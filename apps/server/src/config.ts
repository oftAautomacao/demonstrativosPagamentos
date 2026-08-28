import path from 'node:path';

import dotenv from 'dotenv';

dotenv.config();

export type AppConfig = {
  port: number;
  webPort: number;
  storageRoot: string;
  demoAutoRun: boolean;
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === 'true';
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? '3333'),
    webPort: Number(process.env.WEB_PORT ?? '3000'),
    storageRoot: path.resolve(process.env.ASA_STORAGE_ROOT ?? './storage'),
    demoAutoRun: parseBoolean(process.env.ASA_DEMO_AUTO_RUN, false),
  };
}
