export type UserRole =
  | 'MASTER_ADMIN'
  | 'INSTITUTION_ADMIN'
  | 'SOLO_EDUCATOR'
  | 'COURSE_ADMIN'
  | 'LEARNER';

export type AccountCategory = 'SOLO_TEACHER' | 'SCHOOL_INSTITUTION' | 'FREELANCER' | 'OTHER';

export type KycStatus = 'UNSUBMITTED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';

export type SubscriptionStatus = 'INACTIVE' | 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED';

export type ResourceType = 'PDF' | 'DOCX' | 'VIDEO' | 'IMAGE' | 'BOOK';

export type AccessTier = 'PUBLIC_FREE' | 'PLATFORM_PASS' | 'ENROLLED_ONLY' | 'PAID_SINGLE';

export type VerificationDecision = 'PENDING' | 'APPROVED' | 'REJECTED';

export type LiveSessionStatus = 'SCHEDULED' | 'LIVE' | 'ENDED';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  accountCategory?: AccountCategory;
  institutionId?: string;
  institutionName?: string;
  bio: string;
  specialization: string;
  educationLevel?: string;
  country?: string;
  educationSystem?: string;
  avatarUrl?: string;
  mustChangePassword: boolean;
  kycStatus: KycStatus;
  kycRejectionReason?: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan?: 'SOLO_PRO' | 'INSTITUTION_CAMPUS' | 'AKADEMI_PASS';
  subscriptionUpdatedAt?: string;
  followPriceUsd: number;
  followerIds: string[];
  followingCreatorIds: string[];
  paidFollowCreatorIds: string[];
  purchasedResourceIds: string[];
  purchasedCourseIds: string[];
  platformPassActive: boolean;
  createdAt: string;
  // Confidential PII - only returned to self or MASTER_ADMIN
  nationalIdNumber?: string;
  phone?: string;
  homeAddress?: string;
  billingEmail?: string;
}

export interface KycSubmission {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: UserRole;
  accountCategory?: AccountCategory;
  documentType: 'NATIONAL_ID' | 'PASSPORT' | 'INSTITUTION_CHARTER';
  documentNumberMasked: string;
  idFileName: string;
  idFilePath: string;
  credentialFileName: string;
  credentialFilePath: string;
  submittedAt: string;
  status: VerificationDecision;
  reviewedBy?: string;
  reviewNotes?: string;
}

export interface AccountRequest {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  accountCategory: AccountCategory;
  organizationName?: string;
  country: string;
  district?: string;
  educationSystem?: string;
  specialization: string;
  plannedLevels?: string;
  portfolioUrl?: string;
  statement: string;
  status: VerificationDecision;
  submittedAt: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdUserId?: string;
}

export interface ResourceItem {
  id: string;
  ownerId: string;
  ownerName: string;
  institutionId?: string;
  title: string;
  description: string;
  type: ResourceType;
  subject: string;
  educationLevel: string;
  educationSystem?: string;
  accessTier: AccessTier;
  priceUsd: number;
  downloadable: boolean;
  fileName: string;
  fileSizeLabel: string;
  filePath?: string;
  mimeType?: string;
  previewSummary: string;
  downloadsCount: number;
  viewsCount: number;
  createdAt: string;
  status: 'PUBLISHED' | 'SUSPENDED';
}

export interface CourseItem {
  id: string;
  ownerId: string;
  ownerName: string;
  institutionId?: string;
  institutionName?: string;
  assignedInstructorId?: string;
  title: string;
  description: string;
  subject: string;
  requiredLevel: string;
  educationSystem?: string;
  accessTier: AccessTier;
  priceUsd: number;
  coverImage: string;
  resourceIds: string[];
  requiresAcademicVerification: boolean;
  enrolledLearnerIds: string[];
  createdAt: string;
  status: 'ACTIVE' | 'PAUSED';
}

export interface LearnerAcademicDoc {
  id: string;
  learnerId: string;
  title: string;
  educationLevel: string;
  institutionIssued: string;
  fileName: string;
  filePath?: string;
  uploadedAt: string;
}

export interface EnrollmentRecord {
  id: string;
  courseId: string;
  courseTitle: string;
  learnerId: string;
  learnerName: string;
  learnerDeclaredLevel: string;
  ownerId: string;
  institutionId?: string;
  verifierRoleRequired: 'SOLO_EDUCATOR' | 'INSTITUTION_ADMIN';
  academicStatus: VerificationDecision;
  academicNote?: string;
  progressPercent: number;
  completedResourceIds: string[];
  attendanceMinutes: number;
  gradeLabel?: string;
  certificateId?: string;
  certificateCode?: string;
  requestedAt: string;
  verifiedAt?: string;
}

export interface LiveChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  isQuestion?: boolean;
  approvedForQa?: boolean;
  timestamp: string;
}

