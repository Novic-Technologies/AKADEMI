import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  AccountRequest,
  AuditLogEntry,
  CourseItem,
  DirectMessageThread,
  EnrollmentRecord,
  KycSubmission,
  LearnerAcademicDoc,
  LedgerTransaction,
  LiveSession,
  OutboxEmail,
  PublicGatewayInfo,
  ResourceItem,
  SupportTicket,
  UserProfile,
} from '../src/types/akademi.ts';

export interface StoredUser extends UserProfile {
  passwordHash: string;
}

export interface AkademiDatabase {
  seedVersion: number;
  users: StoredUser[];
  accountRequests: AccountRequest[];
  kycSubmissions: KycSubmission[];
  resources: ResourceItem[];
  courses: CourseItem[];
  learnerAcademicDocs: LearnerAcademicDoc[];
  enrollments: EnrollmentRecord[];
  liveSessions: LiveSession[];
  tickets: SupportTicket[];
  messageThreads: DirectMessageThread[];
  outboxEmails: OutboxEmail[];
  auditLogs: AuditLogEntry[];
  ledger: LedgerTransaction[];
}

export const CURRENT_SEED_VERSION = 6;
export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOAD_DIR = path.resolve(DATA_DIR, 'uploads');
const DB_FILE = path.resolve(DATA_DIR, 'akademi-db.json');

export function getPlatformGatewayConfig(): PublicGatewayInfo {
  const platformName = process.env.AKADEMI_BRAND_NAME?.trim() || 'Akademi';
  const developer = process.env.AKADEMI_OPERATOR_NAME?.trim() || 'Novic Technologies';

  return {
    platformName,
    developer,
    regionFocus: 'Uganda, East Africa & Pan-African Academic Network',
    privacyPolicySummary:
      'Private-by-default academic infrastructure. Personal IDs, learner transcripts, confidential PII, and enrolled-only or paid course files remain protected behind authenticated sign-in.',
    brandConfig: {
      logoUrl:
        process.env.AKADEMI_BRAND_LOGO_URL?.trim() ||
        '/assets/aistudio/39335058-2667-43d2-ac1d-3ecb2e744e84_a6ce7bf2.jpg',
      supportEmail: process.env.AKADEMI_SUPPORT_EMAIL?.trim() || 'support@akademi.novic.tech',
      supportWhatsApp: process.env.AKADEMI_SUPPORT_PHONE?.trim() || '+256 700 418 900',
      physicalAddress:
        process.env.AKADEMI_ADDRESS?.trim() || 'Plot 24, Bukoto Street, Kampala, Uganda',
      registrationNote: 'Kampala, Uganda · Pan-African Academic Network',
      approvalTimelineLabel: '2 business days',
      paymentMethods: [
        'MTN Mobile Money',
        'Airtel Money',
        'M-Pesa',
        'Flutterwave / Cards',
        'Bank Transfer',
      ],
      commissionRatePercent: 15,
      lowDataNote: 'Audio-first mode for slow connections',
    },
    stats: {
      verifiedEducatorsCount: 0,
      availableResourcesCount: 0,
      registeredLearnersCount: 0,
      subjectsCount: 0,
      useQualitativeStrip: true,
    },
    supportedFormats: [
      {
        code: 'PDF',
        label: 'PDF Monographs & Past Papers',
        description: 'UNEB, NCHE, KNEC, NECTA, and NESA exam workbooks, lab manuals, and handouts.',
      },
      {
        code: 'DOCX',
        label: 'Editable Word Templates',
        description: 'Structured practical lab logs, lesson schemes, and research submission templates.',
      },
      {
        code: 'BOOK',
        label: 'Verified Digital Textbooks',
        description: 'Full-length syllabus textbooks and professional reference volumes.',
      },
      {
        code: 'VIDEO',
        label: 'Recorded Lecture Seminars',
        description: 'Mobile-friendly instruction videos and recorded live class replays.',
      },
      {
        code: 'IMAGE',
        label: 'Annotated Plates & Diagrams',
        description: 'High-resolution microscopy, engineering, and botanical reference plates.',
      },
    ],
    educationFrameworks: [
      {
        id: 'uganda',
        country: 'Uganda (Primary Focus)',
        regulatoryBodies: 'MoES · UNEB · NCHE · UBTEB · DIT · NIRA',
        primaryAndSecondary: 'PLE (P7) · UCE O-Level (S1–S4) · UACE A-Level (S5–S6)',
        tvetAndTertiary: 'DIT Assessment · UBTEB National Certificates & Diplomas',
        higherEducationAlignment: 'NCHE Accredited Degrees & Postgraduate (IUCEA / EAQFHE)',
      },
      {
        id: 'kenya',
        country: 'Kenya',
        regulatoryBodies: 'KNEC · KICD · TVETA · CUE',
        primaryAndSecondary: 'CBC (KPSEA / KJSEA) · KCSE Secondary Certificate',
        tvetAndTertiary: 'KNEC / TVETA Artisan, Craft & Diploma Tracks',
        higherEducationAlignment: 'CUE Accredited Bachelor, Masters & PhD (EAQFHE Aligned)',
      },
      {
        id: 'tanzania',
        country: 'Tanzania',
        regulatoryBodies: 'NECTA · NACTVET · TCU',
        primaryAndSecondary: 'PSLE · CSEE (Form IV) · ACSEE (Form VI)',
        tvetAndTertiary: 'NACTVET NTA Level 4–6 Technical Diplomas',
        higherEducationAlignment: 'TCU Accredited University Programmes (EAQFHE Aligned)',
      },
      {
        id: 'rwanda',
        country: 'Rwanda & Regional EAC',
        regulatoryBodies: 'NESA · RTB · HEC · IUCEA',
        primaryAndSecondary: 'NESA O-Level & A-Level National Examinations',
        tvetAndTertiary: 'RTB TVET Certificates I–V & Polytechnic Diplomas',
        higherEducationAlignment: 'HEC Rwanda & IUCEA Cross-Border Recognition',
      },
    ],
    educationLevels: [
      'UNEB PLE (Primary Leaving)',
      'UNEB UCE (Uganda O-Level)',
      'UNEB UACE (Uganda A-Level)',
      'UBTEB / DIT Technical & TVET',
      'NCHE Undergraduate (Year 1–4)',
      'BSc / BA Graduate',
      'Postgraduate / Masters / PhD',
      'Kenya CBC / KCSE (KNEC)',
      'Tanzania NECTA (CSEE / ACSEE)',
      'Rwanda NESA / RTB TVET',
      'Professional & Licensing Track',
    ],
    onboardingSteps: [
      {
        step: '01',
        title: 'Submit Account Request',
        actor: 'Teacher, School, Institution or Freelancer',
        summary:
          'Apply through our short request form with your Ugandan or East African board and subjects.',
      },
      {
        step: '02',
        title: 'Identity & Credential Verification',
        actor: 'Compliance Moderator',
        summary:
          'Sign in with issued temporary credentials, update your password, and submit National ID / Passport plus teaching or institutional accreditation.',
      },
      {
        step: '03',
        title: 'Publish & Earn',
        actor: 'Verified Contributor Studio',
        summary:
          'Upload PDFs, Word docs, books, and videos, manage student academic verification, and host moderated live sessions.',
      },
    ],
    subscriptionPlans: [
      {
        id: 'SOLO_PRO',
        name: 'Individual Educator',
        audience: 'Solo Teachers, Lecturers & Freelancers',
        monthlyUsd: 29,
        storageLabel: '50 GB Resource Vault',
        liveCapacityLabel: 'Up to 100 learners / room',
        commissionLabel: '15% platform fee on sales',
        summary:
          'Publish PDF, DOCX, Video, Image & Books, review prerequisites for your courses, earn from paid follows/courses, and host live classrooms.',
      },
      {
        id: 'INSTITUTION_CAMPUS',
        name: 'School / Institution',
        audience: 'Secondary Schools, Polytechnics, TVETs & Universities',
        monthlyUsd: 149,
        storageLabel: '500 GB Departmental Vault',
        liveCapacityLabel: 'Up to 500 learners / room',
        commissionLabel: '15% platform fee · multi-staff',
        summary:
          'Centralized Institution Admin admission vetting, appointed Course Admin faculty seats, shared school libraries, and cohort attendance logs.',
      },
      {
        id: 'AKADEMI_PASS',
        name: 'Learner Library Pass',
        audience: 'Optional Platform-Wide Learner Plan',
        monthlyUsd: 15,
        storageLabel: 'Unlimited Pass Downloads',
        liveCapacityLabel: 'Priority Live Seminar Access',
        commissionLabel: '0% buyer fees',
        summary:
          'Optional monthly pass unlocking all platform-pass workbooks, editable DOCX study templates, and recorded lecture series.',
      },
    ],
    stakeholderRoles: [
      {
        role: 'Master Admin & Compliance Moderator',
        verificationOwner: 'Platform Governance',
        capabilities:
          'Approves contributor requests, audits National IDs / Passports & academic charters, toggles subscriptions immediately, and handles reports.',
      },
      {
        role: 'Institution Admin & Course Admins',
        verificationOwner: 'Institution Admin clears admissions',
        capabilities:
          'Registrars verify student UNEB/NCHE transcripts centrally while appointed Course Admins run assigned classes and live sessions.',
      },
      {
        role: 'Solo Educators & Freelancers',
        verificationOwner: 'Educator clears course fitness',
        capabilities:
          'Publish verified resources, set prices or free access, review student transcripts per course, and host interactive Q&A classrooms.',
      },
      {
        role: 'Learners & Students',
        verificationOwner: 'Private Academic Vault (PII masked)',
        capabilities:
          'Browse free materials, upload academic transcripts privately, follow trusted educators, and join live mobile-friendly classes.',
      },
    ],
    featuredResources: [],
    featuredCreators: [],
    upcomingSeminars: [],
    faqs: [
      {
        question: 'Is it free for learners?',
        answer:
          'Yes. Creating a learner account, uploading academic transcripts, following educators for updates, and accessing open-access resources marked Free cost nothing. You only pay if you choose a paid course, digital book, paid follow membership, or the optional Library Pass.',
      },
      {
        question: 'How do I become a contributor, and why is verification required?',
        answer:
          'Teachers, schools, institutions, and specialists submit the short Contributor Request Form. Once approved for onboarding, you verify your National ID or Passport and academic credentials so learners only study from real, accountable educators.',
      },
      {
        question: 'How long does approval take?',
        answer:
          'Contributor account requests are typically reviewed within 2 business days. Once temporary credentials are issued and your verification documents are approved, subscription activation unlocks publishing immediately.',
      },
      {
        question: 'How do I pay? Is Mobile Money supported?',
        answer:
          'Yes. Learners and contributors can settle plans and course fees using MTN Mobile Money, Airtel Money, Visa/Mastercard cards, or Bank Transfer.',
      },
      {
        question: "What if I can't afford a paid course?",
        answer:
          'Start with resources marked Free across Primary (PLE), O-Level (UCE), A-Level (UACE), Vocational, and University tracks. Many verified educators also release open problem sets and public live seminars.',
      },
      {
        question: 'Can I use it on my phone or on a slow connection?',
        answer:
          'Yes. The entire portal is mobile-first and lightweight. Inside Live Classrooms, learners can toggle Audio-First Mode to disable video streams and stay connected with minimal mobile data.',
      },
      {
        question: 'Are the certificates recognized?',
        answer:
          'Completion records reflect coursework verified by the issuing Institution Admin or Solo Educator. Accredited NCHE, UBTEB, and UNEB institutions maintain full institutional admission records for their cohorts.',
      },
      {
        question: 'How are my documents and personal data protected?',
        answer:
          'Confidential fields—including National ID/Passport numbers, phone numbers, and home addresses—are isolated from other users and educators. Only Master Admin compliance officers review contributor KYC files.',
      },
      {
        question: 'What happens if a course or live session is cancelled?',
        answer:
          'Live sessions include shared notes, pinned downloadable resources, and post-session materials. If a paid course is cancelled before delivery, learners can request a refund through Support within 7 days.',
      },
      {
        question: 'How do I report a problem or inappropriate content?',
        answer:
          'Use the "Report abuse" or "Help" link in the navigation or footer—or open a Support & Compliance ticket inside your dashboard. Reports go directly to the Master Admin moderation queue.',
      },
    ],
  };
}

