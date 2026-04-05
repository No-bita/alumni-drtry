import "fastify";
import type { AdminMetricsService } from "../services/adminMetricsService.js";
import type { AdminPeopleService } from "../services/adminPeopleService.js";
import type { AuthService, SessionActor } from "../services/authService.js";
import type { ConnectionThreadService } from "../services/connectionThreadService.js";
import type { ContactRequestService } from "../services/contactRequestService.js";
import type { DiscoveryService } from "../services/discoveryService.js";
import type { IntentcastService } from "../services/intentcastService.js";
import type { NotificationService } from "../services/notificationService.js";
import type { LinkService } from "../services/linkService.js";
import type { OccupationService } from "../services/occupationService.js";
import type { OrganizationService } from "../services/organizationService.js";
import type { ProfileService } from "../services/profileService.js";

declare module "fastify" {
  interface FastifyInstance {
    adminMetricsService: AdminMetricsService;
    adminPeopleService: AdminPeopleService;
    authService: AuthService;
    profileService: ProfileService;
    occupationService: OccupationService;
    linkService: LinkService;
    organizationService: OrganizationService;
    discoveryService: DiscoveryService;
    intentcastService: IntentcastService;
    contactRequestService: ContactRequestService;
    connectionThreadService: ConnectionThreadService;
    notificationService: NotificationService;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    actor: SessionActor;
  }
}
