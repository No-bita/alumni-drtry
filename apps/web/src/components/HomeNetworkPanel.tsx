import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "./Avatar";
import type { SearchProfileView } from "../api/client";
import { buildInviteLink, buildWhatsAppShareUrl, copyText } from "../lib/inviteLink";
import "../styles/home-network-invite.css";

type HomeNetworkPanelProps = {
  members: SearchProfileView[];
  directoryHref: string;
  /** Batchmates here, as shown ("12", "40+", "100+"). Defaults to the member count. */
  countLabel?: string;
};

function batchTitle(countLabel: string): string {
  return countLabel === "1" ? "1 of your batchmates is here" : `${countLabel} of your batchmates are here`;
}

/** Your batch on Home. With nobody here yet: one quiet invite line, no zero count. */
export function HomeNetworkPanel({
  members,
  directoryHref,
  countLabel,
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

  const invitePanel = inviteOpen ? (
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
  ) : null;

  if (isEmpty) {
    return (
      <section className="home-network-line" aria-label="Your network">
        <p className="home-network-line__text">
          Know batchmates who should be here?{" "}
          <button
            type="button"
            className="home-network-line__invite"
            aria-expanded={inviteOpen}
            onClick={() => setInviteOpen((v) => !v)}
          >
            Invite them
          </button>
        </p>
        {invitePanel}
      </section>
    );
  }

  return (
    <section className="home-ideal__panel" aria-labelledby="home-network-heading">
      <h2 id="home-network-heading" className="home-ideal__panel-title">
        {batchTitle(countLabel ?? String(members.length))}
      </h2>
      <div className="home-ideal__avatars" aria-label="Batch avatars">
        {avatars.map((member) => {
          const displayName = (member.fullName ?? "").trim() || member.fullName.trim();
          return (
            <Link key={member.id} to={`/profiles/${member.id}`}>
              <Avatar name={displayName} size="sm" tone="pastel" />
            </Link>
          );
        })}
        {overflow > 0 ? <span className="home-ideal__avatar-overflow">+{overflow}</span> : null}
      </div>
      <p className="home-ideal__panel-copy">Strengthen your batch network and stay connected.</p>
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
      {invitePanel}
    </section>
  );
}
