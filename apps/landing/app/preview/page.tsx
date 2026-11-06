import type { Metadata } from "next";
import { AdmitCard, CardDivider, CardField, PhotoBox } from "../../components/AdmitCard.tsx";
import { Button } from "../../components/Button.tsx";
import { CheckboxTag } from "../../components/CheckboxTag.tsx";
import { Hand } from "../../components/Hand.tsx";
import { Stamp } from "../../components/Stamp.tsx";
import { colors } from "../../lib/tokens.ts";

export const metadata: Metadata = {
  title: "Component preview | Alma Mater",
  robots: { index: false, follow: false },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t-2 border-ink py-8">
      <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-label">{title}</h2>
      {children}
    </section>
  );
}

/** Internal preview of the base components. Not linked from the public page in later phases. */
export default function PreviewPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-4xl font-bold uppercase md:text-6xl">Component preview</h1>
      <p className="mt-2 font-mono text-sm text-label">Phase 1. Sample content only, all names are fictional.</p>

      <Section title="Colour tokens">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(colors).map(([name, hex]) => (
            <li key={name} className="border-2 border-ink bg-card">
              <div className="h-12 border-b-2 border-ink" style={{ backgroundColor: hex }} />
              <div className="p-2 font-mono text-xs">
                <div className="font-semibold">{name}</div>
                <div className="text-label">{hex}</div>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Typography">
        <p className="font-display text-5xl font-bold uppercase leading-none md:text-7xl">No one to refer you?</p>
        <Hand as="p" className="mt-3 block text-4xl md:text-5xl">
          Someone from your college works there.
        </Hand>
        <p className="mt-4 font-mono text-sm">Body text in IBM Plex Mono. Field labels are 11 to 12px uppercase.</p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary">Join as an alum</Button>
          <Button variant="secondary">Reach out</Button>
          <Button variant="link" href="#alumni">
            I am an alum. I want to help.
          </Button>
        </div>
      </Section>

      <Section title="Checkbox tags and stamp">
        <div className="flex flex-wrap items-center gap-6">
          <CheckboxTag label="Open to referrals" />
          <CheckboxTag label="Payments team" />
          <Stamp rotate={-6}>
            There is an alum
            <br />
            for this.
          </Stamp>
        </div>
      </Section>

      <Section title="Admit card">
        <div className="relative max-w-md">
          <Stamp rotate={-6} className="absolute -top-9 right-2 z-10 bg-paper text-sm">
            Trusted: same campus
          </Stamp>
          <AdmitCard title="Alumni admit card · match for: referral">
            <div className="flex gap-4">
              <PhotoBox name="Ananya Rao" />
              <dl className="min-w-0 flex-1">
                <CardField label="Name">
                  <span className="font-display text-xl font-bold uppercase">Ananya Rao</span>
                </CardField>
                <CardDivider />
                <CardField label="Batch · Branch">Batch of &rsquo;16 · Electrical</CardField>
              </dl>
            </div>
            <CardDivider />
            <dl>
              <CardField label="Currently">Senior Product Manager, consumer fintech</CardField>
              <CardField label="Why them">
                <Hand>Works at the company you are applying to.</Hand>
              </CardField>
            </dl>
            <div className="mt-2 flex flex-wrap gap-4">
              <CheckboxTag label="Open to referrals" />
              <CheckboxTag label="Payments team" />
            </div>
            <div className="mt-4">
              <Button variant="secondary">Reach out</Button>
            </div>
          </AdmitCard>
        </div>
        <p className="mt-3 font-mono text-xs text-label">Illustrative example</p>
      </Section>
    </main>
  );
}
