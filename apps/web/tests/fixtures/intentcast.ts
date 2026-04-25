import type { IntentcastFeedItem } from "../../src/api/client";

export function makeIntentcast(overrides: Partial<IntentcastFeedItem> = {}): IntentcastFeedItem {
  return {
    id: "ic-1",
    authorPersonId: "person-1",
    authorFullName: "Test Author",
    authorDepartmentCode: "CSE",
    authorDepartmentName: "Computer Science",
    authorBatchYear: 2020,
    authorCurrentRoleTitle: "Engineer",
    authorCurrentOrganizationName: "ACME",
    category: "hiring",
    content: "ACME — Engineer (Bengaluru). Full-time role.",
    status: "open",
    expiresAt: "2030-01-01T00:00:00.000Z",
    closedAt: null,
    createdAt: "2029-01-01T00:00:00.000Z",
    editableUntil: "2029-01-01T01:00:00.000Z",
    authorSoftDeletedAt: null,
    authorDeletePurgeAt: null,
    responseCount: 0,
    viewerHasResponded: false,
    ...overrides,
  };
}
