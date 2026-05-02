import type { Outcome } from '../data';

type Props = {
  value: Outcome | null;
  onChange: (v: Outcome | null) => void;
};

const OPTIONS: { v: Outcome; label: string; icon: string; cls: string }[] = [
  { v: 'W', label: 'Win',  icon: '▲', cls: 'win' },
  { v: 'D', label: 'Draw', icon: '–', cls: 'draw' },
  { v: 'L', label: 'Loss', icon: '▼', cls: 'loss' },
];

export function Toggle({ value, onChange }: Props) {
  return (
    <div className="toggle">
      {OPTIONS.map((o) => (
        <button
          key={o.v}
          className={`toggle-btn ${o.cls} ${value === o.v ? 'active' : ''}`}
          onClick={() => onChange(value === o.v ? null : o.v)}
          type="button"
        >
          <span className="toggle-icon" aria-hidden="true">{o.icon}</span>
          <span className="toggle-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
