import type { SchedulerSettings } from '@asa/domain';

import type { Scheduler, SchedulerHandler } from './types';

const MAX_LOOKAHEAD_DAYS = 14;

function buildDateAtTime(baseDate: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map((part) => Number(part));
  const next = new Date(baseDate);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  return next;
}

export function calculateNextRun(settings: SchedulerSettings, now = new Date()): string | null {
  if (!settings.enabled) {
    return null;
  }

  for (let dayOffset = 0; dayOffset <= MAX_LOOKAHEAD_DAYS; dayOffset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + dayOffset);
    const weekday = candidate.getDay();
    const normalizedWeekday = weekday === 0 ? 7 : weekday;

    if (!settings.weekdays.includes(normalizedWeekday)) {
      continue;
    }

    const scheduled = buildDateAtTime(candidate, settings.time);
    if (scheduled.getTime() > now.getTime()) {
      return scheduled.toISOString();
    }
  }

  return null;
}

export class LocalScheduler implements Scheduler {
  private timeout: NodeJS.Timeout | null = null;

  public constructor(
    private settings: SchedulerSettings,
    private readonly handler: SchedulerHandler,
    private readonly onNextRunComputed: (nextRunAt: string | null) => Promise<void>,
  ) {}

  public start(settings: SchedulerSettings): void {
    this.settings = settings;
    this.scheduleNext();
  }

  public stop(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  public update(settings: SchedulerSettings): void {
    this.stop();
    this.settings = settings;
    this.scheduleNext();
  }

  private scheduleNext(): void {
    const nextRunAt = calculateNextRun(this.settings);
    void this.onNextRunComputed(nextRunAt);

    if (!nextRunAt) {
      return;
    }

    const delay = Math.max(new Date(nextRunAt).getTime() - Date.now(), 1_000);
    this.timeout = setTimeout(() => {
      void this.handler().finally(() => this.scheduleNext());
    }, delay);
  }
}
