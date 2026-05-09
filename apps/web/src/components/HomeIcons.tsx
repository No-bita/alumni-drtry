import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function IconSearch(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l5 5" />
    </svg>
  );
}

export function IconBriefcase(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M3 12h18" />
    </svg>
  );
}

export function IconHelp(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 115 0c0 2-2.5 2-2.5 4" />
      <circle cx="12" cy="17.4" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}>
      <circle cx="9" cy="9" r="3" />
      <circle cx="16.5" cy="10" r="2.5" />
      <path d="M3.5 19a5.5 5.5 0 0111 0M14.5 19a4 4 0 016.5-3.1" />
    </svg>
  );
}

export function IconCity(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}>
      <path d="M4 20V9l6-3v14M10 20h10V4l-6 2v14M7 12h.01M7 15h.01M13 10h.01M16 10h.01M13 13h.01M16 13h.01" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}>
      <path d="M6 9a6 6 0 1112 0v4l2 2H4l2-2V9z" />
      <path d="M10 18a2 2 0 004 0" />
    </svg>
  );
}

export function IconBookmark(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}>
      <path d="M7 4h10a1 1 0 011 1v15l-6-3-6 3V5a1 1 0 011-1z" />
    </svg>
  );
}

/** Bulletin / share announcement affordance */
export function IconMegaphone(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}>
      <path d="M4 11v3l4 2v-7l-4 2z" />
      <path d="M8 10v4l7 4c2 1 4-.9 4-3v-6c0-2.1-2-4-4-3L8 10z" />
      <path d="M18 16v3a2 2 0 01-2 2" />
    </svg>
  );
}

export function IconFile(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function IconRefer(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}>
      <path d="M8.5 13.5l-2.3 2.3a2.8 2.8 0 103.9 3.9l2.7-2.7M15.5 10.5l2.3-2.3a2.8 2.8 0 10-3.9-3.9L11.2 7" />
      <path d="M8 12h8" />
      <path d="M9.8 8.2L14.2 15.8" />
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}>
      <path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-7H10v7H5a1 1 0 01-1-1v-9.5z" />
    </svg>
  );
}

export function IconHammer(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}>
      <path d="M14.5 4.5l5 5-4 4M10 11l-8 8 3 3 8-8M15 8l2 2" />
    </svg>
  );
}

/** Graduation cap — paired with cohort year (class of) across the product. */
export function IconGradCap(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M12 15l-8-4 8-4 8 4-8 4z" />
      <path d="M4 11v4c0 1.2 2.9 3 8 3s8-1.8 8-3v-4" />
      <path d="M19 15v4s-2.2 2-7 2-7-2-7-2v-4" />
    </svg>
  );
}

/** Small “opens target” affordance — corner of quick-action tiles. */
export function IconArrowUpRight(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M8 16L17 7M17 7h-6M17 7v6" />
    </svg>
  );
}
