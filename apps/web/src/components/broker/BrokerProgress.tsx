import { closesInLabel, progressStages, type BrokerRequest } from "../../lib/broker";
import "../../styles/broker.css";

/** The asker's timeline for one request (stage by stage; refreshed on each visit). */
export function BrokerProgress({ request }: { request: BrokerRequest }) {
  const stages = progressStages(request);
  return (
    <div className="broker-progress-wrap">
      <ol className="broker-progress" aria-label="Request progress">
        {stages.map((s) => (
          <li key={s.key} className={`broker-progress__stage broker-progress__stage--${s.state}`}>
            <span className="broker-progress__dot" aria-hidden="true">
              {s.state === "done" ? "✓" : null}
            </span>
            <p className="broker-progress__label">
              {s.label}
              {s.state === "current" ? <span className="pp-visually-hidden"> (now)</span> : null}
            </p>
          </li>
        ))}
      </ol>
      {request.status === "open" ? <p className="broker-note">{closesInLabel(request.expiresAt)}. We&apos;ll tell you as soon as someone says yes.</p> : null}
    </div>
  );
}
