import { useEffect, useState, type FormEvent } from 'react';

import type { SchedulerSettings } from '@asa/domain';

import { fetchScheduler, updateScheduler } from '../api';

const weekdayOptions = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sab' },
  { value: 7, label: 'Dom' },
];

export function SettingsPage() {
  const [settings, setSettings] = useState<SchedulerSettings | null>(null);

  useEffect(() => {
    void fetchScheduler().then(setSettings);
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) {
      return;
    }

    const next = await updateScheduler(settings);
    setSettings(next);
  }

  function toggleWeekday(weekday: number) {
    if (!settings) {
      return;
    }

    setSettings({
      ...settings,
      weekdays: settings.weekdays.includes(weekday)
        ? settings.weekdays.filter((item) => item !== weekday)
        : [...settings.weekdays, weekday].sort((left, right) => left - right),
    });
  }

  if (!settings) {
    return <section className="panel">Carregando configuracoes...</section>;
  }

  return (
    <section className="stack">
      <header className="detail-header">
        <div>
          <p className="eyebrow">Agendamento</p>
          <h2>Configuracoes da execucao automatica</h2>
        </div>
      </header>

      <section className="panel">
        <form className="form-grid" onSubmit={handleSave}>
          <label className="inline-toggle">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
            />
            Ativar scheduler local
          </label>

          <label>
            Horario
            <input
              type="time"
              value={settings.time}
              onChange={(event) => setSettings({ ...settings, time: event.target.value })}
            />
          </label>

          <div className="full-width weekday-picker">
            <span>Dias da semana</span>
            <div className="weekday-options">
              {weekdayOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={settings.weekdays.includes(option.value) ? 'day-chip active' : 'day-chip'}
                  onClick={() => toggleWeekday(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label>
            Ultima execucao
            <input value={settings.lastRunAt ?? 'Nenhuma'} readOnly />
          </label>

          <label>
            Proxima execucao
            <input value={settings.nextRunAt ?? 'Nao agendada'} readOnly />
          </label>

          <button className="primary-button" type="submit">
            Salvar configuracoes
          </button>
        </form>
      </section>
    </section>
  );
}
