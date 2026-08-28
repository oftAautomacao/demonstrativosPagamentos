import type { SchedulerSettings } from '@asa/domain';

export type SchedulerHandler = () => Promise<void>;

export type Scheduler = {
  start(settings: SchedulerSettings): void;
  stop(): void;
  update(settings: SchedulerSettings): void;
};
