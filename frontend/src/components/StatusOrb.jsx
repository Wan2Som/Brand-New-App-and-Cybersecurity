/**
 * The signature element: a living status orb.
 *   secure    - green sphere with a rotating radar sweep ("watching")
 *   alarm     - red sphere, heartbeat + shockwave rings
 *   contained - amber sphere with a slowly turning shield ring
 * Pure CSS animation (see .orb in globals.css); respects reduced motion.
 */
const svg = (children) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const ICONS = {
  secure: svg(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  alarm: svg(
    <>
      <path d="M12 6v8" />
      <path d="M12 18h.01" />
    </>,
  ),
  contained: svg(<path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6l7-3z" />),
};

export default function StatusOrb({ tone }) {
  return (
    <div className={`orb orb--${tone}`} aria-hidden="true">
      <span className="orb__halo" />
      <span className="orb__wave orb__wave--1" />
      <span className="orb__wave orb__wave--2" />
      <span className="orb__wave orb__wave--3" />
      <span className="orb__orbit" />
      <span className="orb__core">
        <span className="orb__grid" />
        <span className="orb__sweep" />
        <span className="orb__gloss" />
        <span className="orb__icon">{ICONS[tone]}</span>
      </span>
    </div>
  );
}
