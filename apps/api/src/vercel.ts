import type { Request, Response } from 'express';
import './load-env';
import { createNestApp } from './bootstrap';

let server: ((req: Request, res: Response) => void) | undefined;
let bootError: Error | undefined;

async function getServer() {
  if (bootError) {
    throw bootError;
  }
  if (!server) {
    try {
      const created = await createNestApp();
      await created.app.init();
      server = created.server;
    } catch (error) {
      bootError = error instanceof Error ? error : new Error(String(error));
      throw bootError;
    }
  }
  return server;
}

export default async function handler(req: Request, res: Response) {
  try {
    const instance = await getServer();
    instance(req, res);
  } catch (error) {
    if (res.headersSent) {
      return;
    }
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        code: 'API_BOOTSTRAP_FAILED',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
