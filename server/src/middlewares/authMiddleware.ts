import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';

const JWT_SECRET = process.env.JWT_SECRET as string;

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
    tv?: number;
  };
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.cookies?.['auth-token']) {
    token = req.cookies['auth-token'];
  }
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
    if (decoded?.id) {
      const current = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { tokenVersion: true, status: true }
      });
      if (!current) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      if (current.status === 'BANNED' || current.status === 'PENDING') {
        return res.status(403).json({ error: 'Account is not authorized' });
      }
      if (typeof decoded.tv === 'number' && decoded.tv !== current.tokenVersion) {
        return res.status(401).json({ error: 'Token revoked' });
      }
    }
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }
  next();
};
