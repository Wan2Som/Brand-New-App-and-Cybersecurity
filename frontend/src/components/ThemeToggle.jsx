/**
 * Segmented control for Light / Dark / Auto, in the style of macOS and iOS.
 */
const icon = (path) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

const OPTIONS = [
  {
    id: 'light',
    label: 'Light',
    icon: icon(
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>,
    ),
  },
  {
    id: 'dark',
    label: 'Dark',
    icon: icon(<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />),
  },
  {
    id: 'system',
    label: 'Auto',
    icon: icon(
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </>,
    ),
  },
];

export default function ThemeToggle({ preference, onChange }) {
  return (
    <div className="segmented" role="group" aria-label="Colour theme">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className="segmented__btn"
          aria-pressed={preference === option.id}
          title={option.id === 'system' ? 'Match my device' : `${option.label} mode`}
          onClick={() => onChange(option.id)}
        >
          {option.icon}
          <span className="segmented__label">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