export interface WhiteboardPoint {
  x: number;
  y: number;
}

export interface WhiteboardStroke {
  id: string;
  userId: string;
  userName: string;
  tool: 'PEN' | 'HIGHLIGHTER' | 'TEXT';
  color: string;
  width: number;
  points: WhiteboardPoint[];
  text?: string;
  createdAt: string;
}

export interface BoardPointerState {
  x: number;
  y: number;
  userId: string;
  userName: string;
  active: boolean;
}

export interface LivePollOption {
  id: string;
  text: string;
  voterIds: string[];
}

export interface LivePoll {
  id: string;
  question: string;
  options: LivePollOption[];
  createdById: string;
  createdByName: string;
  isOpen: boolean;
  createdAt: string;
}

export interface LiveSession {
  id: string;
  courseId: string;
  courseTitle: string;
  hostId: string;
  hostName: string;
  institutionId?: string;
  title: string;
  topicSummary: string;
  scheduledAt: string;
  durationMinutes: number;
  accessRule: 'ENROLLED_ONLY' | 'PAID_FOLLOWERS' | 'PUBLIC_SEMINAR';
  status: LiveSessionStatus;
  chatMuted: boolean;
  qaMode: boolean;
  pinnedResourceIds: string[];
  raisedHandUserIds: string[];
  micGrantedUserIds: string[];
  activeParticipantIds: string[];
  kickedUserIds: string[];
  attendanceLog: Record<string, { name: string; joinedAt: string; minutes: number }>;
  chatMessages: LiveChatMessage[];
  whiteboardStrokes?: WhiteboardStroke[];
  boardPointer?: BoardPointerState | null;
  polls?: LivePoll[];
}

export interface CourseQaReply {
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  body: string;
  mentions: string[];
  upvoterIds: string[];
  isInstructorVerified: boolean;
  verifiedByName?: string;
  createdAt: string;
}

export interface CourseQaThread {
  id: string;
  courseId: string;
  courseTitle: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  title: string;
  body: string;
  mentions: string[];
  upvoterIds: string[];
  isPinned: boolean;
  isOfficeHour?: boolean;
  officeHourSlot?: string;
  createdAt: string;
  updatedAt: string;
  replies: CourseQaReply[];
}

export interface CertificateRecord {
  id: string;
  certificateCode: string;
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  subject: string;
  educationLevel: string;
  learnerId: string;
  learnerName: string;
  issuerId: string;
  issuerName: string;
  institutionName?: string;
  gradeLabel?: string;
  attendanceMinutes: number;
  issuedAt: string;
  revoked?: boolean;
}

export type QuizCurriculumTag =
  | 'UNEB PLE'
  | 'UNEB UCE'
  | 'UNEB UACE'
  | 'UBTEB'
  | 'NCHE'
  | 'KCSE'
  | 'WASSCE'
  | 'GENERAL';

export interface QuizQuestion {
  id: string;
  prompt: string;
  kind: 'MCQ' | 'STRUCTURED';
  options?: string[];
  correctOptionIndex?: number;
  acceptedKeywords?: string[];
  sampleAnswer?: string;
  workedSolution: string;
  marks: number;
}

export interface QuizItem {
  id: string;
  courseId: string;
  courseTitle: string;
  ownerId: string;
  ownerName: string;
  title: string;
  curriculumTag: QuizCurriculumTag;
  description: string;
  timeLimitMinutes: number;
  passingPercent: number;
  isPastPaper: boolean;
  published: boolean;
  createdAt: string;
  questions: QuizQuestion[];
}

export interface QuizQuestionResult {
  questionId: string;
  prompt?: string;
  kind?: 'MCQ' | 'STRUCTURED';
  earnedMarks: number;
  maxMarks: number;
  isCorrect: boolean;
  submittedAnswer?: string;
  correctAnswer?: string;
  matchedKeywords?: string[];
  workedSolution: string;
  correctAnswerDisplay: string;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  courseId: string;
  learnerId: string;
  learnerName: string;
  answers: Record<string, string | number>;
  scoreEarned: number;
  totalMarks: number;
  percentScore: number;
  passed: boolean;
  gradeLabel: string;
  questionResults: QuizQuestionResult[];
  submittedAt: string;
  durationSeconds: number;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  category: 'KYC_APPEAL' | 'SUBSCRIPTION' | 'CONTENT_REPORT' | 'ACADEMIC_DISPUTE' | 'GENERAL';
  subject: string;
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED';
  createdAt: string;
  messages: {
    id: string;
    senderId: string;
    senderName: string;
    senderRole: UserRole;
    body: string;
    timestamp: string;
  }[];
}

export interface MessageRecipient {
  id: string;
  name: string;
  label: string;
}

