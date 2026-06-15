import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { execOnAgent, listDirOnAgent, readFileFromAgent, writeFileToAgent, refreshAgent, deleteFileOnAgent, mkdirOnAgent, renameFileOnAgent } from '../agentCommands';
import { redisPublisher, redisCache } from '../redis';
import { OsType } from '@prisma/client';
import { validate, validateQuery, validateParams, schemas, safeFilePathSchema } from '../middlewares/validation';
import { logAudit, logIpChangeIfChanged } from '../middlewares/audit';
import { sendSettingsUpdate } from '../agentDispatcher';
import { z } from 'zod';

const publishVpsEvent = (type: 'ADDED' | 'DELETED' | 'STATUS_CHANGED' | 'RENAMED', payload: any) => {
  try {
    redisPublisher.publish('vps_event:global', JSON.stringify({ type, ...payload }));
  } catch (err) {
    console.error('vps_event publish failed:', err);
  }
};

export const vpsRouter = Router();

// Helper to check ownership
const checkVpsAccess = async (vpsId: string, user: any) => {
  if (user.role === 'ADMIN') return true;
  const vps = await prisma.vps.findUnique({ where: { id: vpsId } });
  return vps && vps.userId === user.id;
};

// Param schemas
const idParamSchema = z.object({ id: z.string().uuid('Invalid VPS ID') });
const fileQuerySchema = z.object({ path: safeFilePathSchema.optional() });
const metricsQuerySchema = z.object({ hours: z.string().optional() });
const vpsSettingsSchema = z.object({
  screenshotIntervalSec: z.number().int().min(5).max(3600).optional(),
  telemetryIntervalSec: z.number().int().min(1).max(60).optional(),
  ramDiskVisible: z.boolean().optional(),
  networkVisible: z.boolean().optional(),
  telegramEnabled: z.boolean().optional(),
  customAlertMessage: z.string().max(500).optional(),
  visibleCharts: z.array(z.enum(['cpu', 'ram', 'disk', 'network'])).max(4).optional(),
  offlineTimeoutSec: z.number().int().min(5).max(3600).optional(),
  offlineAlertEnabled: z.boolean().optional(),
  onlineAlertEnabled: z.boolean().optional(),
  customOfflineMessage: z.string().max(500).nullable().optional(),
  customOnlineMessage: z.string().max(500).nullable().optional()
});
const userPrefsSchema = z.object({
  dashboardVpsOrder: z.array(z.string().uuid()).max(500).optional(),
  chartVisibleMetrics: z.array(z.enum(['cpu', 'ram', 'disk', 'network'])).max(4).optional()
});

// Get all VPS instances (with optional filters: status, os, search)
vpsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const where: any = {};
    if (user.role !== 'ADMIN') where.userId = user.id;

    if (req.query.status && ['ONLINE', 'OFFLINE', 'MAINTENANCE'].includes(String(req.query.status))) {
      where.status = String(req.query.status);
    }
    if (req.query.os) {
      where.OR = [
        { os: String(req.query.os) },
        { customOsName: { contains: String(req.query.os), mode: 'insensitive' } }
      ];
    }
    if (req.query.search) {
      const q = String(req.query.search);
      const searchOr = [
        { name: { contains: q, mode: 'insensitive' } },
        { ipAddress: { contains: q } },
        { customOsName: { contains: q, mode: 'insensitive' } }
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchOr }];
        delete where.OR;
      } else {
        where.OR = searchOr;
      }
    }

    const vpsList = await prisma.vps.findMany({
      where,
      include: { user: { select: { id: true, email: true } } },
      omit: { apiKey: true },
      orderBy: { name: 'asc' }
    });

    const listWithScreenshots = await Promise.all(
      vpsList.map(async (vps) => {
        const latestScreenshot = await redisCache.hget('vps_latest_screenshots', vps.id);
        return { ...vps, latestScreenshot };
      })
    );
    res.json(listWithScreenshots);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch VPS list' });
  }
});

