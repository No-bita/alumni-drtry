import { useState } from "react";
import type { CSSProperties } from "react";
import { Button } from "./Button";
import { Textarea } from "./Input";
import { CAMPUS_IMAGE_SMALL } from "../constants/images";

type ReachOutCardProps = {
  profileId: string;
  profileName: string;
  onSubmit: (message: string) => Promise<void>;
  status?: "idle" | "sending" | "success" | "error";
  errorMessage?: string | null;
};

export function ReachOutCard({ profileName, onSubmit, status = "idle", errorMessage = null }: ReachOutCardProps) {
  const [message, setMessage] = useState("");
  const loading = status === "sending";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || loading) return;
    await onSubmit(message.trim());
    setMessage("");
  };

  return (
    <div className="card-reach-out">
      <div
        className="card-reach-out__strip"
        style={{ ...({ "--campus-strip-image": `url("${CAMPUS_IMAGE_SMALL}")` } as CSSProperties) }}
      />
      <div className="card-reach-out__body">
        <h3 className="card-reach-out__title">Reach out to {profileName}</h3>
        <p className="card-reach-out__desc">
          Start a short conversation on the platform. You can share email or LinkedIn only if you choose to, after you
          exchange a few messages.
        </p>
        {status === "success" && (
          <p className="body-text" style={{ color: "var(--olive)", marginBottom: 12 }}>
            Opening your conversation…
          </p>
        )}
        {status === "error" && errorMessage && (
          <p style={{ color: "var(--brick)", fontSize: 13, marginBottom: 12 }}>{errorMessage}</p>
        )}
        <form onSubmit={handleSubmit}>
          <Textarea
            placeholder="What are you hoping to talk about?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            style={{
              background: "rgba(242,237,228,0.1)",
              borderColor: "rgba(242,237,228,0.2)",
              color: "var(--cream)",
            }}
          />
          <Button type="submit" variant="secondary" disabled={loading || !message.trim()}>
            {loading ? "Starting…" : "Start conversation"}
          </Button>
        </form>
      </div>
    </div>
  );
}
