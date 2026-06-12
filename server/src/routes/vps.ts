import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { executeCommand, listDirectory, readFile, writeFile } from '../grpcClient';
import { OsType } from '@prisma/client';

export const vpsRouter = Router();

// Helper to check ownership
const checkVpsAccess = async (vpsId: string, user: any) => {
  if (user.role === 'ADMIN') return true;
  const vps = await prisma.vps.findUnique({ where: { id: vpsId } });
  return vps && vps.userId === user.id;
};

// Log action to DB
const logAudit = async (userId: string, target: string, action: string, details: string) => {
  await prisma.auditLog.create({
    data: { userId, action, target: `${target} - ${details}` }
  });
};

// Get all VPS instances
vpsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    let vpsList;
    if (user.role === 'ADMIN') {
      vpsList = await prisma.vps.findMany({ include: { user: { select: { id: true, email: true } } } });
    } else {
      vpsList = await prisma.vps.findMany({ where: { userId: user.id } });
    }
    res.json(vpsList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch VPS list' });
  }
});

// Add a new VPS
vpsRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'ADMIN') return res.status(403).json({ error: 'Only admins can add VPS' });
  const { id, name, ipAddress = "Pending", os, userId } = req.body;
  if (!name || !os || !userId) return res.status(400).json({ error: 'Missing required fields' });
  try {
    const osEnum = os.toUpperCase().includes('WINDOW') ? OsType.WINDOWS : OsType.LINUX;
    const createData: any = { 
      name, 
      ipAddress, 
      os: osEnum, 
      user: { connect: { id: userId } } 
    };
    if (id) createData.id = id; // Allow custom ID if provided
    
    const newVps = await prisma.vps.create({ data: createData });
    res.json(newVps);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to add VPS', details: error.message });
  }
});

// Update a VPS
vpsRouter.put('/:id', requireAuth, async (req: AuthRequest, res: any) => {
  if (req.user!.role !== 'ADMIN') return res.status(403).json({ error: 'Only admins can update VPS properties' });
  const { id } = req.params;
  const { name, ipAddress, os, status, userId } = req.body;
  try {
    const dataToUpdate: any = { name, ipAddress, status, userId };
    if (os) {
      dataToUpdate.os = os.toUpperCase().includes('WINDOW') ? OsType.WINDOWS : OsType.LINUX;
    }
    const updatedVps = await prisma.vps.update({
      where: { id: id as string },
      data: dataToUpdate
    });
    res.json(updatedVps);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update VPS' });
  }
});

// Delete a VPS
vpsRouter.delete('/:id', requireAuth, async (req: AuthRequest, res: any) => {
  if (req.user!.role !== 'ADMIN') return res.status(403).json({ error: 'Only admins can delete VPS' });
  const { id } = req.params;
  try {
    await prisma.vps.delete({ where: { id: id as string } });
    res.json({ message: 'VPS deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete VPS' });
  }
});

// Single command execution
vpsRouter.post('/:id/command', requireAuth, async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  const { command } = req.body;
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const result = await executeCommand(vpsId, command);
    await logAudit(req.user!.id, vpsId, 'EXECUTE_COMMAND', `Executed: ${command}`);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk commands
vpsRouter.post('/bulk/command', requireAuth, async (req: AuthRequest, res: any) => {
  const { vpsIds, command } = req.body;
  if (!Array.isArray(vpsIds) || !command) return res.status(400).json({ error: 'Invalid input' });

  const results: any[] = [];
  for (const vpsId of vpsIds) {
    if (!await checkVpsAccess(vpsId, req.user)) {
      results.push({ vpsId, success: false, error: 'Unauthorized' });
      continue;
    }
    try {
      const resData = await executeCommand(vpsId, command);
      await logAudit(req.user!.id, vpsId, 'EXECUTE_COMMAND', `Bulk Executed: ${command}`);
      results.push({ vpsId, success: true, data: resData });
    } catch (err: any) {
      results.push({ vpsId, success: false, error: err.message });
    }
  }
  res.json({ results });
});

// List Directory
vpsRouter.get('/:id/files', requireAuth, async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  const dirPath = (req.query.path as string) || '/';
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const result = await listDirectory(vpsId, dirPath);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Read File
vpsRouter.get('/:id/file', requireAuth, async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: 'Path required' });
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const result = await readFile(vpsId, filePath);
    res.json({ success: true, content: result.content.toString('utf-8') });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Write File
vpsRouter.put('/:id/file', requireAuth, async (req: AuthRequest, res: any) => {
  const vpsId = req.params.id as string;
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) return res.status(400).json({ error: 'Path and content required' });
  if (!await checkVpsAccess(vpsId, req.user)) return res.status(403).json({ error: 'Unauthorized' });

  try {
    const result = await writeFile(vpsId, filePath, Buffer.from(content, 'utf-8'));
    await logAudit(req.user!.id, vpsId, 'FILE_EDIT', `Edited file: ${filePath}`);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