// Get single VPS by ID
vpsRouter.get('/:id', requireAuth, validateParams(idParamSchema), async (req: AuthRequest, res: any) => {
  try {
    const vps = await prisma.vps.findUnique({
      where: { id: req.params.id as string },
      include: { user: { select: { id: true, email: true } } },
      omit: { apiKey: true }
    });
    if (!vps) return res.status(404).json({ error: 'VPS not found' });
    if (req.user!.role !== 'ADMIN' && vps.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const latestScreenshot = await redisCache.hget('vps_latest_screenshots', req.params.id as string);
    res.json({ ...vps, latestScreenshot });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch VPS' });
  }
});

// Add a new VPS
vpsRouter.post('/', requireAuth, validate(schemas.createVps), async (req: AuthRequest, res) => {
  if (req.user!.role !== 'ADMIN') return res.status(403).json({ error: 'Only admins can add VPS' });
  const { name, ipAddress, os, customOsName, userId } = req.body;

  // F0-17: Tier-based VPS cap
  const TIER_LIMITS: Record<string, number> = { FREE: 2, PRO: 50 };
  if (userId) {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true }
    });
    const tier = target?.tier || 'FREE';
    const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.FREE;
    const count = await prisma.vps.count({ where: { userId } });
    if (count >= limit) {
      return res.status(403).json({
        error: `Tier ${tier} VPS limit (${limit}) reached. Upgrade to PRO to add more.`
      });
    }
  }

  try {
    let osEnum: OsType = OsType.LINUX;
    if (os) {
      const upper = String(os).toUpperCase();
      if (upper === 'LINUX' || upper.includes('UBUNTU') || upper.includes('DEBIAN') || upper.includes('CENTOS') || upper.includes('FEDORA') || upper.includes('ARCH')) {
        osEnum = OsType.LINUX;
      } else if (upper === 'WINDOWS' || upper.includes('WINDOW')) {
        osEnum = OsType.WINDOWS;
      } else if (upper === 'OTHER') {
        if (!customOsName || !String(customOsName).trim()) {
          return res.status(400).json({ error: 'customOsName is required when os is "Other"' });
        }
        osEnum = OsType.OTHER;
      } else {
        osEnum = OsType.OTHER;
        if (!customOsName || !String(customOsName).trim()) {
          return res.status(400).json({ error: 'customOsName is required for this OS' });
        }
      }
    }

    const createData: any = {
      name,
      ipAddress: ipAddress || "Pending",
      os: osEnum,
      customOsName: osEnum === OsType.OTHER ? String(customOsName).trim() : null,
      user: { connect: { id: userId } }
    };

    const newVps = await prisma.vps.create({
      data: {
        ...createData,
        settings: {
          create: {
            screenshotIntervalSec: 30,
            telemetryIntervalSec: 1,
            ramDiskVisible: true,
            networkVisible: true
          }
        }
      }
    });
    publishVpsEvent('ADDED', { vpsId: newVps.id, name: newVps.name, status: newVps.status, userId: newVps.userId });
    res.json(newVps);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to add VPS', details: error.message });
  }
});

// Update a VPS
vpsRouter.put('/:id', requireAuth, validateParams(idParamSchema), validate(schemas.updateVps), async (req: AuthRequest, res: any) => {
  if (req.user!.role !== 'ADMIN') return res.status(403).json({ error: 'Only admins can update VPS properties' });
  const { id } = req.params;
  const { name, ipAddress, os, customOsName, status } = req.body;
  try {
    const dataToUpdate: any = { name, ipAddress, status };
    if (os) {
      dataToUpdate.os = os as OsType;
      if (os === 'OTHER') {
        dataToUpdate.customOsName = customOsName ? String(customOsName).trim() : null;
      } else {
        dataToUpdate.customOsName = null;
      }
    } else if (customOsName !== undefined) {
      dataToUpdate.customOsName = customOsName ? String(customOsName).trim() : null;
    }
    if (ipAddress) {
      await logIpChangeIfChanged(id as string, ipAddress as string);
    }
    const updatedVps = await prisma.vps.update({
      where: { id: id as string },
      data: dataToUpdate,
      omit: { apiKey: true }
    });
    publishVpsEvent('STATUS_CHANGED', { vpsId: updatedVps.id, status: updatedVps.status, name: updatedVps.name, userId: updatedVps.userId });
    res.json(updatedVps);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update VPS' });
  }
});

