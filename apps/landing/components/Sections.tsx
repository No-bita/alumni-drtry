import { copy, PLATFORM_URL } from "../content/copy.ts";
import { taskWall, taskWallCopy } from "../content/taskWall.ts";
import { AdmitCard } from "./AdmitCard.tsx";
import { Button } from "./Button.tsx";
import { CheckboxTag } from "./CheckboxTag.tsx";
import { Hand } from "./Hand.tsx";
import { Stamp } from "./Stamp.tsx";

const wrap = "mx-auto max-w-7xl px-4 py-14 md:px-8 md:py-20";
const h2 = "font-display text-3xl font-bold uppercase leading-[1.05] text-ink md:text-5xl";

/** Gap note (spec 5.3): the problem in one line, and the contrast. */
export function GapNote() {
  const g = copy.gap;
  return (
    <section aria-labelledby="gap-heading" className={wrap}>
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-label md:text-sm">{g.heading}</p>
      <h2 id="gap-heading" className="mt-4 max-w-3xl font-display text-3xl font-bold leading-[1.1] text-ink md:text-5xl">
        {g.body}
      </h2>
      <p className="mt-4 max-w-2xl font-mono text-sm text-label md:text-base">{g.followUp}</p>
      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <div className="border-2 border-dashed border-ink bg-card p-5 font-mono text-sm text-label">{g.contrastLeft}</div>
        <div className="border-2 border-ink bg-tint p-5">
          <Hand className="text-[28px] leading-tight md:text-3xl">{g.contrastRight}</Hand>
        </div>
      </div>
    </section>
  );
}

/** Task wall (spec 5.4): a question paper with three sections. */
export function TaskWall() {
  return (
    <section aria-labelledby="wall-heading" className={wrap}>
      <h2 id="wall-heading" className={h2}>
        {taskWallCopy.heading}
      </h2>
      <p className="mt-2 font-mono text-sm text-label md:text-base">{taskWallCopy.subheading}</p>
      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
        {taskWall.map((s) => (
          <AdmitCard key={s.id} title={s.title} className="group">
            <ol className="space-y-3">
              {s.questions.map((q) => (
                <li
                  key={q.n}
                  className="group/q relative flex gap-3 border-b border-dashed border-ink/40 pb-3 font-mono text-sm text-ink last:border-b-0 last:pb-0"
                >
                  <span className="font-semibold text-label">{q.n}.</span>
                  <span className="min-w-0">{q.text}</span>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-1 right-0 hidden opacity-0 transition-opacity group-hover/q:opacity-100 md:block"
                  >
                    <Stamp rotate={-6} className="bg-card text-xs">
                      {taskWallCopy.hoverStamp}
                    </Stamp>
                  </span>
                </li>
              ))}
            </ol>
          </AdmitCard>
        ))}
      </div>
    </section>
  );
}

/** How it works (spec 5.5): three numbered instructions. */
export function HowItWorks() {
  const h = copy.howItWorks;
  return (
    <section aria-labelledby="how-heading" className={wrap}>
      <h2 id="how-heading" className={h2}>
        {h.heading}
      </h2>
      <ol className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-3">
        {h.steps.map((s) => (
          <li key={s.n} className="border-2 border-ink bg-card p-5">
            <span className="font-display text-5xl font-bold text-pen-blue">{s.n}</span>
            <h3 className="mt-2 font-display text-2xl font-bold uppercase text-ink">{s.title}</h3>
            <p className="mt-2 font-mono text-sm text-label">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** For alumni (spec 5.6). Target of the #for-alumni links. */
export function ForAlumni() {
  const a = copy.forAlumni;
  return (
    <section id={a.anchorId} aria-labelledby="alumni-heading" className={`${wrap} scroll-mt-4`}>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <h2 id="alumni-heading" className={h2}>
            {a.heading}
          </h2>
          <p className="mt-4 max-w-xl font-mono text-sm text-label md:text-base">{a.body}</p>
          <Button href={PLATFORM_URL} className="mt-6">
            {a.cta}
          </Button>
        </div>
        <AdmitCard title="Your answer key">
          <div className="flex flex-col gap-3">
            {a.sampleTags.map((t) => (
              <CheckboxTag key={t} label={t} />
            ))}
          </div>
        </AdmitCard>
      </div>
    </section>
  );
}

/** Build together (spec 5.7). */
export function BuildTogether() {
  const b = copy.buildTogether;
  return (
    <section aria-labelledby="build-heading" className={wrap}>
      <h2 id="build-heading" className={h2}>
        {b.heading}
      </h2>
      <p className="mt-4 max-w-2xl font-mono text-sm text-label md:text-base">{b.body}</p>
      <div className="relative mt-10">
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
          {b.cards.map((c) => (
            <li key={c} className="border-2 border-ink bg-card p-5 font-display text-2xl font-bold uppercase text-ink">
              {c}
            </li>
          ))}
        </ul>
        <Stamp rotate={-6} className="mt-6 text-center md:absolute md:-bottom-8 md:right-4 md:mt-0">
          {b.stamp}
        </Stamp>
      </div>
    </section>
  );
}

/** Expansion strip (spec 5.8): exam centres. */
export function ExamCentres() {
  return (
    <section aria-label="Campuses" className="border-y-2 border-ink bg-tint">
      <ul className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink md:flex-row md:justify-between md:px-8 md:text-sm">
        {copy.examCentres.items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </section>
  );
}


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
