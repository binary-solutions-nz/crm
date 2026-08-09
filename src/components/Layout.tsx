import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '▚', end: true },
  { to: '/clients', label: 'Clients', icon: '☰' },
  { to: '/subscriptions', label: 'Subscriptions', icon: '⟳' },
  { to: '/services', label: 'Services', icon: '⚙' },
  { to: '/renewals', label: 'Renewals', icon: '⏰' },
  { to: '/data-tools', label: 'Import / Export', icon: '⇅' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <span className="sidebar-logo">B</span>
          <div className="sidebar-brand-text">
            <strong>Binary Solutions</strong>
            <span>IT Support CRM</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span className="nav-icon" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user" title={user?.email ?? ''}>
            {user?.email}
          </div>
          <button className="btn btn-ghost btn-block" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button
            className="menu-toggle"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            ☰
          </button>
          <span className="topbar-title">Binary Solutions CRM</span>
        </header>
        <main className="content">{children}</main>
      </div>

      {open && <div className="sidebar-scrim" onClick={() => setOpen(false)} />}
    </div>
  );
}
