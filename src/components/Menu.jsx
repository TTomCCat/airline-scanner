// Small "⋯" overflow menu. Closes on outside tap, Escape, or after picking an item.
// items: [{ label, icon: LucideIcon, onClick, danger?, disabled?, checked? }] — `checked` marks the current choice
import { useEffect, useId, useRef, useState } from 'react';
import { Check, MoreHorizontal } from 'lucide-react';

export default function Menu({ items, label, disabled, icon: Trigger = MoreHorizontal }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        className="icon-btn menu-btn"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <Trigger size={20} />
      </button>
      {open && (
        <div className="menu-list" role="menu" id={id}>
          {items.filter(Boolean).map(({ label: text, icon: Icon, onClick, danger, disabled: off, checked }) => (
            <button
              key={text}
              role={checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={checked}
              className={danger ? 'danger' : ''}
              disabled={off}
              onClick={() => {
                setOpen(false);
                onClick();
              }}
            >
              <span className="menu-icon">{Icon && <Icon size={16} aria-hidden="true" />}</span>
              {text}
              {checked && <Check size={16} className="menu-check" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
