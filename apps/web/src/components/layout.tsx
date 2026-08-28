import { NavLink, Outlet } from 'react-router-dom';

const navigation = [
  { to: '/', label: 'Painel' },
  { to: '/asa-review', label: 'Conferir ASA' },
  { to: '/settings', label: 'Configuracoes' },
];

export function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Central de Demonstrativos</p>
          <h1>ASA</h1>
          <p className="sidebar-copy">
            Fluxo local para baixar, normalizar, validar e acompanhar demonstrativos.
          </p>
        </div>

        <nav className="nav">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              end={item.to === '/'}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
