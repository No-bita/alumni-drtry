import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import "../styles/careers.css";
import { CareersFeedback } from "../components/CareersFeedback";
import { Nav } from "../components/Nav";
import { MatchReachOutDialog } from "../components/MatchReachOutDialog";
import { ReferralRequestFlow } from "../components/broker/ReferralRequestFlow";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/Button";
import { Spinner } from "../components/Spinner";
import { careersKeys, fetchCareersCompany, type CareersPerson } from "../lib/careers";
import { browsingLimitFromError } from "../lib/browsingLimits";

const yy = (y: number | null) => (y ? ` · Batch '${String(y).slice(-2)}` : "");

type Ask = { person: CareersPerson; kind: "referral" | "advice" };

const NOTE_LABEL: Record<string, string> = {
  pending: "Reachout sent · waiting",
  accepted: "Accepted · contact shared",
  declined: "Declined",
  expired: "No reply",
};

function PersonCard({ person, line, action, onAsk }: { person: CareersPerson; line: string; action: string; onAsk: () => void }) {
  // Already asked and still waiting (or accepted): show where it stands instead of asking again.
  const status = person.yourNote === "pending" || person.yourNote === "accepted" ? person.yourNote : null;
  return (
    <li className="careers__person">
      <div className="careers__person-main">
        <Link to={`/profiles/${person.id}`} className="careers__row-title">
          {person.fullName}
        </Link>
        <span className="careers__row-meta">{line}</span>
        {person.openToReferrals ? <span className="careers__tag">Open to referrals</span> : null}
      </div>
      {status ? (
        <span className={`careers__status careers__status--${status}`}>{NOTE_LABEL[status]}</span>
      ) : (
        <button type="button" className={action === "Ask for a referral" ? "careers__primary careers__primary--small" : "careers__ghost"} onClick={onAsk}>
          {action}
        </button>
      )}
    </li>
  );
}

