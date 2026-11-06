import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage.tsx";

export const metadata: Metadata = {
  title: "Terms of Service | Alma Mater",
  description: "Terms of Service for the Alma Mater website, app and WhatsApp service.",
};

export default function Page() {
  return <LegalPage policy="terms-of-service" />;
}