export interface DirectMessageThread {
  id: string;
  contextType: 'ENROLLMENT_CHECK' | 'COURSE_QA' | 'INSTITUTION_STAFF';
  contextId: string;
  contextTitle: string;
  participantIds: string[];
  participantNames: Record<string, string>;
  messages: {
    id: string;
    senderId: string;
    senderName: string;
    senderRole: UserRole;
    body: string;
    timestamp: string;
  }[];
}

export interface OutboxEmail {
  id: string;
  toEmail: string;
  toName: string;
  subject: string;
  body: string;
  sentAt: string;
  tag: 'CREDENTIALS' | 'REJECTION' | 'KYC' | 'SUBSCRIPTION' | 'NOTIFICATION';
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: 'USER' | 'REQUEST' | 'KYC' | 'SUBSCRIPTION' | 'RESOURCE' | 'ENROLLMENT' | 'SESSION' | 'COURSE';
  targetId: string;
  details: string;
  timestamp: string;
}

export interface LedgerTransaction {
  id: string;
  buyerId: string;
  buyerName: string;
  sellerId?: string;
  sellerName?: string;
  itemType: 'COURSE' | 'BOOK' | 'PAID_FOLLOW' | 'PLATFORM_PASS' | 'CONTRIBUTOR_SUBSCRIPTION';
  itemTitle: string;
  grossUsd: number;
  platformFeeUsd: number;
  creatorNetUsd: number;
  timestamp: string;
}

export interface EducationFrameworkSpec {
  id: string;
  country: string;
  regulatoryBodies: string;
  primaryAndSecondary: string;
  tvetAndTertiary: string;
  higherEducationAlignment: string;
}

export interface OnboardingProtocolStep {
  step: string;
  title: string;
  actor: string;
  summary: string;
}

export interface PublicFeaturedResource {
  id: string;
  title: string;
  description: string;
  type: ResourceType;
  subject: string;
  educationLevel: string;
  levelBucket: 'Primary' | 'O-Level' | 'A-Level' | 'Vocational' | 'University' | 'Professional';
  contributorName: string;
  verified: boolean;
  isFree: boolean;
  priceLabel: string;
  fileSizeLabel: string;
}

export interface PublicFeaturedCreator {
  publicKey: string;
  displayName: string;
  roleLabel: string;
  isInstitution: boolean;
  specialization: string;
  bio: string;
  avatarUrl?: string;
  followersCount: number;
}

export interface PublicFeaturedSeminar {
  id: string;
  title: string;
  courseTitle: string;
  hostName: string;
  topicSummary: string;
  scheduledAt: string;
  status: string;
}

export interface PublicGatewayInfo {
  platformName: string;
  developer: string;
  regionFocus: string;
  privacyPolicySummary: string;
  brandConfig: {
    logoUrl: string;
    supportEmail: string;
    supportWhatsApp: string;
    physicalAddress: string;
    registrationNote: string;
    approvalTimelineLabel: string;
    paymentMethods: string[];
    commissionRatePercent: number;
    lowDataNote: string;
  };
  stats: {
    verifiedEducatorsCount: number;
    availableResourcesCount: number;
    registeredLearnersCount: number;
    subjectsCount: number;
    useQualitativeStrip: boolean;
  };
  supportedFormats: { code: ResourceType; label: string; description: string }[];
  educationFrameworks: EducationFrameworkSpec[];
  educationLevels: string[];
  onboardingSteps: OnboardingProtocolStep[];
  subscriptionPlans: {
    id: string;
    name: string;
    audience: string;
    monthlyUsd: number;
    storageLabel: string;
    liveCapacityLabel: string;
    commissionLabel: string;
    summary: string;
  }[];
  stakeholderRoles: {
    role: string;
    verificationOwner: string;
    capabilities: string;
  }[];
  featuredResources: PublicFeaturedResource[];
  featuredCreators: PublicFeaturedCreator[];
  upcomingSeminars: PublicFeaturedSeminar[];
  faqs: { question: string; answer: string }[];
}

export interface MasterAnalyticsSummary {
  totalContributors: number;
  activeContributors: number;
  totalLearners: number;
  pendingRequests: number;
  pendingKyc: number;
  pendingSubscriptions: number;
  totalResources: number;
  totalCourses: number;
  totalEnrollments: number;
  grossPlatformVolumeUsd: number;
  platformCommissionUsd: number;
  mostEnrolledCourses: {
    id: string;
    title: string;
    ownerName: string;
    enrolledCount: number;
    subject: string;
  }[];
  contributorBreakdown: {
    userId: string;
    name: string;
    email: string;
    role: UserRole;
    accountCategory?: AccountCategory;
    institutionName?: string;
    kycStatus: KycStatus;
    subscriptionStatus: SubscriptionStatus;
    totalUploads: number;
    byType: Record<ResourceType, number>;
    coursesCount: number;
    studentsCount: number;
    followersCount: number;
    revenueUsd: number;
  }[];
}
