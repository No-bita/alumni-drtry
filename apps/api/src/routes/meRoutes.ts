import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { OPEN_TO_MAX_SELECTED, OPEN_TO_OPTION_IDS } from "../lib/openToPreferences.js";

const maxProfileBatchYear = new Date().getUTCFullYear() + 5;
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const openToOptionIdSchema = z.enum(OPEN_TO_OPTION_IDS);

const openToPreferencesSchema = z
  .object({
    selected: z.array(openToOptionIdSchema).max(OPEN_TO_MAX_SELECTED),
    descriptions: z.record(openToOptionIdSchema, z.string().max(500)).default({}),
  })
  .superRefine((value, ctx) => {
    const unique = new Set(value.selected);
    if (unique.size !== value.selected.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Open-to selections must be unique.",
        path: ["selected"],
      });
    }
    const descriptions = value.descriptions ?? {};
    for (const key of Object.keys(descriptions)) {
      if (!unique.has(key as (typeof OPEN_TO_OPTION_IDS)[number])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Descriptions may only be set for selected open-to options.",
          path: ["descriptions"],
        });
      }
    }
  });

const patchProfileSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120).optional(),
    departmentCode: z.string().trim().min(2).max(16).regex(/^[a-zA-Z0-9]+$/).optional(),
    batchYear: z.union([z.number().int().min(1960).max(maxProfileBatchYear), z.null()]).optional(),
    degreeCode: z.string().trim().min(2).max(24).regex(/^[a-zA-Z0-9_]+$/).nullable().optional(),
    personalEmail: z.string().trim().email().nullable().optional(),
    bio: z.string().max(3000).nullable().optional(),
    mobilePhone: z.string().trim().max(40).nullable().optional(),
    residenceCountry: z.string().trim().max(120).nullable().optional(),
    residenceCity: z.string().trim().max(120).nullable().optional(),
    openToPreferences: openToPreferencesSchema.nullable().optional(),
    markMinimumProfileComplete: z.literal(true).optional(),
    markOnboardingComplete: z.literal(true).optional()
  })
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one profile field to update."
      });
    }
  });

const occupationCreateSchema = z.object({
  occupationTypeCode: z.string().trim().min(2).max(64),
  organizationId: z.string().uuid().nullable().optional(),
  roleTitle: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  startDate: dateStringSchema.nullable().optional(),
  endDate: dateStringSchema.nullable().optional(),
  isCurrent: z.boolean().optional()
});

const occupationPatchSchema = z
  .object({
    occupationTypeCode: z.string().trim().min(2).max(64).optional(),
    organizationId: z.string().uuid().nullable().optional(),
    roleTitle: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    startDate: dateStringSchema.nullable().optional(),
    endDate: dateStringSchema.nullable().optional(),
    isCurrent: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one occupation field to update."
      });
    }
  });

const createLinkSchema = z.object({
  platform: z.string().trim().min(1).max(80),
  url: z.string().url().max(2048),
  label: z.string().max(120).nullable().optional()
});

const patchLinkSchema = z
  .object({
    platform: z.string().trim().min(1).max(80).optional(),
    url: z.string().url().max(2048).optional(),
    label: z.string().max(120).nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one link field to update."
      });
    }
  });

const uuidParamSchema = z.object({
  id: z.string().uuid()
});

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/me", { preHandler: app.authenticate }, async (request, reply) => {
    return reply.code(200).send({
      person: request.actor
    });
  });

  app.get("/v1/me/profile", { preHandler: app.authenticate }, async (request, reply) => {
    const profile = await app.profileService.getMyProfile(request.actor.personId);
    return reply.code(200).send({ profile });
  });

  app.patch(
    "/v1/me/profile",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const parsed = patchProfileSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "PROFILE_BAD_REQUEST", "Invalid profile update payload.");
      }

      const profile = await app.profileService.updateMyProfile(request.actor.personId, parsed.data);
      return reply.code(200).send({ profile });
    }
  );

  app.get("/v1/me/occupations", { preHandler: app.authenticate }, async (request, reply) => {
    const occupations = await app.occupationService.listMyOccupations(request.actor.personId);
    return reply.code(200).send({ occupations });
  });

  app.post(
    "/v1/me/occupations",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const parsed = occupationCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "OCCUPATION_BAD_REQUEST", "Invalid occupation payload.");
      }

      const occupation = await app.occupationService.createMyOccupation(
        request.actor.personId,
        parsed.data
      );
      return reply.code(201).send({ occupation });
    }
  );

  app.patch(
    "/v1/me/occupations/:id",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const params = uuidParamSchema.safeParse(request.params);
      const parsed = occupationPatchSchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        throw new AppError(400, "OCCUPATION_BAD_REQUEST", "Invalid occupation update payload.");
      }

      const occupation = await app.occupationService.updateMyOccupation(
        request.actor.personId,
        params.data.id,
        parsed.data
      );
      return reply.code(200).send({ occupation });
    }
  );

  app.delete(
    "/v1/me/occupations/:id",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const params = uuidParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, "OCCUPATION_BAD_REQUEST", "Invalid occupation id.");
      }
      await app.occupationService.deleteMyOccupation(request.actor.personId, params.data.id);
      return reply.code(204).send();
    }
  );

  app.get("/v1/me/links", { preHandler: app.authenticate }, async (request, reply) => {
    const links = await app.linkService.listMyLinks(request.actor.personId);
    return reply.code(200).send({ links });
  });

  app.post(
    "/v1/me/links",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const parsed = createLinkSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "LINK_BAD_REQUEST", "Invalid link payload.");
      }

      const link = await app.linkService.createMyLink(request.actor.personId, parsed.data);
      return reply.code(201).send({ link });
    }
  );

  app.patch(
    "/v1/me/links/:id",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const params = uuidParamSchema.safeParse(request.params);
      const parsed = patchLinkSchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        throw new AppError(400, "LINK_BAD_REQUEST", "Invalid link update payload.");
      }

      const link = await app.linkService.updateMyLink(request.actor.personId, params.data.id, parsed.data);
      return reply.code(200).send({ link });
    }
  );

  app.delete(
    "/v1/me/links/:id",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const params = uuidParamSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, "LINK_BAD_REQUEST", "Invalid link id.");
      }
      await app.linkService.deleteMyLink(request.actor.personId, params.data.id);
      return reply.code(204).send();
    }
  );
};