// Delete a VPS
vpsRouter.delete('/:id', requireAuth, validateParams(idParamSchema), async (req: AuthRequest, res: any) => {
  if (req.user!.role !== 'ADMIN') return res.status(403).json({ error: 'Only admins can delete VPS' });
  const { id } = req.params;
  try {
    const deleted = await prisma.vps.delete({ where: { id: id as string } });
    publishVpsEvent('DELETED', { vpsId: deleted.id, userId: deleted.userId });
    res.json({ message: 'VPS deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete VPS' });
  }
});

// Single command execution
vpsRouter.post('/:id/command', requireAuth, validateParams(idParamSchema), validate(schemas.executeCommand), async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  const { command } = req.body;
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const result = await execOnAgent(vpsId, command);
    await logAudit({ userId: req.user!.id, action: 'EXECUTE_COMMAND', target: vpsId, details: `Executed: ${command}` });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manual refresh: ask the agent to immediately push one telemetry frame + screenshot
vpsRouter.post('/:id/refresh', requireAuth, validateParams(idParamSchema), async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const result = await refreshAgent(vpsId);
    await logAudit({ userId: req.user!.id, action: 'REFRESH', target: vpsId, details: 'Manual refresh requested' });
    res.json({ ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk refresh
vpsRouter.post('/bulk/refresh', requireAuth, validate(schemas.bulkCommand), async (req: AuthRequest, res: any) => {
  const { vpsIds } = req.body;
  const results: any[] = [];
  for (const vpsId of vpsIds) {
    if (!await checkVpsAccess(vpsId, req.user)) {
      results.push({ vpsId, success: false, error: 'Unauthorized' });
      continue;
    }
    try {
      const r = await refreshAgent(vpsId);
      results.push({ vpsId, success: r.success, data: r });
    } catch (err: any) {
      results.push({ vpsId, success: false, error: err.message });
    }
  }
  res.json({ results });
});

// Get VPS settings
vpsRouter.get('/:id/settings', requireAuth, validateParams(idParamSchema), async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const settings = await prisma.vpsSettings.upsert({
      where: { vpsId },
      update: {},
      create: {
        vpsId,
        screenshotIntervalSec: 30,
        telemetryIntervalSec: 1,
        ramDiskVisible: true,
        networkVisible: true
      }
    });
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update VPS settings
vpsRouter.put('/:id/settings', requireAuth, validateParams(idParamSchema), validate(vpsSettingsSchema), async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const updateData: any = { ...req.body };
    if (req.body.visibleCharts !== undefined) {
      updateData.visibleCharts = JSON.stringify(req.body.visibleCharts);
    }
    const settings = await prisma.vpsSettings.upsert({
      where: { vpsId },
      update: updateData,
      create: {
        vpsId,
        screenshotIntervalSec: req.body.screenshotIntervalSec ?? 30,
        telemetryIntervalSec: req.body.telemetryIntervalSec ?? 1,
        ramDiskVisible: req.body.ramDiskVisible ?? true,
        networkVisible: req.body.networkVisible ?? true,
        telegramEnabled: req.body.telegramEnabled ?? true,
        customAlertMessage: req.body.customAlertMessage ?? null,
        visibleCharts: req.body.visibleCharts ? JSON.stringify(req.body.visibleCharts) : JSON.stringify(['cpu', 'ram', 'disk', 'network']),
        offlineTimeoutSec: req.body.offlineTimeoutSec ?? 60,
        offlineAlertEnabled: req.body.offlineAlertEnabled ?? true,
        onlineAlertEnabled: req.body.onlineAlertEnabled ?? true,
        customOfflineMessage: req.body.customOfflineMessage ?? null,
        customOnlineMessage: req.body.customOnlineMessage ?? null
      }
    });

    try {
      const visibleCharts = typeof settings.visibleCharts === 'string'
        ? JSON.parse(settings.visibleCharts)
        : (settings.visibleCharts || ['cpu', 'ram', 'disk', 'network']);
      sendSettingsUpdate(vpsId, {
        screenshotIntervalSec: settings.screenshotIntervalSec,
        telemetryIntervalSec: settings.telemetryIntervalSec,
        ramDiskVisible: settings.ramDiskVisible,
        networkVisible: settings.networkVisible,
        telegramEnabled: settings.telegramEnabled,
        customAlertMessage: settings.customAlertMessage,
        visibleCharts
      });
    } catch (pushErr) {
      console.warn('SettingsUpdate push to agent failed (agent offline?):', pushErr);
    }

    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Historical Metrics
vpsRouter.get('/:id/metrics', requireAuth, validateParams(idParamSchema), validateQuery(metricsQuerySchema), async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const hours = parseInt(req.query.hours as string, 10) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const metrics = await prisma.historicalMetric.findMany({
      where: { vpsId, timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' }
    });
    res.json(metrics);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk commands
vpsRouter.post('/bulk/command', requireAuth, validate(schemas.bulkCommand), async (req: AuthRequest, res: any) => {
  const { vpsIds, command } = req.body;

  const results: any[] = [];
  for (const vpsId of vpsIds) {
    if (!await checkVpsAccess(vpsId, req.user)) {
      results.push({ vpsId, success: false, error: 'Unauthorized' });
      continue;
    }
    try {
      const resData = await execOnAgent(vpsId, command);
      await logAudit({ userId: req.user!.id, action: 'EXECUTE_COMMAND', target: vpsId, details: `Bulk Executed: ${command}` });
      results.push({ vpsId, success: true, data: resData });
    } catch (err: any) {
      results.push({ vpsId, success: false, error: err.message });
    }
  }
  res.json({ results });
});

// List Directory
vpsRouter.get('/:id/files', requireAuth, validateParams(idParamSchema), validateQuery(fileQuerySchema), async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  const dirPath = (req.query.path as string) || '/';
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const result = await listDirOnAgent(vpsId, dirPath);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Read File
vpsRouter.get('/:id/file', requireAuth, validateParams(idParamSchema), validateQuery(schemas.readFile), async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  const filePath = req.query.path as string;
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const result = await readFileFromAgent(vpsId, filePath);
    if (result.content.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large to read (>5MB)' });
    }
    res.json({ success: true, content: result.content.toString('utf-8') });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Write File
vpsRouter.put('/:id/file', requireAuth, validateParams(idParamSchema), validate(schemas.writeFile), async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  const { path: filePath, content } = req.body;
  if (Buffer.byteLength(content || '', 'utf-8') > 10 * 1024 * 1024) {
    return res.status(413).json({ error: 'File content too large (>10MB)' });
  }
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const result = await writeFileToAgent(vpsId, filePath, Buffer.from(content, 'utf-8'));
    await logAudit({ userId: req.user!.id, action: 'FILE_EDIT', target: vpsId, details: `Edited file: ${filePath}` });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete File or Directory
vpsRouter.delete('/:id/files', requireAuth, validateParams(idParamSchema), validateQuery(schemas.deleteFile), async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  const filePath = req.query.path as string;
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const result = await deleteFileOnAgent(vpsId, filePath);
    await logAudit({ userId: req.user!.id, action: 'FILE_DELETE', target: vpsId, details: `Deleted: ${filePath}` });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create File or Directory
vpsRouter.post('/:id/files', requireAuth, validateParams(idParamSchema), validate(schemas.createFile), async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  const { path: filePath, type } = req.body as { path: string; type: 'file' | 'directory' };
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });

  try {
    let result;
    if (type === 'directory') {
      result = await mkdirOnAgent(vpsId, filePath);
    } else {
      result = await writeFileToAgent(vpsId, filePath, Buffer.alloc(0));
    }
    await logAudit({ userId: req.user!.id, action: 'FILE_CREATE', target: vpsId, details: `Created: ${filePath}` });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Rename File or Directory
vpsRouter.patch('/:id/files', requireAuth, validateParams(idParamSchema), validate(schemas.renameFile), async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  const { oldPath, newPath } = req.body as { oldPath: string; newPath: string };
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const result = await renameFileOnAgent(vpsId, oldPath, newPath);
    await logAudit({ userId: req.user!.id, action: 'FILE_RENAME', target: vpsId, details: `Renamed: ${oldPath} to ${newPath}` });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Download File
vpsRouter.get('/:id/file/download', requireAuth, validateParams(idParamSchema), validateQuery(schemas.deleteFile), async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  const filePath = req.query.path as string;
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const result = await readFileFromAgent(vpsId, filePath);
    if (result.content.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large to download (>5MB)' });
    }
    const safeName = (filePath.split('/').pop() || 'file').replace(/[^\w.\-]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(result.content);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
