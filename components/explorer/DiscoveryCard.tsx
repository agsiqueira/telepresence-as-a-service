import type { ReactNode } from "react";
import { StatusBadge, Surface, type BadgeVariant } from "@/components/ui/primitives";

export default function DiscoveryCard({
  title,
  typeLabel,
  status,
  statusTone = "neutral",
  description,
  metadata,
  action,
}: {
  title: string;
  typeLabel: string;
  status: string;
  statusTone?: BadgeVariant;
  description?: ReactNode;
  metadata?: ReactNode;
  action: ReactNode;
}) {
  return (
    <Surface className="flex h-full min-w-0 flex-col break-words">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label text-ink-muted">{typeLabel}</p>
          <h3 className="mt-1 text-heading-3">{title}</h3>
        </div>
        <StatusBadge variant={statusTone}>{status}</StatusBadge>
      </div>
      {description && <div className="mt-3 text-body-sm text-ink-secondary">{description}</div>}
      {metadata && <div className="mt-4">{metadata}</div>}
      <div className="mt-auto pt-5">{action}</div>
    </Surface>
  );
}
