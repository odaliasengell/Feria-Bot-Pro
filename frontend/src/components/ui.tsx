import { useEffect, type ReactNode } from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { Calificacion } from '../types';
import { CALIFICACIONES, colorDe, iniciales, type Tone } from '../lib/utils';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = '', title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, icon, tone = 'navy', hint }: { label: string; value: ReactNode; icon: ReactNode; tone?: Tone; hint?: string }) {
  return (
    <div className={`stat tone-${tone}`}>
      <div className="stat-top">
        <span className="stat-tag">{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}

export function CalificacionBadge({ c }: { c: Calificacion }) {
  const info = CALIFICACIONES[c];
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

export function Avatar({ nombre, src, size = 40, square = false }: { nombre: string; src?: string; size?: number; square?: boolean }) {
  const style = { width: size, height: size, fontSize: size * 0.38, borderRadius: square ? size * 0.28 : '50%' };
  if (src) return <img className="avatar" src={src} alt={nombre} style={{ ...style, objectFit: 'cover' }} />;
  return (
    <span className="avatar" style={{ ...style, background: colorDe(nombre) }}>
      {iniciales(nombre)}
    </span>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function Loader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="loader">
      <span className="spinner" /> {label}
    </div>
  );
}

export function Alert({ tone = 'orange', children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`alert tone-${tone}`}>{children}</div>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/**
 * Campo con etiqueta. Con `error` el campo se marca en rojo y el mensaje reemplaza a la ayuda; el input debe llevar
 * `aria-invalid` (el hook useValidacion lo usa para enfocar el primer campo con error).
 */
export function Field({
  label,
  children,
  hint,
  full,
  error,
  opcional,
  className = '',
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  full?: boolean;
  className?: string;
  error?: string | null;
  /** Agrega «(opcional)» a la etiqueta. */
  opcional?: boolean;
}) {
  return (
    <label className={`field ${full ? 'field-full' : ''} ${error ? 'has-error' : ''} ${className}`}>
      <span className="field-label">
        {label}
        {opcional && <span className="field-opcional"> (opcional)</span>}
      </span>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          <AlertCircle size={14} /> {error}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </label>
  );
}
