import type { Request, Response } from 'express';
import './load-env';
import { createNestApp } from './bootstrap';

let server: ((req: Request, res: Response) => void) | undefined;

async function getServer() {
  if (!server) {
    const created = await createNestApp();
    await created.app.init();
    server = created.server;
  }
  return server;
}

export default async function handler(req: Request, res: Response) {
  const instance = await getServer();
  instance(req, res);
}
