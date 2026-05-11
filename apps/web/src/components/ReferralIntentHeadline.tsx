import { splitReferralIntentHeadlineForDisplay } from "../lib/bulletinPostCardUtils";

type ReferralIntentHeadlineProps = {
  headline: string;
  as?: "h3" | "p" | "span";
  className?: string;
};

export function ReferralIntentHeadline({ headline, as: Tag = "span", className }: ReferralIntentHeadlineProps) {
  const parts = splitReferralIntentHeadlineForDisplay(headline);
  if (!parts) {
    return <Tag className={className}>{headline}</Tag>;
  }
  const merged = [className, "referral-intent-headline"].filter(Boolean).join(" ");
  return (
    <Tag className={merged}>
      <span className="referral-intent-headline__lead">{parts.lead}</span>
      <span className="referral-intent-headline__em">{parts.role}</span>
      {parts.company ? (
        <>
          <span className="referral-intent-headline__lead"> at </span>
          <span className="referral-intent-headline__em">{parts.company}</span>
        </>
      ) : null}
    </Tag>
  );
}