export function ensureDataDirs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }
  const [salt, keyHex] = storedHash.split(':');
  const expected = Buffer.from(keyHex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  if (expected.length !== actual.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, actual);
}

export function createSeedDatabase(): AkademiDatabase {
  const demoPass = hashPassword('AkademiDemo#2026');
  const tempPass = hashPassword('TempPass#2026');
  const now = new Date().toISOString();

  const masterAdmin: StoredUser = {
    id: 'usr-master-admin',
    email: 'admin@akademi.novic.tech',
    name: 'Akademi Master Admin',
    role: 'MASTER_ADMIN',
    bio: 'Platform governance, compliance verification, and subscription management for Akademi.',
    specialization: 'Platform Governance & Compliance',
    mustChangePassword: false,
    kycStatus: 'VERIFIED',
    subscriptionStatus: 'ACTIVE',
    followPriceUsd: 0,
    followerIds: [],
    followingCreatorIds: [],
    paidFollowCreatorIds: [],
    purchasedResourceIds: [],
    purchasedCourseIds: [],
    platformPassActive: true,
    createdAt: '2026-01-10T08:00:00.000Z',
    passwordHash: '', // Claimed via AKADEMI_ADMIN_PASSCODE env or first-run Claim Master Admin screen
  };

  // ---- SOLO EDUCATORS & FREELANCERS ----
  const drOkello: StoredUser = {
    id: 'usr-dr-okello',
    email: 'dr.okello@akademi.novic.tech',
    name: 'Dr. Samuel Okello',
    role: 'SOLO_EDUCATOR',
    accountCategory: 'SOLO_TEACHER',
    bio: 'Computational data scientist and Kampala university lecturer publishing applied statistics monographs, codebooks, and live workshops.',
    specialization: 'Applied Statistics & Machine Learning',
    country: 'Uganda',
    educationSystem: 'NCHE Uganda / IUCEA-EAQFHE',
    mustChangePassword: false,
    kycStatus: 'VERIFIED',
    subscriptionStatus: 'ACTIVE',
    subscriptionPlan: 'SOLO_PRO',
    subscriptionUpdatedAt: '2026-10-01T09:00:00.000Z',
    followPriceUsd: 12,
    followerIds: ['usr-learner-amara', 'usr-learner-daniel', 'usr-learner-fatima'],
    followingCreatorIds: [],
    paidFollowCreatorIds: [],
    purchasedResourceIds: [],
    purchasedCourseIds: [],
    platformPassActive: false,
    createdAt: '2026-02-14T10:00:00.000Z',
    nationalIdNumber: 'CM9004819283KL',
    phone: '+256 772 418 902',
    homeAddress: 'Plot 14, Kololo Hill Drive, Kampala',
    billingEmail: 'billing.okello@novicmail.org',
    passwordHash: demoPass,
  };

  const aminaDiallo: StoredUser = {
    id: 'usr-freelancer-maya',
    email: 'amina.diallo@akademi.novic.tech',
    name: 'Amina Diallo',
    role: 'SOLO_EDUCATOR',
    accountCategory: 'FREELANCER',
    bio: 'Independent financial modeling specialist in Dakar sharing corporate valuation books, spreadsheet DOCX guides, and open seminars across West & East Africa.',
    specialization: 'Corporate Finance & Agribusiness Valuation',
    country: 'Senegal',
    educationSystem: 'CAMES / UEMOA Francophone Africa',
    mustChangePassword: false,
    kycStatus: 'VERIFIED',
    subscriptionStatus: 'ACTIVE',
    subscriptionPlan: 'SOLO_PRO',
    subscriptionUpdatedAt: '2026-10-12T11:00:00.000Z',
    followPriceUsd: 15,
    followerIds: ['usr-learner-amara'],
    followingCreatorIds: [],
    paidFollowCreatorIds: [],
    purchasedResourceIds: [],
    purchasedCourseIds: [],
    platformPassActive: false,
    createdAt: '2026-03-19T10:00:00.000Z',
    nationalIdNumber: 'SN-291847510-D',
    phone: '+221 77 412 8890',
    homeAddress: 'Avenue Léopold Sédar Senghor, Dakar',
    billingEmail: 'amina.diallo@akademi.novic.tech',
    passwordHash: demoPass,
  };

  const profMensah: StoredUser = {
    id: 'usr-solo-mensah',
    email: 'prof.mensah@akademi.novic.tech',
    name: 'Prof. Kwame Mensah',
    role: 'SOLO_EDUCATOR',
    accountCategory: 'SOLO_TEACHER',
    bio: 'Commercial and constitutional law lecturer awaiting subscription activation after passing KYC identity verification.',
    specialization: 'Commercial Law & Regulatory Policy',
    country: 'Ghana',
    educationSystem: 'GTEC / Ghana Tertiary Education',
    mustChangePassword: false,
    kycStatus: 'VERIFIED',
    subscriptionStatus: 'PENDING_APPROVAL',
    subscriptionPlan: 'SOLO_PRO',
    subscriptionUpdatedAt: '2026-11-23T09:30:00.000Z',
    followPriceUsd: 14,
    followerIds: [],
    followingCreatorIds: [],
    paidFollowCreatorIds: [],
    purchasedResourceIds: [],
    purchasedCourseIds: [],
    platformPassActive: false,
    createdAt: '2026-11-12T08:00:00.000Z',
    nationalIdNumber: 'GHA-772190442-8',
    phone: '+233 24 891 3302',
    homeAddress: '18 Cantonments Road, Accra',
    billingEmail: 'prof.mensah@akademi.novic.tech',
    passwordHash: demoPass,
  };

  const tundeAdeyemi: StoredUser = {
    id: 'usr-freelancer-kenji',
    email: 'tunde.adeyemi@studio-draft.ng',
    name: 'Eng. Tunde Adeyemi',
    role: 'SOLO_EDUCATOR',
    accountCategory: 'FREELANCER',
    bio: 'Structural drafting consultant in Lagos awaiting Master Admin National ID / Passport verification.',
    specialization: 'Architectural Drafting & BIM',
    country: 'Nigeria',
    educationSystem: 'COREN / NUC Nigeria',
    mustChangePassword: false,
    kycStatus: 'PENDING_REVIEW',
    subscriptionStatus: 'INACTIVE',
    followPriceUsd: 10,
    followerIds: [],
    followingCreatorIds: [],
    paidFollowCreatorIds: [],
    purchasedResourceIds: [],
    purchasedCourseIds: [],
    platformPassActive: false,
    createdAt: '2026-11-18T14:20:00.000Z',
    nationalIdNumber: 'NG-NIN-89201432',
    phone: '+234 803 412 9980',
    homeAddress: '14 Adeola Odeku, Victoria Island, Lagos',
    billingEmail: 'tunde.adeyemi@studio-draft.ng',
    passwordHash: demoPass,
  };

  const aminaYusuf: StoredUser = {
    id: 'usr-solo-amina',
    email: 'new.educator@akademi.novic.tech',
    name: 'Dr. Amina Yusuf',
    role: 'SOLO_EDUCATOR',
    accountCategory: 'SOLO_TEACHER',
    bio: 'Clinical bioethics lecturer newly approved by Master Admin (requires first-login password change & KYC upload).',
    specialization: 'Bioethics & Public Health',
    mustChangePassword: true,
    kycStatus: 'UNSUBMITTED',
    subscriptionStatus: 'INACTIVE',
    followPriceUsd: 10,
    followerIds: [],
    followingCreatorIds: [],
    paidFollowCreatorIds: [],
    purchasedResourceIds: [],
    purchasedCourseIds: [],
    platformPassActive: false,
    createdAt: '2026-11-24T10:00:00.000Z',
    passwordHash: tempPass,
  };

  const victorSuspended: StoredUser = {
    id: 'usr-solo-victor',
    email: 'suspended.creator@akademi.novic.tech',
    name: 'Victor Karanja',
    role: 'SOLO_EDUCATOR',
    accountCategory: 'FREELANCER',
    bio: 'Software testing instructor whose subscription is currently suspended.',
    specialization: 'QA Automation',
    mustChangePassword: false,
    kycStatus: 'VERIFIED',
    subscriptionStatus: 'SUSPENDED',
    subscriptionPlan: 'SOLO_PRO',
    followPriceUsd: 9,
    followerIds: [],
    followingCreatorIds: [],
    paidFollowCreatorIds: [],
    purchasedResourceIds: [],
    purchasedCourseIds: [],
    platformPassActive: false,
    createdAt: '2026-06-10T10:00:00.000Z',
    nationalIdNumber: 'KE-30918472',
    phone: '+254 711 230 981',
    homeAddress: 'Kilimani, Nairobi',
    billingEmail: 'suspended.creator@akademi.novic.tech',
    passwordHash: demoPass,
  };

  // ---- INSTITUTIONS & COURSE ADMINS ----
  const stMarksAdmin: StoredUser = {
    id: 'usr-inst-stmarks',
    email: 'registrar@stmarks-polytechnic.edu',
    name: 'St. Marks Polytechnic',
    role: 'INSTITUTION_ADMIN',
    accountCategory: 'SCHOOL_INSTITUTION',
    institutionId: 'inst-stmarks',
    institutionName: 'St. Marks Polytechnic Institute',
    bio: 'Kampala accredited engineering, life sciences, and architectural design polytechnic delivering NCHE & UBTEB degree-prep tracks and live labs.',
    specialization: 'Engineering, Biosciences & Architecture',
    country: 'Uganda',
    educationSystem: 'NCHE Uganda / UBTEB',
    mustChangePassword: false,
    kycStatus: 'VERIFIED',
    subscriptionStatus: 'ACTIVE',
    subscriptionPlan: 'INSTITUTION_CAMPUS',
    subscriptionUpdatedAt: '2026-09-15T12:00:00.000Z',
    followPriceUsd: 25,
    followerIds: ['usr-learner-amara', 'usr-learner-daniel'],
    followingCreatorIds: [],
    paidFollowCreatorIds: [],
    purchasedResourceIds: [],
    purchasedCourseIds: [],
    platformPassActive: false,
    createdAt: '2026-02-20T11:30:00.000Z',
    nationalIdNumber: 'INST-REG-2026-8841',
    phone: '+256 414 290 881',
    homeAddress: 'Academic Wing B, Entebbe Road Campus, Kampala',
    billingEmail: 'finance@stmarks-polytechnic.edu',
    passwordHash: demoPass,
  };

  const claireStaff: StoredUser = {
    id: 'usr-staff-claire',
    email: 'claire.namono@stmarks-polytechnic.edu',
    name: 'Prof. Claire Namono',
    role: 'COURSE_ADMIN',
    accountCategory: 'SCHOOL_INSTITUTION',
    institutionId: 'inst-stmarks',
    institutionName: 'St. Marks Polytechnic Institute',
    bio: 'Lead Course Administrator for Molecular Biology & Cellular Microscopy tracks at St. Marks Polytechnic.',
    specialization: 'Molecular Biology & Lab Instruction',
    mustChangePassword: false,
    kycStatus: 'VERIFIED',
    subscriptionStatus: 'ACTIVE',
    subscriptionPlan: 'INSTITUTION_CAMPUS',
    followPriceUsd: 0,
    followerIds: [],
    followingCreatorIds: [],
    paidFollowCreatorIds: [],
    purchasedResourceIds: [],
    purchasedCourseIds: [],
    platformPassActive: false,
    createdAt: '2026-03-01T09:00:00.000Z',
    nationalIdNumber: 'CF8820194812MP',
    phone: '+256 701 334 119',
    homeAddress: 'Faculty Quarters 4, St. Marks',
    billingEmail: 'claire.namono@stmarks-polytechnic.edu',
    passwordHash: demoPass,
  };

  const davidStaff: StoredUser = {
    id: 'usr-staff-david',
    email: 'david.bukenya@stmarks-polytechnic.edu',
    name: 'Eng. David Bukenya',
    role: 'COURSE_ADMIN',
    accountCategory: 'SCHOOL_INSTITUTION',
    institutionId: 'inst-stmarks',
    institutionName: 'St. Marks Polytechnic Institute',
    bio: 'Studio Course Administrator for Structural Timber & Spatial Modeling at St. Marks Polytechnic.',
    specialization: 'Structural Timber & Scale Modeling',
    mustChangePassword: false,
    kycStatus: 'VERIFIED',
    subscriptionStatus: 'ACTIVE',
    subscriptionPlan: 'INSTITUTION_CAMPUS',
    followPriceUsd: 0,
    followerIds: [],
    followingCreatorIds: [],
    paidFollowCreatorIds: [],
    purchasedResourceIds: [],
    purchasedCourseIds: [],
    platformPassActive: false,
    createdAt: '2026-03-05T09:00:00.000Z',
    nationalIdNumber: 'CM8512904411DB',
    phone: '+256 702 881 402',
    homeAddress: 'Faculty Quarters 7, St. Marks',
    billingEmail: 'david.bukenya@stmarks-polytechnic.edu',
    passwordHash: demoPass,
  };

  const nairobiSchool: StoredUser = {
    id: 'usr-inst-nairobi',
    email: 'admissions@nairobi-science.ac.ke',
    name: 'Nairobi School of Computing',
    role: 'INSTITUTION_ADMIN',
    accountCategory: 'SCHOOL_INSTITUTION',
    institutionId: 'inst-nsc',
    institutionName: 'Nairobi School of Computing & Systems',
    bio: 'Regional technical academy delivering distributed systems handbooks, network topology guides, and open seminars.',
    specialization: 'Distributed Systems & Cloud Networks',
    mustChangePassword: false,
    kycStatus: 'VERIFIED',
    subscriptionStatus: 'ACTIVE',
    subscriptionPlan: 'INSTITUTION_CAMPUS',
    subscriptionUpdatedAt: '2026-10-05T10:00:00.000Z',
    followPriceUsd: 20,
    followerIds: ['usr-learner-fatima'],
    followingCreatorIds: [],
    paidFollowCreatorIds: [],
    purchasedResourceIds: [],
    purchasedCourseIds: [],
    platformPassActive: false,
    createdAt: '2026-04-12T10:00:00.000Z',
    nationalIdNumber: 'KE-INST-55410',
    phone: '+254 20 812 9900',
    homeAddress: 'Westlands Innovation Park, Nairobi',
    billingEmail: 'finance@nairobi-science.ac.ke',
    passwordHash: demoPass,
  };

  // ---- LEARNERS ----
  const learnerAmara: StoredUser = {
    id: 'usr-learner-amara',
    email: 'amara.kato@student.akademi.tech',
    name: 'Amara Kato',
    role: 'LEARNER',
    bio: 'Undergraduate quantitative biology student in Kampala tracking data science and microscopy coursework.',
    specialization: 'Quantitative Biology & Data Science',
    educationLevel: 'NCHE Undergraduate (Year 1–4)',
    country: 'Uganda',
    educationSystem: 'NCHE Uganda',
    mustChangePassword: false,
    kycStatus: 'VERIFIED',
    subscriptionStatus: 'ACTIVE',
    subscriptionPlan: 'AKADEMI_PASS',
    followPriceUsd: 0,
    followerIds: [],
    followingCreatorIds: ['usr-dr-okello', 'usr-inst-stmarks', 'usr-freelancer-maya'],
    paidFollowCreatorIds: ['usr-dr-okello'],
    purchasedResourceIds: ['res-book-ml-compendium'],
    purchasedCourseIds: ['crs-bio-microscopy'],
    platformPassActive: true,
    createdAt: '2026-04-02T08:15:00.000Z',
    nationalIdNumber: 'CF0192837465AM',
    phone: '+256 784 910 225',
    homeAddress: 'Block 9, Ntinda Crescent, Kampala',
    billingEmail: 'amara.kato@student.akademi.tech',
    passwordHash: demoPass,
  };

  const learnerDaniel: StoredUser = {
    id: 'usr-learner-daniel',
    email: 'daniel.m@student.akademi.tech',
    name: 'Daniel Mugisha',
    role: 'LEARNER',
    bio: 'Civil engineering graduate from Kyambogo awaiting Institution Admin verification for Structural Timber Studio.',
    specialization: 'Structural Architecture',
    educationLevel: 'BSc / BA Graduate',
    country: 'Uganda',
    educationSystem: 'NCHE Uganda / UBTEB',
    mustChangePassword: false,
    kycStatus: 'VERIFIED',
    subscriptionStatus: 'INACTIVE',
    followPriceUsd: 0,
    followerIds: [],
    followingCreatorIds: ['usr-dr-okello', 'usr-inst-stmarks'],
    paidFollowCreatorIds: [],
    purchasedResourceIds: [],
    purchasedCourseIds: [],
    platformPassActive: false,
    createdAt: '2026-05-11T16:40:00.000Z',
    nationalIdNumber: 'CM9920118472DM',
    phone: '+256 752 800 412',
    homeAddress: 'Plot 21, Bukoto Street, Kampala',
    billingEmail: 'daniel.m@student.akademi.tech',
    passwordHash: demoPass,
  };

  const learnerFatima: StoredUser = {
    id: 'usr-learner-fatima',
    email: 'fatima.z@student.akademi.tech',
    name: 'Fatima Zahra',
    role: 'LEARNER',
    bio: 'UNEB UACE A-Level quantitative track learner applying to Solo Educator courses.',
    specialization: 'Applied Mathematics & Finance',
    educationLevel: 'UNEB UACE (Uganda A-Level)',
    country: 'Uganda',
    educationSystem: 'UNEB Uganda',
    mustChangePassword: false,
    kycStatus: 'VERIFIED',
    subscriptionStatus: 'INACTIVE',
    followPriceUsd: 0,
    followerIds: [],
    followingCreatorIds: ['usr-dr-okello', 'usr-inst-nairobi'],
    paidFollowCreatorIds: [],
    purchasedResourceIds: [],
    purchasedCourseIds: [],
    platformPassActive: false,
    createdAt: '2026-07-08T09:20:00.000Z',
    nationalIdNumber: 'CF998120491FZ',
    phone: '+256 779 440 812',
    homeAddress: 'Plot 14, Lubaga Road, Kampala',
    billingEmail: 'fatima.z@student.akademi.tech',
    passwordHash: demoPass,
  };

  const learnerKwabena: StoredUser = {
    id: 'usr-learner-lucas',
    email: 'kwabena.boateng@student.akademi.tech',
    name: 'Kwabena Boateng',
    role: 'LEARNER',
    bio: 'Fresh learner account in Accra ready to upload academic transcripts and explore Akademi.',
    specialization: 'Systems Engineering',
    educationLevel: 'Postgraduate / Professional',
    country: 'Ghana',
    educationSystem: 'WAEC / GTEC Ghana',
    mustChangePassword: false,
    kycStatus: 'VERIFIED',
    subscriptionStatus: 'INACTIVE',
    followPriceUsd: 0,
    followerIds: [],
    followingCreatorIds: [],
    paidFollowCreatorIds: [],
    purchasedResourceIds: [],
    purchasedCourseIds: [],
    platformPassActive: false,
    createdAt: '2026-11-20T12:00:00.000Z',
    nationalIdNumber: 'GHA-441092817',
    phone: '+233 24 619 3310',
    homeAddress: 'East Legon, Accra, Ghana',
    billingEmail: 'kwabena.boateng@student.akademi.tech',
    passwordHash: demoPass,
  };

  const accountRequests: AccountRequest[] = [
    {
      id: 'req-001',
      fullName: 'Dr. Fatoumata Traoré',
      email: 'fatoumata.traore@bamako-sciences.ml',
      accountCategory: 'SOLO_TEACHER',
      country: 'Mali',
      district: 'Bamako',
      educationSystem: 'CAMES / Francophone Africa',
      specialization: 'Organic Chemistry & Spectroscopy',
      plannedLevels: 'University Undergraduate & Licence',
      statement:
        'University chemistry lecturer requesting a verified Studio to publish French and English laboratory manuals and weekly live problem-solving seminars.',
      status: 'PENDING',
      submittedAt: '2026-11-24T09:10:00.000Z',
    },
    {
      id: 'req-002',
      fullName: 'Kigali Technical College',
      email: 'dean@kigalitech.ac.rw',
      accountCategory: 'SCHOOL_INSTITUTION',
      organizationName: 'Kigali Technical College',
      country: 'Rwanda',
      district: 'Kigali',
      educationSystem: 'NESA / HEC Rwanda',
      specialization: 'Renewable Energy & Civil Infrastructure',
      plannedLevels: 'TVET Diplomas & BSc Engineering',
      statement:
        'Accredited polytechnic seeking an Institutional Campus plan for 12 faculty instructors and 450 engineering students.',
      status: 'PENDING',
      submittedAt: '2026-11-24T13:45:00.000Z',
    },
    {
      id: 'req-003',
      fullName: 'Dr. Amina Yusuf',
      email: 'new.educator@akademi.novic.tech',
      accountCategory: 'SOLO_TEACHER',
      country: 'Nigeria',
      district: 'Abuja',
      educationSystem: 'NUC Nigeria',
      specialization: 'Bioethics & Public Health',
      statement: 'Public health researcher publishing peer-reviewed ethics casebooks.',
      status: 'APPROVED',
      submittedAt: '2026-11-23T08:00:00.000Z',
      reviewedAt: '2026-11-24T10:00:00.000Z',
      createdUserId: 'usr-solo-amina',
    },
  ];

  const kycSubmissions: KycSubmission[] = [
    {
      id: 'kyc-001',
      userId: 'usr-freelancer-kenji',
      userName: 'Eng. Tunde Adeyemi',
      userEmail: 'tunde.adeyemi@studio-draft.ng',
      role: 'SOLO_EDUCATOR',
      accountCategory: 'FREELANCER',
      documentType: 'NATIONAL_ID',
      documentNumberMasked: 'NG-****-1432',
      idFileName: 'tunde_adeyemi_nin_card.pdf',
      idFilePath: '',
      credentialFileName: 'coren_architectural_engineering_license.pdf',
      credentialFilePath: '',
      submittedAt: '2026-11-23T11:20:00.000Z',
      status: 'PENDING',
    },
    {
      id: 'kyc-002',
      userId: 'usr-dr-okello',
      userName: 'Dr. Samuel Okello',
      userEmail: 'dr.okello@akademi.novic.tech',
      role: 'SOLO_EDUCATOR',
      accountCategory: 'SOLO_TEACHER',
      documentType: 'NATIONAL_ID',
      documentNumberMasked: 'CM****83KL',
      idFileName: 'okello_national_id.pdf',
      idFilePath: '',
      credentialFileName: 'phd_applied_statistics_charter.pdf',
      credentialFilePath: '',
      submittedAt: '2026-02-14T11:00:00.000Z',
      status: 'APPROVED',
      reviewedBy: 'Akademi Master Admin',
      reviewNotes: 'Passport and PhD credential verified against registry.',
    },
    {
      id: 'kyc-003',
      userId: 'usr-solo-mensah',
      userName: 'Prof. Kwame Mensah',
      userEmail: 'prof.mensah@akademi.novic.tech',
      role: 'SOLO_EDUCATOR',
      accountCategory: 'SOLO_TEACHER',
      documentType: 'NATIONAL_ID',
      documentNumberMasked: 'GH****42-8',
      idFileName: 'mensah_ghana_card.pdf',
      idFilePath: '',
      credentialFileName: 'bar_association_fellowship.pdf',
      credentialFilePath: '',
      submittedAt: '2026-11-15T10:00:00.000Z',
      status: 'APPROVED',
      reviewedBy: 'Akademi Master Admin',
      reviewNotes: 'Identity verified. Pending subscription activation.',
    },
  ];

  const resources: ResourceItem[] = [
    {
      id: 'res-pdf-bayesian',
      ownerId: 'usr-dr-okello',
      ownerName: 'Dr. Samuel Okello',
      title: 'Bayesian Inference & Experimental Error Analysis (Workbook)',
      description:
        'Structured 48-page laboratory workbook covering posterior distributions, conjugate priors, and Monte Carlo diagnostics.',
      type: 'PDF',
      subject: 'Applied Statistics',
      educationLevel: 'Undergraduate',
      accessTier: 'PUBLIC_FREE',
      priceUsd: 0,
      downloadable: true,
      fileName: 'Bayesian_Inference_Workbook_v3.pdf',
      fileSizeLabel: '4.2 MB',
      previewSummary:
        'Chapter 1: Likelihood Functions and Prior Sensitivity\nChapter 2: Markov Chain Convergence Diagnostics\nWorked Exercises: 18 solved problems with numerical tables.',
      downloadsCount: 412,
      viewsCount: 1290,
      createdAt: '2026-09-12T08:00:00.000Z',
      status: 'PUBLISHED',
    },
    {
      id: 'res-book-ml-compendium',
      ownerId: 'usr-dr-okello',
      ownerName: 'Dr. Samuel Okello',
      title: 'Foundations of Statistical Learning — Complete Reference Book',
      description:
        'Peer-reviewed 320-page digital textbook covering regularization, gradient boosting, and matrix decomposition.',
      type: 'BOOK',
      subject: 'Data Science',
      educationLevel: 'Undergraduate / Graduate',
      accessTier: 'PAID_SINGLE',
      priceUsd: 24,
      downloadable: true,
      fileName: 'Statistical_Learning_Compendium_2026.pdf',
      fileSizeLabel: '18.6 MB',
      previewSummary:
        'Full 12-chapter textbook with mathematical proofs, pseudocode blocks, and end-of-chapter problem sets.',
      downloadsCount: 148,
      viewsCount: 684,
      createdAt: '2026-10-03T10:15:00.000Z',
      status: 'PUBLISHED',
    },
    {
      id: 'res-docx-lab-template',
      ownerId: 'usr-inst-stmarks',
      ownerName: 'St. Marks Polytechnic',
      institutionId: 'inst-stmarks',
      title: 'Standardized Molecular Microscopy Lab Protocol (DOCX)',
      description:
        'Editable Word document protocol for brightfield calibration, specimen staining, and error logging.',
      type: 'DOCX',
      subject: 'Molecular Biology',
      educationLevel: 'Undergraduate',
      accessTier: 'PLATFORM_PASS',
      priceUsd: 0,
      downloadable: true,
      fileName: 'Microscopy_Lab_Report_Template.docx',
      fileSizeLabel: '1.1 MB',
      previewSummary:
        'Includes equipment calibration checklist, slide preparation steps, and standardized observation tables.',
      downloadsCount: 235,
      viewsCount: 540,
      createdAt: '2026-09-28T14:00:00.000Z',
      status: 'PUBLISHED',
    },
    {
      id: 'res-video-finite-element',
      ownerId: 'usr-dr-okello',
      ownerName: 'Dr. Samuel Okello',
      title: 'Lecture 04: Matrix Factorization & Dimensionality Reduction',
      description:
        'Recorded 42-minute studio lecture walking through singular value decomposition on real sensor datasets.',
      type: 'VIDEO',
      subject: 'Data Science',
      educationLevel: 'Undergraduate',
      accessTier: 'PLATFORM_PASS',
      priceUsd: 0,
      downloadable: false,
      fileName: 'Lecture_04_SVD_Walkthrough.mp4',
      fileSizeLabel: '164 MB',
      previewSummary:
        '42-minute HD recorded seminar with synchronized slide annotations and live dataset breakdown.',
      downloadsCount: 0,
      viewsCount: 892,
      createdAt: '2026-10-18T11:30:00.000Z',
      status: 'PUBLISHED',
    },
    {
      id: 'res-img-vascular-plate',
      ownerId: 'usr-inst-stmarks',
      ownerName: 'St. Marks Polytechnic',
      institutionId: 'inst-stmarks',
      title: 'High-Resolution Botanical Cellular Atlas (Plate IV)',
      description:
        'Annotated microscopy reference plate illustrating vascular bundle cross-sections and xylem transport.',
      type: 'IMAGE',
      subject: 'Molecular Biology',
      educationLevel: 'High School / Undergraduate',
      accessTier: 'PUBLIC_FREE',
      priceUsd: 0,
      downloadable: true,
      fileName: 'Botanical_Cellular_Atlas_Plate_IV.png',
      fileSizeLabel: '6.8 MB',
      previewSummary:
        '300 DPI labeled reference diagram suitable for revision flashcards and lab identification.',
      downloadsCount: 519,
      viewsCount: 1620,
      createdAt: '2026-10-25T09:45:00.000Z',
      status: 'PUBLISHED',
    },
    {
      id: 'res-pdf-timber-load',
      ownerId: 'usr-inst-stmarks',
      ownerName: 'St. Marks Polytechnic',
      institutionId: 'inst-stmarks',
      title: 'Structural Load Analysis & Timber Framing Studio Manual',
      description:
        'Enrolled-cohort studio manual detailing truss equilibrium, shear diagrams, and basswood scale modeling.',
      type: 'PDF',
      subject: 'Architecture',
      educationLevel: 'BSc / Professional',
      accessTier: 'ENROLLED_ONLY',
      priceUsd: 0,
      downloadable: true,
      fileName: 'Timber_Load_Studio_Manual.pdf',
      fileSizeLabel: '9.4 MB',
      previewSummary:
        'Studio manual covering equilibrium calculations, cantilever deflection tables, and model tolerances.',
      downloadsCount: 94,
      viewsCount: 310,
      createdAt: '2026-11-02T15:10:00.000Z',
      status: 'PUBLISHED',
    },
    {
      id: 'res-book-dcf-valuation',
      ownerId: 'usr-freelancer-maya',
      ownerName: 'Amina Diallo',
      title: 'Applied Discounted Cash Flow & Agribusiness Capital Handbook',
      description:
        'Practical 190-page digital reference book covering WACC sensitivity, working capital schedules, and African infrastructure modeling.',
      type: 'BOOK',
      subject: 'Corporate Finance',
      educationLevel: 'Undergraduate / Professional',
      accessTier: 'PAID_SINGLE',
      priceUsd: 19,
      downloadable: true,
      fileName: 'Applied_DCF_Handbook_AminaDiallo.pdf',
      fileSizeLabel: '7.5 MB',
      previewSummary:
        'Step-by-step valuation case studies across regional manufacturing, agribusiness, and energy infrastructure assets.',
      downloadsCount: 83,
      viewsCount: 410,
      createdAt: '2026-10-29T12:00:00.000Z',
      status: 'PUBLISHED',
    },
    {
      id: 'res-pdf-network-basics',
      ownerId: 'usr-inst-nairobi',
      ownerName: 'Nairobi School of Computing',
      institutionId: 'inst-nsc',
      title: 'TCP/IP Packet Routing & Distributed Consensus Primer',
      description:
        'Open-access introductory handbook explaining subnetting, BGP routing tables, and Raft consensus.',
      type: 'PDF',
      subject: 'Distributed Systems',
      educationLevel: 'Undergraduate',
      accessTier: 'PUBLIC_FREE',
      priceUsd: 0,
      downloadable: true,
      fileName: 'Distributed_Consensus_Primer.pdf',
      fileSizeLabel: '3.4 MB',
      previewSummary:
        'Clear diagrams and packet-level exercises for undergraduate systems engineering students.',
      downloadsCount: 280,
      viewsCount: 910,
      createdAt: '2026-11-05T10:00:00.000Z',
      status: 'PUBLISHED',
    },
    {
      id: 'res-pdf-uneb-ple-math',
      ownerId: 'usr-dr-okello',
      ownerName: 'Dr. Samuel Okello',
      title: 'UNEB PLE Primary 7 Integrated Mathematics Revision Pack',
      description:
        'Open-access revision exercises covering fractions, geometry, sets, and Ugandan shilling commercial arithmetic for P7 candidates.',
      type: 'PDF',
      subject: 'Primary Mathematics',
      educationLevel: 'UNEB PLE (Primary Leaving)',
      educationSystem: 'UNEB Uganda',
      accessTier: 'PUBLIC_FREE',
      priceUsd: 0,
      downloadable: true,
      fileName: 'UNEB_PLE_P7_Mathematics_Revision.pdf',
      fileSizeLabel: '2.1 MB',
      previewSummary:
        '40 graded practice questions aligned to UNEB PLE marking schemes with step-by-step solutions.',
      downloadsCount: 640,
      viewsCount: 1850,
      createdAt: '2026-11-08T09:00:00.000Z',
      status: 'PUBLISHED',
    },
    {
      id: 'res-docx-uce-chemistry',
      ownerId: 'usr-inst-stmarks',
      ownerName: 'St. Marks Polytechnic',
      institutionId: 'inst-stmarks',
      title: 'UNEB UCE O-Level Volumetric Analysis & Titration Guide (DOCX)',
      description:
        'Competency-based O-Level (S3–S4) practical chemistry workbook with titration tables and mole calculation steps.',
      type: 'DOCX',
      subject: 'Chemistry (O-Level)',
      educationLevel: 'UNEB UCE (Uganda O-Level)',
      educationSystem: 'UNEB Uganda',
      accessTier: 'PUBLIC_FREE',
      priceUsd: 0,
      downloadable: true,
      fileName: 'UNEB_UCE_Titration_Practical_Guide.docx',
      fileSizeLabel: '1.4 MB',
      previewSummary:
        'Editable school laboratory sheet covering acid-base burette readings and molarity calculations.',
      downloadsCount: 390,
      viewsCount: 1120,
      createdAt: '2026-11-10T11:30:00.000Z',
      status: 'PUBLISHED',
    },
    {
      id: 'res-pdf-uace-physics',
      ownerId: 'usr-dr-okello',
      ownerName: 'Dr. Samuel Okello',
      title: 'UNEB UACE A-Level Mechanics & Waves Seminar Notes',
      description:
        'Comprehensive S5–S6 A-Level physics notes covering projectile motion, circular dynamics, and standing waves.',
      type: 'PDF',
      subject: 'Physics (A-Level)',
      educationLevel: 'UNEB UACE (Uganda A-Level)',
      educationSystem: 'UNEB Uganda',
      accessTier: 'PUBLIC_FREE',
      priceUsd: 0,
      downloadable: true,
      fileName: 'UACE_Physics_Mechanics_Waves.pdf',
      fileSizeLabel: '5.3 MB',
      previewSummary:
        'Derivations, vector diagrams, and worked paper-1 & paper-2 UNEB past problems.',
      downloadsCount: 475,
      viewsCount: 1340,
      createdAt: '2026-11-12T08:15:00.000Z',
      status: 'PUBLISHED',
    },
    {
      id: 'res-pdf-ubteb-solar',
      ownerId: 'usr-inst-stmarks',
      ownerName: 'St. Marks Polytechnic',
      institutionId: 'inst-stmarks',
      title: 'UBTEB / DIT Solar PV Sizing & Off-Grid Wiring Manual',
      description:
        'Vocational & technical diploma guide for sizing batteries, charge controllers, and rural solar installations across East Africa.',
      type: 'PDF',
      subject: 'Renewable Energy & TVET',
      educationLevel: 'UBTEB / DIT Technical & TVET',
      educationSystem: 'UBTEB / DIT TVET Uganda',
      accessTier: 'PUBLIC_FREE',
      priceUsd: 0,
      downloadable: true,
      fileName: 'UBTEB_Solar_PV_Sizing_Manual.pdf',
      fileSizeLabel: '4.6 MB',
      previewSummary:
        'Practical load-audit worksheets, inverter selection tables, and safety earthing checklists.',
      downloadsCount: 312,
      viewsCount: 880,
      createdAt: '2026-11-14T10:45:00.000Z',
      status: 'PUBLISHED',
    },
  ];

  const courses: CourseItem[] = [
    {
      id: 'crs-applied-ml',
      ownerId: 'usr-dr-okello',
      ownerName: 'Dr. Samuel Okello',
      title: 'Computational Statistics & Applied Machine Learning',
      description:
        'A rigorous 8-week curriculum connecting probability theory, matrix methods, and live statistical modeling seminars.',
      subject: 'Data Science',
      requiredLevel: 'NCHE Undergraduate (Year 1–4)',
      educationSystem: 'NCHE Uganda / IUCEA-EAQFHE',
      accessTier: 'PLATFORM_PASS',
      priceUsd: 0,
      coverImage: '/src/assets/images/course_data_science_1795613120523.jpg',
      resourceIds: ['res-pdf-bayesian', 'res-video-finite-element', 'res-book-ml-compendium'],
      requiresAcademicVerification: true,
      enrolledLearnerIds: ['usr-learner-amara'],
      createdAt: '2026-09-10T08:00:00.000Z',
      status: 'ACTIVE',
    },
    {
      id: 'crs-bio-microscopy',
      ownerId: 'usr-inst-stmarks',
      ownerName: 'St. Marks Polytechnic',
      institutionId: 'inst-stmarks',
      institutionName: 'St. Marks Polytechnic Institute',
      assignedInstructorId: 'usr-staff-claire',
      title: 'Quantitative Cellular Microscopy & Lab Methods',
      description:
        'Institution-certified laboratory track combining high-resolution cellular plates, DOCX lab protocols, and live microscopy reviews.',
      subject: 'Molecular Biology',
      requiredLevel: 'NCHE Undergraduate (Year 1–4)',
      educationSystem: 'NCHE Uganda / UBTEB',
      accessTier: 'PAID_SINGLE',
      priceUsd: 45,
      coverImage: '/src/assets/images/course_bio_sciences_1795613120804.jpg',
      resourceIds: ['res-docx-lab-template', 'res-img-vascular-plate'],
      requiresAcademicVerification: true,
      enrolledLearnerIds: ['usr-learner-amara'],
      createdAt: '2026-09-20T09:30:00.000Z',
      status: 'ACTIVE',
    },
    {
      id: 'crs-arch-studio',
      ownerId: 'usr-inst-stmarks',
      ownerName: 'St. Marks Polytechnic',
      institutionId: 'inst-stmarks',
      institutionName: 'St. Marks Polytechnic Institute',
      assignedInstructorId: 'usr-staff-david',
      title: 'Structural Timber & Spatial Scale Modeling Studio',
      description:
        'Architectural studio course verifying foundational engineering fitness before granting studio manuals and live critique access.',
      subject: 'Architecture',
      requiredLevel: 'BSc / BA Graduate',
      educationSystem: 'NCHE Uganda / UBTEB',
      accessTier: 'PAID_SINGLE',
      priceUsd: 60,
      coverImage: '/src/assets/images/course_architecture_1795613122272.jpg',
      resourceIds: ['res-pdf-timber-load'],
      requiresAcademicVerification: true,
      enrolledLearnerIds: [],
      createdAt: '2026-10-08T10:00:00.000Z',
      status: 'ACTIVE',
    },
    {
      id: 'crs-corp-valuation',
      ownerId: 'usr-freelancer-maya',
      ownerName: 'Amina Diallo',
      title: 'Financial Modeling & Corporate Valuation Workshop',
      description:
        'Applied finance track led by Amina Diallo featuring real balance-sheet casebooks and weekly Q&A clinics.',
      subject: 'Corporate Finance',
      requiredLevel: 'UNEB UACE (Uganda A-Level)',
      educationSystem: 'UNEB / East & West African Secondary & Tertiary',
      accessTier: 'ENROLLED_ONLY',
      priceUsd: 0,
      coverImage: '/src/assets/images/course_data_science_1795613120523.jpg',
      resourceIds: ['res-book-dcf-valuation'],
      requiresAcademicVerification: true,
      enrolledLearnerIds: [],
      createdAt: '2026-10-30T11:00:00.000Z',
      status: 'ACTIVE',
    },
  ];

  const learnerAcademicDocs: LearnerAcademicDoc[] = [
    {
      id: 'adoc-001',
      learnerId: 'usr-learner-amara',
      title: 'BSc Quantitative Biology Year 1 Official Transcript',
      educationLevel: 'NCHE Undergraduate (Year 1–4)',
      institutionIssued: 'Makerere University',
      fileName: 'amara_kato_year1_transcript.pdf',
      uploadedAt: '2026-09-05T10:00:00.000Z',
    },
    {
      id: 'adoc-002',
      learnerId: 'usr-learner-daniel',
      title: 'BSc Civil & Structural Engineering Degree Certificate',
      educationLevel: 'BSc / BA Graduate',
      institutionIssued: 'Kyambogo University',
      fileName: 'daniel_mugisha_bsc_civil.pdf',
      uploadedAt: '2026-11-20T14:15:00.000Z',
    },
    {
      id: 'adoc-003',
      learnerId: 'usr-learner-fatima',
      title: 'UNEB UACE Principal Passes Mathematics & Economics Slip',
      educationLevel: 'UNEB UACE (Uganda A-Level)',
      institutionIssued: 'UNEB Uganda National Examinations Board',
      fileName: 'fatima_uneb_uace_slip.pdf',
      uploadedAt: '2026-11-21T09:10:00.000Z',
    },
  ];

  const enrollments: EnrollmentRecord[] = [
    {
      id: 'enr-001',
      courseId: 'crs-applied-ml',
      courseTitle: 'Computational Statistics & Applied Machine Learning',
      learnerId: 'usr-learner-amara',
      learnerName: 'Amara Kato',
      learnerDeclaredLevel: 'Undergraduate (Year 2)',
      ownerId: 'usr-dr-okello',
      verifierRoleRequired: 'SOLO_EDUCATOR',
      academicStatus: 'APPROVED',
      academicNote: 'Strong calculus and Year 1 statistics scores confirmed.',
      progressPercent: 67,
      completedResourceIds: ['res-pdf-bayesian', 'res-video-finite-element'],
      attendanceMinutes: 95,
      gradeLabel: 'A-',
      requestedAt: '2026-09-12T10:00:00.000Z',
      verifiedAt: '2026-09-12T16:30:00.000Z',
    },
    {
      id: 'enr-002',
      courseId: 'crs-bio-microscopy',
      courseTitle: 'Quantitative Cellular Microscopy & Lab Methods',
      learnerId: 'usr-learner-amara',
      learnerName: 'Amara Kato',
      learnerDeclaredLevel: 'Undergraduate (Year 2)',
      ownerId: 'usr-inst-stmarks',
      institutionId: 'inst-stmarks',
      verifierRoleRequired: 'INSTITUTION_ADMIN',
      academicStatus: 'APPROVED',
      academicNote: 'Cleared by St. Marks Admissions Registrar.',
      progressPercent: 50,
      completedResourceIds: ['res-img-vascular-plate'],
      attendanceMinutes: 45,
      gradeLabel: 'B+',
      requestedAt: '2026-09-22T09:00:00.000Z',
      verifiedAt: '2026-09-23T11:00:00.000Z',
    },
    {
      id: 'enr-003',
      courseId: 'crs-arch-studio',
      courseTitle: 'Structural Timber & Spatial Scale Modeling Studio',
      learnerId: 'usr-learner-daniel',
      learnerName: 'Daniel Mugisha',
      learnerDeclaredLevel: 'BSc Graduate',
      ownerId: 'usr-inst-stmarks',
      institutionId: 'inst-stmarks',
      verifierRoleRequired: 'INSTITUTION_ADMIN',
      academicStatus: 'PENDING',
      progressPercent: 0,
      completedResourceIds: [],
      attendanceMinutes: 0,
      requestedAt: '2026-11-24T11:00:00.000Z',
    },
    {
      id: 'enr-004',
      courseId: 'crs-corp-valuation',
      courseTitle: 'Financial Modeling & Corporate Valuation Workshop',
      learnerId: 'usr-learner-fatima',
      learnerName: 'Fatima Zahra',
      learnerDeclaredLevel: 'High School / A-Level',
      ownerId: 'usr-freelancer-maya',
      verifierRoleRequired: 'SOLO_EDUCATOR',
      academicStatus: 'PENDING',
      progressPercent: 0,
      completedResourceIds: [],
      attendanceMinutes: 0,
      requestedAt: '2026-11-24T15:30:00.000Z',
    },
  ];

  const liveSessions: LiveSession[] = [
    {
      id: 'live-stats-seminar',
      courseId: 'crs-applied-ml',
      courseTitle: 'Computational Statistics & Applied Machine Learning',
      hostId: 'usr-dr-okello',
      hostName: 'Dr. Samuel Okello',
      title: 'Live Seminar: Posterior Predictive Checks & Model Calibration',
      topicSummary:
        'Interactive walkthrough of diagnostic plots with live Q&A and workbook distribution.',
      scheduledAt: now,
      durationMinutes: 60,
      accessRule: 'ENROLLED_ONLY',
      status: 'LIVE',
      chatMuted: false,
      qaMode: false,
      pinnedResourceIds: ['res-pdf-bayesian'],
      raisedHandUserIds: [],
      micGrantedUserIds: [],
      activeParticipantIds: ['usr-dr-okello'],
      kickedUserIds: [],
      attendanceLog: {
        'usr-learner-amara': {
          name: 'Amara Kato',
          joinedAt: '2026-11-25T05:00:00.000Z',
          minutes: 24,
        },
      },
      chatMessages: [
        {
          id: 'msg-seed-1',
          senderId: 'usr-dr-okello',
          senderName: 'Dr. Samuel Okello',
          senderRole: 'SOLO_EDUCATOR',
          text: 'Welcome to the live seminar. I have pinned the Bayesian Inference Workbook in the Session Materials drawer.',
          timestamp: '2026-11-25T05:02:00.000Z',
        },
      ],
    },
    {
      id: 'live-microscopy-lab',
      courseId: 'crs-bio-microscopy',
      courseTitle: 'Quantitative Cellular Microscopy & Lab Methods',
      hostId: 'usr-staff-claire',
      hostName: 'Prof. Claire Namono (St. Marks)',
      institutionId: 'inst-stmarks',
      title: 'Staining Calibration & Brightfield Optics Review',
      topicSummary: 'Pre-lab briefing for enrolled molecular microscopy cohort.',
      scheduledAt: '2026-11-27T14:00:00.000Z',
      durationMinutes: 45,
      accessRule: 'ENROLLED_ONLY',
      status: 'SCHEDULED',
      chatMuted: false,
      qaMode: false,
      pinnedResourceIds: ['res-docx-lab-template'],
      raisedHandUserIds: [],
      micGrantedUserIds: [],
      activeParticipantIds: [],
      kickedUserIds: [],
      attendanceLog: {},
      chatMessages: [],
    },
    {
      id: 'live-open-systems',
      courseId: 'crs-applied-ml',
      courseTitle: 'Open Academic Colloquium',
      hostId: 'usr-inst-nairobi',
      hostName: 'Nairobi School of Computing',
      institutionId: 'inst-nsc',
      title: 'Public Colloquium: Distributed Fault Tolerance in Campus Networks',
      topicSummary: 'Open seminar introducing Raft consensus and packet routing.',
      scheduledAt: '2026-11-28T16:00:00.000Z',
      durationMinutes: 50,
      accessRule: 'PUBLIC_SEMINAR',
      status: 'SCHEDULED',
      chatMuted: false,
      qaMode: false,
      pinnedResourceIds: ['res-pdf-network-basics'],
      raisedHandUserIds: [],
      micGrantedUserIds: [],
      activeParticipantIds: [],
      kickedUserIds: [],
      attendanceLog: {},
      chatMessages: [],
    },
  ];

  const tickets: SupportTicket[] = [
    {
      id: 'tkt-001',
      userId: 'usr-freelancer-kenji',
      userName: 'Eng. Tunde Adeyemi',
      userRole: 'SOLO_EDUCATOR',
      category: 'KYC_APPEAL',
      subject: 'National ID & COREN Architectural License Review Timeline',
      status: 'OPEN',
      createdAt: '2026-11-24T08:40:00.000Z',
      messages: [
        {
          id: 'tktm-1',
          senderId: 'usr-freelancer-kenji',
          senderName: 'Eng. Tunde Adeyemi',
          senderRole: 'SOLO_EDUCATOR',
          body: 'Hello Compliance Team, I uploaded my Nigerian NIN card and COREN drafting license yesterday. Please let me know if any additional certification is needed before I activate my subscription.',
          timestamp: '2026-11-24T08:40:00.000Z',
        },
      ],
    },
    {
      id: 'tkt-002',
      userId: 'usr-solo-mensah',
      userName: 'Prof. Kwame Mensah',
      userRole: 'SOLO_EDUCATOR',
      category: 'SUBSCRIPTION',
      subject: 'Subscription Payment Verification Confirmation',
      status: 'IN_REVIEW',
      createdAt: '2026-11-24T10:15:00.000Z',
      messages: [
        {
          id: 'tktm-2',
          senderId: 'usr-solo-mensah',
          senderName: 'Prof. Kwame Mensah',
          senderRole: 'SOLO_EDUCATOR',
          body: 'My identity is verified and I submitted my Solo Pro subscription request. Kindly activate my account so I can upload Commercial Law lecture notes.',
          timestamp: '2026-11-24T10:15:00.000Z',
        },
      ],
    },
  ];

  const messageThreads: DirectMessageThread[] = [
    {
      id: 'thr-001',
      contextType: 'ENROLLMENT_CHECK',
      contextId: 'enr-003',
      contextTitle: 'Structural Timber Studio — Prerequisite Review',
      participantIds: ['usr-inst-stmarks', 'usr-learner-daniel'],
      participantNames: {
        'usr-inst-stmarks': 'St. Marks Polytechnic (Registrar)',
        'usr-learner-daniel': 'Daniel Mugisha',
      },
      messages: [
        {
          id: 'dm-1',
          senderId: 'usr-learner-daniel',
          senderName: 'Daniel Mugisha',
          senderRole: 'LEARNER',
          body: 'Good morning Registrar, I have attached my BSc Civil Engineering certificate in my Academic Vault for the Structural Timber Studio admission check.',
          timestamp: '2026-11-24T11:05:00.000Z',
        },
      ],
    },
    {
      id: 'thr-002',
      contextType: 'ENROLLMENT_CHECK',
      contextId: 'enr-004',
      contextTitle: 'Corporate Valuation Workshop — Transcript Check',
      participantIds: ['usr-freelancer-maya', 'usr-learner-fatima'],
      participantNames: {
        'usr-freelancer-maya': 'Amina Diallo',
        'usr-learner-fatima': 'Fatima Zahra',
      },
      messages: [
        {
          id: 'dm-2',
          senderId: 'usr-learner-fatima',
          senderName: 'Fatima Zahra',
          senderRole: 'LEARNER',
          body: 'Hello Amina, I uploaded my A-Level Mathematics & Economics certificate for admission into your valuation workshop.',
          timestamp: '2026-11-24T15:35:00.000Z',
        },
      ],
    },
    {
      id: 'thr-003',
      contextType: 'INSTITUTION_STAFF',
      contextId: 'inst-stmarks',
      contextTitle: 'St. Marks Faculty — Term Lab Schedule',
      participantIds: ['usr-inst-stmarks', 'usr-staff-claire', 'usr-staff-david'],
      participantNames: {
        'usr-inst-stmarks': 'St. Marks Polytechnic (Registrar)',
        'usr-staff-claire': 'Prof. Claire Namono',
        'usr-staff-david': 'Eng. David Bukenya',
      },
      messages: [
        {
          id: 'dm-3',
          senderId: 'usr-inst-stmarks',
          senderName: 'St. Marks Polytechnic',
          senderRole: 'INSTITUTION_ADMIN',
          body: 'Claire and David, incoming student academic clearances are handled centrally by Admissions before students appear in your active rosters.',
          timestamp: '2026-11-23T09:00:00.000Z',
        },
      ],
    },
  ];

  const outboxEmails: OutboxEmail[] = [
    {
      id: 'mail-001',
      toEmail: 'tunde.adeyemi@studio-draft.ng',
      toName: 'Eng. Tunde Adeyemi',
      subject: 'Account Approved — Temporary Credentials Issued',
      body: 'Your contributor request has been approved by Compliance Admin. Sign in using your email and temporary password to complete identity verification and profile setup.',
      sentAt: '2026-11-18T14:25:00.000Z',
      tag: 'CREDENTIALS',
    },
    {
      id: 'mail-002',
      toEmail: 'new.educator@akademi.novic.tech',
      toName: 'Dr. Amina Yusuf',
      subject: 'Akademi Contributor Account Approved — Temporary Credentials',
      body: 'Welcome to Akademi. Temporary Password issued; sign in to set your permanent password and submit National ID / Passport verification.',
      sentAt: '2026-11-24T10:00:00.000Z',
      tag: 'CREDENTIALS',
    },
  ];

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'aud-001',
      actorId: 'usr-master-admin',
      actorName: 'Akademi Master Admin',
      action: 'KYC_VERIFIED',
      targetType: 'KYC',
      targetId: 'kyc-002',
      details: 'Verified National ID and PhD charter for Dr. Samuel Okello.',
      timestamp: '2026-02-14T12:15:00.000Z',
    },
    {
      id: 'aud-002',
      actorId: 'usr-master-admin',
      actorName: 'Akademi Master Admin',
      action: 'SUBSCRIPTION_ACTIVATED',
      targetType: 'SUBSCRIPTION',
      targetId: 'usr-inst-stmarks',
      details: 'Activated Institution Campus subscription for St. Marks Polytechnic.',
      timestamp: '2026-09-15T12:05:00.000Z',
    },
    {
      id: 'aud-003',
      actorId: 'usr-master-admin',
      actorName: 'Akademi Master Admin',
      action: 'SUBSCRIPTION_SUSPENDED',
      targetType: 'SUBSCRIPTION',
      targetId: 'usr-solo-victor',
      details: 'Suspended Victor Karanja subscription due to expired billing cycle.',
      timestamp: '2026-11-10T16:00:00.000Z',
    },
  ];

  const ledger: LedgerTransaction[] = [
    {
      id: 'tx-001',
      buyerId: 'usr-learner-amara',
      buyerName: 'Amara Kato',
      sellerId: 'usr-dr-okello',
      sellerName: 'Dr. Samuel Okello',
      itemType: 'BOOK',
      itemTitle: 'Foundations of Statistical Learning — Complete Reference Book',
      grossUsd: 24,
      platformFeeUsd: 3.6,
      creatorNetUsd: 20.4,
      timestamp: '2026-10-06T15:20:00.000Z',
    },
    {
      id: 'tx-002',
      buyerId: 'usr-learner-amara',
      buyerName: 'Amara Kato',
      sellerId: 'usr-inst-stmarks',
      sellerName: 'St. Marks Polytechnic',
      itemType: 'COURSE',
      itemTitle: 'Quantitative Cellular Microscopy & Lab Methods',
      grossUsd: 45,
      platformFeeUsd: 6.75,
      creatorNetUsd: 38.25,
      timestamp: '2026-09-22T09:05:00.000Z',
    },
    {
      id: 'tx-003',
      buyerId: 'usr-learner-amara',
      buyerName: 'Amara Kato',
      itemType: 'PLATFORM_PASS',
      itemTitle: 'Akademi Pass — Monthly Learner Access',
      grossUsd: 15,
      platformFeeUsd: 15,
      creatorNetUsd: 0,
      timestamp: '2026-11-01T08:00:00.000Z',
    },
    {
      id: 'tx-004',
      buyerId: 'usr-dr-okello',
      buyerName: 'Dr. Samuel Okello',
      itemType: 'CONTRIBUTOR_SUBSCRIPTION',
      itemTitle: 'Solo Pro Educator Plan',
      grossUsd: 29,
      platformFeeUsd: 29,
      creatorNetUsd: 0,
      timestamp: '2026-10-01T09:00:00.000Z',
    },
    {
      id: 'tx-005',
      buyerId: 'usr-inst-stmarks',
      buyerName: 'St. Marks Polytechnic',
      itemType: 'CONTRIBUTOR_SUBSCRIPTION',
      itemTitle: 'Institution Campus Plan',
      grossUsd: 149,
      platformFeeUsd: 149,
      creatorNetUsd: 0,
      timestamp: '2026-09-15T12:00:00.000Z',
    },
    {
      id: 'tx-006',
      buyerId: 'usr-freelancer-maya',
      buyerName: 'Amina Diallo',
      itemType: 'CONTRIBUTOR_SUBSCRIPTION',
      itemTitle: 'Solo Pro Educator Plan',
      grossUsd: 29,
      platformFeeUsd: 29,
      creatorNetUsd: 0,
      timestamp: '2026-10-12T11:00:00.000Z',
    },
  ];

  return {
    seedVersion: CURRENT_SEED_VERSION,
    users: [
      masterAdmin,
      drOkello,
      aminaDiallo,
      profMensah,
      tundeAdeyemi,
      aminaYusuf,
      victorSuspended,
      stMarksAdmin,
      claireStaff,
      davidStaff,
      nairobiSchool,
      learnerAmara,
      learnerDaniel,
      learnerFatima,
      learnerKwabena,
    ],
    accountRequests,
    kycSubmissions,
    resources,
    courses,
    learnerAcademicDocs,
    enrollments,
    liveSessions,
    tickets,
    messageThreads,
    outboxEmails,
    auditLogs,
    ledger,
  };
}

export function loadDatabase(): AkademiDatabase {
  ensureDataDirs();
  if (!fs.existsSync(DB_FILE)) {
    const seeded = createSeedDatabase();
    saveDatabase(seeded);
    return seeded;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as AkademiDatabase;
    if (parsed.seedVersion !== CURRENT_SEED_VERSION) {
      const seeded = createSeedDatabase();
      saveDatabase(seeded);
      return seeded;
    }
    return parsed;
  } catch {
    const seeded = createSeedDatabase();
    saveDatabase(seeded);
    return seeded;
  }
}

export function saveDatabase(db: AkademiDatabase) {
  ensureDataDirs();
  const tmpPath = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpPath, DB_FILE);
}
