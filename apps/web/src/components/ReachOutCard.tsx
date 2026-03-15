import { useState } from "react";
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
        style={{
          backgroundImage: `url(${CAMPUS_IMAGE_SMALL})`,
        }}
      />
      <div className="card-reach-out__body">
        <h3 className="card-reach-out__title">Reach out to {profileName}</h3>
        <p className="card-reach-out__desc">
          Send a short note about what you’d like to connect on. They’ll get it via the platform.
        </p>
        {status === "success" && (
          <p className="body-text" style={{ color: "var(--olive)", marginBottom: 12 }}>
            Request sent. They’ll get your note via the platform.
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
            {loading ? "Sending…" : "Send request"}
          </Button>
        </form>
      </div>
    </div>
  );
}
