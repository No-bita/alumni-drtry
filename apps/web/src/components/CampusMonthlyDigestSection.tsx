import { useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiPostForm,
  API_BASE_URL,
  type CampusMonthlyCurrentResponse,
  type CampusMonthlyUploadResponse,
  isSuperAdmin,
} from "../api/client";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./Button";

/** File: `apps/web/public/media/Alma Communique Feb 2026.pdf` → served at site root in dev/build. */
const ALMA_COMMUNIQUE_PDF = encodeURI("/media/Alma Communique Feb 2026.pdf");

const DEFAULT_DIGEST_TITLE = "Alma Communique Feb 2026";

function previousCalendarMonthYyyyMm(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function CampusMonthlyDigestSection() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const formId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [issueMonth, setIssueMonth] = useState(previousCalendarMonthYyyyMm);

  const canUpload = auth.status === "authenticated" && isSuperAdmin(auth.person);

  /** When the API returns an issue, embed `/v1/campus-monthly/current/pdf`; otherwise the on-site default PDF. */
  const digestQuery = useQuery({
    queryKey: queryKeys.home.campusMonthly(),
    queryFn: ({ signal }) => assertApiGet<CampusMonthlyCurrentResponse>("/v1/campus-monthly/current", signal),
    enabled: auth.status === "authenticated",
  });

  const apiPdfSrc = useMemo(() => `${API_BASE_URL}/v1/campus-monthly/current/pdf`, []);

  const uploadMut = useMutation({
    mutationFn: async (fd: FormData) => {
      const res = await apiPostForm<CampusMonthlyUploadResponse>("/v1/campus-monthly/issue", fd);
      if (res.error) {
        throw new Error(res.error.message ?? res.error.code);
      }
      return res.data;
    },
    onSuccess: async () => {
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.home.campusMonthly() });
    },
  });

  const issue = digestQuery.data?.issue ?? null;
  const pdfSrc = issue ? apiPdfSrc : ALMA_COMMUNIQUE_PDF;
  const viewerTitle = issue?.headingLabel ?? DEFAULT_DIGEST_TITLE;

  return (
    <section className="home-dashboard__digest" aria-labelledby={`${formId}-digest-heading`}>
      <header className="home-dashboard__digest-header">
        <div className="home-dashboard__digest-header-main">
          <p className="home-dashboard__digest-kicker">Campus monthly</p>
          <h2 id={`${formId}-digest-heading`} className="home-dashboard__digest-title">
            {viewerTitle}
          </h2>
          <p className="home-dashboard__digest-caption">Reference read — open the PDF in a new tab for full view.</p>
        </div>
        <a
          href={pdfSrc}
          target="_blank"
          rel="noopener noreferrer"
          className="home-dashboard__text-link home-dashboard__text-link--caps"
        >
          Open PDF
        </a>
      </header>

      <div className="home-dashboard__digest-viewer">
        <iframe
          key={issue ? issue.issueMonth : "alma-communique-static"}
          title={viewerTitle}
          className="home-dashboard__digest-iframe"
          src={pdfSrc}
          loading="lazy"
        />
      </div>

      {canUpload ? (
        <form
          className="home-dashboard__digest-upload"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            const fd = new FormData();
            fd.set("issueMonth", issueMonth);
            fd.set("file", file);
            uploadMut.mutate(fd);
          }}
          aria-label="Upload campus monthly PDF"
        >
          <p className="home-dashboard__digest-upload-label">Super admin: upload or replace an issue (PDF, max 12 MB)</p>
          <div className="home-dashboard__digest-upload-row">
            <label className="home-dashboard__digest-month-label">
              <span className="visually-hidden">Issue month</span>
              <input
                type="month"
                className="input home-dashboard__digest-month-input"
                value={issueMonth}
                onChange={(e) => setIssueMonth(e.target.value)}
                required
              />
            </label>
            <label className="home-dashboard__digest-file-label">
              <span className="visually-hidden">PDF file</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </label>
            <Button type="submit" variant="primary" disabled={uploadMut.isPending || !file}>
              {uploadMut.isPending ? "Uploading…" : "Upload PDF"}
            </Button>
          </div>
          {uploadMut.isError ? (
            <p className="home-dashboard__digest-upload-error" role="alert">
              {uploadMut.error instanceof Error ? uploadMut.error.message : "Upload failed."}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
