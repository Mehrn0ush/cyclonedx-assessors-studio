import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface SecureRequest extends Request {
  requestId?: string;
}

export function requestIdMiddleware(
  req: SecureRequest,
  res: Response,
  next: NextFunction
): void {
  req.requestId = uuidv4();
  res.setHeader('X-Request-ID', req.requestId as string | string[]);
  next();
}
