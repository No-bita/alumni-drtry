import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import "../styles/careers.css";
import { CareersFeedback } from "../components/CareersFeedback";
import { Nav } from "../components/Nav";
import { MatchReachOutDialog } from "../components/MatchReachOutDialog";
import { PostBulletinFlow, type PostBulletinFlowHandle } from "../components/PostBulletinFlow";
import { useAuth } from "../contexts/AuthContext";
import { careersKeys, fetchCareersCompany, type CareersPerson } from "../lib/careers";
import { queryKeys } from "../lib/queryKeys";

const yy = (y: number | null) => (y ? ` · Batch '${String(y).slice(-2)}` : "");

type Ask = { person: CareersPerson; kind: "referral" | "note" | "past" };

const NOTE_LABEL: Record<string, string> = {
  pending: "Note sent · waiting",
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
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const name = (params.get("name") ?? "").trim();
  const role = (params.get("role") ?? "").trim() || null;
  const [ask, setAsk] = useState<Ask | null>(null);
  const wallRef = useRef<PostBulletinFlowHandle>(null);
  const [posted, setPosted] = useState(false);
  const signedIn = auth.status === "authenticated";

  const query = useQuery({
    queryKey: careersKeys.company(name),
    queryFn: ({ signal }) => fetchCareersCompany(name, role, signal),
    enabled: signedIn && name.length >= 2,
    staleTime: 60_000,
  });

  if (!signedIn) return null;
  const displayName = auth.myProfile?.fullName?.trim() || undefined;
  const data = query.data;
  const companyName = data?.company ?? name;
  const open = data?.current.filter((p) => p.openToReferrals) ?? [];
  const others = data?.current.filter((p) => !p.openToReferrals) ?? [];
  const past = data?.past ?? [];
  const nobodyNow = data !== undefined && data.current.length === 0;

  const applying = role ? `I'm applying for the ${role} role at ${companyName}` : `I'm applying to ${companyName}`;
  const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;
  const startNote = (a: Ask) => {
    const hi = `Hi ${firstName(a.person.fullName)}, I found you on Alma Mater.`;
    if (a.kind === "referral") return `${hi} ${applying}. Would you be open to referring me? Happy to share my résumé and anything else you need.`;
    if (a.kind === "past") return `${hi} ${applying} and saw you worked there. Could you tell me what it was like and how to approach it?`;
    return `${hi} ${applying}. Could you tell me a bit about working there?`;
  };

  const wallFallback = (
    <section className="careers__section careers__wall" aria-labelledby="careers-wall-title">
      <h2 id="careers-wall-title" className="careers__h2">
        {nobodyNow ? "Ask everyone instead" : "Not the right people?"}
      </h2>
      {posted ? (
        <p className="careers__note" role="status">
          Posted. It&apos;s under Recent from alumni on <Link to="/intent/career">Careers</Link>.
        </p>
      ) : (
        <>
          <p className="careers__note">Post your referral ask on the Wall. Any alum who knows someone at {companyName} can reply.</p>
          <button
            type="button"
            className={nobodyNow ? "careers__primary" : "careers__ghost"}
            onClick={() => wallRef.current?.open({ careersPreset: "referralSeeking", referralCompanyName: companyName, headline: role ?? undefined })}
          >
            Post it on the Wall
          </button>
        </>
      )}
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
          ← Careers
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
            Couldn&apos;t load alumni at {name}.{" "}
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
              ) : (
                <p className="careers__note">
                  {data!.current.length} {data!.current.length === 1 ? "alum" : "alumni"} at {companyName} · {open.length} open to referrals
                </p>
              )}
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
                    <PersonCard key={p.id} person={p} line={`${p.roleTitle}${yy(p.batchYear)}`} action="Send a note" onAsk={() => setAsk({ person: p, kind: "note" })} />
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
                      action="Ask about it"
                      onAsk={() => setAsk({ person: p, kind: "past" })}
                    />
                  ))}
                </ul>
              </section>
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
          question={applying}
          initialNote={startNote(ask)}
          category={ask.kind === "referral" ? "referral" : null}
          source="careers"
          withLinks={ask.kind === "referral"}
          title={ask.kind === "referral" ? `Ask ${firstName(ask.person.fullName)} for a referral` : undefined}
          backTo={{ to: "/intent/career", label: "Back to Careers" }}
          onClose={() => setAsk(null)}
        />
      ) : null}
      <PostBulletinFlow
        ref={wallRef}
        onPublishSuccess={() => {
          setPosted(true);
          void queryClient.invalidateQueries({ queryKey: queryKeys.career.intentFeed() });
          void queryClient.invalidateQueries({ queryKey: ["home", "opportunity-rail"] });
        }}
      />
    </div>
  );
            }
