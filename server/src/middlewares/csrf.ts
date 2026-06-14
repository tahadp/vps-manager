import { Request, Response, NextFunction, RequestHandler } from 'express';

export const requireCsrf: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return next();
  }

  const csrfCookie = req.cookies?.['XSRF-TOKEN'];
  const csrfHeader = req.headers['x-xsrf-token'] || req.headers['X-XSRF-TOKEN'];

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ error: 'CSRF token mismatch or missing' });
  }

  next();
};
