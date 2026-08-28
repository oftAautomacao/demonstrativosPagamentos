import { useEffect, useState, type FormEvent } from 'react';

import { AsaImportReviewStatus, formatMoneyBRL, moneyFromDecimal } from '@asa/domain';

import { fetchDemonstratives, submitReview } from '../api';
import { formatDateOnly } from '../formatters';

export function AsaReviewPage() {
  const [demonstratives, setDemonstratives] = useState<Awaited<ReturnType<typeof fetchDemonstratives>>>([]);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState<AsaImportReviewStatus>(AsaImportReviewStatus.CORRECT);
  const [importedValue, setImportedValue] = useState('');
  const [notes, setNotes] = useState('');

  async function load() {
    const next = await fetchDemonstratives();
    const withAsa = next.filter((item) => item.asaFile);
    setDemonstratives(withAsa);
    setSelectedId((current) => current || withAsa[0]?.id || '');
  }

  useEffect(() => {
    void load();
  }, []);

  const selected = demonstratives.find((item) => item.id === selectedId) ?? null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) {
      return;
    }

    await submitReview({
      demonstrativeId: selected.id,
      status,
      importedAmountCents:
        status === AsaImportReviewStatus.DIFFERENT_VALUE ? moneyFromDecimal(importedValue) : null,
      notes: notes.trim() || null,
    });

    setImportedValue('');
    setNotes('');
    await load();
  }

  return (
    <section className="stack">
      <header className="detail-header">
        <div>
          <p className="eyebrow">Conferencia manual</p>
          <h2>Conferir importacoes ASA</h2>
        </div>
      </header>

      <section className="panel">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Demonstrativo
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {demonstratives.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.convenioName} | {formatDateOnly(item.payment.paymentDate)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Resultado
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as AsaImportReviewStatus)}
            >
              <option value={AsaImportReviewStatus.CORRECT}>Importacao correta</option>
              <option value={AsaImportReviewStatus.DIFFERENT_VALUE}>Valor diferente</option>
              <option value={AsaImportReviewStatus.ERROR}>ASA apresentou erro</option>
            </select>
          </label>

          {status === AsaImportReviewStatus.DIFFERENT_VALUE ? (
            <label>
              Valor efetivamente importado
              <input
                value={importedValue}
                onChange={(event) => setImportedValue(event.target.value)}
                placeholder="136954,24"
              />
            </label>
          ) : null}

          <label className="full-width">
            Observacoes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
          </label>

          <button className="primary-button" type="submit" disabled={!selected}>
            Salvar conferencia
          </button>
        </form>
      </section>

      {selected ? (
        <section className="two-column">
          <article className="panel">
            <p className="eyebrow">Valor esperado</p>
            <h3>{formatMoneyBRL(selected.importReview.expectedAmountCents)}</h3>
          </article>
          <article className="panel">
            <p className="eyebrow">Diferenca atual</p>
            <h3>
              {selected.importReview.differenceAmountCents === null
                ? '-'
                : formatMoneyBRL(selected.importReview.differenceAmountCents)}
            </h3>
          </article>
        </section>
      ) : null}
    </section>
  );
}
