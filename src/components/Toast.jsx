// Small notification at the bottom of the screen that hides itself.
// `toast.action = { label, onClick }` adds a button (e.g. Undo) and keeps the toast up longer.
import { useEffect } from 'react';
import { AlertTriangle, CircleAlert, CircleCheck } from 'lucide-react';

export default function Toast({ toast, onDone, ms: msProp }) {
  const ms = msProp ?? (toast?.action ? 7000 : toast?.kind === 'warn' ? 4000 : 2200); // warnings / undo stay longer
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(onDone, ms);
    return () => clearTimeout(id);
  }, [toast, onDone, ms]);

  if (!toast) return null;
  const Icon = toast.kind === 'err' ? CircleAlert : toast.kind === 'warn' ? AlertTriangle : CircleCheck;
  return (
    <div className={`toast ${toast.kind || ''}`} role="status" aria-live="polite">
      <Icon size={18} aria-hidden="true" />
      <span>{toast.text}</span>
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            onDone();
            toast.action.onClick();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
