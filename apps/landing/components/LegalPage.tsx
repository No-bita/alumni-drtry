import Link from "next/link";
import { Footer } from "./Sections.tsx";
import { legalEffectiveDate, legalPolicies } from "../content/legal.ts";

type PolicyKey = keyof typeof legalPolicies;

export function LegalPage({ policy }: { policy: PolicyKey }) {
  const content = legalPolicies[policy];
  return (
    <>
      <header className="border-b-2 border-ink">
        <nav aria-label="Legal pages" className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-5 py-5 md:px-8">
          <Link href="/" className="font-display text-2xl font-bold uppercase tracking-wide text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pen-blue">Alma Mater</Link>
          <Link href="/" className="py-2 text-sm text-pen-blue underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pen-blue">Back to home</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-10 md:px-8 md:py-16">
        <article className="border-2 border-ink bg-card p-5 sm:p-8 md:p-12" aria-labelledby="legal-title">
          <h1 id="legal-title" className="font-display text-4xl font-bold uppercase leading-tight text-ink md:text-5xl">{content.title}</h1>
          <p className="mt-3 text-sm text-label">Effective: {legalEffectiveDate}</p>
          <div className="mt-10 space-y-9">
            {content.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="font-display text-2xl font-bold leading-tight text-ink md:text-3xl">{section.heading}</h2>
                <div className="mt-3 space-y-4 text-sm leading-7 text-ink md:text-base md:leading-8">
                  {section.paragraphs.map((paragraph) => <p key={paragraph} className="break-words">{paragraph}</p>)}
                </div>
              </section>
            ))}
          </div>
          <nav aria-label="Related policy" className="mt-10 border-t border-ink pt-5 text-sm">
            <Link href={policy === "privacy-policy" ? "/tos" : "/privacy-policy"} className="inline-flex min-h-11 items-center text-pen-blue underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pen-blue">{policy === "privacy-policy" ? "Terms of Service" : "Privacy Policy"}</Link>
          </nav>
        </article>
      </main>
      <Footer />
    </>
  );
}
