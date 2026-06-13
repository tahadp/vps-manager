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
      const result = schema.safeParse(req.query);
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

const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;

export const schemas = {
  register: z.object({
    email: z.string().email('Invalid email format'),
    username: z.string().min(3).max(50).optional(),
    password: z.string().min(6).max(100)
  }),

  login: z.object({
    identifier: z.string().min(1).optional(),
    email: z.string().email().optional(),
    username: z.string().min(1).optional(),
    password: z.string().min(1),
    rememberMe: z.boolean().optional()
  }).refine(data => data.identifier || data.email || data.username, {
    message: 'Either identifier, email, or username is required'
  }),

  changePassword: z.object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(6).max(100)
  }),

  createVps: z.object({
    name: z.string().min(1).max(100),
    ipAddress: z.string().regex(ipRegex, 'Invalid IP address').optional(),
    os: z.enum(['LINUX', 'WINDOWS']).optional(),
    userId: z.string().uuid().optional()
  }),

  updateVps: z.object({
    name: z.string().min(1).max(100).optional(),
    ipAddress: z.string().regex(ipRegex).optional(),
    os: z.enum(['LINUX', 'WINDOWS']).optional(),
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
    metric: z.enum(['CPU', 'RAM', 'DISK', 'NET']),
    condition: z.enum(['GT', 'LT', 'EQ', 'GTE', 'LTE']),
    threshold: z.number().min(0).max(100),
    durationMin: z.number().int().min(1).max(1440),
    action: z.enum(['ALERT', 'RESTART', 'CUSTOM_SCRIPT']),
    script: z.string().max(5000).optional()
  }),

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