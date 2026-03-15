import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Nav } from "../components/Nav";
import { Avatar } from "../components/Avatar";
import { ReachOutCard } from "../components/ReachOutCard";
import { api, type ProfileResponse } from "../api/client";
import { CAMPUS_IMAGE } from "../constants/images";

export function Profile() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [contactStatus, setContactStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [contactError, setContactError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<ProfileResponse>(`/v1/profiles/${id}`).then(({ data: res }) => {
      if (res) setData(res);
      setLoading(false);
    });
  }, [id]);

  const handleReachOut = async (message: string) => {
    if (!id) return;
    setContactStatus("sending");
    setContactError(null);
    const { error } = await api.post("/v1/contact-requests", {
      recipientPersonId: id,
      message,
    });
    if (error) {
      setContactStatus("error");
      setContactError(error.message ?? error.code);
    } else {
      setContactStatus("success");
    }
  };

  if (loading || !data) {
    return (
      <>
        <Nav />
        <div style={{ padding: "4rem var(--page-x)", textAlign: "center" }}>
          {loading ? "Loading…" : "Profile not found."}
        </div>
      </>
    );
  }

  const { profile, occupations, links } = data;
  const batch = profile.batchYear ?? profile.parsedJoiningYear ?? "—";
  const currentRole = occupations.find((o) => o.isCurrent) ?? occupations[0];

  return (
    <>
      <Nav right={<Avatar name={profile.fullName ?? "?"} size="sm" />} />
      <header
        className="campus-panel"
        style={{
          backgroundImage: `url(${CAMPUS_IMAGE})`,
          padding: "3rem var(--page-x) 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: 24, paddingBottom: 24 }}>
          <Avatar name={profile.fullName ?? "?"} size="lg" />
          <div>
            <h1 className="page-headline" style={{ fontSize: 36, marginBottom: 4, color: "var(--cream)" }}>
              {profile.fullName}
            </h1>
            {currentRole && (
              <p style={{ color: "rgba(242,237,228,0.8)", fontSize: 15, margin: 0 }}>
                {currentRole.roleTitle} at {currentRole.organizationName}
              </p>
            )}
            <span className="badge badge--verified" style={{ marginTop: 8 }}>
              ✓ Verified
            </span>
          </div>
        </div>
        <div
          className="profile-meta-row"
          style={{
            display: "flex",
            gap: "2.5rem",
            padding: "12px 0",
            borderTop: "0.5px solid rgba(242,237,228,0.08)",
            fontSize: 12,
            color: "rgba(242,237,228,0.6)",
          }}
        >
          <span>Batch <strong style={{ color: "rgba(242,237,228,0.85)" }}>{batch}</strong></span>
          <span>Dept <strong style={{ color: "rgba(242,237,228,0.85)" }}>{profile.departmentName ?? profile.departmentCode ?? "—"}</strong></span>
        </div>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "2.5rem", padding: "2.5rem var(--page-x)", background: "var(--cream)" }}>
        <main>
          {profile.bio && (
            <section style={{ marginBottom: 32 }}>
              <h2 className="section-headline" style={{ fontSize: 20 }}>About</h2>
              <p className="body-text">{profile.bio}</p>
            </section>
          )}
          {occupations.length > 0 && (
            <section>
              <h2 className="section-headline" style={{ fontSize: 20 }}>Experience</h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {occupations.map((occ) => (
                  <li
                    key={occ.id}
                    style={{
                      display: "flex",
                      gap: 12,
                      marginBottom: 16,
                      paddingLeft: 12,
                      borderLeft: "2px solid var(--rule)",
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: occ.isCurrent ? "var(--brick)" : "var(--ochre)", marginTop: 6, marginLeft: -18, flexShrink: 0 }} />
                    <div>
                      <div className="ui-body" style={{ fontWeight: 500 }}>{occ.roleTitle}</div>
                      <div style={{ color: "var(--brick)", fontSize: 13 }}>{occ.organizationName ?? "—"}</div>
                      <div className="small-note">
                        {occ.startDate ? occ.startDate.slice(0, 4) : "—"} – {occ.isCurrent ? "Present" : (occ.endDate ? occ.endDate.slice(0, 4) : "—")}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
        <aside style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <ReachOutCard
            profileId={profile.id}
            profileName={profile.fullName ?? "them"}
            onSubmit={handleReachOut}
            status={contactStatus}
            errorMessage={contactError}
          />
          <div className="card-search" style={{ padding: "1.25rem" }}>
            <span className="eyebrow eyebrow-light">Batch</span>
            <p className="stat-number" style={{ marginTop: 4 }}>{batch}</p>
          </div>
          {links.length > 0 && (
            <div className="card-search" style={{ padding: "1.25rem" }}>
              <span className="eyebrow eyebrow-light">Links</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                {links.map((link) => (
                  <li key={link.id} style={{ marginBottom: 8 }}>
                    <a href={link.url} target="_blank" rel="noopener noreferrer">
                      {link.platform}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
