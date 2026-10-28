import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Nav } from "../components/Nav";
import { WeeklyBars } from "../components/WeeklyBars";
import { useAuth } from "../contexts/AuthContext";
import {
  ANALYTICS_WINDOWS,
  analyticsQueryKey,
  compact,
  duration,
  alumRepliesVerdict,
  fetchAnalytics,
  onboardingVerdict,
  pct,
  type Verdict,
  type AnalyticsReport,
  type AnalyticsWindow,
  type DemandRow,
} from "../lib/adminAnalytics";
import { MATCH_CATEGORY_LABELS, isMatchCategory } from "../lib/matchApi";
import "../styles/admin-analytics.css";

const SECTIONS = [
  ["north-star", "North star"],
  ["sign-in", "Sign-in"],
  ["onboarding", "Onboarding"],
  ["asking", "Asking"],
  ["demand", "Demand vs supply"],
  ["matching", "Matching"],
  ["outcomes", "Outcomes"],
  ["wall", "The Wall"],
  ["engagement", "Engagement"],
  ["growth", "Growth"],
  ["whatsapp", "WhatsApp pilot"],
  ["operations", "Operations"],
] as const;

const HOME_EVENT_LABELS: Record<string, string> = {
  home_ask_submitted: "Asked a question",
  home_example_clicked: "Tapped an example question",
  home_browse_clicked: "Tapped a browse link",
  home_wall_post_clicked: "Tapped Post to The Wall",
  home_notes_clicked: "Opened their notes",
  home_checklist_clicked: "Tapped the next step",
  home_checklist_dismissed: "Dismissed the next step",
  home_answer_key_opened: "Opened the answer-key card",
  home_answer_key_dismissed: "Dismissed the answer-key card",
};

const BROWSE_LABELS: Record<string, string> = {
  careers: "Careers",
  cities: "Cities",
  startups: "Startups",
  directory: "All alumni",
};

const METHOD_LABELS: Record<string, string> = {
  otp: "Email code",
  magic_link: "Email link",
  google: "Google",
  password: "Password (dev)",
  invite: "Invite code",
  demo: "Demo",
  unknown: "Not recorded",
};

/** Tracking added with this screen: these numbers start from the release that shipped it. */
const SINCE_RELEASE = "Counted from the analytics release onward.";

function categoryLabel(c: string | null): string {
  if (!c) return "No clear kind of help";
  return isMatchCategory(c) ? MATCH_CATEGORY_LABELS[c] : c;
}

