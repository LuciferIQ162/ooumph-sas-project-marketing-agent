import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: string;
        name: string;
        [key: string]: any;
      };
      user?: {
        id: string;
        email: string;
        role: string;
        [key: string]: any;
      };
    }
  }
}