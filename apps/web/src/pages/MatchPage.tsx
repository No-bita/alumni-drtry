import { useCallback, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { MatchIntentChips } from "../components/MatchIntentChips";
import { MatchReachOutDialog } from "../components/MatchReachOutDialog";
import { MatchResultCard } from "../components/MatchResultCard";
import { PostBulletinFlow, type PostBulletinFlowHandle } from "../components/PostBulletinFlow";
import { useAuth } from "../contexts/AuthContext";
import {
  MATCH_QUESTION_MAX,
  MATCH_QUESTION_MIN,
  buildMatchSearch,
  bulletinCategoryForMatch,
  fetchMatches,
  matchErrorMessage,
  needsDetailPrompt,
  parseMatchUrlState,
  type MatchOverrideField,
  type MatchResult,
} from "../lib/matchApi";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import type { ProfileResponse } from "../api/client";
import "../styles/match.css";

/** Ask → Match results (`/match?q=…`). */
export function MatchPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => parseMatchUrlState(searchParams), [searchParams]);
  const searchKey = useMemo(() => buildMatchSearch(state), [state]);
  const hasQuestion = state.question.length >= MATCH_QUESTION_MIN;

  const questionId = useId();
  // Draft follows the URL question until the user types; no effect needed.
  const [draft, setDraft] = useState({ forQuestion: state.question, text: state.question });
  const draftQuestion = draft.forQuestion === state.question ? draft.text : state.question;
  const setDraftQuestion = (text: string) => setDraft({ forQuestion: state.question, text });
  const [reachOutTo, setReachOutTo] = useState<{ result: MatchResult; rank: number } | null>(null);
  // From the WhatsApp bot's "Send a note" link: open the note box for that person once results load.
  const [searchParamsForReach] = useSearchParams();
  const reachId = searchParamsForReach.get("reach");
  const viaWhatsApp = searchParamsForReach.get("via") === "whatsapp";
  const [autoDismissed, setAutoDismissed] = useState(false);
  const bulletinFlowRef = useRef<PostBulletinFlowHandle>(null);

  const matchQuery = useQuery({
    queryKey: queryKeys.match.results(searchKey),
    queryFn: ({ signal }) => fetchMatches(state, signal),
    enabled: auth.status === "authenticated" && hasQuestion,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });

  const data = matchQuery.data;
  // Derived, not stored: the person the bot's link points at, until the box is closed once.
  const wantReach = Boolean(!autoDismissed && reachId);
  const reachIndex = wantReach && data ? data.results.findIndex((r) => r.id === reachId) : -1;
  const reachResult = reachIndex >= 0 ? data!.results[reachIndex]! : null;
  // They tapped "Send a note" for this person: if the list no longer includes them (their load
  // changed, or the list differs), still open their note box, using their profile for the name.
  const reachMissing = wantReach && !matchQuery.isPending && !matchQuery.isPlaceholderData && reachIndex < 0;
  const reachProfile = useQuery({
    queryKey: queryKeys.profiles.detail(reachId ?? ""),
    queryFn: ({ signal }) => assertApiGet<ProfileResponse>(`/v1/profiles/${reachId}`, signal),
    enabled: auth.status === "authenticated" && reachMissing,
    retry: false,
  });
  const autoDialog: { result: Pick<MatchResult, "id" | "fullName">; rank: number | null } | null = reachResult
    ? reachResult.yourNote
      ? null // already sent them a note: nothing to open
      : { result: reachResult, rank: reachIndex + 1 }
    : reachMissing && reachProfile.data
      ? { result: { id: reachProfile.data.profile.id, fullName: reachProfile.data.profile.fullName }, rank: null }
      : null;
  const dialogFor = reachOutTo ?? autoDialog;
  const updating = matchQuery.isFetching && matchQuery.isPlaceholderData;

  const onAsk = (e: FormEvent) => {
    e.preventDefault();
    const q = draftQuestion.trim();
    if (q.length < MATCH_QUESTION_MIN) return;
    // A new question starts fresh: drop chip corrections made for the old one.
    setSearchParams(buildMatchSearch({ question: q, overrides: {} }).slice(1));
  };

  const onChipChange = useCallback(
    (field: MatchOverrideField, value: string | null) => {
      const overrides = { ...state.overrides, [field]: value };
      setSearchParams(buildMatchSearch({ question: state.question, overrides }).slice(1));
    },
    [setSearchParams, state]
  );

  const postAsBulletin = () => {
    bulletinFlowRef.current?.open({
      category: bulletinCategoryForMatch(data?.intent.category ?? null),
      headline: state.question,
    });
  };

  const displayName = auth.status === "authenticated" ? auth.myProfile?.fullName?.trim() || undefined : undefined;
  const detail = data?.needsDetail ? needsDetailPrompt(data.intent.category) : null;
  // Only auto-open a chip for the response that belongs to this URL — never for the previous
  // response shown while the new one loads (it would reopen the field the user just filled).
  const autoEditField =
    !matchQuery.isPlaceholderData && detail?.field && detail.field !== "category" ? detail.field : null;

  return (
    <div className="match-page-shell">
      <Nav
        variant="home"
        avatarName={displayName}
        appToolbarLead={
          <div className="nav-app-toolbar__welcome">
            <h1 className="nav-app-toolbar__welcome-title">Ask alumni</h1>
          </div>
        }
      />
      <main className="match-page">
        <form className="match-page__ask" onSubmit={onAsk} role="search" aria-label="Ask alumni">
          <label htmlFor={questionId} className="match-page__ask-label">
            Your question
          </label>
          <div className="match-page__ask-row">
            <input
              id={questionId}
              className="match-page__ask-input"
              value={draftQuestion}
              maxLength={MATCH_QUESTION_MAX}
              autoComplete="off"
              onChange={(e) => setDraftQuestion(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn--primary"
              disabled={draftQuestion.trim().length < MATCH_QUESTION_MIN}
            >
              Find alumni
            </button>
          </div>
        </form>

        {!hasQuestion ? (
          <p className="match-page__state">Write what you’re trying to get done, and we’ll find the alum who can help.</p>
        ) : matchQuery.isPending ? (
          <p className="match-page__state" role="status">
            Finding the right alum…
          </p>
        ) : matchQuery.isError && !data ? (
          <div className="match-page__state match-page__state--error" role="alert">
            <p>{matchErrorMessage(matchQuery.error)}</p>
            <button type="button" className="btn btn--secondary" onClick={() => void matchQuery.refetch()}>
              Try again
            </button>
          </div>
        ) : data ? (
          <>
            <section className="match-page__understood" aria-labelledby="match-understood-title">
              <h2 id="match-understood-title" className="match-page__section-title">
                What we understood
              </h2>
              <p className="match-page__hint">Wrong? Tap a chip to fix it.</p>
              <MatchIntentChips
                key={`${searchKey}:${matchQuery.isPlaceholderData ? "prev" : "current"}`}
                intent={data.intent}
                disabled={updating}
                autoEditField={autoEditField}
                onChange={onChipChange}
              />
            </section>

            {updating ? (
              <p className="match-page__updating" role="status">
                Updating matches…
              </p>
            ) : null}

            {data.needsDetail ? (
              <div className="match-page__state">
                <p className="match-page__state-title">{detail?.title}</p>
              </div>
            ) : data.results.length === 0 ? (
              <div className="match-page__state">
                <p className="match-page__state-title">No alum on Alma Mater matches this yet.</p>
                <p className="match-page__state-copy">
                  Post it as a bulletin so the right alum can find you, or loosen a filter above.
                </p>
                <button type="button" className="btn btn--secondary" onClick={postAsBulletin}>
                  Post this as a bulletin
                </button>
              </div>
            ) : (
              <section aria-labelledby="match-results-title">
                <h2 id="match-results-title" className="match-page__section-title">
                  {data.results.length === 1 ? "1 alum who can help" : `${data.results.length} alumni who can help`}
                </h2>
                <ul className="match-page__results">
                  {data.results.map((r, i) => (
                    <MatchResultCard key={r.id} result={r} onReachOut={(result) => setReachOutTo({ result, rank: i + 1 })} />
                  ))}
                </ul>
                <p className="match-page__footnote">
                  Matches use only what alumni have added to their profiles.{" "}
                  <button type="button" className="match-page__inline-link" onClick={postAsBulletin}>
                    Not quite right? Post this as a bulletin.
                  </button>
                </p>
              </section>
            )}
          </>
        ) : null}

        <button type="button" className="match-page__back" onClick={() => navigate("/home")}>
          ← Back to home
        </button>
      </main>

      {dialogFor ? (
        <MatchReachOutDialog
          recipient={{ id: dialogFor.result.id, fullName: dialogFor.result.fullName }}
          rank={dialogFor.rank}
          source={viaWhatsApp ? "whatsapp" : "match"}
          question={state.question}
          category={data?.intent.category ?? null}
          onClose={() => {
            setReachOutTo(null);
            setAutoDismissed(true);
          }}
        />
      ) : null}
      <PostBulletinFlow ref={bulletinFlowRef} />
    </div>
  );
}
