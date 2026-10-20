import ThemeToggle from './ThemeToggle';

/**
 * Translucent sticky navigation bar: brand, live-link status, theme switch.
 */
export default function TopBar({ connected, transport, themePreference, onThemeChange }) {
  return (
    <nav className="topbar" aria-label="App">
      <div className="topbar__inner">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6l7-3z" />
            </svg>
          </span>
          <span className="brand__name">Cyber Responder</span>
        </div>

        <div className="topbar__actions">
          <span className={`live ${connected ? 'live--up' : 'live--down'}`} role="status">
            <span className="live__dot" aria-hidden="true" />
            {connected ? 'Sensor live' : 'Reconnecting'}
            <span className="visually-hidden"> via {transport}</span>
          </span>
          <ThemeToggle preference={themePreference} onChange={onThemeChange} />
        </div>
      </div>
    </nav>
  );
}
