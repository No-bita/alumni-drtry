import type { ContactRequestInboxItem } from "../api/client";
import type { BrokerAsk } from "./broker";
import { formatBatchYearShort } from "./bulletinPostCardUtils";
import { EXPERIENCE_BAND_LABELS, JOB_FUNCTION_LABELS } from "./jobFunctions";
import { ADVICE_TOPIC_LABELS, noteLabel } from "./noteForm";

/**
 * Home's "Requests for you": brokered asks (Alma Mater asked you on someone's behalf) and direct
 * reachouts (someone wrote to you), as one list of rows. Compact by default (who, what, status); a row
 * opens into the full request (their note, links, what saying yes means, Yes / Not this time).
 */
export type RequestRow = {
  /** "ask:<askId>" or "note:<contactRequestId>". */
  key: string;
  source: "ask" | "note";
  occurredAt: string;
  /** Small label above the title: "Referral request", "Hiring", "Interview prep"… */
  label: string;
  /** One line: "Referral for Product Manager at Meesho". */
  title: string;
  person: { personId: string; name: string; institution: string | null; batchYear: number | null };
  /** Their own words (why they're a fit, the question, the role pitch). */
  note: string;
  /** Links to open: the job description, a résumé. */
  links: { label: string; sub: string | null; href: string }[];
  /** Waiting for your answer (false once you said yes to a brokered ask). */
  pending: boolean;
  ask?: BrokerAsk;
  inbox?: ContactRequestInboxItem;
};

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "Aaryan Shah · IIT (BHU) Varanasi '25" (compact row). */
export function rowMeta(p: RequestRow["person"]): string {
  const place = [p.institution, p.batchYear ? formatBatchYearShort(p.batchYear) : null].filter(Boolean).join(" ");
  return [p.name, place].filter(Boolean).join(" · ");
}

/** "IIT (BHU) Varanasi · Class of 2025" (open request). */
export function personLine(p: RequestRow["person"]): string {
  return [p.institution, p.batchYear ? `Class of ${p.batchYear}` : null].filter(Boolean).join(" · ");
}

function referralTitle(role: string | null, company: string): string {
  return role ? `Referral for ${role} at ${company}` : `Referral at ${company}`;
}

function hiringTitle(role: string, company: string | null): string {
  return company ? `Hiring: ${role} at ${company}` : `Hiring: ${role}`;
}

function jobLink(href: string | null | undefined, company: string | null, role: string | null) {
  const url = clean(href);
  if (!url) return [];
  const sub = [clean(company), clean(role)].filter(Boolean).join(" · ") || null;
  return [{ label: "View job description", sub, href: url }];
}

export function rowFromAsk(a: BrokerAsk): RequestRow {
  const name = clean(a.asker.fullName) || "An alum";
  const person = { personId: a.asker.personId, name, institution: a.asker.institutionName, batchYear: a.asker.batchYear };
  const d = a.details;
  if (a.kind === "referral") {
    const role = clean(a.roleTitle) || (d?.purpose === "referral" ? clean(d.role) : "") || null;
    const links = jobLink(d?.purpose === "referral" ? d.jobUrl : a.jobUrl, a.company, role);
    if (d?.purpose === "referral" && d.resumeUrl) links.push({ label: "View résumé", sub: null, href: d.resumeUrl });
    return {
      key: `ask:${a.askId}`,
      source: "ask",
      occurredAt: a.askedAt,
      label: "Referral request",
      title: referralTitle(role ?? `${JOB_FUNCTION_LABELS[a.jobFunction]} role`, a.company),
      person,
      note: d?.purpose === "referral" ? clean(d.fit) || a.message : a.message,
      links,
      pending: a.status === "asked",
      ask: a,
    };
  }
  const role = clean(a.roleTitle) || `${JOB_FUNCTION_LABELS[a.jobFunction]} role`;
  const band = a.experienceBand ? EXPERIENCE_BAND_LABELS[a.experienceBand] : null;
  return {
    key: `ask:${a.askId}`,
    source: "ask",
    occurredAt: a.askedAt,
    label: "Hiring",
    title: hiringTitle(band ? `${role} (${band})` : role, a.company || null),
    person,
    note: d?.purpose === "hiring" ? clean(d.message) || a.message : a.message,
    links: jobLink(a.jobUrl ?? (d?.purpose === "hiring" ? d.jobUrl : null), a.company || null, role),
    pending: a.status === "asked",
    ask: a,
  };
}

export function rowFromInbox(r: ContactRequestInboxItem): RequestRow {
  const name = clean(r.senderFullName) || "An alum";
  const person = { personId: r.senderPersonId, name, institution: r.senderInstitutionName ?? null, batchYear: r.senderBatchYear ?? null };
  const base = { key: `note:${r.id}`, source: "note" as const, occurredAt: r.createdAt, person, pending: true, inbox: r };
  const d = r.details;
  if (d?.purpose === "referral") {
    const links = jobLink(d.jobUrl, d.company, d.role);
    if (d.resumeUrl) links.push({ label: "View résumé", sub: null, href: d.resumeUrl });
    return { ...base, label: noteLabel(d), title: referralTitle(clean(d.role) || null, clean(d.company)), note: clean(d.fit), links };
  }
  if (d?.purpose === "hiring") {
    return { ...base, label: noteLabel(d), title: hiringTitle(clean(d.role), clean(d.company) || null), note: clean(d.message), links: jobLink(d.jobUrl, d.company, d.role) };
  }
  if (d?.purpose === "advice") {
    const topic = ADVICE_TOPIC_LABELS[d.topic] ?? "Advice";
    return { ...base, label: topic, title: clean(d.question), note: clean(d.question), links: [] };
  }
  const message = clean(r.message);
  return { ...base, label: "Reachout", title: message, note: message, links: [] };
}

/** Waiting for your answer first, newest first; then asks you already said yes to. */
export function requestRows(asks: readonly BrokerAsk[], inbox: readonly ContactRequestInboxItem[]): RequestRow[] {
  const rows = [
    ...asks.filter((a) => a.status === "asked" || a.status === "accepted").map(rowFromAsk),
    ...inbox.map(rowFromInbox),
  ];
  return rows.sort((x, y) => Number(y.pending) - Number(x.pending) || Date.parse(y.occurredAt) - Date.parse(x.occurredAt));
}
