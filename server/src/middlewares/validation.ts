import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

// XSS koruması için HTML tag'lerini temizle
function sanitizeString(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Recursive olarak obje içindeki string'leri temizle
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

// Validation middleware factory
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Request body'yi sanitize et
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
      }

      // Validation uygula
      const result = schema.safeParse(req.body);
      if (!result.success) {
        const errors = result.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }));
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: errors 
        });
      }

      // Validated data'yı req.body'ye ata
      req.body = result.data;
      next();
    } catch (error) {
      res.status(400).json({ error: 'Invalid request data' });
    }
  };
}

// Query validation middleware
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.query);
      if (!result.success) {
        const errors = result.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }));
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: errors 
        });
      }
      req.query = result.data;
      next();
    } catch (error) {
      res.status(400).json({ error: 'Invalid query parameters' });
    }
  };
}

// Param validation middleware
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.params);
      if (!result.success) {
        const errors = result.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }));
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: errors 
        });
      }
      req.params = result.data;
      next();
    } catch (error) {
      res.status(400).json({ error: 'Invalid URL parameters' });
    }
  };
}

// Ortak validation şemaları
export const schemas = {
  // Auth schemas
  register: z.object({
    email: z.string().email('Invalid email format'),
    username: z.string().min(3, 'Username must be at least 3 characters').max(50).optional(),
    password: z.string().min(6, 'Password must be at least 6 characters').max(100)
  }),

  login: z.object({
    identifier: z.string().min(1, 'Identifier is required').optional(),
    email: z.string().email().optional(),
    username: z.string().min(1).optional(),
    password: z.string().min(1, 'Password is required'),
    rememberMe: z.boolean().optional()
  }).refine(data => data.identifier || data.email || data.username, {
    message: 'Either identifier, email, or username is required'
  }),

  changePassword: z.object({
    oldPassword: z.string().min(1, 'Old password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters').max(100)
  }),

  // VPS schemas
  createVps: z.object({
    name: z.string().min(1, 'Name is required').max(100),
    ipAddress: z.string().ip('Invalid IP address'),
    os: z.enum(['LINUX', 'WINDOWS']).optional(),
    userId: z.string().uuid('Invalid user ID').optional()
  }),

  updateVps: z.object({
    name: z.string().min(1).max(100).optional(),
    ipAddress: z.string().ip().optional(),
    os: z.enum(['LINUX', 'WINDOWS']).optional(),
    status: z.enum(['ONLINE', 'OFFLINE', 'MAINTENANCE']).optional()
  }),

  // Command schema
  executeCommand: z.object({
    command: z.string().min(1, 'Command is required').max(1000)
  }),

  bulkCommand: z.object({
    vpsIds: z.array(z.string().uuid()).min(1, 'At least one VPS ID required'),
    command: z.string().min(1, 'Command is required').max(1000)
  }),

  // Rule schemas
  createRule: z.object({
    vpsId: z.string().uuid().optional(),
    metric: z.enum(['CPU', 'RAM', 'DISK', 'NET']),
    condition: z.enum(['GT', 'LT', 'EQ', 'GTE', 'LTE']),
    threshold: z.number().min(0).max(100),
    durationMin: z.number().int().min(1).max(1440),
    action: z.enum(['ALERT', 'RESTART', 'CUSTOM_SCRIPT']),
    script: z.string().max(5000).optional()
  }),

  // File schemas
  readFile: z.object({
    path: z.string().min(1, 'Path is required').max(1000)
  }),

  writeFile: z.object({
    path: z.string().min(1, 'Path is required').max(1000),
    content: z.string().max(10000000) // 10MB limit
  }),

  listDirectory: z.object({
    path: z.string().min(1, 'Path is required').max(1000)
  }),

  // Admin schemas
  approveUser: z.object({
    userId: z.string().uuid('Invalid user ID')
  }),

  updateUserRole: z.object({
    userId: z.string().uuid('Invalid user ID'),
    role: z.enum(['USER', 'ADMIN'])
  })
};