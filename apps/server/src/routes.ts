import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { AsaImportReviewStatus } from '@asa/domain';

import { ProcessingService } from './processing-service';

const schedulerSchema = z.object({
  enabled: z.boolean(),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string(),
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
});

const reviewSchema = z.object({
  status: z.nativeEnum(AsaImportReviewStatus),
  importedAmountCents: z.number().int().nullable(),
  notes: z.string().trim().max(500).nullable(),
});

export async function registerRoutes(
  app: FastifyInstance,
  processingService: ProcessingService,
  storageRoot: string,
  onSchedulerUpdated: (settings: z.infer<typeof schedulerSchema>) => void,
): Promise<void> {
  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/dashboard', async () => {
    const state = await processingService.getState();
    return {
      scheduler: state.scheduler,
      latestRun: state.runs[0] ?? null,
      demonstratives: state.demonstratives,
    };
  });

  app.post('/api/runs/demo', async () => {
    const run = await processingService.executeDemoRun();
    return { run };
  });

  app.get('/api/demonstratives', async () => {
    const state = await processingService.getState();
    return state.demonstratives;
  });

  app.get('/api/demonstratives/:id', async (request, reply) => {
    const state = await processingService.getState();
    const params = z.object({ id: z.string() }).parse(request.params);
    const demonstrative = state.demonstratives.find((item) => item.id === params.id);

    if (!demonstrative) {
      reply.code(404);
      return { error: 'Demonstrativo nao encontrado.' };
    }

    return demonstrative;
  });

  app.post('/api/demonstratives/:id/review', async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = reviewSchema.parse(request.body);

    try {
      return await processingService.updateReview(params.id, body);
    } catch (error) {
      reply.code(404);
      return { error: (error as Error).message };
    }
  });

  app.get('/api/settings/scheduler', async () => {
    const state = await processingService.getState();
    return state.scheduler;
  });

  app.put('/api/settings/scheduler', async (request) => {
    const body = schedulerSchema.parse(request.body);
    const scheduler = await processingService.updateSchedulerSettings(body);
    onSchedulerUpdated(scheduler);
    return scheduler;
  });

  app.get('/api/files', async (request, reply) => {
    const query = z.object({ path: z.string() }).parse(request.query);
    const resolved = path.resolve(storageRoot, query.path);
    const relative = path.relative(path.resolve(storageRoot), resolved);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      reply.code(400);
      return { error: 'Caminho invalido.' };
    }

    const file = await readFile(resolved);
    if (resolved.endsWith('.json')) {
      reply.header('content-type', 'application/json');
    } else if (resolved.endsWith('.csv')) {
      reply.header('content-type', 'text/csv; charset=utf-8');
    } else if (resolved.endsWith('.xlsx')) {
      reply.header(
        'content-type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    } else {
      reply.header('content-type', 'application/octet-stream');
    }

    return reply.send(file);
  });
}
