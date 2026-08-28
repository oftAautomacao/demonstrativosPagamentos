import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppState, SchedulerSettings } from '@asa/domain';

const DEFAULT_SCHEDULER: SchedulerSettings = {
  enabled: false,
  weekdays: [1, 2, 3, 4, 5],
  time: '08:00',
  timezone: 'America/Sao_Paulo',
  lastRunAt: null,
  nextRunAt: null,
};

function createDefaultState(): AppState {
  return {
    demonstratives: [],
    runs: [],
    scheduler: DEFAULT_SCHEDULER,
  };
}

export class JsonStateRepository {
  private readonly filePath: string;

  public constructor(rootDirectory: string) {
    this.filePath = path.join(rootDirectory, 'runtime', 'app-state.json');
  }

  public async load(): Promise<AppState> {
    try {
      const contents = await readFile(this.filePath, 'utf8');
      return JSON.parse(contents) as AppState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return createDefaultState();
      }

      throw error;
    }
  }

  public async save(state: AppState): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), 'utf8');
  }
}
