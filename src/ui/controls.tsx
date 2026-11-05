import type { ReactNode } from 'react';
import type { Option } from '../library/intake';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function TextArea({ value, onChange, rows = 3, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return <textarea className="input" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = '— select —',
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option[];
  placeholder?: string;
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Chips({ value, onChange, options, single }: { value: string[]; onChange: (v: string[]) => void; options: Option[]; single?: boolean }) {
  return (
    <div className="chips" role="group">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            type="button"
            key={o.value}
            className={`chip ${on ? 'on' : ''}`}
            aria-pressed={on}
            onClick={() => {
              if (single) onChange(on ? [] : [o.value]);
              else onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value]);
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress" title={label}>
      <div className="progress-bar" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export const DATA_CLASS_OPTIONS: Option[] = [
  { value: 'public', label: 'Public' },
  { value: 'internal', label: 'Internal' },
  { value: 'confidential', label: 'Confidential' },
  { value: 'restricted', label: 'Restricted' },
];