function Tile({ label, value, hint, hero = false }: { label: string; value: ReactNode; hint?: ReactNode; hero?: boolean }) {
  return (
    <div className={`aa-tile${hero ? " aa-tile--hero" : ""}`}>
      <p className="aa-tile__label">{label}</p>
      <p className="aa-tile__value">{value}</p>
      {hint ? <p className="aa-tile__hint">{hint}</p> : null}
    </div>
  );
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className="aa-section" aria-labelledby={`${id}-title`}>
      <div className="aa-section__head">
        <h2 id={`${id}-title`} className="aa-section__title">
          {title}
        </h2>
        {note ? <p className="aa-section__note">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Table({ caption, head, rows, empty }: { caption: string; head: string[]; rows: ReactNode[][]; empty: string }) {
  return (
    <div className="aa-table-wrap">
      <table className="aa-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={i === 0 ? undefined : "aa-num"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="aa-table__empty">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j} className={j === 0 ? undefined : "aa-num"}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const VERDICT_LABEL: Record<Verdict["status"], string> = {
  not_enough_data: "Not enough data yet",
  passes: "Passes",
  not_yet: "Doesn't pass yet",
};

function VerdictLine({ title, v }: { title: string; v: Verdict }) {
  return (
    <p className={`aa-verdict aa-verdict--${v.status}`}>
      <strong>{title}:</strong> {VERDICT_LABEL[v.status]} · {v.detail}
    </p>
  );
}

function demandAsked(r: DemandRow): string {
  const parts = [r.company, r.role, r.city ?? r.country].filter(Boolean);
  return `${categoryLabel(r.category)}${parts.length ? ` · ${parts.join(" · ")}` : ""}`;
}

function Report({ r }: { r: AnalyticsReport }) {
  const ns = r.northStar;
  const si = r.signIn;
  const ob = r.onboarding;
  const ask = r.asking;
  const out = r.outcomes;
  const pr = ob.profiles;
  const failed = si.failedRejected + si.failedUnreachable;
  const methods = Object.entries(si.sessionsByMethod).sort((a, b) => b[1] - a[1]);
  const totalSessions = methods.reduce((a, [, v]) => a + v, 0);

  return (
    <>
      <Section id="north-star" title="North star" note="A helpful connection = a note an alum accepted.">
        <div className="aa-tiles">
          <Tile hero label="Accepted notes" value={compact(ns.acceptedNotes)} hint={`in the last ${r.windowDays} days`} />
          <Tile
            label="Helped within 7 days"
            value={pct(ns.helpedWithin7Days, ns.askers)}
            hint={`${ns.helpedWithin7Days} of ${ns.askers} first-time askers · ${ns.stillWithin7Days} still inside their 7 days`}
          />
        </div>
        <div className="aa-charts">
          <WeeklyBars title="Accepted notes per week" points={ns.trendAccepted} />
          <WeeklyBars title="Notes sent per week" points={ns.trendSent} />
        </div>
      </Section>

      <Section id="sign-in" title="Sign-in and sign-up">
        <div className="aa-tiles">
          <Tile label="Sign-in starts" value={compact(si.starts)} hint={`${compact(si.completed)} completed`} />
          <Tile label="Emails sent" value={compact(si.emailSent)} hint={`${si.emailUnconfirmed} unconfirmed · ${si.emailUnknown} not recorded`} />
          <Tile label="Emails failed" value={compact(failed)} hint={`${si.failedRejected} rejected · ${si.failedUnreachable} unreachable`} />
          <Tile label="Codes replaced by a newer one" value={compact(si.superseded)} />
          <Tile label="New members" value={compact(si.newMembers)} />
        </div>
        <div className="aa-split">
          <WeeklyBars title="New members per week" points={si.trendNewMembers} />
          <Table
            caption="How people signed in"
            head={["Method", "Sign-ins", "Share"]}
            rows={methods.map(([m, v]) => [METHOD_LABELS[m] ?? m, compact(v), pct(v, totalSessions)])}
            empty="No sign-ins in this window."
          />
        </div>
        <p className="aa-footnote">Email outcomes and sign-in methods: {SINCE_RELEASE.toLowerCase()} Earlier ones show as “not recorded”.</p>
      </Section>

      <Section id="onboarding" title="Onboarding and profiles">
        <div className="aa-tiles">
          <Tile label="Started onboarding" value={compact(ob.startedPeople)} hint="people" />
          <Tile label="Finished onboarding" value={compact(ob.completedOnboardingProfiles)} hint="people" />
          <Tile label="Validation errors" value={compact(ob.validationErrors)} />
          <Tile label="Members" value={compact(pr.members)} hint={`${pct(pr.completed, pr.members)} complete`} />
          <Tile label="Current role added" value={pct(pr.withCurrentRole, pr.members)} hint={`${pct(pr.withPastRole, pr.members)} added a past role`} />
          <Tile label="Picked help topics" value={pct(pr.withOpenTo, pr.members)} hint={`${pr.withOpenTo} members`} />
        </div>
        <Table
          caption="How far people got (each question, people who reached it)"
          head={["Stage · question", "#", "People"]}
          rows={ob.steps.map((s) => [`${s.stage || "—"} · ${s.questionId || "—"}`, String(s.questionIndex), compact(s.people)])}
          empty={`No onboarding steps recorded in this window. ${SINCE_RELEASE}`}
        />
      </Section>

      <Section id="asking" title="Asking">
        <div className="aa-tiles">
          <Tile label="Questions asked" value={compact(ask.questions)} />
          <Tile label="Found matches" value={pct(ask.withMatches, ask.questions)} hint={`${ask.withMatches} questions`} />
          <Tile label="Needed more detail" value={pct(ask.needsDetail, ask.questions)} hint={`${ask.needsDetail} questions`} />
          <Tile label="Found nobody" value={pct(ask.zeroResults, ask.questions)} hint={`${ask.zeroResults} questions`} />
          <Tile label="Directory searches" value={compact(ask.search.searches)} hint={`${ask.search.zeroResults} found nobody · ${ask.search.loadMore} load-more`} />
        </div>
        <div className="aa-split">
          <WeeklyBars title="Questions per week" points={ask.trendQuestions} />
          <Table
            caption="By kind of help"
            head={["Kind of help", "Questions", "More detail", "Nobody"]}
            rows={ask.byCategory.map((c) => [categoryLabel(c.category), compact(c.questions), compact(c.needsDetail), compact(c.zeroResults)])}
            empty="No questions in this window."
          />
        </div>
      </Section>

      <Section id="demand" title="Demand vs supply" note="What people asked for, and how many alumni could help with exactly that.">
        <Table
          caption="Most-asked (company, role, city or country the matcher read)"
          head={["What was asked", "Asked", "Found nobody", "Alumni who fit", "…offering this help"]}
          rows={r.demandSupply.top.map((d) => [
            demandAsked(d),
            compact(d.questions),
            compact(d.zeroResults),
            compact(d.supply),
            d.supplyOffering === 0 ? <span className="aa-gap">0 · gap</span> : compact(d.supplyOffering),
          ])}
          empty={`No specific asks recorded in this window. ${SINCE_RELEASE}`}
        />
        <Table
          caption="By kind of help"
          head={["Kind of help", "Questions", "Alumni offering it", "Alumni per question"]}
          rows={r.demandSupply.byCategory.map((c) => [
            categoryLabel(c.category),
            compact(c.questions),
            compact(c.alumniOffering),
            c.questions ? (c.alumniOffering / c.questions).toFixed(1) : "—",
          ])}
          empty="No data."
        />
      </Section>

      <Section id="matching" title="Matching quality">
        <div className="aa-tiles">
          <Tile label="Notes from a search" value={compact(r.matching.notesFromMatch)} />
          <Tile
            label="Searches that led to a note"
            value={pct(r.matching.notesFromMatch, r.matching.questionsWithMatches)}
            hint={`of ${r.matching.questionsWithMatches} searches with matches (a search can lead to several notes)`}
          />
        </div>
        <div className="aa-split">
          <Table
            caption="Which result people contacted"
            head={["Position", "Notes", "Accepted", "Accept rate"]}
            rows={r.matching.byRank.map((k) => [
              k.rank == null ? "Not recorded" : `#${k.rank}`,
              compact(k.notes),
              compact(k.accepted),
              pct(k.accepted, k.accepted + k.declined),
            ])}
            empty={`No notes from a search in this window. Position: ${SINCE_RELEASE.toLowerCase()}`}
          />
          <Table
            caption="Notes by kind of help"
            head={["Kind of help", "Notes", "Accepted", "Declined", "Waiting"]}
            rows={r.matching.byCategory.map((c) => [
              categoryLabel(c.category),
              compact(c.notes),
              compact(c.accepted),
              compact(c.declined),
              compact(c.pending),
            ])}
            empty="No notes from a search in this window."
          />
        </div>
      </Section>

      <Section id="outcomes" title="Outcomes and fairness">
        <div className="aa-tiles">
          <Tile label="Notes sent" value={compact(out.sent)} hint={`${out.accepted} accepted · ${out.declined} declined · ${out.pending} waiting`} />
          <Tile label="Accept rate" value={pct(out.accepted, out.accepted + out.declined)} hint="of answered notes" />
          <Tile label="Median time to reply" value={duration(out.medianReplyHours)} />
          <Tile label="Reminders sent" value={compact(out.remindersSent)} hint={`${out.repliedAfterReminder} replied after one`} />
          <Tile
            label="Notes to the busiest 10%"
            value={out.fairness.top10Share == null ? "—" : `${Math.round(out.fairness.top10Share * 100)}%`}
            hint={`${out.fairness.recipients} alumni received notes`}
          />
          <Tile label="At the weekly cap" value={compact(out.fairness.atWeeklyCap)} hint="5+ new notes in the last 7 days" />
          <Tile label="Not replying" value={compact(out.fairness.silentAlumni)} hint="2+ notes older than 7 days, no reply" />
        </div>
      </Section>

      <Section id="wall" title="The Wall">
        <div className="aa-tiles">
          <Tile label="Posts" value={compact(r.wall.posts)} />
          <Tile label="Posts with a reply" value={pct(r.wall.postsWithReply, r.wall.posts)} hint={`${r.wall.postsWithReply} posts`} />
          <Tile label="Replies" value={compact(r.wall.replies)} />
          <Tile label="Median time to first reply" value={duration(r.wall.medianFirstReplyHours)} />
          <Tile label="Expired with no reply" value={compact(r.wall.expiredWithoutReply)} />
        </div>
        <div className="aa-charts">
          <WeeklyBars title="Wall posts per week" points={r.wall.trendPosts} />
        </div>
      </Section>

      <Section id="engagement" title="Engagement and Home" note={`Active members and Home taps: ${SINCE_RELEASE.toLowerCase()}`}>
        <div className="aa-tiles">
          <Tile label="Active members" value={compact(r.engagement.activeMembers)} hint={`used the app in the last ${r.windowDays} days`} />
          <Tile
            label="Returning members"
            value={pct(r.engagement.returningMembers, r.engagement.activeMembers)}
            hint={`also active in the ${r.windowDays} days before`}
          />
          <Tile label="Notifications opened" value={compact(r.engagement.notifications.opened)} hint={`${r.engagement.notifications.clicked} items clicked`} />
        </div>
        <div className="aa-split">
          <WeeklyBars title="Active members per week" points={r.engagement.trendActive} />
          <Table
            caption="What people use on Home"
            head={["Action", "Taps", "People"]}
            rows={r.engagement.home.map((h) => [HOME_EVENT_LABELS[h.event] ?? h.event, compact(h.count), compact(h.people)])}
            empty="No Home activity recorded."
          />
        </div>
        <Table
          caption="Browse links tapped on Home"
          head={["Link", "Taps"]}
          rows={r.engagement.browseByLink.map((b) => [BROWSE_LABELS[b.link] ?? b.link, compact(b.count)])}
          empty="No browse taps in this window."
        />
      </Section>

      <Section id="growth" title="Growth" note={`Invites: ${SINCE_RELEASE.toLowerCase()}`}>
        <div className="aa-tiles">
          <Tile label="Invite panel opened" value={compact(r.growth.inviteOpened)} />
          <Tile label="Invite links shared" value={compact(r.growth.inviteCopied + r.growth.inviteWhatsapp)} hint={`${r.growth.inviteCopied} copied · ${r.growth.inviteWhatsapp} WhatsApp`} />
          <Tile
            label="Joined through an invite"
            value={compact(r.growth.invitedSignups.copy + r.growth.invitedSignups.whatsapp)}
            hint={`${r.growth.invitedSignups.copy} from copied links · ${r.growth.invitedSignups.whatsapp} from WhatsApp`}
          />
        </div>
        <div className="aa-split">
          <WeeklyBars title="Invited sign-ups per week" points={r.growth.trendInvitedSignups} />
          <Table
            caption="Members by department (top 20)"
            head={["Department", "Members"]}
            rows={r.growth.byDepartment.map((d) => [`${d.name} (${d.code.toUpperCase()})`, compact(d.members)])}
            empty="No departments recorded."
          />
        </div>
        <Table
          caption="Members by batch"
          head={["Batch", "Members"]}
          rows={[...r.growth.byBatch].reverse().map((b) => [String(b.batchYear), compact(b.members)])}
          empty="No batches recorded."
        />
      </Section>

      <Section
        id="whatsapp"
        title="WhatsApp pilot"
        note="Go / no-go after 30+ WhatsApp notes. Spend is an estimate; Meta's invoice is final."
      >
        <VerdictLine title="Test 1 · Alum replies" v={alumRepliesVerdict(r.whatsapp.byChannel)} />
        <VerdictLine title="Test 2 · Onboarding" v={onboardingVerdict(r.whatsapp.onboardingByArrival)} />
        <div className="aa-tiles">
          <Tile label="Linked members" value={compact(r.whatsapp.linkedMembers)} hint={`${r.whatsapp.linkedInWindow} linked in the last ${r.windowDays} days`} />
          <Tile
            label="Get notes on WhatsApp"
            value={compact(r.whatsapp.notesOptedIn)}
            hint={`${r.whatsapp.notesPaused} paused · ${r.whatsapp.stopped} stopped`}
          />
          <Tile label="Numbers texting the bot" value={compact(r.whatsapp.numbersTexting)} />
          <Tile
            label="Notes from the bot's links"
            value={compact(r.whatsapp.notesFromBot)}
            hint={`${r.whatsapp.notesFromBotAccepted} accepted`}
          />
          <Tile
            label="Free replies this month"
            value={`${compact(r.whatsapp.month.serviceReplies)} / ${compact(r.whatsapp.month.freeServicePerMonth)}`}
            hint={`${compact(r.whatsapp.month.inbound)} messages received`}
          />
          <Tile
            label="Paid messages this month"
            value={`${compact(r.whatsapp.month.templates)} / ${compact(r.whatsapp.month.templateCap)}`}
            hint={`≈ ₹${r.whatsapp.month.estimatedSpendRupees.toFixed(2)} so far`}
          />
        </div>
        <div className="aa-split">
          <Table
            caption="Test 1 · How the alum was told"
            head={["Channel", "Notes", "Accepted", "Accept rate", "Median reply"]}
            rows={r.whatsapp.byChannel.map((c) => [
              c.channel === "whatsapp" ? "WhatsApp" : "Email",
              compact(c.notes),
              compact(c.accepted),
              pct(c.accepted, c.notes),
              duration(c.medianReplyHours),
            ])}
            empty="No notes in this window."
          />
          <Table
            caption="Test 2 · Members who joined, by where they arrived"
            head={["Arrived from", "Started", "Finished", "Finish rate"]}
            rows={r.whatsapp.onboardingByArrival.map((a) => [
              a.arrival === "whatsapp" ? "WhatsApp bot" : "Website",
              compact(a.started),
              compact(a.finished),
              pct(a.finished, a.started),
            ])}
            empty="No new members in this window."
          />
        </div>
        <p className="aa-footnote">Accept rate here is accepted ÷ notes sent (notes still waiting count as not accepted).</p>
      </Section>

      <Section id="operations" title="Operations" note="Every other number on this page counts real members only.">
        <div className="aa-tiles">
          <Tile
            label="People in the directory"
            value={compact(r.operations.directory.total)}
            hint={`${r.operations.directory.real} real · ${r.operations.directory.demo} demo · ${r.operations.directory.test} test`}
          />
          <Tile label="Admins" value={compact(r.operations.admins)} />
          <Tile label="Suspended" value={compact(r.operations.suspended)} />
          <Tile label="Deleted" value={compact(r.operations.deletedInWindow)} hint={`in the last ${r.windowDays} days`} />
          <Tile
            label="Companies waiting for approval"
            value={compact(r.operations.orgsPending)}
            hint={
              <Link to="/admin/companies" className="aa-link">
                Review
              </Link>
            }
          />
        </div>
      </Section>
    </>
  );
}

/** /admin/analytics — every analytics number on one screen (admins only; the API enforces it). */
export function AdminAnalyticsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [days, setDays] = useState<AnalyticsWindow>(30);
  const [refreshing, setRefreshing] = useState(false);
  const isAdmin = auth.status === "authenticated" && auth.person.role !== "alumni";
  const displayName = auth.status === "authenticated" ? auth.myProfile?.fullName?.trim() || undefined : undefined;

  const query = useQuery({
    queryKey: analyticsQueryKey(days),
    queryFn: ({ signal }) => fetchAnalytics(days, signal),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await fetchAnalytics(days, new AbortController().signal, true);
      queryClient.setQueryData(analyticsQueryKey(days), fresh);
    } catch {
      /* keep showing the last numbers */
    } finally {
      setRefreshing(false);
    }
  };

  const updated = query.data
    ? new Date(query.data.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="aa-shell">
      <Nav
        variant="home"
        avatarName={displayName}
        appToolbarLead={
          <div className="nav-app-toolbar__welcome">
            <h1 className="nav-app-toolbar__welcome-title">Analytics</h1>
          </div>
        }
      />
      <main className="aa-page">
        {!isAdmin ? (
          <p className="aa-message" role="alert">
            This page is for admins.
          </p>
        ) : (
          <>
            <div className="aa-controls">
              <div className="aa-range" role="group" aria-label="Time range">
                {ANALYTICS_WINDOWS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`aa-range__btn${d === days ? " is-active" : ""}`}
                    aria-pressed={d === days}
                    onClick={() => setDays(d)}
                  >
                    {d} days
                  </button>
                ))}
              </div>
              <p className="aa-updated">
                {updated ? `Updated ${updated}` : ""}
                <button type="button" className="aa-refresh" onClick={() => void refresh()} disabled={refreshing || query.isPending}>
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </p>
            </div>
            <nav className="aa-index" aria-label="Sections">
              {SECTIONS.map(([id, label]) => (
                <a key={id} href={`#${id}`}>
                  {label}
                </a>
              ))}
            </nav>
            {query.isPending ? (
              <p className="aa-message" role="status">
                Loading analytics…
              </p>
            ) : query.isError || !query.data ? (
              <p className="aa-message" role="alert">
                Couldn&apos;t load analytics. Try Refresh.
              </p>
            ) : (
              <Report r={query.data} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
