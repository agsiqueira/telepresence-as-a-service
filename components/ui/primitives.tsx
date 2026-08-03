import { cloneElement, isValidElement, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import Link, { type LinkProps } from "next/link";

const join = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");

export type ButtonVariant = "primary" | "secondary" | "subtle" | "danger" | "quiet";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "border border-line-strong bg-action-secondary text-ink hover:border-brand",
  subtle: "bg-brand-subtle text-brand hover:bg-surface-subtle",
  danger: "bg-danger-fg text-white hover:brightness-90",
  quiet: "bg-transparent text-link underline-offset-4 hover:underline",
};
export function buttonClassName(variant: ButtonVariant = "primary", className?: string) {
  return join("inline-flex min-h-control items-center justify-center gap-2 rounded-md px-4 py-2 text-label transition-colors duration-fast ease-standard disabled:cursor-not-allowed disabled:opacity-60", buttonVariants[variant], className);
}
export function Button({ variant = "primary", className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClassName(variant, className)} {...props} />;
}
export function ActionLink({ variant = "primary", className, ...props }: LinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & { variant?: ButtonVariant }) {
  return <Link className={buttonClassName(variant, className)} {...props} />;
}

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={join("rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-6", className)} {...props} />;
}

export type NoticeVariant = "info" | "success" | "warning" | "danger";
const noticeVariants: Record<NoticeVariant, string> = {
  info: "border-info-fg/25 bg-info-bg text-info-fg",
  success: "border-success-fg/25 bg-success-bg text-success-fg",
  warning: "border-warning-fg/25 bg-warning-bg text-warning-fg",
  danger: "border-danger-fg/25 bg-danger-bg text-danger-fg",
};
export function Notice({ variant = "info", title, children, className, role }: { variant?: NoticeVariant; title?: string; children: ReactNode; className?: string; role?: "alert" | "status" }) {
  return <div className={join("rounded-lg border p-4 text-body-sm", noticeVariants[variant], className)} role={role ?? (variant === "danger" ? "alert" : "status")}><div>{title && <p className="font-semibold">{title}</p>}<div className={title ? "mt-1" : undefined}>{children}</div></div></div>;
}

export type BadgeVariant = NoticeVariant | "neutral" | "live" | "guided";
const badgeVariants: Record<BadgeVariant, string> = {
  neutral: "border-line bg-surface-subtle text-ink-secondary", info: "border-info-fg/25 bg-info-bg text-info-fg", success: "border-success-fg/25 bg-success-bg text-success-fg", warning: "border-warning-fg/25 bg-warning-bg text-warning-fg", danger: "border-danger-fg/25 bg-danger-bg text-danger-fg", live: "border-live-fg/25 bg-live-bg text-live-fg", guided: "border-guided-fg/25 bg-guided-bg text-guided-fg",
};
export function StatusBadge({ variant = "neutral", children, className }: { variant?: BadgeVariant; children: ReactNode; className?: string }) {
  return <span className={join("inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-caption", badgeVariants[variant], className)}>{children}</span>;
}

export function PageHeader({ eyebrow, title, description, actions, className }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode; className?: string }) {
  return <header className={join("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}><div className="max-w-prose">{eyebrow && <p className="mb-2 text-label uppercase tracking-wide text-brand">{eyebrow}</p>}<h1 className="text-heading-1">{title}</h1>{description && <p className="mt-3 text-body text-ink-secondary">{description}</p>}</div>{actions && <div className="flex flex-col gap-2 sm:flex-row">{actions}</div>}</header>;
}

export function Field({ id, label, description, error, children, optional }: { id: string; label: string; description?: string; error?: string; children: ReactNode; optional?: boolean }) {
  const describedBy = [description && `${id}-description`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined }) : children;
  return <div><label className="text-label text-ink" htmlFor={id}>{label}{optional && <span className="font-normal text-ink-muted"> (optional)</span>}</label>{description && <p id={`${id}-description`} className="mt-1 text-body-sm text-ink-muted">{description}</p>}<div className="mt-2">{control}</div>{error && <p id={`${id}-error`} className="mt-2 text-body-sm text-danger-fg" role="alert">{error}</p>}</div>;
}
export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={join("unfar-control min-h-28 resize-y", className)} {...props} />; }
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) { return <select className={join("unfar-control", className)} {...props} />; }
export function Choice({ label, description, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { type: "checkbox" | "radio"; label: string; description?: string }) {
  return <label className={join("flex min-h-control cursor-pointer items-start gap-3 rounded-md p-2 focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2", className)}><input className="mt-1 size-5 accent-brand" {...props} /><span><span className="block text-label">{label}</span>{description && <span className="mt-1 block text-body-sm text-ink-muted">{description}</span>}</span></label>;
}

export function MetadataList({ items, className }: { items: Array<{ term: string; detail: ReactNode }>; className?: string }) {
  return <dl className={join("grid gap-4 sm:grid-cols-2", className)}>{items.map(item => <div key={item.term}><dt className="text-label text-ink-muted">{item.term}</dt><dd className="mt-1 text-body text-ink">{item.detail}</dd></div>)}</dl>;
}
export function StatePanel({ title, children, action, tone = "neutral", busy = false }: { title: string; children: ReactNode; action?: ReactNode; tone?: "neutral" | NoticeVariant; busy?: boolean }) {
  const toneClass = tone === "neutral" ? "border-line bg-surface" : noticeVariants[tone];
  return <section className={join("rounded-xl border p-6 text-center", toneClass)} aria-busy={busy || undefined}><h2 className="text-heading-3">{title}</h2><div className="mx-auto mt-2 max-w-prose text-body-sm text-ink-secondary">{children}</div>{action && <div className="mt-5 flex justify-center">{action}</div>}</section>;
}
export function Skeleton({ className, label = "Loading" }: { className?: string; label?: string }) { return <div className={join("h-5 rounded-md bg-surface-subtle motion-safe:animate-pulse", className)} aria-hidden="true"><span className="sr-only">{label}</span></div>; }
export function VisuallyHidden({ children }: { children: ReactNode }) { return <span className="sr-only">{children}</span>; }
export function LiveRegion({ children, assertive = false, className }: { children: ReactNode; assertive?: boolean; className?: string }) { return <div className={className} role={assertive ? "alert" : "status"} aria-live={assertive ? "assertive" : "polite"} aria-atomic="true">{children}</div>; }
