// Small notification at the bottom of the screen that hides itself.
import { useEffect } from 'react';
import { AlertTriangle, CircleAlert, CircleCheck } from 'lucide-react';

export default function Toast({ toast, onDone, ms: msProp }) {
  const ms = msProp ?? (toast?.kind === 'warn' ? 4000 : 2200); // warnings stay a bit longer
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
    </div>
  );
}
