import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

function sanitizeString(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }
  return obj;
}

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
      }
      const result = schema.safeParse(req.body);
      if (!result.success) {
        const errors = result.error.issues.map((e: any) => ({
          field: e.path.join('.'),
          message: e.message
        }));
        return res.status(400).json({ error: 'Validation failed', details: errors });
      }
      req.body = result.data;
      next();
    } catch (error) {
      res.status(400).json({ error: 'Invalid request data' });
    }
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query || {};
      const result = schema.safeParse(query);
      if (!result.success) {
        const errors = result.error.issues.map((e: any) => ({
          field: e.path.join('.'),
          message: e.message
        }));
        return res.status(400).json({ error: 'Validation failed', details: errors });
      }
      req.query = result.data as any;
      next();
    } catch (error) {
      res.status(400).json({ error: 'Invalid query parameters' });
    }
  };
}

export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.params);
      if (!result.success) {
        const errors = result.error.issues.map((e: any) => ({
          field: e.path.join('.'),
          message: e.message
        }));
        return res.status(400).json({ error: 'Validation failed', details: errors });
      }
      req.params = result.data as any;
      next();
    } catch (error) {
      res.status(400).json({ error: 'Invalid URL parameters' });
    }
  };
}

export const schemas = {
  register: z.object({
    email: z.string().email(),
    username: z.string().min(3).max(50).optional(),
    password: z.string().min(6).max(100)
  }),

  login: z.object({
    identifier: z.string().min(1).optional(),
    email: z.string().email().optional(),
    username: z.string().min(1).optional(),
    password: z.string().min(1),
    rememberMe: z.boolean().optional()
  }).refine((data: any) => data.identifier || data.email || data.username, {
    message: 'Either identifier, email, or username is required'
  }),

  changePassword: z.object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(6).max(100)
  }),

  createVps: z.object({
    name: z.string().min(1).max(100),
    id: z.string().optional(),
    ipAddress: z.string().optional(),
    os: z.string().optional(),
    customOsName: z.string().max(100).optional(),
    userId: z.string().uuid().optional()
  }),

  updateVps: z.object({
    name: z.string().min(1).max(100).optional(),
    ipAddress: z.string().optional(),
    os: z.string().optional(),
    status: z.enum(['ONLINE', 'OFFLINE', 'MAINTENANCE']).optional()
  }),

  executeCommand: z.object({
    command: z.string().min(1).max(1000)
  }),

  bulkCommand: z.object({
    vpsIds: z.array(z.string().uuid()).min(1),
    command: z.string().min(1).max(1000)
  }),

  createRule: z.object({
    vpsId: z.string().uuid().optional(),
    metric: z.enum(['CPU', 'RAM', 'DISK', 'OFFLINE']).optional(),
    condition: z.enum(['>', '<']).optional(),
    threshold: z.number().min(0).max(100).optional(),
    durationMin: z.number().int().min(1).max(1440).optional(),
    offlineThresholdMin: z.number().int().min(1).max(10080).optional(),
    customMessage: z.string().max(2000).optional(),
    restartOnAlert: z.boolean().optional(),
    action: z.enum(['ALERT', 'RESTART', 'CUSTOM_SCRIPT', 'ALERT_AND_RESTART', 'NOTIFY_ONLY']),
    script: z.string().max(5000).optional()
  }).refine((data: any) => {
    // OFFLINE rules: no metric threshold required, but offlineThresholdMin is
    if (data.metric === 'OFFLINE' || data.metric === undefined) {
      return data.offlineThresholdMin !== undefined;
    }
    // Metric rules: must have threshold and duration
    return data.threshold !== undefined && data.durationMin !== undefined;
  }, { message: 'Invalid rule configuration: metric rules need threshold+duration; offline rules need offlineThresholdMin' }),

  readFile: z.object({
    path: z.string().min(1).max(1000)
  }),

  writeFile: z.object({
    path: z.string().min(1).max(1000),
    content: z.string().max(10000000)
  }),

  listDirectory: z.object({
    path: z.string().min(1).max(1000)
  }),

  approveUser: z.object({
    userId: z.string().uuid()
  }),

  updateUserRole: z.object({
    userId: z.string().uuid(),
    role: z.enum(['USER', 'ADMIN'])
  })
};
