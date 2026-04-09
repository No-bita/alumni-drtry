import type { FastifyPluginAsync } from "fastify";
import { AppError } from "../lib/errors.js";

const MAX_PDF_BYTES = 12 * 1024 * 1024;

function isPdfMagic(buf: Buffer): boolean {
  return buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

function parseIssueMonthYyyyMm(raw: string | undefined): Date {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new AppError(400, "CAMPUS_MONTHLY_BAD_REQUEST", "issueMonth is required (YYYY-MM).");
  }
  const m = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (!m || m[1] === undefined || m[2] === undefined) {
    throw new AppError(400, "CAMPUS_MONTHLY_BAD_REQUEST", "issueMonth must be YYYY-MM.");
  }
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (mo < 1 || mo > 12) {
    throw new AppError(400, "CAMPUS_MONTHLY_BAD_REQUEST", "Invalid month in issueMonth.");
  }
  return new Date(Date.UTC(y, mo - 1, 1));
}

export const campusMonthlyRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/campus-monthly/current", { preHandler: app.authenticate }, async (_request, reply) => {
    const issue = await app.campusMonthlyService.getLatestPublic();
    return reply.code(200).send({ issue });
  });

  app.get("/v1/campus-monthly/current/pdf", { preHandler: app.authenticate }, async (_request, reply) => {
    const pdf = await app.campusMonthlyService.getLatestPdf();
    if (!pdf) {
      throw new AppError(404, "CAMPUS_MONTHLY_NOT_FOUND", "No campus digest has been uploaded yet.");
    }
    const iso = pdf.issueMonth.toISOString().slice(0, 10);
    const filename = `iitbhu-campus-${iso}.pdf`;
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="${filename}"`)
      .send(pdf.buffer);
  });

  app.post(
    "/v1/campus-monthly/issue",
    { preHandler: [app.authenticate, app.requireSuperAdmin] },
    async (request, reply) => {
      if (!request.isMultipart()) {
        throw new AppError(400, "CAMPUS_MONTHLY_BAD_REQUEST", "Expected multipart/form-data.");
      }

      let issueMonthRaw: string | undefined;
      let fileBuf: Buffer | null = null;

      for await (const part of request.parts({ limits: { fileSize: MAX_PDF_BYTES } })) {
        if (part.type === "field" && part.fieldname === "issueMonth") {
          issueMonthRaw = String(part.value);
        } else if (part.type === "file" && part.fieldname === "file") {
          fileBuf = await part.toBuffer();
        }
      }

      if (!fileBuf || fileBuf.length === 0) {
        throw new AppError(400, "CAMPUS_MONTHLY_BAD_REQUEST", "A PDF file is required (field name: file).");
      }
      if (!isPdfMagic(fileBuf)) {
        throw new AppError(400, "CAMPUS_MONTHLY_BAD_REQUEST", "Upload must be a PDF file.");
      }

      const issueMonth = parseIssueMonthYyyyMm(issueMonthRaw);
      await app.campusMonthlyService.upsertPdf({
        issueMonth,
        pdfBytes: fileBuf,
        uploadedBy: request.actor.personId
      });

      const issue = await app.campusMonthlyService.getLatestPublic();
      return reply.code(200).send({ issue });
    }
  );
};
