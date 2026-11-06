import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";

const stripControl = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const idParams = z.object({ personId: z.string().uuid() });
const queueQuery = z.object({
  status: z.enum(["pending", "rejected"]).default("pending"),
  q: z.string().transform(stripControl).pipe(z.string().trim().max(100)).optional()
});
const rejectBody = z.object({
  reason: z.string().transform(stripControl).pipe(z.string().trim().min(1).max(500))
});
// The exact text the admin reviewed; approval only applies if the stored text still matches it.
const expectedBody = z.object({ expectedText: z.string().min(1).max(500) });
const linkBody = z.object({ departmentId: z.string().uuid() });
const historyQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

/**
 * Admin review of member-typed "Other" departments. The typed text is never shown publicly
 * while pending or rejected; every decision writes department_other_history (append-only).
 */
export const adminDepartmentOtherRoutes: FastifyPluginAsync = async (app) => {
  const admin = { preHandler: [app.authenticate, app.requireAdmin] };
  const review = () => app.departmentOtherReview;
  const bad = (message: string) => new AppError(400, "DEPARTMENT_OTHER_REVIEW_BAD_REQUEST", message);

  const submissionOr404 = async (personId: string) => {
    const sub = await review().findSubmission(personId);
    if (!sub || sub.department_code !== "other" || !sub.department_other_text) {
      throw new AppError(404, "DEPARTMENT_OTHER_NOT_FOUND", "No other-department submission for this person.");
    }
    return sub;
  };

  app.get("/v1/admin/department-other/review", admin, async (request, reply) => {
    const query = queueQuery.safeParse(request.query);
    if (!query.success) throw bad("Invalid review query.");
    const submissions = await review().queue(query.data.status, query.data.q ?? "");
    return reply.code(200).send({ submissions });
  });

  app.get("/v1/admin/department-other/departments", admin, async (_request, reply) => {
    const departments = (await review().listDepartments()).filter((d) => d.code !== "other");
    return reply.code(200).send({ departments });
  });

  app.get("/v1/admin/department-other/history", admin, async (request, reply) => {
    const query = historyQuery.safeParse(request.query);
    if (!query.success) throw bad("Invalid history query.");
    const history = await review().history(null, query.data.limit);
    return reply.code(200).send({ history });
  });

  app.get("/v1/admin/department-other/:personId/history", admin, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) throw new AppError(404, "DEPARTMENT_OTHER_NOT_FOUND", "Submission not found.");
    const history = await review().history(params.data.personId, 50);
    return reply.code(200).send({ history });
  });

  const changed = () =>
    new AppError(409, "DEPARTMENT_OTHER_CHANGED", "The member changed this text after you opened it. Review the new text.");
  const expectedTextOr400 = (body: unknown) => {
    const parsed = expectedBody.safeParse(body);
    if (!parsed.success) throw bad("Say which submission text you reviewed.");
    return parsed.data.expectedText;
  };

  app.post("/v1/admin/department-other/:personId/approve", admin, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) throw new AppError(404, "DEPARTMENT_OTHER_NOT_FOUND", "Submission not found.");
    await submissionOr404(params.data.personId);
    const expectedText = expectedTextOr400(request.body);
    if (!(await review().approve(params.data.personId, request.actor.personId, expectedText))) throw changed();
    return reply.code(204).send();
  });

  app.post("/v1/admin/department-other/:personId/reject", admin, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = rejectBody.safeParse(request.body);
    if (!params.success) throw new AppError(404, "DEPARTMENT_OTHER_NOT_FOUND", "Submission not found.");
    if (!body.success) throw new AppError(400, "DEPARTMENT_OTHER_REJECT_REASON_REQUIRED", "Give a reason.");
    await submissionOr404(params.data.personId);
    const expectedText = expectedTextOr400(request.body);
    if (!(await review().reject(params.data.personId, request.actor.personId, body.data.reason, expectedText))) throw changed();
    return reply.code(204).send();
  });

  app.post("/v1/admin/department-other/:personId/link", admin, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = linkBody.safeParse(request.body);
    if (!params.success) throw new AppError(404, "DEPARTMENT_OTHER_NOT_FOUND", "Submission not found.");
    if (!body.success) throw bad("Pick a department.");
    await submissionOr404(params.data.personId);
    const expectedText = expectedTextOr400(request.body);
    const target = await review().findDepartmentById(body.data.departmentId);
    if (!target || target.code === "other") throw bad("Pick an existing catalog department.");
    if (!(await review().link(params.data.personId, request.actor.personId, body.data.departmentId, expectedText))) throw changed();
    return reply.code(204).send();
  });
};
