import { AlertCircle, ArrowRight, LoaderCircle } from 'lucide-react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';

export const Button = ({
  children,
  className = '',
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' }) => (
  <button className={`button button--${variant} ${className}`} {...props}>
    <span>{children}</span>
    {variant === 'primary' ? <ArrowRight aria-hidden="true" size={16} /> : null}
  </button>
);

export const Field = ({
  error,
  hint,
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  error?: string | undefined;
  hint?: string | undefined;
  label: string;
}) => {
  const id = props.id ?? props.name;
  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}</span>
      <input className="field__control" id={id} {...props} />
      {error ? (
        <span className="field__error">{error}</span>
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </label>
  );
};

export const TextAreaField = ({
  error,
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string | undefined; label: string }) => {
  const id = props.id ?? props.name;
  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}</span>
      <textarea className="field__control field__control--textarea" id={id} {...props} />
      {error ? <span className="field__error">{error}</span> : null}
    </label>
  );
};

export const StatusPill = ({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'good' | 'neutral' | 'warn';
}) => (
  <span className={`status status--${tone}`}>
    <i aria-hidden="true" />
    {children}
  </span>
);

export const LoadingState = ({ label = 'Loading workspace' }: { label?: string }) => (
  <div className="state-panel" role="status">
    <LoaderCircle aria-hidden="true" className="spin" size={22} />
    <p>{label}</p>
  </div>
);

export const ErrorState = ({ message, retry }: { message: string; retry?: () => void }) => (
  <div className="state-panel state-panel--error" role="alert">
    <AlertCircle aria-hidden="true" size={22} />
    <div>
      <strong>Something needs attention</strong>
      <p>{message}</p>
    </div>
    {retry ? (
      <Button onClick={retry} variant="secondary">
        Try again
      </Button>
    ) : null}
  </div>
);

export const EmptyState = ({ children, title }: { children?: ReactNode; title: string }) => (
  <div className="empty-state">
    <span aria-hidden="true">00</span>
    <h3>{title}</h3>
    {children}
  </div>
);
