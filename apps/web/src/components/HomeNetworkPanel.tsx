import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "./Avatar";
import type { SearchProfileView } from "../api/client";
import { demoDisplayFullName } from "../lib/demoProfile";
import { buildInviteLink, buildWhatsAppShareUrl, copyText } from "../lib/inviteLink";
import "../styles/home-network-invite.css";

type HomeNetworkPanelProps = {
  members: SearchProfileView[];
  directoryHref: string;
};

export function HomeNetworkPanel({
  members,
  directoryHref,
}: HomeNetworkPanelProps) {
  const avatars = members.slice(0, 6);
  const overflow = Math.max(0, members.length - avatars.length);
  const isEmpty = avatars.length === 0;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState<"idle" | "yes" | "no">("idle");
  const copiedTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    },
    []
  );
  const link = buildInviteLink(typeof window === "undefined" ? "" : window.location.origin);

  const onCopy = async () => {
    const ok = await copyText(link);
    setCopied(ok ? "yes" : "no");
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => {
      copiedTimer.current = null;
      setCopied("idle");
    }, 2500);
  };

  return (
    <section className="home-ideal__panel" aria-labelledby="home-network-heading">
      <h2 id="home-network-heading" className="home-ideal__panel-title">
        Your Network
      </h2>
      {isEmpty ? (
        <div className="home-network-empty">
          <p className="home-network-empty__count">0 of your batchmates are here yet</p>
          <p className="home-ideal__panel-copy">
            It's a little quiet in here. Be the person who brings the party: send one link and the
            first hello is yours.
          </p>
        </div>
      ) : (
        <>
          <div className="home-ideal__avatars" aria-label="Batch avatars">
            {avatars.map((member) => {
              const displayName = demoDisplayFullName(member.fullName) || member.fullName.trim();
              return (
                <Link key={member.id} to={`/profiles/${member.id}`}>
                  <Avatar name={displayName} size="sm" tone="pastel" />
                </Link>
              );
            })}
            {overflow > 0 ? <span className="home-ideal__avatar-overflow">+{overflow}</span> : null}
          </div>
          <p className="home-ideal__panel-copy">Strengthen your batch network and stay connected.</p>
        </>
      )}
      <div className="home-ideal__panel-actions">
        <button
          type="button"
          className="btn btn--primary"
          aria-expanded={inviteOpen}
          onClick={() => setInviteOpen((v) => !v)}
        >
          Invite batchmates
        </button>
        <Link to={directoryHref} className="btn btn--secondary">
          View all alumni
        </Link>
      </div>
      {inviteOpen ? (
        <div className="home-network-invite" role="group" aria-label="Invite link">
          <p className="home-network-invite__hint">Your link is ready. Drop it in a group chat and watch the batch roll in.</p>
          <input className="home-network-invite__link" readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
          <div className="home-network-invite__actions">
            <button type="button" className="btn btn--secondary" onClick={() => void onCopy()}>
              {copied === "yes" ? "Copied. Go forth." : copied === "no" ? "Couldn't copy. Long-press the link instead" : "Copy link"}
            </button>
            <a className="btn btn--primary" href={buildWhatsAppShareUrl(link)} target="_blank" rel="noopener noreferrer">
              Share on WhatsApp
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
}
