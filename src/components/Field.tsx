import type { ReactNode } from 'react';

interface BaseProps {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, required, hint, children }: BaseProps) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="field-required">*</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="field-row">{children}</div>;
}
