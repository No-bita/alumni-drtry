import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage.tsx";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy-policy" },
  title: "Privacy Policy | Alma Mater",
  description: "Privacy Policy for the Alma Mater website, app and WhatsApp service.",
};

export default function Page() {
  return <LegalPage policy="privacy-policy" />;
}
