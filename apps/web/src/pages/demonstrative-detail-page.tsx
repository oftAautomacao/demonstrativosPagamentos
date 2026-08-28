import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { formatMoneyBRL } from '@asa/domain';

import { fetchDemonstrative, getFileUrl } from '../api';
import { formatDateOnly, formatDateTime } from '../formatters';

export function DemonstrativeDetailPage() {
  const { id = '' } = useParams();
  const [demonstrative, setDemonstrative] = useState<Awaited<ReturnType<typeof fetchDemonstrative>> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const next = await fetchDemonstrative(id);
      setDemonstrative(next);
      setLoading(false);
    }

    void load();
  }, [id]);

  if (loading || !demonstrative) {
    return <section className="panel">Carregando demonstrativo...</section>;
  }

  return (
    <section className="stack">
      <header className="detail-header">
        <div>
          <p className="eyebrow">Detalhes do demonstrativo</p>
          <h2>
            {demonstrative.convenioName} • {formatDateOnly(demonstrative.payment.paymentDate)}
          </h2>
        </div>
        <Link className="ghost-button" to="/">
          Voltar
        </Link>
      </header>

      <div className="stats-grid">
        <article className="stat-card">
          <span>Valor portal</span>
          <strong>
            {demonstrative.portalAmountCents === null
              ? '-'
              : formatMoneyBRL(demonstrative.portalAmountCents)}
          </strong>
        </article>
        <article className="stat-card">
          <span>Valor demonstrativo</span>
          <strong>{formatMoneyBRL(demonstrative.demonstrativeAmountCents)}</strong>
        </article>
        <article className="stat-card">
          <span>Status</span>
          <strong>{demonstrative.status}</strong>
        </article>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Linha do tempo</p>
            <h3>Processamento</h3>
          </div>
        </div>

        <div className="timeline">
          {demonstrative.timeline.map((event) => (
            <article key={event.id} className="timeline-item">
              <span className={event.success ? 'timeline-dot success' : 'timeline-dot error'} />
              <div>
                <strong>{event.title}</strong>
                <p>{event.details}</p>
                <small>{formatDateTime(event.occurredAt)}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="two-column">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Arquivos</p>
              <h3>Originais e gerados</h3>
            </div>
          </div>
          <ul className="file-list">
            {demonstrative.originalFiles.map((file) => (
              <li key={file.id}>
                <a href={getFileUrl(file.relativePath)} target="_blank" rel="noreferrer">
                  {file.fileName}
                </a>
                <span>{file.sha256.slice(0, 12)}...</span>
              </li>
            ))}
            {demonstrative.processedFiles.map((file) => (
              <li key={file.id}>
                <a href={getFileUrl(file.relativePath)} target="_blank" rel="noreferrer">
                  {file.fileName}
                </a>
                <span>processado</span>
              </li>
            ))}
            {demonstrative.asaFile ? (
              <li>
                <a href={getFileUrl(demonstrative.asaFile.relativePath)} target="_blank" rel="noreferrer">
                  {demonstrative.asaFile.fileName}
                </a>
                <span>ASA</span>
              </li>
            ) : null}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Validacao</p>
              <h3>Resumo pre-ASA</h3>
            </div>
          </div>
          <p>Status: {demonstrative.validation?.status ?? 'Pendente'}</p>
          <p>Guias: {demonstrative.validation?.guideCount ?? 0}</p>
          <p>
            Total ASA:{' '}
            {demonstrative.validation ? formatMoneyBRL(demonstrative.validation.asaAmountCents) : '-'}
          </p>
          <ul className="issue-list">
            {demonstrative.validation?.issues.length ? (
              demonstrative.validation.issues.map((issue) => (
                <li key={issue.code}>
                  {issue.severity}: {issue.message}
                </li>
              ))
            ) : (
              <li>Nenhuma divergencia encontrada.</li>
            )}
          </ul>
        </article>
      </section>
    </section>
  );
}
