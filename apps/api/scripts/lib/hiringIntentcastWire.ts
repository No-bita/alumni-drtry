/**
 * Canonical hiring intentcast `content` wire shape (aligned with web Hire Alumni / `buildHiringBulletinContent`).
 * Leading `[[cat:hiring]]` matches `stripBulletinUiCategory` handling on the client.
 */
export function buildHiringIntentcastWire(opts: {
  company: string;
  title: string;
  location: string;
  summary: string;
  employmentType: string;
  experienceYears: string;
  compensationLpa: string;
}): string {
  const company = opts.company.trim();
  const title = opts.title.trim();
  const location = opts.location.trim();
  const head = `${company} — ${title} (${location}).`;
  const parts: string[] = [];
  const summary = opts.summary.trim();
  if (summary) parts.push(summary);
  parts.push(`${opts.employmentType.trim()}.`);
  const yoe = opts.experienceYears.trim();
  if (yoe) parts.push(`${yoe} years experience.`);
  const comp = opts.compensationLpa.trim();
  if (comp) parts.push(`Compensation: ${comp} LPA.`);
  const details = parts.join(" ").replace(/\s+/g, " ").trim();
  return `[[cat:hiring]]\n${head} ${details}`.trim();
}
