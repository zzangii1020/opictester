import { useEffect, useRef, type ReactNode } from 'react';
import examInfo from '../data/examInfo.json';

type Status = keyof typeof examInfo.statusLabels;

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{examInfo.statusLabels[status]}</span>;
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'error' | 'success'; title?: string; children: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {title && <strong className="notice-title">{title}</strong>}
      <div>{children}</div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = '확인',
  cancelLabel = '취소',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="dlg-title">{title}</h2>
        {children && <div className="modal-body">{children}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirmRef} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, back }: { title: string; subtitle?: ReactNode; back?: { label: string; href: string } }) {
  return (
    <header className="page-header">
      {back && <a className="back-link" href={`#${back.href}`}>← {back.label}</a>}
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
    </header>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function formatDate(ts: number) {
  return new Date(ts).toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
