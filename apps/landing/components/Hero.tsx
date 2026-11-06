"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useReducer } from "react";
import { copy, PLATFORM_URL } from "../content/copy.ts";
import { heroPairs, type HeroPair } from "../content/heroPairs.ts";
import { delayFor, heroReducer, initialHeroState, type HeroAction, type HeroState } from "../lib/heroLoop.ts";
import { AdmitCard, CardDivider, CardField, PhotoBox } from "./AdmitCard.tsx";
import { Button } from "./Button.tsx";
import { CheckboxTag } from "./CheckboxTag.tsx";
import { Hand } from "./Hand.tsx";
import { Stamp } from "./Stamp.tsx";
import { cx } from "../lib/cx.ts";

const fill = (template: string, pair: HeroPair) => template.replace("{USE CASE}", pair.useCase.toUpperCase());

/** Hero (spec 5.2): pain headline, handwritten answer, pills, and the matched admit card. */
export function Hero({ pairs = heroPairs }: { pairs?: readonly HeroPair[] }) {
  const reduced = useReducedMotion() ?? false;
  const reducer = useCallback(
    (state: HeroState, action: HeroAction) => heroReducer(state, action, pairs.length),
    [pairs.length],
  );
  const [state, dispatch] = useReducer(reducer, undefined, initialHeroState);

  useEffect(() => {
    if (reduced) {
      dispatch({ type: "settle" });
      return;
    }
    const id = setTimeout(() => dispatch({ type: "tick" }), delayFor(state));
    return () => clearTimeout(id);
  }, [state, reduced]);

  const pair = pairs[state.index];
  if (!pair) return null;
  const answered = state.phase === "answer";
  const t = reduced ? { duration: 0 } : { duration: 0.45, ease: "easeOut" as const };

  return (
    <section aria-labelledby="hero-headline" className="mx-auto max-w-7xl px-4 pb-16 pt-10 md:px-8 md:pt-16">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-14 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-12">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-pen-blue md:text-sm">
            {fill(copy.hero.eyebrowTemplate, pair)}
          </p>

          <motion.h1
            id="hero-headline"
            animate={{ opacity: answered ? 0.5 : 1 }}
            transition={t}
            className={cx(
              "mt-4 min-h-[calc(4*1.02em)] font-display sm:min-h-[calc(3*1.02em)] text-[42px] font-bold uppercase leading-[1.02] text-ink md:text-7xl",
              "decoration-[0.08em] [text-decoration-line:line-through] [transition:text-decoration-color_0.45s]",
              answered ? "decoration-stamp-red" : "decoration-transparent",
            )}
          >
            {pair.headline}
          </motion.h1>

          {/* Announce only the solution, and only once it is written in. */}
          <p aria-live="polite" className="sr-only">
            {answered ? pair.subhead : ""}
          </p>

          <div aria-hidden="true" className="mt-5 min-h-[calc(3*1.1em)] text-[34px] leading-[1.1] md:text-5xl">
            <AnimatePresence mode="wait">
              {answered && (
                <motion.div
                  key={pair.id}
                  initial={{ opacity: 0, y: reduced ? 0 : 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={t}
                >
                  <Hand className="text-[length:inherit]">{pair.subhead}</Hand>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button href={PLATFORM_URL}>{copy.hero.primaryCta}</Button>
            <a
              href="#for-alumni"
              className="inline-flex min-h-11 items-center font-mono text-sm text-pen-blue underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen-blue"
            >
              {copy.hero.secondaryCta}
            </a>
          </div>

          <ul
            aria-label="Use cases"
            className="-mx-4 mt-8 flex gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
          >
            {pairs.map((p, i) => {
              const active = i === state.index;
              return (
                <li key={p.id} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => dispatch({ type: "select", index: i })}
                    className={cx(
                      "min-h-11 border-2 border-ink px-3 font-mono text-xs font-semibold uppercase tracking-[0.04em]",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen-blue",
                      active ? "bg-ink text-paper" : "bg-card text-ink",
                    )}
                  >
                    {p.pill}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative mt-8 min-w-0 lg:mt-12">
          <Stamp rotate={-6} className="absolute -top-16 right-3 z-10 bg-paper/0 text-center text-base md:text-lg">
            {copy.hero.stamp[0]}
            <br />
            {copy.hero.stamp[1]}
          </Stamp>
          <AdmitCard title={fill(copy.hero.cardHeaderTemplate, pair)} className="min-h-[26rem]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${pair.id}-${state.phase}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={t}
              >
                {answered ? <MatchedAlum pair={pair} /> : <Searching />}
              </motion.div>
            </AnimatePresence>
          </AdmitCard>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-label">
            {copy.hero.illustrativeCaption}
          </p>
        </div>
      </div>
    </section>
  );
}

function Searching() {
  return (
    <div data-searching>
      <p className="font-mono text-sm text-label">{copy.hero.searching}</p>
      <div aria-hidden="true" className="mt-6 space-y-8">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border-b-2 border-dotted border-ink/40" />
        ))}
      </div>
    </div>
  );
}

/* Exported for tests: the answer-state card only renders after the client-side
   match loop, so server snapshots of <Hero /> never reach it. */
export function MatchedAlum({ pair }: { pair: HeroPair }) {
  const f = copy.hero.cardFields;
  const { alum } = pair;
  return (
    <div data-matched>
      <div className="flex items-start gap-4">
        <PhotoBox name={alum.name} />
        <dl className="min-w-0 flex-1">
          <CardField label={f.name}>
            <span className="font-display text-xl font-bold uppercase">{alum.name}</span>
          </CardField>
          <CardField label={f.batchBranch}>{alum.batchBranch}</CardField>
        </dl>
      </div>
      <CardDivider />
      <dl>
        <CardField label={f.currently}>{alum.currently}</CardField>
        <CardDivider />
        <CardField label={f.whyThem}>
          <Hand className="block leading-tight">{alum.whyThem}</Hand>
        </CardField>
      </dl>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        {alum.tags.map((tag) => (
          <CheckboxTag key={tag} label={tag} />
        ))}
      </div>
      <Button href={PLATFORM_URL} variant="secondary" className="mt-4 w-full">
        {f.reachOut}
      </Button>
    </div>
  );
}
