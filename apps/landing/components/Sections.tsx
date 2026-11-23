import { copy } from "../content/copy.ts";

/** Footer (spec 5.10). */
export function Footer() {
  const f = copy.footer;
  return (
    <footer className="border-t-2 border-ink">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-8">
        <p className="font-display text-xl font-bold uppercase tracking-wide text-ink">{f.wordmark}</p>
        <p className="font-mono text-sm text-label">{f.tagline}</p>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-sm text-label">
          <a href="/tos" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen-blue">Terms of Service</a>
          <a href="/privacy-policy" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen-blue">Privacy Policy</a>
        </nav>
        <a href={`mailto:${f.contactEmail}`} className="font-mono text-sm text-label underline underline-offset-2 hover:text-ink">
          {f.contactEmail}
        </a>
      </div>
    </footer>
  );
}
