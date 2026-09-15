import { Logger } from '@nestjs/common';
import './load-env';
import { createNestApp } from './bootstrap';

async function bootstrap() {
  const { app } = await createNestApp();
  const prefix = process.env.API_PREFIX ?? 'api/v1';
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/${prefix}`);
}

bootstrap();
