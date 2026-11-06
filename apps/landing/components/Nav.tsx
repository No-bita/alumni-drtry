import Link from "next/link";
import { copy, PLATFORM_URL } from "../content/copy.ts";
import { Button, buttonClasses } from "./Button.tsx";

/** Top bar (spec 5.1). On small screens: wordmark plus the join button only. */
export function Nav() {
  const { wordmark, badge, forAlumniLink, joinButton } = copy.nav;
  return (
    <header className="border-b-2 border-ink">
      <nav aria-label="Main" className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="whitespace-nowrap font-display text-xl font-bold uppercase tracking-wide text-ink sm:text-2xl">
            {wordmark}
          </Link>
          <span className="hidden border border-dashed border-ink px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-ink md:inline-block">
            {badge}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden md:block">
            <a href="#for-alumni" className={buttonClasses("link")}>
              {forAlumniLink}
            </a>
          </span>
          <Button href={PLATFORM_URL} className="px-3 text-xs sm:px-4 sm:text-sm">
            {joinButton}
          </Button>
        </div>
      </nav>
    </header>
  );
}
