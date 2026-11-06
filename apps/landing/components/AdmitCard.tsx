import type { ReactNode } from "react";
import { initials } from "../lib/initials.ts";
import { cx } from "../lib/cx.ts";

type AdmitCardProps = {
  /** Header bar text. Shown uppercase in mono. */
  title: string;
  children: ReactNode;
  className?: string;
};

/** Admit card surface: card background, 2px ink border, dark header bar. */
export function AdmitCard({ title, children, className }: AdmitCardProps) {
  return (
    <section data-admit-card className={cx("border-2 border-ink bg-card text-ink", className)}>
      <header className="bg-ink px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-paper">
        {title}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

type CardFieldProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

/** Form-style field: small label above a value. */
export function CardField({ label, children, className }: CardFieldProps) {
  return (
    <div className={cx("py-2", className)}>
      <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-label">{label}</dt>
      <dd className="mt-1 font-mono text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

/** Dashed divider between fields. */
export function CardDivider() {
  return <hr className="my-1 border-0 border-t border-dashed border-ink" />;
}

/** Photo box showing initials, on the tint fill. */
export function PhotoBox({ name, className }: { name: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`Photo placeholder for ${name}`}
      className={cx(
        "flex h-24 w-20 shrink-0 items-center justify-center border-2 border-ink bg-tint",
        "font-display text-3xl font-bold uppercase text-ink",
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
