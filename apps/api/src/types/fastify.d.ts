import type { BrokerService } from "../services/brokerService.js";
import type { BrokerConversationService } from "../services/brokerConversationService.js";
import "fastify";
import type { AdminMetricsService } from "../services/adminMetricsService.js";
import type { AdminPeopleService } from "../services/adminPeopleService.js";
import type { AdminPlacesService } from "../services/adminPlacesService.js";
import type { DepartmentOtherReviewRepo } from "../repos/departmentOtherReviewRepo.js";
import type { AnnouncementService } from "../services/announcementService.js";
import type { LocationCleanupService } from "../services/locationCleanupService.js";
import type { AuthService, SessionActor } from "../services/authService.js";
import type { CampusMonthlyService } from "../services/campusMonthlyService.js";
import type { ConnectionThreadService } from "../services/connectionThreadService.js";
import type { ContactRequestService } from "../services/contactRequestService.js";
import type { DiscoveryService } from "../services/discoveryService.js";
import type { MatchService } from "../services/matchService.js";
import type { CareersService } from "../services/careersService.js";
import type { CitiesService } from "../services/citiesService.js";
import type { HomeSummaryService } from "../services/homeSummaryService.js";
import type { FeedbackService } from "../services/feedbackService.js";
import type { AnalyticsService } from "../services/analyticsService.js";
import type { WhatsAppService } from "../whatsapp/service.js";
import type { IntentcastService } from "../services/intentcastService.js";
import type { NotificationService } from "../services/notificationService.js";
import type { LinkService } from "../services/linkService.js";
import type { PersonAreaService } from "../services/personAreaService.js";
import type { OccupationService } from "../services/occupationService.js";
import type { OrganizationService } from "../services/organizationService.js";
import type { ProfileService } from "../services/profileService.js";
import type { DiscoveryReadLimiter } from "../lib/directoryAbuseLimiter.js";
import type { ViewAsInfo, ViewAsService } from "../services/viewAsService.js";

declare module "fastify" {
  interface FastifyInstance {
    adminMetricsService: AdminMetricsService;
    adminPeopleService: AdminPeopleService;
    departmentOtherReview: DepartmentOtherReviewRepo;
    announcementService: AnnouncementService;
    adminPlacesService: AdminPlacesService;
    locationCleanupService: LocationCleanupService;
    authService: AuthService;
    profileService: ProfileService;
    occupationService: OccupationService;
    linkService: LinkService;
    personAreaService: PersonAreaService;
    organizationService: OrganizationService;
    discoveryService: DiscoveryService;
    matchService: MatchService;
    careersService: CareersService;
    citiesService: CitiesService;
    homeSummaryService: HomeSummaryService;
    feedbackService: FeedbackService;
    analyticsService: AnalyticsService;
    whatsappService: WhatsAppService;
    discoveryLimiter: DiscoveryReadLimiter;
    intentcastService: IntentcastService;
    contactRequestService: ContactRequestService;
    brokerService: BrokerService;
    brokerConversationService: BrokerConversationService;
    connectionThreadService: ConnectionThreadService;
    notificationService: NotificationService;
    campusMonthlyService: CampusMonthlyService;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireSuperAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireNonDemoMutation: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Signed-in admin on the VIEW_AS_ADMIN_EMAILS allowlist, as themselves (never the viewed member). */
    requireViewAsAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    viewAsService: ViewAsService;
  }

  interface FastifyRequest {
    actor: SessionActor;
    /** Active admin view-as session for this request (actor is then the viewed member), else unset. */
    viewAs?: ViewAsInfo;
  }
}
