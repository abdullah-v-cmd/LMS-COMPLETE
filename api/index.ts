import { Request, Response } from 'express';
import app from '../server/src/app';

/**
 * Vercel Serverless Function entrypoint.
 * Automatically handles all /api/v1/* requests forwarded by vercel.json rewrites.
 */
export default function handler(req: Request, res: Response) {
  return app(req, res);
}

