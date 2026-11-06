import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx.ts";

export type ButtonVariant = "primary" | "secondary" | "link";

const base =
  "inline-flex min-h-11 items-center justify-center font-mono text-sm font-semibold uppercase tracking-[0.04em] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen-blue";

const variants: Record<ButtonVariant, string> = {
  primary: "rounded-none bg-ink px-6 py-3 text-paper",
  secondary: "rounded-none bg-pen-blue px-6 py-3 text-paper",
  link: "normal-case tracking-normal text-pen-blue underline underline-offset-4",
};

export function buttonClasses(variant: ButtonVariant, className?: string): string {
  return cx(base, variants[variant], className);
}

type CommonProps = { variant?: ButtonVariant; children: ReactNode; className?: string };
type ButtonProps = CommonProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & { href?: undefined };
type AnchorProps = CommonProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children"> & { href: string };

/** Square-cornered button. Renders a real <a> when href is given, otherwise a real <button>. */
export function Button(props: ButtonProps | AnchorProps) {
  const { variant = "primary", className, children, ...rest } = props;
  if ("href" in rest && rest.href !== undefined) {
    return (
      <a className={buttonClasses(variant, className)} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={buttonClasses(variant, className)} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