/** /intent/career/company?name=…&role=… — who is at a company now and before, and asking them. */
export function CareerCompanyPage() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const name = (params.get("name") ?? "").trim();
  const role = (params.get("role") ?? "").trim() || null;
  const [ask, setAsk] = useState<Ask | null>(null);
  const [referralOpen, setReferralOpen] = useState(false);
  const signedIn = auth.status === "authenticated";

  const query = useInfiniteQuery({
    queryKey: careersKeys.company(name),
    queryFn: ({ pageParam, signal }) => fetchCareersCompany(name, role, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
    enabled: signedIn && name.length >= 2,
    staleTime: 60_000,
  });

  if (!signedIn) return null;
  const displayName = auth.myProfile?.fullName?.trim() || undefined;
  // Every loaded page together; the server returns current people before past ones.
  const pages = query.data?.pages ?? [];
  const currentAll = pages.flatMap((pg) => pg.current);
  const past = pages.flatMap((pg) => pg.past);
  const companyName = pages[0]?.company ?? name;
  const open = currentAll.filter((p) => p.openToReferrals);
  const others = currentAll.filter((p) => !p.openToReferrals);
  const nobodyNow = pages.length > 0 && currentAll.length === 0;

  // Advice starts with where they're applying; they add their own question (80+ characters in all).
  const applying = role ? `I'm applying for the ${role} role at ${companyName}. ` : `I'm applying to ${companyName}. `;

  // Referrals are brokered: Alma Mater asks everyone at the company for you (nothing to ask when no one is there).
  const wallFallback = nobodyNow ? null : (
    <section className="careers__section careers__wall" aria-labelledby="careers-wall-title">
      <h2 id="careers-wall-title" className="careers__h2">
        Not the right people?
      </h2>
      <p className="careers__note">Let Alma Mater ask everyone at {companyName} for you. You&apos;re connected with the first who says yes.</p>
      <button type="button" className="careers__ghost" onClick={() => setReferralOpen(true)}>
        Ask everyone at {companyName} for me
      </button>
    </section>
  );

  return (
    <div className="intent-page-shell career-page-shell">
      <Nav
        variant="home"
        avatarName={displayName}
        appToolbarLead={
          <div className="nav-app-toolbar__welcome">
            <h1 className="nav-app-toolbar__welcome-title">Careers</h1>
          </div>
        }
      />
      <main className="careers">
        <Link to="/intent/career" className="careers__back">
          Careers
        </Link>
        {name.length < 2 ? (
          <p className="careers__empty">
            Type a company on <Link to="/intent/career">Careers</Link> to see who&apos;s there.
          </p>
        ) : query.isPending ? (
          <p className="careers__note" role="status">
            Finding alumni at {name}…
          </p>
        ) : query.isError ? (
          <CareersFeedback tone="error">
            <p className="careers__note">
            {browsingLimitFromError(query.error) ?? <>Couldn&apos;t load alumni at {name}.</>}{" "}
            <button type="button" className="careers__textbtn" onClick={() => void query.refetch()}>
              Try again
            </button>
          </p>
            </CareersFeedback>
        ) : (
          <>
            <section className="careers__head" aria-labelledby="careers-co-title">
              <h2 id="careers-co-title" className="careers__title">
                {companyName}
              </h2>
              {role ? <span className="careers__chip">{role}</span> : null}
              {nobodyNow ? (
                <div className="careers__callout">
                  <p className="careers__row-title">No one at {companyName} on Alma Mater yet.</p>
                  <p className="careers__note">
                    {past.length > 0 ? "Alumni who used to work there can still give you an inside view." : "No one on Alma Mater has worked there either."}
                  </p>
                </div>
              ) : null}
            </section>

            {open.length > 0 ? (
              <section className="careers__section" aria-labelledby="careers-open-title">
                <h2 id="careers-open-title" className="careers__h2">
                  Open to referrals
                </h2>
                <ul className="careers__people">
                  {open.map((p) => (
                    <PersonCard key={p.id} person={p} line={`${p.roleTitle}${yy(p.batchYear)}`} action="Ask for a referral" onAsk={() => setAsk({ person: p, kind: "referral" })} />
                  ))}
                </ul>
              </section>
            ) : null}

            {others.length > 0 ? (
              <section className="careers__section" aria-labelledby="careers-also-title">
                <h2 id="careers-also-title" className="careers__h2">
                  {open.length > 0 ? `Also at ${companyName}` : `At ${companyName}`}
                </h2>
                <ul className="careers__people">
                  {others.map((p) => (
                    <PersonCard key={p.id} person={p} line={`${p.roleTitle}${yy(p.batchYear)}`} action="Ask for advice" onAsk={() => setAsk({ person: p, kind: "advice" })} />
                  ))}
                </ul>
              </section>
            ) : null}

            {past.length > 0 ? (
              <section className="careers__section" aria-labelledby="careers-past-title">
                <div className="careers__head">
                  <h2 id="careers-past-title" className="careers__h2">
                    Used to work at {companyName}
                  </h2>
                  <p className="careers__note">They know the teams and may still know people there.</p>
                </div>
                <ul className="careers__people">
                  {past.map((p) => (
                    <PersonCard
                      key={p.id}
                      person={p}
                      line={`${p.roleTitle} at ${p.organizationName}${yy(p.batchYear)}`}
                      action="Ask for advice"
                      onAsk={() => setAsk({ person: p, kind: "advice" })}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {query.hasNextPage ? (
              <div className="careers__load-more">
                <Button
                  variant="secondary"
                  onClick={() => void query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                >
                  {query.isFetchingNextPage ? (
                    <>
                      <Spinner size="sm" />
                      Loading…
                    </>
                  ) : (
                    "Load more"
                  )}
                </Button>
              </div>
            ) : null}

            {wallFallback}
            <Link to="/intent/career" className="careers__more">
              Try another company
            </Link>
          </>
        )}
      </main>

      {ask ? (
        <MatchReachOutDialog
          recipient={{ id: ask.person.id, fullName: ask.person.fullName }}
          purpose={null}
          referral={{ role, company: companyName }}
          advice={{ topic: null, question: applying }}
          source="careers"
          backTo={{ to: "/intent/career", label: "Back to Careers" }}
          onClose={() => setAsk(null)}
        />
      ) : null}
      {referralOpen ? <ReferralRequestFlow initialCompany={companyName} onClose={() => setReferralOpen(false)} /> : null}
    </div>
  );
            }
