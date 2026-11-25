import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { assertApiGet } from "../../lib/assertApiGet";

const KEY = ["admin", "settings", "broker-whatsapp"] as const;

/** Admin switch (off by default): also send brokered referral and hiring asks on WhatsApp. */
export function BrokerWhatsAppSetting() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: ({ signal }) => assertApiGet<{ enabled: boolean }>("/v1/admin/settings/broker-whatsapp", signal) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = q.data?.enabled ?? false;

  const toggle = async () => {
    setSaving(true);
    setError(null);
    const { data, error: err } = await api.put<{ enabled: boolean }>("/v1/admin/settings/broker-whatsapp", { enabled: !enabled });
    setSaving(false);
    if (err || !data) {
      setError(err?.message ?? "Couldn't save. Try again.");
      return;
    }
    queryClient.setQueryData(KEY, data);
  };

  return (
    <section className="aa-review" aria-labelledby="aa-broker-wa-title">
      <div className="aa-review__text">
        <h2 id="aa-broker-wa-title" className="aa-review__title">
          Requests on WhatsApp
        </h2>
        <p className="aa-review__count">
          {q.isPending
            ? "Loading…"
            : enabled
              ? "On: referral and hiring asks also go to alumni who get reachouts on WhatsApp (within the monthly cap)."
              : "Off: referral and hiring asks go by email and in the app only."}
        </p>
        {error ? (
          <p className="aa-review__count" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <button type="button" className="btn btn--secondary" role="switch" aria-checked={enabled} disabled={q.isPending || saving} onClick={() => void toggle()}>
        {saving ? "Saving…" : enabled ? "Turn off" : "Turn on"}
      </button>
    </section>
  );
}
