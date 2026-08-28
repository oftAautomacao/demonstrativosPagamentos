import Fastify from 'fastify';
import cors from '@fastify/cors';

import { FileStorageService, JsonStateRepository } from '@asa/storage';

import { loadConfig } from './config';
import { CredentialsService } from './credentials-service';
import { ProcessingService } from './processing-service';
import { registerRoutes } from './routes';
import { LocalScheduler } from './scheduler/local-scheduler';

export async function buildApp() {
  const config = loadConfig();
  const storage = new FileStorageService(config.storageRoot);
  const stateRepository = new JsonStateRepository(config.storageRoot);
  const processingService = new ProcessingService(
    stateRepository,
    storage,
    new CredentialsService(),
  );

  await processingService.bootstrap();

  const app = Fastify({
    logger: false,
  });

  await app.register(cors, {
    origin: [`http://localhost:${config.webPort}`],
  });
  const scheduler = new LocalScheduler(
    (await processingService.getState()).scheduler,
    async () => {
      await processingService.executeDemoRun();
    },
    async (nextRunAt) => {
      const state = await processingService.getState();
      await processingService.updateSchedulerSettings({
        ...state.scheduler,
        nextRunAt,
      });
    },
  );

  await registerRoutes(app, processingService, config.storageRoot, (settings) => {
    scheduler.update(settings);
  });

  scheduler.start((await processingService.getState()).scheduler);

  return {
    app,
    config,
    scheduler,
  };
}
