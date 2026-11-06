import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANSWER_MS,
  PINNED_ANSWER_MS,
  QUESTION_MS,
  delayFor,
  heroReducer,
  initialHeroState,
  type HeroState,
} from "../lib/heroLoop.ts";

const N = 6;
const tick = (s: HeroState) => heroReducer(s, { type: "tick" }, N);

test("timings match the spec: 1.7s question, 3.6s answer, 5s after a pill click", () => {
  assert.equal(QUESTION_MS, 1700);
  assert.equal(ANSWER_MS, 3600);
  assert.equal(PINNED_ANSWER_MS, 5000);
  assert.equal(delayFor({ index: 0, phase: "question", pinned: false }), 1700);
  assert.equal(delayFor({ index: 0, phase: "answer", pinned: false }), 3600);
  assert.equal(delayFor({ index: 0, phase: "answer", pinned: true }), 5000);
});

test("start state is the first pair in the question phase", () => {
  assert.deepEqual(initialHeroState(), { index: 0, phase: "question", pinned: false });
});

test("settle (reduced motion) shows the current pair answered and keeps the index", () => {
  assert.deepEqual(heroReducer(initialHeroState(), { type: "settle" }, N), { index: 0, phase: "answer", pinned: false });
  const answered: HeroState = { index: 2, phase: "answer", pinned: true };
  assert.deepEqual(heroReducer(answered, { type: "settle" }, N), answered);
  // Same object back when already answered, otherwise a reduced-motion effect would loop forever.
  assert.strictEqual(heroReducer(answered, { type: "settle" }, N), answered);
  const settled = heroReducer(initialHeroState(), { type: "settle" }, N);
  assert.strictEqual(heroReducer(settled, { type: "settle" }, N), settled);
});

test("loop goes answer -> next question -> answer, and wraps after pair 6", () => {
  let s: HeroState = { index: 0, phase: "question", pinned: false };
  s = tick(s);
  assert.deepEqual(s, { index: 0, phase: "answer", pinned: false });
  s = tick(s);
  assert.deepEqual(s, { index: 1, phase: "question", pinned: false });
  s = { index: 5, phase: "answer", pinned: false };
  assert.deepEqual(tick(s), { index: 0, phase: "question", pinned: false });
});

test("a full lap visits every pair once", () => {
  let s: HeroState = { index: 0, phase: "question", pinned: false };
  const seen: number[] = [];
  for (let i = 0; i < N * 2; i++) {
    if (s.phase === "answer") seen.push(s.index);
    s = tick(s);
  }
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 5]);
});

test("pill click jumps to that pair in the answer phase, pinned, then the loop resumes", () => {
  let s = heroReducer({ index: 0, phase: "question", pinned: false }, { type: "select", index: 3 }, N);
  assert.deepEqual(s, { index: 3, phase: "answer", pinned: true });
  s = tick(s);
  assert.deepEqual(s, { index: 4, phase: "question", pinned: false });
});

test("select clamps out-of-range indexes and empty data is a no-op", () => {
  assert.equal(heroReducer(initialHeroState(), { type: "select", index: 7 }, N).index, 1);
  assert.equal(heroReducer(initialHeroState(), { type: "select", index: -1 }, N).index, 5);
  assert.deepEqual(heroReducer(initialHeroState(), { type: "tick" }, 0), initialHeroState());
  assert.deepEqual(heroReducer(initialHeroState(), { type: "settle" }, 0), initialHeroState());
});
