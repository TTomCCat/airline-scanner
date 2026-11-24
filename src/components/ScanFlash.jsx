// Big glanceable confirmation after each scan: the seat number huge, readable from arm's length.
// flash = { id, kind: 'ok' | 'warn' | 'err', seat, name, text } — hides itself, never blocks taps.
import { useEffect } from 'react';
import { AlertTriangle, CircleCheck, CircleX } from 'lucide-react';

export default function ScanFlash({ flash, onDone, ms = 1100 }) {
  useEffect(() => {
    if (!flash) return undefined;
    const id = setTimeout(onDone, ms);
    return () => clearTimeout(id);
  }, [flash, onDone, ms]);

  if (!flash) return null;
  const Icon = flash.kind === 'err' ? CircleX : flash.kind === 'warn' ? AlertTriangle : CircleCheck;
  return (
    <div key={flash.id} className={`scan-flash ${flash.kind}`} role="status" aria-live="assertive">
      <div className="scan-flash-card">
        <Icon size={36} strokeWidth={2} aria-hidden="true" />
        {flash.seat && <div className="scan-flash-seat">{flash.seat}</div>}
        {flash.name && <div className="scan-flash-name">{flash.name}</div>}
        {flash.text && <div className="scan-flash-text">{flash.text}</div>}
      </div>
    </div>
  );
}
