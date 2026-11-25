import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import http from 'http';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import {
  AkademiDatabase,
  StoredUser,
  UPLOAD_DIR,
  ensureDataDirs,
  getPlatformGatewayConfig,
  hashPassword,
  loadDatabase,
  saveDatabase,
  verifyPassword,
} from './server/store.ts';
import type {
  AccessTier,
  AccountCategory,
  AccountRequest,
  AuditLogEntry,
  CourseItem,
  DirectMessageThread,
  EnrollmentRecord,
  KycSubmission,
  LearnerAcademicDoc,
  LiveChatMessage,
  LiveSession,
  MasterAnalyticsSummary,
  PublicFeaturedCreator,
  PublicFeaturedResource,
  PublicFeaturedSeminar,
  ResourceItem,
  ResourceType,
  SupportTicket,
  UserProfile,
  UserRole,
} from './src/types/akademi.ts';

dotenv.config();
ensureDataDirs();

const PORT = 3000;
const SESSION_SECRET = process.env.AKADEMI_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const MASTER_ADMIN_EMAIL = 'admin@akademi.novic.tech';

let db: AkademiDatabase = loadDatabase();

function persist() {
  saveDatabase(db);
}

// Multer configuration with strict filename sanitization
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDataDirs();
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

interface TokenPayload {
  uid: string;
  role: UserRole;
  exp: number;
}

function signToken(user: StoredUser): string {
  const payload: TokenPayload = {
    uid: user.id,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 24,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): TokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as TokenPayload;
    if (parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function toSafeUser(user: StoredUser, viewer: StoredUser | null): UserProfile {
  const {
    passwordHash: _ph,
    nationalIdNumber,
    phone,
    homeAddress,
    billingEmail,
    ...publicFields
  } = user;

  if (viewer && (viewer.id === user.id || viewer.role === 'MASTER_ADMIN')) {
    return {
      ...publicFields,
      nationalIdNumber,
      phone,
      homeAddress,
      billingEmail,
    };
  }
  return publicFields;
}

function logAudit(
  actor: StoredUser,
  action: string,
  targetType: AuditLogEntry['targetType'],
  targetId: string,
  details: string
) {
  db.auditLogs.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    actorId: actor.id,
    actorName: actor.name,
    action,
    targetType,
    targetId,
    details,
    timestamp: new Date().toISOString(),
  });
}

function queueOutboxEmail(
  toEmail: string,
  toName: string,
  subject: string,
  body: string,
  tag: 'CREDENTIALS' | 'REJECTION' | 'KYC' | 'SUBSCRIPTION' | 'NOTIFICATION'
) {
  db.outboxEmails.unshift({
    id: `mail-${crypto.randomUUID().slice(0, 8)}`,
    toEmail,
    toName,
    subject,
    body,
    sentAt: new Date().toISOString(),
    tag,
  });
}

function isContributorRole(role: UserRole): boolean {
  return role === 'SOLO_EDUCATOR' || role === 'INSTITUTION_ADMIN' || role === 'COURSE_ADMIN';
}

function canUserAccessResource(user: StoredUser | null, res: ResourceItem): boolean {
  if (res.status !== 'PUBLISHED') {
    return Boolean(user && (user.role === 'MASTER_ADMIN' || user.id === res.ownerId));
  }
  if (res.accessTier === 'PUBLIC_FREE') return true;
  if (!user) return false;
  if (user.role === 'MASTER_ADMIN' || user.id === res.ownerId) return true;
  if (user.institutionId && res.institutionId && user.institutionId === res.institutionId) return true;
  if (user.purchasedResourceIds.includes(res.id)) return true;
  if (user.paidFollowCreatorIds.includes(res.ownerId)) return true;
  if (res.accessTier === 'PLATFORM_PASS' && user.platformPassActive) return true;

  // Check if enrolled in any approved course containing this resource
  const enrolledCourses = db.courses.filter(
    (c) =>
      c.resourceIds.includes(res.id) &&
      db.enrollments.some(
        (e) => e.courseId === c.id && e.learnerId === user.id && e.academicStatus === 'APPROVED'
      )
  );
  if (enrolledCourses.length > 0 && res.accessTier !== 'PAID_SINGLE') return true;
  // Also allow if learner purchased a course containing this resource
  if (db.courses.some((c) => c.resourceIds.includes(res.id) && user.purchasedCourseIds.includes(c.id))) {
    return true;
  }
  return false;
}

function canUserJoinSession(user: StoredUser, session: LiveSession): { allowed: boolean; reason?: string } {
  if (session.kickedUserIds.includes(user.id)) {
    return { allowed: false, reason: 'You have been removed from this live session by the host.' };
  }
  const host = db.users.find((u) => u.id === session.hostId);
  if (!host || host.subscriptionStatus !== 'ACTIVE') {
    return { allowed: false, reason: 'Host subscription is currently inactive or suspended.' };
  }
  if (
    user.role === 'MASTER_ADMIN' ||
    user.id === session.hostId ||
    (user.institutionId && session.institutionId && user.institutionId === session.institutionId)
  ) {
    return { allowed: true };
  }
  if (session.accessRule === 'PUBLIC_SEMINAR') return { allowed: true };
  if (session.accessRule === 'PAID_FOLLOWERS') {
    const course = db.courses.find((c) => c.id === session.courseId);
    const creatorId = course?.ownerId || session.hostId;
    if (user.paidFollowCreatorIds.includes(creatorId) || user.platformPassActive) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Requires an active Paid Follow membership or Akademi Pass.' };
  }
  // ENROLLED_ONLY
  const approvedEnrollment = db.enrollments.find(
    (e) => e.courseId === session.courseId && e.learnerId === user.id && e.academicStatus === 'APPROVED'
  );
  if (!approvedEnrollment) {
    return {
      allowed: false,
      reason: 'Requires approved enrollment & academic verification for this course.',
    };
  }
  return { allowed: true };
}

interface AuthedRequest extends Request {
  authUser?: StoredUser;
}

function extractBearer(req: Request): string {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return '';
}

function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = extractBearer(req);
  if (token) {
    const parsed = verifyToken(token);
    if (parsed) {
      const user = db.users.find((u) => u.id === parsed.uid);
      if (user) req.authUser = user;
    }
  }
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractBearer(req);
  const parsed = verifyToken(token);
  if (!parsed) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const user = db.users.find((u) => u.id === parsed.uid);
  if (!user) {
    res.status(401).json({ error: 'Account session is no longer valid.' });
    return;
  }
  if (
    user.mustChangePassword &&
    req.path !== '/api/auth/change-password' &&
    req.path !== '/api/auth/me'
  ) {
    res.status(403).json({
      error: 'You must set a permanent password before accessing Akademi.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
    return;
  }
  req.authUser = user;
  next();
}

function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      res.status(403).json({ error: 'Insufficient role permissions for this operation.' });
      return;
    }
    next();
  };
}

// WebSocket Client Registry
interface ConnectedSocket {
  ws: WebSocket;
  userId: string;
  role: UserRole;
  sessionId?: string;
}

const connectedSockets = new Set<ConnectedSocket>();

function sendToUser(userId: string, event: string, payload: unknown) {
  const msg = JSON.stringify({ event, payload });
  for (const client of connectedSockets) {
    if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
    }
  }
}

