import type { AsaImportReviewStatus, Demonstrative, ProcessingRun, SchedulerSettings } from '@asa/domain';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

type DashboardPayload = {
  scheduler: SchedulerSettings;
  latestRun: ProcessingRun | null;
  demonstratives: Demonstrative[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Falha na requisicao ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getFileUrl(relativePath: string): string {
  return `${API_BASE}/api/files?path=${encodeURIComponent(relativePath)}`;
}

export async function fetchDashboard(): Promise<DashboardPayload> {
  return request<DashboardPayload>('/api/dashboard');
}

export async function executeDemoRun(): Promise<void> {
  await request('/api/runs/demo', {
    method: 'POST',
  });
}

export async function fetchDemonstrative(id: string): Promise<Demonstrative> {
  return request<Demonstrative>(`/api/demonstratives/${id}`);
}

export async function fetchDemonstratives(): Promise<Demonstrative[]> {
  return request<Demonstrative[]>('/api/demonstratives');
}

export async function fetchScheduler(): Promise<SchedulerSettings> {
  return request<SchedulerSettings>('/api/settings/scheduler');
}

export async function updateScheduler(settings: SchedulerSettings): Promise<SchedulerSettings> {
  return request<SchedulerSettings>('/api/settings/scheduler', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function submitReview(input: {
  demonstrativeId: string;
  status: AsaImportReviewStatus;
  importedAmountCents: number | null;
  notes: string | null;
}): Promise<Demonstrative> {
  return request<Demonstrative>(`/api/demonstratives/${input.demonstrativeId}/review`, {
    method: 'POST',
    body: JSON.stringify({
      status: input.status,
      importedAmountCents: input.importedAmountCents,
      notes: input.notes,
    }),
  });
}
