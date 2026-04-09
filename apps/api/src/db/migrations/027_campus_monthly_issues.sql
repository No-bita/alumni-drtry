-- Monthly PDF digest for the home page (e.g. "March 2026 at IIT BHU"). Super admin uploads; all signed-in users may view.

CREATE TABLE campus_monthly_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_month DATE NOT NULL,
  pdf_bytes BYTEA NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES people (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT campus_monthly_issues_issue_month_unique UNIQUE (issue_month),
  CONSTRAINT campus_monthly_issues_issue_month_first_day CHECK (EXTRACT(DAY FROM issue_month)::int = 1)
);

CREATE INDEX idx_campus_monthly_issues_issue_month_desc ON campus_monthly_issues (issue_month DESC);
