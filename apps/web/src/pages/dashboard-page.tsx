import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatMoneyBRL } from '@asa/domain';

import { executeDemoRun, fetchDashboard } from '../api';
import { formatDateOnly, formatDateTime } from '../formatters';

type DashboardState = Awaited<ReturnType<typeof fetchDashboard>>;

export function DashboardPage() {
  const [data, setData] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchDashboard();
      setData(next);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleExecuteNow() {
    setRunning(true);
    try {
      await executeDemoRun();
      await load();
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return <section className="panel">Carregando painel...</section>;
  }

  if (!data || error) {
    return <section className="panel">Falha ao carregar o painel: {error}</section>;
  }

  return (
    <section className="stack">
      <header className="hero">
        <div>
          <p className="eyebrow">Operacao local</p>
          <h2>Central de Demonstrativos ASA</h2>
          <p className="hero-copy">
            O backend local executa o fluxo de captura e geracao do XLSX ASA. A interface apenas
            acompanha o status e registra a conferencia manual.
          </p>
        </div>

        <div className="hero-actions">
          <button className="primary-button" onClick={() => void handleExecuteNow()} disabled={running}>
            {running ? 'Executando...' : 'Executar agora'}
          </button>
          <Link to="/settings" className="ghost-button">
            Configuracoes
          </Link>
        </div>
      </header>

      <div className="stats-grid">
        <article className="stat-card">
          <span>Proxima execucao</span>
          <strong>
            {data.scheduler.nextRunAt ? formatDateTime(data.scheduler.nextRunAt) : 'Nao agendada'}
          </strong>
        </article>
        <article className="stat-card">
          <span>Ultima execucao</span>
          <strong>{data.scheduler.lastRunAt ? formatDateTime(data.scheduler.lastRunAt) : 'Nenhuma'}</strong>
        </article>
        <article className="stat-card">
          <span>Ultimo run</span>
          <strong>{data.latestRun?.id ?? 'Sem execucao'}</strong>
        </article>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Demonstrativos</p>
            <h3>Fila processada</h3>
          </div>
          <Link to="/asa-review" className="text-link">
            Conferir importacoes
          </Link>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Convenio</th>
                <th>Pagamento</th>
                <th>Valor</th>
                <th>Guias</th>
                <th>Status</th>
                <th>Arquivo ASA</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {data.demonstratives.map((demonstrative) => (
                <tr key={demonstrative.id}>
                  <td>{demonstrative.convenioName}</td>
                  <td>{formatDateOnly(demonstrative.payment.paymentDate)}</td>
                  <td>{formatMoneyBRL(demonstrative.demonstrativeAmountCents)}</td>
                  <td>{demonstrative.guideCount}</td>
                  <td>
                    <span className="status-pill">{demonstrative.status}</span>
                  </td>
                  <td>{demonstrative.asaFile?.fileName ?? 'Nao gerado'}</td>
                  <td>
                    <Link className="text-link" to={`/demonstratives/${demonstrative.id}`}>
                      Ver detalhes
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