function broadcastToSession(sessionId: string, event: string, payload: unknown) {
  const msg = JSON.stringify({ event, payload });
  for (const client of connectedSockets) {
    if (client.sessionId === sessionId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(optionalAuth);

  // ---------------- AUTH & BOOTSTRAP ----------------
  app.get('/api/auth/bootstrap-status', (_req, res) => {
    const envPasscodeSet = Boolean(process.env.AKADEMI_ADMIN_PASSCODE?.trim());
    const master = db.users.find((u) => u.role === 'MASTER_ADMIN');
    const claimed = Boolean(master?.passwordHash);
    res.json({
      needsAdminClaim: !envPasscodeSet && !claimed,
      envConfigured: envPasscodeSet,
      masterEmail: MASTER_ADMIN_EMAIL,
    });
  });

  app.post('/api/auth/claim-admin', (req, res) => {
    const envPasscode = process.env.AKADEMI_ADMIN_PASSCODE?.trim();
    const master = db.users.find((u) => u.role === 'MASTER_ADMIN');
    if (!master) {
      res.status(500).json({ error: 'Master Admin account missing.' });
      return;
    }
    if (envPasscode || master.passwordHash) {
      res.status(409).json({ error: 'Master Admin credentials have already been configured.' });
      return;
    }
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || master.name).trim();
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }
    master.passwordHash = hashPassword(password);
    if (name) master.name = name;
    logAudit(master, 'MASTER_ADMIN_CLAIMED', 'USER', master.id, 'Initial Master Admin password claimed.');
    persist();
    const token = signToken(master);
    res.json({ token, user: toSafeUser(master, master) });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const user = db.users.find((u) => u.email.toLowerCase() === email);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (user.role === 'MASTER_ADMIN') {
      const envPass = process.env.AKADEMI_ADMIN_PASSCODE?.trim();
      if (envPass) {
        const d1 = crypto.createHash('sha256').update(password).digest();
        const d2 = crypto.createHash('sha256').update(envPass).digest();
        if (!crypto.timingSafeEqual(d1, d2)) {
          res.status(401).json({ error: 'Invalid Master Admin credentials.' });
          return;
        }
      } else if (!user.passwordHash) {
        res.status(403).json({
          error: 'Master Admin password has not been claimed yet. Use the initial setup card.',
          code: 'ADMIN_CLAIM_REQUIRED',
        });
        return;
      } else if (!verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: 'Invalid Master Admin credentials.' });
        return;
      }
    } else if (!verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signToken(user);
    res.json({ token, user: toSafeUser(user, user) });
  });

  app.post('/api/auth/register-learner', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');
    const educationLevel = String(req.body?.educationLevel || 'NCHE Undergraduate (Year 1–4)').trim();
    const country = String(req.body?.country || 'Uganda').trim();
    const educationSystem = String(req.body?.educationSystem || 'UNEB / NCHE Uganda').trim();
    const specialization = String(req.body?.specialization || 'General Studies').trim();

    if (!email || !name || password.length < 8) {
      res.status(400).json({ error: 'Valid name, email, and 8+ character password are required.' });
      return;
    }
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const newLearner: StoredUser = {
      id: `usr-lrn-${crypto.randomUUID().slice(0, 8)}`,
      email,
      name,
      role: 'LEARNER',
      bio: `Akademi learner (${country}) pursuing ${specialization}.`,
      specialization,
      educationLevel,
      country,
      educationSystem,
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
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(password),
    };
    db.users.push(newLearner);
    queueOutboxEmail(
      email,
      name,
      'Welcome to Akademi — Learner Account Ready',
      `Hello ${name}, your Akademi learner dashboard is active. Upload your academic documents in your Academic Vault to unlock course prerequisite approvals.`,
      'NOTIFICATION'
    );
    persist();
    const token = signToken(newLearner);
    res.status(201).json({ token, user: toSafeUser(newLearner, newLearner) });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: toSafeUser(req.authUser!, req.authUser!) });
  });

  app.post('/api/auth/change-password', requireAuth, (req: AuthedRequest, res) => {
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }
    const user = req.authUser!;
    if (user.role === 'MASTER_ADMIN' && process.env.AKADEMI_ADMIN_PASSCODE?.trim()) {
      res.status(400).json({ error: 'Master Admin passcode is managed via environment settings.' });
      return;
    }
    user.passwordHash = hashPassword(newPassword);
    user.mustChangePassword = false;
    logAudit(user, 'PASSWORD_CHANGED', 'USER', user.id, 'User updated account password.');
    persist();
    res.json({ user: toSafeUser(user, user) });
  });

  // ---------------- PUBLIC GATEWAY INFO (SYSTEM-EXTRACTED, STRICTLY SANITIZED) ----------------
  function mapLevelBucket(
    level: string
  ): 'Primary' | 'O-Level' | 'A-Level' | 'Vocational' | 'University' | 'Professional' {
    const low = level.toLowerCase();
    if (low.includes('ple') || low.includes('primary')) return 'Primary';
    if (low.includes('uce') || low.includes('o-level') || low.includes('csee') || low.includes('cbc')) {
      return 'O-Level';
    }
    if (low.includes('uace') || low.includes('a-level') || low.includes('acsee') || low.includes('kcse')) {
      return 'A-Level';
    }
    if (low.includes('ubteb') || low.includes('tvet') || low.includes('dit') || low.includes('vocational')) {
      return 'Vocational';
    }
    if (low.includes('professional') || low.includes('licensing') || low.includes('postgraduate')) {
      return 'Professional';
    }
    return 'University';
  }

  app.get('/api/public/overview', (_req, res) => {
    const base = getPlatformGatewayConfig();
    const verifiedActiveCreators = db.users.filter(
      (u) =>
        (u.role === 'SOLO_EDUCATOR' || u.role === 'INSTITUTION_ADMIN') &&
        u.kycStatus === 'VERIFIED' &&
        u.subscriptionStatus === 'ACTIVE'
    );
    const publishedResources = db.resources.filter((r) => r.status === 'PUBLISHED');
    const learnersCount = db.users.filter((u) => u.role === 'LEARNER').length;
    const distinctSubjects = new Set(publishedResources.map((r) => r.subject));

    // Only expose PUBLIC_FREE resources to unauthenticated visitors (zero filePaths, zero paid/enrolled files)
    const featuredResources: PublicFeaturedResource[] = publishedResources
      .filter((r) => r.accessTier === 'PUBLIC_FREE')
      .map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        type: r.type,
        subject: r.subject,
        educationLevel: r.educationLevel,
        levelBucket: mapLevelBucket(r.educationLevel),
        contributorName: r.ownerName,
        verified: true,
        isFree: true,
        priceLabel: 'Free',
        fileSizeLabel: r.fileSizeLabel,
      }));

    // Strictly sanitized public creator cards (zero emails, zero phones, zero IDs, zero home addresses)
    const featuredCreators: PublicFeaturedCreator[] = verifiedActiveCreators.map((u, idx) => ({
      publicKey: `creator-${idx + 1}`,
      displayName: u.institutionName || u.name,
      roleLabel:
        u.role === 'INSTITUTION_ADMIN'
          ? 'Verified Institution'
          : u.accountCategory === 'FREELANCER'
            ? 'Verified Specialist'
            : 'Verified Educator',
      isInstitution: u.role === 'INSTITUTION_ADMIN',
      specialization: u.specialization,
      bio: u.bio,
      avatarUrl: u.avatarUrl,
      followersCount: u.followerIds.length,
    }));

    // Strictly public seminars (no enrolled-only rooms, no attendance logs, no chat transcripts)
    const upcomingSeminars: PublicFeaturedSeminar[] = db.liveSessions
      .filter((s) => s.accessRule === 'PUBLIC_SEMINAR' && s.status !== 'ENDED')
      .map((s) => ({
        id: s.id,
        title: s.title,
        courseTitle: s.courseTitle,
        hostName: s.hostName,
        topicSummary: s.topicSummary,
        scheduledAt: s.scheduledAt,
        status: s.status,
      }));

    res.json({
      ...base,
      stats: {
        verifiedEducatorsCount: verifiedActiveCreators.length,
        availableResourcesCount: publishedResources.length,
        registeredLearnersCount: learnersCount,
        subjectsCount: distinctSubjects.size,
        useQualitativeStrip: verifiedActiveCreators.length < 20,
      },
      featuredResources,
      featuredCreators,
      upcomingSeminars,
    });
  });

  app.post('/api/public/report', (req, res) => {
    const reporterEmail = String(req.body?.email || 'anonymous@visitor.local').trim();
    const subject = String(req.body?.subject || '').trim();
    const details = String(req.body?.details || '').trim();
    if (!subject || !details) {
      res.status(400).json({ error: 'Report subject and description are required.' });
      return;
    }
    const ticket: SupportTicket = {
      id: `tkt-${crypto.randomUUID().slice(0, 8)}`,
      userId: 'public-visitor',
      userName: reporterEmail,
      userRole: 'LEARNER',
      category: 'CONTENT_REPORT',
      subject: `[Public Report] ${subject}`,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      messages: [
        {
          id: `tktm-${crypto.randomUUID().slice(0, 8)}`,
          senderId: 'public-visitor',
          senderName: reporterEmail,
          senderRole: 'LEARNER',
          body: details,
          timestamp: new Date().toISOString(),
        },
      ],
    };
    db.tickets.unshift(ticket);
    persist();
    res.status(201).json({ ticketId: ticket.id });
  });

  // ---------------- AUTHENTICATED LEARNER CATALOG ----------------
  app.get('/api/learner/catalog', requireAuth, (req: AuthedRequest, res) => {
    const viewer = req.authUser!;
    const creators = db.users
      .filter(
        (u) =>
          (u.role === 'SOLO_EDUCATOR' || u.role === 'INSTITUTION_ADMIN') &&
          u.kycStatus === 'VERIFIED' &&
          u.subscriptionStatus === 'ACTIVE'
      )
      .map((u) => ({
        ...toSafeUser(u, viewer),
        resourcesCount: db.resources.filter((r) => r.ownerId === u.id && r.status === 'PUBLISHED')
          .length,
        coursesCount: db.courses.filter((c) => c.ownerId === u.id && c.status === 'ACTIVE').length,
      }));

    const resources = db.resources
      .filter((r) => r.status === 'PUBLISHED')
      .map((r) => ({
        ...r,
        filePath: undefined,
        canAccess: canUserAccessResource(viewer, r),
      }));

    const courses = db.courses
      .filter((c) => c.status === 'ACTIVE')
      .map((c) => {
        const myEnrollment = db.enrollments.find(
          (e) => e.courseId === c.id && e.learnerId === viewer.id
        );
        return {
          ...c,
          myEnrollment,
        };
      });

    const liveSessions = db.liveSessions.map((s) => ({
      ...s,
      chatMessages: [],
      attendanceLog: {},
      canJoin: canUserJoinSession(viewer, s),
    }));

    res.json({ creators, resources, courses, liveSessions });
  });

  app.post('/api/requests', (req, res) => {
    const fullName = String(req.body?.fullName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const accountCategory = String(req.body?.accountCategory || 'SOLO_TEACHER') as AccountCategory;
    const organizationName = String(req.body?.organizationName || '').trim();
    const country = String(req.body?.country || 'Uganda').trim();
    const district = String(req.body?.district || '').trim();
    const educationSystem = String(req.body?.educationSystem || 'UNEB / NCHE Uganda').trim();
    const specialization = String(req.body?.specialization || '').trim();
    const plannedLevels = String(req.body?.plannedLevels || '').trim();
    const portfolioUrl = String(req.body?.portfolioUrl || '').trim();
    const statement = String(req.body?.statement || '').trim();

    if (!fullName || !email || !country || !specialization || !statement) {
      res.status(400).json({ error: 'All required fields must be completed.' });
      return;
    }
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'An account with this email already exists on Akademi.' });
      return;
    }
    if (db.accountRequests.some((r) => r.email.toLowerCase() === email && r.status === 'PENDING')) {
      res.status(409).json({ error: 'A pending contributor request already exists for this email.' });
      return;
    }

    const requestItem: AccountRequest = {
      id: `req-${crypto.randomUUID().slice(0, 8)}`,
      fullName,
      email,
      phone: phone || undefined,
      accountCategory,
      organizationName: accountCategory === 'SCHOOL_INSTITUTION' ? organizationName || fullName : undefined,
      country,
      district: district || undefined,
      educationSystem,
      specialization,
      plannedLevels: plannedLevels || undefined,
      portfolioUrl: portfolioUrl || undefined,
      statement,
      status: 'PENDING',
      submittedAt: new Date().toISOString(),
    };

    db.accountRequests.unshift(requestItem);
    persist();
    res.status(201).json({ request: requestItem });
  });

  // ---------------- MASTER ADMIN ENDPOINTS ----------------
  app.get('/api/admin/overview', requireAuth, requireRole('MASTER_ADMIN'), (req: AuthedRequest, res) => {
    const viewer = req.authUser!;
    const contributors = db.users.filter((u) => isContributorRole(u.role));
    const learners = db.users.filter((u) => u.role === 'LEARNER');

    const contributorBreakdown = contributors.map((u) => {
      const userResources = db.resources.filter((r) => r.ownerId === u.id);
      const byType: Record<ResourceType, number> = {
        PDF: 0,
        DOCX: 0,
        VIDEO: 0,
        IMAGE: 0,
        BOOK: 0,
      };
      for (const r of userResources) {
        byType[r.type] = (byType[r.type] || 0) + 1;
      }
      const userCourses = db.courses.filter(
        (c) => c.ownerId === u.id || c.assignedInstructorId === u.id
      );
      const studentSet = new Set<string>();
      for (const e of db.enrollments) {
        if (
          e.academicStatus === 'APPROVED' &&
          (e.ownerId === u.id || (u.institutionId && e.institutionId === u.institutionId))
        ) {
          studentSet.add(e.learnerId);
        }
      }
      const rev = db.ledger
        .filter((t) => t.sellerId === u.id)
        .reduce((acc, t) => acc + t.creatorNetUsd, 0);

      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        accountCategory: u.accountCategory,
        institutionName: u.institutionName,
        kycStatus: u.kycStatus,
        subscriptionStatus: u.subscriptionStatus,
        totalUploads: userResources.length,
        byType,
        coursesCount: userCourses.length,
        studentsCount: studentSet.size,
        followersCount: u.followerIds.length,
        revenueUsd: Number(rev.toFixed(2)),
      };
    });

    const mostEnrolledCourses = [...db.courses]
      .map((c) => ({
        id: c.id,
        title: c.title,
        ownerName: c.ownerName,
        enrolledCount: db.enrollments.filter(
          (e) => e.courseId === c.id && e.academicStatus === 'APPROVED'
        ).length,
        subject: c.subject,
      }))
      .sort((a, b) => b.enrolledCount - a.enrolledCount)
      .slice(0, 6);

    const summary: MasterAnalyticsSummary = {
      totalContributors: contributors.length,
      activeContributors: contributors.filter((u) => u.subscriptionStatus === 'ACTIVE').length,
      totalLearners: learners.length,
      pendingRequests: db.accountRequests.filter((r) => r.status === 'PENDING').length,
      pendingKyc: db.kycSubmissions.filter((k) => k.status === 'PENDING').length,
      pendingSubscriptions: contributors.filter((u) => u.subscriptionStatus === 'PENDING_APPROVAL')
        .length,
      totalResources: db.resources.length,
      totalCourses: db.courses.length,
      totalEnrollments: db.enrollments.filter((e) => e.academicStatus === 'APPROVED').length,
      grossPlatformVolumeUsd: Number(
        db.ledger.reduce((acc, t) => acc + t.grossUsd, 0).toFixed(2)
      ),
      platformCommissionUsd: Number(
        db.ledger.reduce((acc, t) => acc + t.platformFeeUsd, 0).toFixed(2)
      ),
      mostEnrolledCourses,
      contributorBreakdown,
    };

    const enrichedAcademicDocs = db.learnerAcademicDocs.map((doc) => {
      const learner = db.users.find((u) => u.id === doc.learnerId);
      return {
        ...doc,
        filePath: undefined,
        learnerName: learner?.name || 'Learner',
        learnerEmail: learner?.email || '',
      };
    });

    res.json({
      summary,
      accountRequests: db.accountRequests,
      kycSubmissions: db.kycSubmissions,
      users: db.users.map((u) => toSafeUser(u, viewer)),
      resources: db.resources.map((r) => ({ ...r, filePath: undefined })),
      academicDocs: enrichedAcademicDocs,
      courses: db.courses,
      outboxEmails: db.outboxEmails,
      auditLogs: db.auditLogs.slice(0, 60),
      ledger: db.ledger,
    });
  });

  app.post('/api/admin/requests/:id/approve', requireAuth, requireRole('MASTER_ADMIN'), (req: AuthedRequest, res) => {
    const admin = req.authUser!;
    const requestItem = db.accountRequests.find((r) => r.id === req.params.id);
    if (!requestItem) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }
    if (requestItem.status !== 'PENDING') {
      res.status(409).json({ error: 'This request has already been processed.' });
      return;
    }

    const customTemp = String(req.body?.tempPassword || '').trim();
    const tempPassword =
      customTemp.length >= 8
        ? customTemp
        : `Akd-${crypto.randomBytes(4).toString('hex')}!`;

    const isInst = requestItem.accountCategory === 'SCHOOL_INSTITUTION';
    const institutionId = isInst ? `inst-${crypto.randomUUID().slice(0, 6)}` : undefined;
    const newUserId = `usr-${crypto.randomUUID().slice(0, 8)}`;

    const newUser: StoredUser = {
      id: newUserId,
      email: requestItem.email,
      name: requestItem.fullName,
      role: isInst ? 'INSTITUTION_ADMIN' : 'SOLO_EDUCATOR',
      accountCategory: requestItem.accountCategory,
      institutionId,
      institutionName: isInst ? requestItem.organizationName || requestItem.fullName : undefined,
      bio: requestItem.statement,
      specialization: requestItem.specialization,
      country: requestItem.country,
      educationSystem: requestItem.educationSystem,
      mustChangePassword: true,
      kycStatus: 'UNSUBMITTED',
      subscriptionStatus: 'INACTIVE',
      followPriceUsd: isInst ? 20 : 10,
      followerIds: [],
      followingCreatorIds: [],
      paidFollowCreatorIds: [],
      purchasedResourceIds: [],
      purchasedCourseIds: [],
      platformPassActive: false,
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(tempPassword),
    };

    db.users.push(newUser);
    requestItem.status = 'APPROVED';
    requestItem.reviewedAt = new Date().toISOString();
    requestItem.createdUserId = newUserId;

    queueOutboxEmail(
      newUser.email,
      newUser.name,
      'Akademi Contributor Account Approved — Temporary Credentials',
      `Welcome to Akademi.\n\nEmail: ${newUser.email}\nTemporary Password: ${tempPassword}\n\nNext steps:\n1. Sign in and set your permanent password.\n2. Upload your National ID / Passport and teaching credentials.\n3. Activate your subscription once Master Admin verifies your identity.`,
      'CREDENTIALS'
    );
    logAudit(
      admin,
      'ACCOUNT_REQUEST_APPROVED',
      'REQUEST',
      requestItem.id,
      `Approved ${requestItem.fullName} (${requestItem.accountCategory}) and issued temporary credentials.`
    );
    persist();

    res.json({
      request: requestItem,
      user: toSafeUser(newUser, admin),
      issuedTempPassword: tempPassword,
    });
  });

  app.post('/api/admin/requests/:id/reject', requireAuth, requireRole('MASTER_ADMIN'), (req: AuthedRequest, res) => {
    const admin = req.authUser!;
    const requestItem = db.accountRequests.find((r) => r.id === req.params.id);
    if (!requestItem) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }
    const reason = String(req.body?.reason || 'Submitted details did not meet contributor criteria.').trim();
    requestItem.status = 'REJECTED';
    requestItem.reviewedAt = new Date().toISOString();
    requestItem.rejectionReason = reason;

    queueOutboxEmail(
      requestItem.email,
      requestItem.fullName,
      'Akademi Contributor Application Update',
      `Hello ${requestItem.fullName}, your contributor application could not be approved at this time.\nReason: ${reason}`,
      'REJECTION'
    );
    logAudit(admin, 'ACCOUNT_REQUEST_REJECTED', 'REQUEST', requestItem.id, reason);
    persist();
    res.json({ request: requestItem });
  });

  app.post('/api/admin/kyc/:id/review', requireAuth, requireRole('MASTER_ADMIN'), (req: AuthedRequest, res) => {
    const admin = req.authUser!;
    const submission = db.kycSubmissions.find((k) => k.id === req.params.id);
    if (!submission) {
      res.status(404).json({ error: 'KYC submission not found.' });
      return;
    }
    const decision = String(req.body?.decision || '') as 'APPROVED' | 'REJECTED';
    const notes = String(req.body?.notes || '').trim();
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      res.status(400).json({ error: 'Decision must be APPROVED or REJECTED.' });
      return;
    }

    submission.status = decision;
    submission.reviewedBy = admin.name;
    submission.reviewNotes = notes;

    const user = db.users.find((u) => u.id === submission.userId);
    if (user) {
      user.kycStatus = decision === 'APPROVED' ? 'VERIFIED' : 'REJECTED';
      user.kycRejectionReason = decision === 'REJECTED' ? notes || 'Document scan unclear.' : undefined;

      queueOutboxEmail(
        user.email,
        user.name,
        decision === 'APPROVED'
          ? 'Akademi Identity Verified — Ready for Subscription Activation'
          : 'Akademi Identity Verification Requires Resubmission',
        decision === 'APPROVED'
          ? 'Your National ID/Passport and credentials have been verified by Master Admin. Proceed to activate your contributor subscription to unlock publishing.'
          : `Your verification submission was returned: ${user.kycRejectionReason}`,
        'KYC'
      );
      sendToUser(user.id, 'kyc:updated', {
        kycStatus: user.kycStatus,
        kycRejectionReason: user.kycRejectionReason,
      });
    }

    logAudit(
      admin,
      `KYC_${decision}`,
      'KYC',
      submission.id,
      `${decision} verification for ${submission.userName}. ${notes}`
    );
    persist();
    res.json({ submission, user: user ? toSafeUser(user, admin) : null });
  });

  app.post('/api/admin/users/:id/subscription', requireAuth, requireRole('MASTER_ADMIN'), (req: AuthedRequest, res) => {
    const admin = req.authUser!;
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const status = String(req.body?.status || '') as 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
    if (!['ACTIVE', 'SUSPENDED', 'INACTIVE'].includes(status)) {
      res.status(400).json({ error: 'Invalid subscription status.' });
      return;
    }

    target.subscriptionStatus = status;
    target.subscriptionUpdatedAt = new Date().toISOString();
    if (status === 'ACTIVE' && !target.subscriptionPlan) {
      target.subscriptionPlan =
        target.role === 'INSTITUTION_ADMIN' ? 'INSTITUTION_CAMPUS' : 'SOLO_PRO';
    }

    // Cascade to institution staff if institution admin toggled
    if (target.role === 'INSTITUTION_ADMIN' && target.institutionId) {
      for (const staff of db.users) {
        if (staff.institutionId === target.institutionId && staff.id !== target.id) {
          staff.subscriptionStatus = status;
          sendToUser(staff.id, 'subscription:updated', { subscriptionStatus: status });
        }
      }
    }

    if (status === 'ACTIVE') {
      const fee = target.role === 'INSTITUTION_ADMIN' ? 149 : 29;
      db.ledger.unshift({
        id: `tx-${crypto.randomUUID().slice(0, 8)}`,
        buyerId: target.id,
        buyerName: target.name,
        itemType: 'CONTRIBUTOR_SUBSCRIPTION',
        itemTitle: `${target.subscriptionPlan || 'SOLO_PRO'} Activation`,
        grossUsd: fee,
        platformFeeUsd: fee,
        creatorNetUsd: 0,
        timestamp: new Date().toISOString(),
      });
    }

    queueOutboxEmail(
      target.email,
      target.name,
      status === 'ACTIVE'
        ? 'Akademi Subscription Activated — Portal Unlocked'
        : 'Akademi Subscription Suspended',
      status === 'ACTIVE'
        ? 'Master Admin has approved your subscription. Your Contributor Studio, resource publishing, and live classroom tools are now unlocked immediately.'
        : 'Your contributor subscription has been suspended. Publishing and live session hosting are temporarily locked.',
      'SUBSCRIPTION'
    );

    logAudit(
      admin,
      `SUBSCRIPTION_${status}`,
      'SUBSCRIPTION',
      target.id,
      `Set subscription status to ${status} for ${target.name}.`
    );
    persist();

    // Real-time automatic unlock/lock broadcast
    sendToUser(target.id, 'subscription:updated', {
      subscriptionStatus: target.subscriptionStatus,
      subscriptionPlan: target.subscriptionPlan,
    });

    res.json({ user: toSafeUser(target, admin) });
  });

  app.post('/api/admin/resources/:id/status', requireAuth, requireRole('MASTER_ADMIN'), (req: AuthedRequest, res) => {
    const admin = req.authUser!;
    const item = db.resources.find((r) => r.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Resource not found.' });
      return;
    }
    const status = req.body?.status === 'SUSPENDED' ? 'SUSPENDED' : 'PUBLISHED';
    item.status = status;
    logAudit(admin, `RESOURCE_${status}`, 'RESOURCE', item.id, `Resource "${item.title}" set to ${status}.`);
    persist();
    res.json({ resource: { ...item, filePath: undefined } });
  });

  // ---------------- CONTRIBUTOR & INSTITUTION STUDIO ----------------
  app.post(
    '/api/contributor/kyc',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN'),
    upload.fields([
      { name: 'idDocument', maxCount: 1 },
      { name: 'credentialDocument', maxCount: 1 },
    ]),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const documentType = String(req.body?.documentType || 'NATIONAL_ID') as KycSubmission['documentType'];
      const rawNumber = String(req.body?.documentNumber || '').trim();
      const masked =
        rawNumber.length > 4
          ? `${rawNumber.slice(0, 2)}****${rawNumber.slice(-4)}`
          : '****VERIFIED';

      const idFile = files?.idDocument?.[0];
      const credFile = files?.credentialDocument?.[0];

      user.bio = String(req.body?.bio || user.bio).trim();
      user.specialization = String(req.body?.specialization || user.specialization).trim();
      user.phone = String(req.body?.phone || user.phone || '').trim();
      user.homeAddress = String(req.body?.homeAddress || user.homeAddress || '').trim();
      if (rawNumber) user.nationalIdNumber = rawNumber;
      user.kycStatus = 'PENDING_REVIEW';
      user.kycRejectionReason = undefined;

      const submission: KycSubmission = {
        id: `kyc-${crypto.randomUUID().slice(0, 8)}`,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        role: user.role,
        accountCategory: user.accountCategory,
        documentType,
        documentNumberMasked: masked,
        idFileName: idFile?.originalname || String(req.body?.idFileNameFallback || 'identity_document.pdf'),
        idFilePath: idFile?.filename || '',
        credentialFileName:
          credFile?.originalname || String(req.body?.credentialFileNameFallback || 'teaching_credential.pdf'),
        credentialFilePath: credFile?.filename || '',
        submittedAt: new Date().toISOString(),
        status: 'PENDING',
      };

      // Replace previous pending submissions for same user
      db.kycSubmissions = db.kycSubmissions.filter(
        (k) => !(k.userId === user.id && k.status === 'PENDING')
      );
      db.kycSubmissions.unshift(submission);
      persist();
      res.status(201).json({ submission, user: toSafeUser(user, user) });
    }
  );

  app.post(
    '/api/contributor/subscription/request',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      if (user.kycStatus !== 'VERIFIED') {
        res.status(403).json({
          error: 'Identity documents must be verified by Master Admin before activating a subscription.',
        });
        return;
      }
      const plan =
        req.body?.plan === 'INSTITUTION_CAMPUS' ? 'INSTITUTION_CAMPUS' : 'SOLO_PRO';
      user.subscriptionPlan = plan;
      user.subscriptionStatus = 'PENDING_APPROVAL';
      user.subscriptionUpdatedAt = new Date().toISOString();
      logAudit(
        user,
        'SUBSCRIPTION_REQUESTED',
        'SUBSCRIPTION',
        user.id,
        `${user.name} submitted payment verification for ${plan}.`
      );
      persist();
      res.json({ user: toSafeUser(user, user) });
    }
  );

  app.get(
    '/api/contributor/workspace',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      const isInstScope = Boolean(user.institutionId);
      const myResources = db.resources
        .filter((r) =>
          isInstScope ? r.institutionId === user.institutionId || r.ownerId === user.id : r.ownerId === user.id
        )
        .map((r) => ({ ...r, filePath: undefined }));

      const myCourses = db.courses.filter((c) =>
        isInstScope ? c.institutionId === user.institutionId || c.ownerId === user.id : c.ownerId === user.id
      );

      // Enrollments belonging to this educator or institution
      const myEnrollments = db.enrollments
        .filter((e) =>
          isInstScope ? e.institutionId === user.institutionId || e.ownerId === user.id : e.ownerId === user.id
        )
        .map((e) => {
          const learner = db.users.find((u) => u.id === e.learnerId);
          const docs = db.learnerAcademicDocs.filter((d) => d.learnerId === e.learnerId);
          return {
            ...e,
            // Strictly non-confidential learner summary (NO nationalId, NO phone, NO homeAddress!)
            learnerAcademicDocs: docs.map((d) => ({ ...d, filePath: undefined })),
            learnerSpecialization: learner?.specialization || '',
          };
        });

      const mySessions = db.liveSessions.filter((s) =>
        isInstScope
          ? s.institutionId === user.institutionId || s.hostId === user.id
          : s.hostId === user.id
      );

      const staff = isInstScope
        ? db.users
            .filter((u) => u.institutionId === user.institutionId && u.id !== user.id)
            .map((u) => toSafeUser(u, null))
        : [];

      const myTransactions = db.ledger.filter((t) => t.sellerId === user.id);

      res.json({
        resources: myResources,
        courses: myCourses,
        enrollments: myEnrollments,
        sessions: mySessions,
        staff,
        transactions: myTransactions,
        myKycSubmissions: db.kycSubmissions.filter((k) => k.userId === user.id),
        educationLevels: getPlatformGatewayConfig().educationLevels,
      });
    }
  );

  app.post(
    '/api/contributor/resources',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN'),
    upload.single('file'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      if (user.kycStatus !== 'VERIFIED' || user.subscriptionStatus !== 'ACTIVE') {
        res.status(403).json({
          error:
            'Publishing is locked until your identity is verified and your subscription is ACTIVE.',
        });
        return;
      }

      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      const type = String(req.body?.type || 'PDF') as ResourceType;
      const subject = String(req.body?.subject || 'General').trim();
      const educationLevel = String(req.body?.educationLevel || 'NCHE Undergraduate (Year 1–4)').trim();
      const educationSystem = String(req.body?.educationSystem || user.educationSystem || 'UNEB / NCHE Uganda').trim();
      const accessTier = String(req.body?.accessTier || 'PUBLIC_FREE') as AccessTier;
      const priceUsd = accessTier === 'PAID_SINGLE' ? Math.max(1, Number(req.body?.priceUsd || 10)) : 0;
      const downloadable = req.body?.downloadable !== 'false' && req.body?.downloadable !== false;
      const previewSummary = String(
        req.body?.previewSummary || description || 'Verified Akademi study material.'
      ).trim();

      if (!title || !description) {
        res.status(400).json({ error: 'Title and description are required.' });
        return;
      }

      const uploaded = req.file;
      const sizeKb = uploaded ? Math.max(1, Math.round(uploaded.size / 1024)) : 240;
      const fileSizeLabel =
        sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

      const resource: ResourceItem = {
        id: `res-${crypto.randomUUID().slice(0, 8)}`,
        ownerId: user.role === 'COURSE_ADMIN' && user.institutionId
          ? db.users.find((u) => u.institutionId === user.institutionId && u.role === 'INSTITUTION_ADMIN')?.id || user.id
          : user.id,
        ownerName: user.institutionName || user.name,
        institutionId: user.institutionId,
        title,
        description,
        type,
        subject,
        educationLevel,
        educationSystem,
        accessTier,
        priceUsd,
        downloadable,
        fileName: uploaded?.originalname || `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.${type.toLowerCase()}`,
        fileSizeLabel,
        filePath: uploaded?.filename,
        mimeType: uploaded?.mimetype,
        previewSummary,
        downloadsCount: 0,
        viewsCount: 0,
        createdAt: new Date().toISOString(),
        status: 'PUBLISHED',
      };

      db.resources.unshift(resource);
      persist();
      res.status(201).json({ resource: { ...resource, filePath: undefined } });
    }
  );

  app.post(
    '/api/contributor/courses',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      if (user.kycStatus !== 'VERIFIED' || user.subscriptionStatus !== 'ACTIVE') {
        res.status(403).json({
          error: 'Course creation requires Verified KYC and an Active subscription.',
        });
        return;
      }

      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      const subject = String(req.body?.subject || 'General').trim();
      const requiredLevel = String(req.body?.requiredLevel || 'NCHE Undergraduate (Year 1–4)').trim();
      const educationSystem = String(req.body?.educationSystem || user.educationSystem || 'UNEB / NCHE Uganda').trim();
      const accessTier = String(req.body?.accessTier || 'ENROLLED_ONLY') as AccessTier;
      const priceUsd = accessTier === 'PAID_SINGLE' ? Math.max(1, Number(req.body?.priceUsd || 25)) : 0;
      const resourceIds = Array.isArray(req.body?.resourceIds) ? req.body.resourceIds.map(String) : [];
      const requiresAcademicVerification = req.body?.requiresAcademicVerification !== false;
      const assignedInstructorId = req.body?.assignedInstructorId
        ? String(req.body.assignedInstructorId)
        : undefined;

      if (!title || !description) {
        res.status(400).json({ error: 'Course title and description are required.' });
        return;
      }

      const covers = [
        '/src/assets/images/course_data_science_1795613120523.jpg',
        '/src/assets/images/course_bio_sciences_1795613120804.jpg',
        '/src/assets/images/course_architecture_1795613122272.jpg',
      ];
      const coverImage = covers[db.courses.length % covers.length];

      const ownerUser =
        user.role === 'COURSE_ADMIN' && user.institutionId
          ? db.users.find((u) => u.institutionId === user.institutionId && u.role === 'INSTITUTION_ADMIN') || user
          : user;

      const course: CourseItem = {
        id: `crs-${crypto.randomUUID().slice(0, 8)}`,
        ownerId: ownerUser.id,
        ownerName: ownerUser.institutionName || ownerUser.name,
        institutionId: ownerUser.institutionId,
        institutionName: ownerUser.institutionName,
        assignedInstructorId: assignedInstructorId || (user.role === 'COURSE_ADMIN' ? user.id : undefined),
        title,
        description,
        subject,
        requiredLevel,
        educationSystem,
        accessTier,
        priceUsd,
        coverImage,
        resourceIds,
        requiresAcademicVerification,
        enrolledLearnerIds: [],
        createdAt: new Date().toISOString(),
        status: 'ACTIVE',
      };

      db.courses.unshift(course);
      persist();
      res.status(201).json({ course });
    }
  );

  app.post(
    '/api/institution/staff',
    requireAuth,
    requireRole('INSTITUTION_ADMIN'),
    (req: AuthedRequest, res) => {
      const admin = req.authUser!;
      if (!admin.institutionId) {
        res.status(400).json({ error: 'Institution context missing.' });
        return;
      }
      const name = String(req.body?.name || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const specialization = String(req.body?.specialization || 'Course Administration').trim();
      const tempPassword = String(req.body?.tempPassword || '').trim() || `Staff-${crypto.randomBytes(4).toString('hex')}!`;

      if (!name || !email) {
        res.status(400).json({ error: 'Instructor name and email are required.' });
        return;
      }
      if (db.users.some((u) => u.email.toLowerCase() === email)) {
        res.status(409).json({ error: 'Email already registered on Akademi.' });
        return;
      }

      const staffUser: StoredUser = {
        id: `usr-stf-${crypto.randomUUID().slice(0, 8)}`,
        email,
        name,
        role: 'COURSE_ADMIN',
        accountCategory: 'SCHOOL_INSTITUTION',
        institutionId: admin.institutionId,
        institutionName: admin.institutionName || admin.name,
        bio: `Assigned Course Administrator at ${admin.institutionName || admin.name}.`,
        specialization,
        mustChangePassword: true,
        kycStatus: 'VERIFIED',
        subscriptionStatus: admin.subscriptionStatus,
        subscriptionPlan: admin.subscriptionPlan,
        followPriceUsd: 0,
        followerIds: [],
        followingCreatorIds: [],
        paidFollowCreatorIds: [],
        purchasedResourceIds: [],
        purchasedCourseIds: [],
        platformPassActive: false,
        createdAt: new Date().toISOString(),
        passwordHash: hashPassword(tempPassword),
      };
      db.users.push(staffUser);
      queueOutboxEmail(
        email,
        name,
        `Appointed Course Admin at ${admin.institutionName || admin.name}`,
        `Temporary password: ${tempPassword}. Sign in to manage assigned courses and live classrooms.`,
        'CREDENTIALS'
      );
      persist();
      res.status(201).json({ staff: toSafeUser(staffUser, null), issuedTempPassword: tempPassword });
    }
  );

  // Academic Prerequisite Verification (Strict Solo Educator vs. Institution Admin ownership!)
  app.post(
    '/api/enrollments/:id/verify',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'MASTER_ADMIN'),
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const enrollment = db.enrollments.find((e) => e.id === req.params.id);
      if (!enrollment) {
        res.status(404).json({ error: 'Enrollment record not found.' });
        return;
      }

      // Enforce Institution Admin vs Solo Educator ownership
      if (actor.role !== 'MASTER_ADMIN') {
        if (enrollment.verifierRoleRequired === 'INSTITUTION_ADMIN') {
          if (actor.role !== 'INSTITUTION_ADMIN' || actor.institutionId !== enrollment.institutionId) {
            res.status(403).json({
              error:
                'Only the Institution Admin of this school can verify learner academic prerequisites.',
            });
            return;
          }
        } else if (actor.role !== 'SOLO_EDUCATOR' || actor.id !== enrollment.ownerId) {
          res.status(403).json({
            error: 'Only the owning Solo Educator can verify academic fitness for this course.',
          });
          return;
        }
      }

      const decision = String(req.body?.decision || '') as 'APPROVED' | 'REJECTED';
      const note = String(req.body?.note || '').trim();
      if (decision !== 'APPROVED' && decision !== 'REJECTED') {
        res.status(400).json({ error: 'Decision must be APPROVED or REJECTED.' });
        return;
      }

      enrollment.academicStatus = decision;
      enrollment.academicNote = note;
      enrollment.verifiedAt = new Date().toISOString();

      const course = db.courses.find((c) => c.id === enrollment.courseId);
      if (decision === 'APPROVED' && course && !course.enrolledLearnerIds.includes(enrollment.learnerId)) {
        course.enrolledLearnerIds.push(enrollment.learnerId);
      }

      logAudit(
        actor,
        `LEARNER_ACADEMIC_${decision}`,
        'ENROLLMENT',
        enrollment.id,
        `${actor.name} marked ${enrollment.learnerName} as ${decision} for ${enrollment.courseTitle}.`
      );
      sendToUser(enrollment.learnerId, 'enrollment:updated', { enrollment });
      persist();
      res.json({ enrollment });
    }
  );

  // Educator updates student grade/notes (excluding confidential info)
  app.post(
    '/api/enrollments/:id/grade',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN'),
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const enrollment = db.enrollments.find((e) => e.id === req.params.id);
      if (!enrollment) {
        res.status(404).json({ error: 'Enrollment not found.' });
        return;
      }
      const authorized =
        enrollment.ownerId === actor.id ||
        (actor.institutionId && enrollment.institutionId === actor.institutionId);
      if (!authorized) {
        res.status(403).json({ error: 'You do not manage this student enrollment.' });
        return;
      }
      if (req.body?.gradeLabel !== undefined) {
        enrollment.gradeLabel = String(req.body.gradeLabel).slice(0, 12);
      }
      if (req.body?.academicNote !== undefined) {
        enrollment.academicNote = String(req.body.academicNote).slice(0, 300);
      }
      persist();
      res.json({ enrollment });
    }
  );

  // ---------------- LEARNER WORKSPACE & MONETIZATION ----------------
  app.get('/api/learner/workspace', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const docs = db.learnerAcademicDocs
      .filter((d) => d.learnerId === user.id)
      .map((d) => ({ ...d, filePath: undefined }));
    const enrollments = db.enrollments.filter((e) => e.learnerId === user.id);
    const transactions = db.ledger.filter((t) => t.buyerId === user.id);
    res.json({
      academicDocs: docs,
      enrollments,
      transactions,
      educationLevels: getPlatformGatewayConfig().educationLevels,
    });
  });

  app.post(
    '/api/learner/academic-docs',
    requireAuth,
    upload.single('document'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      const title = String(req.body?.title || '').trim();
      const educationLevel = String(req.body?.educationLevel || user.educationLevel || 'Undergraduate').trim();
      const institutionIssued = String(req.body?.institutionIssued || '').trim();
      if (!title || !institutionIssued) {
        res.status(400).json({ error: 'Document title and issuing institution are required.' });
        return;
      }

      user.educationLevel = educationLevel;
      const docItem: LearnerAcademicDoc = {
        id: `adoc-${crypto.randomUUID().slice(0, 8)}`,
        learnerId: user.id,
        title,
        educationLevel,
        institutionIssued,
        fileName: req.file?.originalname || `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.pdf`,
        filePath: req.file?.filename,
        uploadedAt: new Date().toISOString(),
      };
      db.learnerAcademicDocs.unshift(docItem);
      persist();
      res.status(201).json({
        doc: { ...docItem, filePath: undefined },
        user: toSafeUser(user, user),
      });
    }
  );

  app.post('/api/learner/follow/:creatorId', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const creator = db.users.find((u) => u.id === req.params.creatorId);
    if (!creator || !isContributorRole(creator.role)) {
      res.status(404).json({ error: 'Educator or institution not found.' });
      return;
    }

    const mode = String(req.body?.mode || 'FREE'); // 'FREE' | 'PAID' | 'UNFOLLOW'
    if (mode === 'UNFOLLOW') {
      user.followingCreatorIds = user.followingCreatorIds.filter((id) => id !== creator.id);
      user.paidFollowCreatorIds = user.paidFollowCreatorIds.filter((id) => id !== creator.id);
      creator.followerIds = creator.followerIds.filter((id) => id !== user.id);
      persist();
      res.json({ user: toSafeUser(user, user) });
      return;
    }

    if (!user.followingCreatorIds.includes(creator.id)) {
      user.followingCreatorIds.push(creator.id);
    }
    if (!creator.followerIds.includes(user.id)) {
      creator.followerIds.push(user.id);
    }

    if (mode === 'PAID' && !user.paidFollowCreatorIds.includes(creator.id)) {
      const gross = creator.followPriceUsd || 10;
      const fee = Number((gross * 0.15).toFixed(2));
      const net = Number((gross - fee).toFixed(2));
      user.paidFollowCreatorIds.push(creator.id);
      db.ledger.unshift({
        id: `tx-${crypto.randomUUID().slice(0, 8)}`,
        buyerId: user.id,
        buyerName: user.name,
        sellerId: creator.id,
        sellerName: creator.name,
        itemType: 'PAID_FOLLOW',
        itemTitle: `Paid Follow Membership — ${creator.name}`,
        grossUsd: gross,
        platformFeeUsd: fee,
        creatorNetUsd: net,
        timestamp: new Date().toISOString(),
      });
    }

    persist();
    res.json({ user: toSafeUser(user, user) });
  });

  app.post('/api/learner/purchase', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const kind = String(req.body?.kind || ''); // 'PLATFORM_PASS' | 'RESOURCE' | 'COURSE'
    const targetId = String(req.body?.targetId || '');

    if (kind === 'PLATFORM_PASS') {
      user.platformPassActive = true;
      user.subscriptionPlan = 'AKADEMI_PASS';
      user.subscriptionStatus = 'ACTIVE';
      db.ledger.unshift({
        id: `tx-${crypto.randomUUID().slice(0, 8)}`,
        buyerId: user.id,
        buyerName: user.name,
        itemType: 'PLATFORM_PASS',
        itemTitle: 'Akademi Pass — Monthly Resource Access',
        grossUsd: 15,
        platformFeeUsd: 15,
        creatorNetUsd: 0,
        timestamp: new Date().toISOString(),
      });
      persist();
      res.json({ user: toSafeUser(user, user) });
      return;
    }

    if (kind === 'RESOURCE') {
      const item = db.resources.find((r) => r.id === targetId);
      if (!item) {
        res.status(404).json({ error: 'Resource not found.' });
        return;
      }
      if (!user.purchasedResourceIds.includes(item.id)) {
        const gross = item.priceUsd || 10;
        const fee = Number((gross * 0.15).toFixed(2));
        const net = Number((gross - fee).toFixed(2));
        user.purchasedResourceIds.push(item.id);
        db.ledger.unshift({
          id: `tx-${crypto.randomUUID().slice(0, 8)}`,
          buyerId: user.id,
          buyerName: user.name,
          sellerId: item.ownerId,
          sellerName: item.ownerName,
          itemType: item.type === 'BOOK' ? 'BOOK' : 'COURSE',
          itemTitle: item.title,
          grossUsd: gross,
          platformFeeUsd: fee,
          creatorNetUsd: net,
          timestamp: new Date().toISOString(),
        });
      }
      persist();
      res.json({ user: toSafeUser(user, user) });
      return;
    }

    if (kind === 'COURSE') {
      const course = db.courses.find((c) => c.id === targetId);
      if (!course) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      if (!user.purchasedCourseIds.includes(course.id)) {
        const gross = course.priceUsd || 25;
        const fee = Number((gross * 0.15).toFixed(2));
        const net = Number((gross - fee).toFixed(2));
        user.purchasedCourseIds.push(course.id);
        db.ledger.unshift({
          id: `tx-${crypto.randomUUID().slice(0, 8)}`,
          buyerId: user.id,
          buyerName: user.name,
          sellerId: course.ownerId,
          sellerName: course.ownerName,
          itemType: 'COURSE',
          itemTitle: course.title,
          grossUsd: gross,
          platformFeeUsd: fee,
          creatorNetUsd: net,
          timestamp: new Date().toISOString(),
        });
      }
      persist();
      res.json({ user: toSafeUser(user, user) });
      return;
    }

    res.status(400).json({ error: 'Unsupported purchase kind.' });
  });

  app.post('/api/courses/:id/enroll', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const course = db.courses.find((c) => c.id === req.params.id);
    if (!course) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }

    const existing = db.enrollments.find(
      (e) => e.courseId === course.id && e.learnerId === user.id
    );
    if (existing) {
      res.json({ enrollment: existing });
      return;
    }

    if (course.accessTier === 'PAID_SINGLE' && course.priceUsd > 0 && !user.purchasedCourseIds.includes(course.id)) {
      res.status(402).json({ error: 'Please purchase this course before requesting enrollment.' });
      return;
    }

    const docs = db.learnerAcademicDocs.filter((d) => d.learnerId === user.id);
    if (course.requiresAcademicVerification && docs.length === 0) {
      res.status(400).json({
        error: 'Upload at least one academic certificate or transcript in your Academic Vault first.',
      });
      return;
    }

    const verifierRoleRequired = course.institutionId ? 'INSTITUTION_ADMIN' : 'SOLO_EDUCATOR';
    const academicStatus = course.requiresAcademicVerification ? 'PENDING' : 'APPROVED';

    const enrollment: EnrollmentRecord = {
      id: `enr-${crypto.randomUUID().slice(0, 8)}`,
      courseId: course.id,
      courseTitle: course.title,
      learnerId: user.id,
      learnerName: user.name,
      learnerDeclaredLevel: user.educationLevel || 'Undergraduate',
      ownerId: course.ownerId,
      institutionId: course.institutionId,
      verifierRoleRequired,
      academicStatus,
      progressPercent: 0,
      completedResourceIds: [],
      attendanceMinutes: 0,
      requestedAt: new Date().toISOString(),
      verifiedAt: academicStatus === 'APPROVED' ? new Date().toISOString() : undefined,
    };

    db.enrollments.unshift(enrollment);
    if (academicStatus === 'APPROVED' && !course.enrolledLearnerIds.includes(user.id)) {
      course.enrolledLearnerIds.push(user.id);
    }

    // Auto-create enrollment communication thread between learner and verifier
    const verifierUser = db.users.find((u) => u.id === course.ownerId);
    if (verifierUser) {
      db.messageThreads.unshift({
        id: `thr-${crypto.randomUUID().slice(0, 8)}`,
        contextType: 'ENROLLMENT_CHECK',
        contextId: enrollment.id,
        contextTitle: `${course.title} — Prerequisite Review`,
        participantIds: [verifierUser.id, user.id],
        participantNames: {
          [verifierUser.id]: verifierUser.institutionName || verifierUser.name,
          [user.id]: user.name,
        },
        messages: [
          {
            id: `dm-${crypto.randomUUID().slice(0, 8)}`,
            senderId: user.id,
            senderName: user.name,
            senderRole: user.role,
            body: `Requested enrollment for "${course.title}". Declared level: ${enrollment.learnerDeclaredLevel}.`,
            timestamp: new Date().toISOString(),
          },
        ],
      });
    }

    persist();
    res.status(201).json({ enrollment });
  });

  app.post('/api/learner/progress', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const courseId = String(req.body?.courseId || '');
    const resourceId = String(req.body?.resourceId || '');
    const enrollment = db.enrollments.find(
      (e) => e.courseId === courseId && e.learnerId === user.id && e.academicStatus === 'APPROVED'
    );
    const course = db.courses.find((c) => c.id === courseId);
    if (!enrollment || !course) {
      res.status(404).json({ error: 'Approved enrollment not found.' });
      return;
    }
    if (!enrollment.completedResourceIds.includes(resourceId)) {
      enrollment.completedResourceIds.push(resourceId);
    }
    const total = Math.max(1, course.resourceIds.length);
    enrollment.progressPercent = Math.min(
      100,
      Math.round((enrollment.completedResourceIds.length / total) * 100)
    );
    persist();
    res.json({ enrollment });
  });

  // ---------------- SECURE FILE DELIVERY ----------------
  app.get('/api/files/resource/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const item = db.resources.find((r) => r.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Resource not found.' });
      return;
    }
    if (!canUserAccessResource(user, item)) {
      res.status(403).json({ error: 'Access denied. Entitlement or course approval required.' });
      return;
    }
    item.viewsCount += 1;
    if (req.query.download === '1' && item.downloadable) {
      item.downloadsCount += 1;
    }
    persist();

    if (item.filePath) {
      const resolved = path.resolve(UPLOAD_DIR, item.filePath);
      if (!resolved.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(resolved)) {
        res.status(404).json({ error: 'File payload missing from vault.' });
        return;
      }
      if (req.query.download === '1' && item.downloadable) {
        res.download(resolved, item.fileName);
        return;
      }
      res.sendFile(resolved);
      return;
    }

    // Serve clean formatted study document for seeded materials
    const content = [
      `AKADEMI BY NOVIC TECHNOLOGIES — VERIFIED RESOURCE`,
      `==================================================`,
      `Title: ${item.title}`,
      `Author / Institution: ${item.ownerName}`,
      `Subject: ${item.subject} | Level: ${item.educationLevel}`,
      `Type: ${item.type} | File: ${item.fileName}`,
      ``,
      `Summary & Study Outline:`,
      item.previewSummary,
      ``,
      `Description:`,
      item.description,
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (req.query.download === '1' && item.downloadable) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${item.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}.txt"`
      );
    }
    res.send(content);
  });

  app.get('/api/files/kyc/:id/:kind', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const kyc = db.kycSubmissions.find((k) => k.id === req.params.id);
    if (!kyc) {
      res.status(404).json({ error: 'Verification record not found.' });
      return;
    }
    if (user.role !== 'MASTER_ADMIN' && user.id !== kyc.userId) {
      res.status(403).json({ error: 'Confidential identity documents are restricted.' });
      return;
    }
    if (user.role === 'MASTER_ADMIN') {
      logAudit(user, 'KYC_DOC_INSPECTED', 'KYC', kyc.id, `Viewed ${req.params.kind} file for ${kyc.userName}.`);
      persist();
    }
    const relPath = req.params.kind === 'credential' ? kyc.credentialFilePath : kyc.idFilePath;
    const fileName = req.params.kind === 'credential' ? kyc.credentialFileName : kyc.idFileName;
    if (relPath) {
      const resolved = path.resolve(UPLOAD_DIR, relPath);
      if (resolved.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(resolved)) {
        if (req.query.download === '1') {
          res.download(resolved, fileName);
          return;
        }
        res.sendFile(resolved);
        return;
      }
    }
    const applicant = db.users.find((u) => u.id === kyc.userId);
    res.type('text/plain').send(
      [
        `AKADEMI COMPLIANCE VERIFICATION RECORD (${kyc.id})`,
        `==================================================`,
        `Applicant: ${kyc.userName} (${kyc.userEmail})`,
        `Role / Category: ${kyc.role} · ${kyc.accountCategory || 'N/A'}`,
        `Country / System: ${applicant?.country || 'N/A'} · ${applicant?.educationSystem || 'N/A'}`,
        `Specialization: ${applicant?.specialization || 'N/A'}`,
        `Phone: ${applicant?.phone || 'N/A'}`,
        `Address: ${applicant?.homeAddress || 'N/A'}`,
        `Document Type: ${kyc.documentType}`,
        `Document Reference: ${applicant?.nationalIdNumber || kyc.documentNumberMasked}`,
        `Submitted Filename: ${fileName}`,
        `Submitted At: ${new Date(kyc.submittedAt).toLocaleString()}`,
        `Status: ${kyc.status}`,
        kyc.reviewNotes ? `Review Notes: ${kyc.reviewNotes}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  });

  app.get('/api/files/academic-doc/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const doc = db.learnerAcademicDocs.find((d) => d.id === req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Academic document not found.' });
      return;
    }
    const isAdminOrVerifier =
      user.role === 'MASTER_ADMIN' ||
      user.id === doc.learnerId ||
      db.enrollments.some(
        (e) =>
          e.learnerId === doc.learnerId &&
          (e.ownerId === user.id || (user.institutionId && e.institutionId === user.institutionId))
      );

    if (!isAdminOrVerifier) {
      res.status(403).json({ error: 'Access denied to this learner academic record.' });
      return;
    }

    if (user.role !== 'LEARNER') {
      logAudit(
        user,
        'ACADEMIC_DOC_INSPECTED',
        'USER',
        doc.learnerId,
        `${user.name} inspected academic document "${doc.title}".`
      );
      persist();
    }

    if (doc.filePath) {
      const resolved = path.resolve(UPLOAD_DIR, doc.filePath);
      if (resolved.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(resolved)) {
        if (req.query.download === '1') {
          res.download(resolved, doc.fileName);
          return;
        }
        res.sendFile(resolved);
        return;
      }
    }

    const learner = db.users.find((u) => u.id === doc.learnerId);
    res.type('text/plain').send(
      [
        `AKADEMI LEARNER ACADEMIC CREDENTIAL (${doc.id})`,
        `==================================================`,
        `Document Title: ${doc.title}`,
        `Learner: ${learner?.name || 'Learner'}${user.role === 'MASTER_ADMIN' && learner?.email ? ` (${learner.email})` : ''}`,
        `Education Level: ${doc.educationLevel}`,
        `Issuing Institution / Board: ${doc.institutionIssued}`,
        `Filename: ${doc.fileName}`,
        `Uploaded At: ${new Date(doc.uploadedAt).toLocaleString()}`,
      ].join('\n')
    );
  });

  // ---------------- LIVE SESSIONS ----------------
  app.post(
    '/api/sessions',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      if (user.kycStatus !== 'VERIFIED' || user.subscriptionStatus !== 'ACTIVE') {
        res.status(403).json({
          error: 'Live session hosting requires Verified KYC and an Active subscription.',
        });
        return;
      }
      const courseId = String(req.body?.courseId || '');
      const course = db.courses.find((c) => c.id === courseId);
      if (!course) {
        res.status(404).json({ error: 'Target course not found.' });
        return;
      }
      const title = String(req.body?.title || '').trim();
      const topicSummary = String(req.body?.topicSummary || '').trim();
      const scheduledAt = String(req.body?.scheduledAt || new Date().toISOString());
      const durationMinutes = Math.max(15, Number(req.body?.durationMinutes || 60));
      const accessRule = String(req.body?.accessRule || 'ENROLLED_ONLY') as LiveSession['accessRule'];
      const pinnedResourceIds = Array.isArray(req.body?.pinnedResourceIds)
        ? req.body.pinnedResourceIds.map(String)
        : [];

      if (!title) {
        res.status(400).json({ error: 'Session title is required.' });
        return;
      }

      const session: LiveSession = {
        id: `live-${crypto.randomUUID().slice(0, 8)}`,
        courseId: course.id,
        courseTitle: course.title,
        hostId: user.id,
        hostName: user.institutionName ? `${user.name} (${user.institutionName})` : user.name,
        institutionId: user.institutionId,
        title,
        topicSummary: topicSummary || `Live class for ${course.title}`,
        scheduledAt,
        durationMinutes,
        accessRule,
        status: req.body?.startImmediately ? 'LIVE' : 'SCHEDULED',
        chatMuted: false,
        qaMode: false,
        pinnedResourceIds,
        raisedHandUserIds: [],
        micGrantedUserIds: [],
        activeParticipantIds: req.body?.startImmediately ? [user.id] : [],
        kickedUserIds: [],
        attendanceLog: {},
        chatMessages: [],
      };

      db.liveSessions.unshift(session);
      persist();
      res.status(201).json({ session });
    }
  );

  app.post(
    '/api/sessions/:id/status',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN', 'MASTER_ADMIN'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      const session = db.liveSessions.find((s) => s.id === req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found.' });
        return;
      }
      const isAuthorized =
        user.role === 'MASTER_ADMIN' ||
        session.hostId === user.id ||
        (user.institutionId && session.institutionId === user.institutionId);
      if (!isAuthorized) {
        res.status(403).json({ error: 'Only the session host or institution admin can control status.' });
        return;
      }
      const status = String(req.body?.status || 'LIVE') as LiveSession['status'];
      session.status = status;
      persist();
      broadcastToSession(session.id, 'session:status', { status });
      res.json({ session });
    }
  );

  app.get('/api/sessions/:id/room', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const session = db.liveSessions.find((s) => s.id === req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Live session not found.' });
      return;
    }
    const access = canUserJoinSession(user, session);
    if (!access.allowed) {
      res.status(403).json({ error: access.reason || 'Access denied to live session.' });
      return;
    }

    // Record attendance
    if (user.role === 'LEARNER') {
      if (!session.attendanceLog[user.id]) {
        session.attendanceLog[user.id] = {
          name: user.name,
          joinedAt: new Date().toISOString(),
          minutes: 1,
        };
      }
      const enrollment = db.enrollments.find(
        (e) => e.courseId === session.courseId && e.learnerId === user.id
      );
      if (enrollment) {
        enrollment.attendanceMinutes += 5;
      }
      persist();
    }

    const pinnedResources = db.resources
      .filter((r) => session.pinnedResourceIds.includes(r.id))
      .map((r) => ({ ...r, filePath: undefined }));

    const participantDirectory: Record<string, { id: string; name: string; role: UserRole }> = {};
    for (const pid of session.activeParticipantIds) {
      const pu = db.users.find((u) => u.id === pid);
      if (pu) participantDirectory[pid] = { id: pu.id, name: pu.name, role: pu.role };
    }

    res.json({
      session,
      pinnedResources,
      participantDirectory,
    });
  });

  // ---------------- IN-SYSTEM COMMUNICATION ----------------
  app.get('/api/communication/inbox', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const tickets =
      user.role === 'MASTER_ADMIN'
        ? db.tickets
        : db.tickets.filter((t) => t.userId === user.id);

    const threads =
      user.role === 'MASTER_ADMIN'
        ? db.messageThreads
        : db.messageThreads.filter((t) => t.participantIds.includes(user.id));

    res.json({ tickets, threads });
  });

  app.post('/api/tickets', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const subject = String(req.body?.subject || '').trim();
    const category = String(req.body?.category || 'GENERAL') as SupportTicket['category'];
    const body = String(req.body?.body || '').trim();
    if (!subject || !body) {
      res.status(400).json({ error: 'Ticket subject and message are required.' });
      return;
    }

    const ticket: SupportTicket = {
      id: `tkt-${crypto.randomUUID().slice(0, 8)}`,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      category,
      subject,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      messages: [
        {
          id: `tktm-${crypto.randomUUID().slice(0, 8)}`,
          senderId: user.id,
          senderName: user.name,
          senderRole: user.role,
          body,
          timestamp: new Date().toISOString(),
        },
      ],
    };
    db.tickets.unshift(ticket);
    persist();
    res.status(201).json({ ticket });
  });

  app.post('/api/tickets/:id/reply', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const ticket = db.tickets.find((t) => t.id === req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }
    if (user.role !== 'MASTER_ADMIN' && ticket.userId !== user.id) {
      res.status(403).json({ error: 'Access denied to this support ticket.' });
      return;
    }
    const body = String(req.body?.body || '').trim();
    if (!body) {
      res.status(400).json({ error: 'Reply message cannot be empty.' });
      return;
    }
    ticket.messages.push({
      id: `tktm-${crypto.randomUUID().slice(0, 8)}`,
      senderId: user.id,
      senderName: user.name,
      senderRole: user.role,
      body,
      timestamp: new Date().toISOString(),
    });
    if (user.role === 'MASTER_ADMIN' && req.body?.status) {
      ticket.status = req.body.status;
    } else if (user.role === 'MASTER_ADMIN' && ticket.status === 'OPEN') {
      ticket.status = 'IN_REVIEW';
    }
    persist();
    res.json({ ticket });
  });

  app.post('/api/messages/thread', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const recipientId = String(req.body?.recipientId || '');
    const contextTitle = String(req.body?.contextTitle || 'Academic Inquiry').trim();
    const contextType = String(req.body?.contextType || 'COURSE_QA') as DirectMessageThread['contextType'];
    const body = String(req.body?.body || '').trim();

    const recipient = db.users.find((u) => u.id === recipientId);
    if (!recipient || !body) {
      res.status(400).json({ error: 'Valid recipient and message are required.' });
      return;
    }

    const thread: DirectMessageThread = {
      id: `thr-${crypto.randomUUID().slice(0, 8)}`,
      contextType,
      contextId: String(req.body?.contextId || 'general'),
      contextTitle,
      participantIds: [user.id, recipient.id],
      participantNames: {
        [user.id]: user.institutionName || user.name,
        [recipient.id]: recipient.institutionName || recipient.name,
      },
      messages: [
        {
          id: `dm-${crypto.randomUUID().slice(0, 8)}`,
          senderId: user.id,
          senderName: user.name,
          senderRole: user.role,
          body,
          timestamp: new Date().toISOString(),
        },
      ],
    };
    db.messageThreads.unshift(thread);
    persist();
    res.status(201).json({ thread });
  });

  app.post('/api/messages/:id/reply', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const thread = db.messageThreads.find((t) => t.id === req.params.id);
    if (!thread) {
      res.status(404).json({ error: 'Thread not found.' });
      return;
    }
    if (user.role !== 'MASTER_ADMIN' && !thread.participantIds.includes(user.id)) {
      res.status(403).json({ error: 'Not a participant in this thread.' });
      return;
    }
    const body = String(req.body?.body || '').trim();
    if (!body) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }
    thread.messages.push({
      id: `dm-${crypto.randomUUID().slice(0, 8)}`,
      senderId: user.id,
      senderName: user.name,
      senderRole: user.role,
      body,
      timestamp: new Date().toISOString(),
    });
    persist();
    res.json({ thread });
  });

  // ---------------- HTTP + WEBSOCKET SERVER ----------------
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const token = url.searchParams.get('token') || '';
    const parsed = verifyToken(token);
    if (!parsed) {
      ws.close(4001, 'Unauthorized');
      return;
    }
    const user = db.users.find((u) => u.id === parsed.uid);
    if (!user) {
      ws.close(4001, 'User not found');
      return;
    }

    const client: ConnectedSocket = { ws, userId: user.id, role: user.role };
    connectedSockets.add(client);

    ws.on('message', (raw) => {
      let data: { event?: string; payload?: Record<string, unknown> };
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const event = data.event;
      const payload = data.payload || {};

      if (event === 'session:join') {
        const sessionId = String(payload.sessionId || '');
        const session = db.liveSessions.find((s) => s.id === sessionId);
        const freshUser = db.users.find((u) => u.id === client.userId);
        if (!session || !freshUser) return;
        const access = canUserJoinSession(freshUser, session);
        if (!access.allowed) {
          ws.send(JSON.stringify({ event: 'session:error', payload: { error: access.reason } }));
          return;
        }
        client.sessionId = sessionId;
        if (!session.activeParticipantIds.includes(freshUser.id)) {
          session.activeParticipantIds.push(freshUser.id);
        }
        persist();
        const participantDirectory: Record<string, { id: string; name: string; role: UserRole }> = {};
        for (const pid of session.activeParticipantIds) {
          const pu = db.users.find((u) => u.id === pid);
          if (pu) participantDirectory[pid] = { id: pu.id, name: pu.name, role: pu.role };
        }
        broadcastToSession(sessionId, 'session:presence', {
          activeParticipantIds: session.activeParticipantIds,
          participantDirectory,
        });
      }

      if (event === 'session:chat' && client.sessionId) {
        const session = db.liveSessions.find((s) => s.id === client.sessionId);
        const freshUser = db.users.find((u) => u.id === client.userId);
        if (!session || !freshUser) return;
        const isHost =
          freshUser.id === session.hostId ||
          freshUser.role === 'MASTER_ADMIN' ||
          (freshUser.institutionId && session.institutionId === freshUser.institutionId);
        if (session.chatMuted && !isHost) {
          ws.send(
            JSON.stringify({
              event: 'session:error',
              payload: { error: 'Chat is currently muted by the host.' },
            })
          );
          return;
        }
        const text = String(payload.text || '').trim().slice(0, 600);
        if (!text) return;
        const msgId = String(payload.id || `msg-${crypto.randomUUID().slice(0, 8)}`);
        if (session.chatMessages.some((m) => m.id === msgId)) return;

        const message: LiveChatMessage = {
          id: msgId,
          senderId: freshUser.id,
          senderName: freshUser.name,
          senderRole: freshUser.role,
          text,
          isQuestion: Boolean(payload.isQuestion || session.qaMode),
          approvedForQa: isHost || !session.qaMode,
          timestamp: new Date().toISOString(),
        };
        session.chatMessages.push(message);
        persist();
        broadcastToSession(session.id, 'session:chat_message', { message });
      }

      if (event === 'session:raise_hand' && client.sessionId) {
        const session = db.liveSessions.find((s) => s.id === client.sessionId);
        if (!session) return;
        const raised = Boolean(payload.raised);
        if (raised && !session.raisedHandUserIds.includes(client.userId)) {
          session.raisedHandUserIds.push(client.userId);
        } else if (!raised) {
          session.raisedHandUserIds = session.raisedHandUserIds.filter((id) => id !== client.userId);
        }
        persist();
        broadcastToSession(session.id, 'session:hands', {
          raisedHandUserIds: session.raisedHandUserIds,
          micGrantedUserIds: session.micGrantedUserIds,
        });
      }

      if (event === 'session:moderate' && client.sessionId) {
        const session = db.liveSessions.find((s) => s.id === client.sessionId);
        const freshUser = db.users.find((u) => u.id === client.userId);
        if (!session || !freshUser) return;
        const isHost =
          freshUser.id === session.hostId ||
          freshUser.role === 'MASTER_ADMIN' ||
          (freshUser.institutionId && session.institutionId === freshUser.institutionId);
        if (!isHost) return;

        const action = String(payload.action || '');
        if (action === 'TOGGLE_MUTE') {
          session.chatMuted = !session.chatMuted;
          broadcastToSession(session.id, 'session:controls', {
            chatMuted: session.chatMuted,
            qaMode: session.qaMode,
          });
        } else if (action === 'TOGGLE_QA') {
          session.qaMode = !session.qaMode;
          broadcastToSession(session.id, 'session:controls', {
            chatMuted: session.chatMuted,
            qaMode: session.qaMode,
          });
        } else if (action === 'GRANT_MIC') {
          const targetId = String(payload.targetUserId || '');
          if (session.micGrantedUserIds.includes(targetId)) {
            session.micGrantedUserIds = session.micGrantedUserIds.filter((id) => id !== targetId);
          } else {
            session.micGrantedUserIds.push(targetId);
            session.raisedHandUserIds = session.raisedHandUserIds.filter((id) => id !== targetId);
          }
          broadcastToSession(session.id, 'session:hands', {
            raisedHandUserIds: session.raisedHandUserIds,
            micGrantedUserIds: session.micGrantedUserIds,
          });
        } else if (action === 'DELETE_MESSAGE') {
          const messageId = String(payload.messageId || '');
          session.chatMessages = session.chatMessages.filter((m) => m.id !== messageId);
          broadcastToSession(session.id, 'session:message_deleted', { messageId });
        } else if (action === 'KICK_USER') {
          const targetId = String(payload.targetUserId || '');
          if (!session.kickedUserIds.includes(targetId)) {
            session.kickedUserIds.push(targetId);
          }
          session.activeParticipantIds = session.activeParticipantIds.filter((id) => id !== targetId);
          sendToUser(targetId, 'session:kicked', { sessionId: session.id });
          broadcastToSession(session.id, 'session:presence', {
            activeParticipantIds: session.activeParticipantIds,
          });
        } else if (action === 'PIN_RESOURCE') {
          const resourceId = String(payload.resourceId || '');
          const resObj = db.resources.find((r) => r.id === resourceId);
          if (resObj && !session.pinnedResourceIds.includes(resourceId)) {
            session.pinnedResourceIds.push(resourceId);
          }
          const course = db.courses.find((c) => c.id === session.courseId);
          if (course && resourceId && !course.resourceIds.includes(resourceId)) {
            course.resourceIds.push(resourceId);
          }
          const pinnedResources = db.resources
            .filter((r) => session.pinnedResourceIds.includes(r.id))
            .map((r) => ({ ...r, filePath: undefined }));
          broadcastToSession(session.id, 'session:pinned_resources', { pinnedResources });
        }
        persist();
      }
    });

    ws.on('close', () => {
      connectedSockets.delete(client);
      if (client.sessionId) {
        const session = db.liveSessions.find((s) => s.id === client.sessionId);
        if (session) {
          session.activeParticipantIds = session.activeParticipantIds.filter(
            (id) => id !== client.userId
          );
          persist();
          broadcastToSession(session.id, 'session:presence', {
            activeParticipantIds: session.activeParticipantIds,
          });
        }
      }
    });
  });

  // Vite integration in development, static dist in production
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Akademi server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
