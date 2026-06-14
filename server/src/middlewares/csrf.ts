import { Request, Response, NextFunction, RequestHandler } from 'express';

export const requireCsrf: RequestHandler = (_req: Request, _res: Response, next: NextFunction) => {
  next();
};
