import type { DbExecutor } from "../db/types.js";
import { FeedbackRepo, type FeedbackEntry } from "../repos/feedbackRepo.js";

/** Member feedback: stored with its author so admins can follow up; never anonymous. */
export class FeedbackService {
  private readonly repo: FeedbackRepo;

  constructor(db: DbExecutor) {
    this.repo = new FeedbackRepo(db);
  }

  submit(personId: string, message: string): Promise<FeedbackEntry> {
    return this.repo.create(personId, message.trim());
  }

  listForAdmin(): Promise<FeedbackEntry[]> {
    return this.repo.listForAdmin();
  }
}
