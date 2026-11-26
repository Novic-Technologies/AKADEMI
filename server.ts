import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import http from 'http';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import { buildCertificatePdfBuffer, buildPdfDocumentBuffer } from './server/pdf.ts';
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
  BoardPointerState,
  CertificateRecord,
  CourseItem,
  CourseQaReply,
  CourseQaThread,
  DirectMessageThread,
  EnrollmentRecord,
  KycSubmission,
  LearnerAcademicDoc,
  LiveChatMessage,
  LivePoll,
  LiveSession,
  MasterAnalyticsSummary,
  PublicFeaturedCreator,
  PublicFeaturedResource,
  PublicFeaturedSeminar,
  QuizAttempt,
  QuizCurriculumTag,
  QuizItem,
  QuizQuestion,
  QuizQuestionResult,
  ResourceItem,
  ResourceType,
  SupportTicket,
  UserProfile,
  UserRole,
  WhiteboardStroke,
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

function canManageCourse(actor: StoredUser, course: CourseItem): boolean {
  return (
    actor.role === 'MASTER_ADMIN' ||
    course.ownerId === actor.id ||
    course.assignedInstructorId === actor.id ||
    Boolean(actor.institutionId && course.institutionId === actor.institutionId)
  );
}

function canAccessCourseFeatures(user: StoredUser, course: CourseItem): boolean {
  if (canManageCourse(user, course)) return true;
  if (course.enrolledLearnerIds.includes(user.id)) return true;
  if (user.purchasedCourseIds.includes(course.id)) return true;
  return db.enrollments.some(
    (e) => e.courseId === course.id && e.learnerId === user.id && e.academicStatus === 'APPROVED'
  );
}

function gradeToLabel(percent: number): string {
  if (percent >= 85) return 'A';
  if (percent >= 80) return 'A-';
  if (percent >= 75) return 'B+';
  if (percent >= 70) return 'B';
  if (percent >= 60) return 'C+';
  if (percent >= 50) return 'C';
  if (percent >= 40) return 'D';
  return 'F';
}

function recalculateEnrollmentProgress(course: CourseItem, enrollment: EnrollmentRecord): number {
  const publishedQuizzes = db.quizzes.filter((q) => q.courseId === course.id && q.published);
  const totalUnits = course.resourceIds.length + publishedQuizzes.length;
  if (totalUnits <= 0) return enrollment.progressPercent || 0;

  const doneResources = enrollment.completedResourceIds.filter((rid) =>
    course.resourceIds.includes(rid)
  ).length;

  const passedQuizIds = new Set(
    db.quizAttempts
      .filter((a) => a.courseId === course.id && a.learnerId === enrollment.learnerId && a.passed)
      .map((a) => a.quizId)
  );

  const doneQuizzes = publishedQuizzes.filter((q) => passedQuizIds.has(q.id)).length;
  return Math.min(100, Math.round(((doneResources + doneQuizzes) / totalUnits) * 100));
}

function ensureCertificateForEnrollment(
  enrollment: EnrollmentRecord,
  course?: CourseItem
): CertificateRecord | null {
  if (enrollment.academicStatus !== 'APPROVED' || enrollment.progressPercent < 100) {
    return null;
  }
  const existing = db.certificates.find(
    (c) =>
      c.enrollmentId === enrollment.id ||
      (c.courseId === enrollment.courseId && c.learnerId === enrollment.learnerId)
  );
  if (existing) {
    enrollment.certificateId = existing.id;
    enrollment.certificateCode = existing.certificateCode;
    return existing;
  }

  const targetCourse = course || db.courses.find((c) => c.id === enrollment.courseId);
  const owner = db.users.find((u) => u.id === enrollment.ownerId);
  const year = new Date().getFullYear();
  let code = '';
  do {
    code = `AKD-${year}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  } while (db.certificates.some((c) => c.certificateCode === code));

  const cert: CertificateRecord = {
    id: `cert-${crypto.randomUUID().slice(0, 8)}`,
    certificateCode: code,
    enrollmentId: enrollment.id,
    courseId: enrollment.courseId,
    courseTitle: targetCourse?.title || enrollment.courseTitle,
    subject: targetCourse?.subject || 'Academic Studies',
    educationLevel: targetCourse?.requiredLevel || enrollment.learnerDeclaredLevel,
    learnerId: enrollment.learnerId,
    learnerName: enrollment.learnerName,
    issuerId: enrollment.ownerId,
    issuerName: owner?.name || targetCourse?.ownerName || 'Akademi Faculty',
    institutionName: targetCourse?.institutionName || owner?.institutionName,
    gradeLabel: enrollment.gradeLabel || 'Pass',
    attendanceMinutes: enrollment.attendanceMinutes,
    issuedAt: new Date().toISOString(),
  };

  db.certificates.unshift(cert);
  enrollment.certificateId = cert.id;
  enrollment.certificateCode = cert.certificateCode;
  sendToUser(enrollment.learnerId, 'certificate:issued', { certificate: cert, enrollment });
  return cert;
}

function extractCourseMentions(text: string, course: CourseItem): string[] {
  const candidates = new Map<string, StoredUser>();
  for (const u of db.users) {
    if (
      u.id === course.ownerId ||
      u.id === course.assignedInstructorId ||
      (course.institutionId && u.institutionId === course.institutionId) ||
      course.enrolledLearnerIds.includes(u.id) ||
      db.enrollments.some((e) => e.courseId === course.id && e.learnerId === u.id && e.academicStatus === 'APPROVED')
    ) {
      candidates.set(u.id, u);
    }
  }
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const u of candidates.values()) {
    const fullHandle = `@${u.name.toLowerCase()}`;
    const firstToken = `@${u.name.split(/\s+/)[0].toLowerCase()}`;
    const compactHandle = `@${u.name.toLowerCase().replace(/\s+/g, '')}`;
    if (
      lower.includes(fullHandle) ||
      (firstToken.length > 3 && lower.includes(firstToken)) ||
      lower.includes(compactHandle)
    ) {
      matched.push(u.name);
    }
  }
  return matched;
}

function buildLiveKitToken(apiKey: string, apiSecret: string, roomName: string, user: StoredUser, canPublish: boolean): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: apiKey,
      sub: user.id,
      name: user.name,
      nbf: now - 10,
      exp: now + 3600 * 4,
      video: {
        room: roomName,
        roomJoin: true,
        canPublish,
        canSubscribe: true,
        canPublishData: true,
      },
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', apiSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function canAttachResource(actor: StoredUser, res: ResourceItem): boolean {
  return (
    actor.role === 'MASTER_ADMIN' ||
    res.accessTier === 'PUBLIC_FREE' ||
    res.ownerId === actor.id ||
    Boolean(actor.institutionId && res.institutionId === actor.institutionId)
  );
}

function filterAttachableResourceIds(actor: StoredUser, ids: string[]): string[] {
  const unique = Array.from(new Set(ids.map(String)));
  return unique.filter((id) => {
    const resObj = db.resources.find((r) => r.id === id);
    return Boolean(resObj && canAttachResource(actor, resObj));
  });
}

function sanitizeSafeExternalUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function isActiveMarkupFile(fileName: string): boolean {
  const ext = path.extname(fileName || '').toLowerCase();
  return ['.html', '.htm', '.svg', '.xhtml', '.xml'].includes(ext);
}

const DOC_ONLY_EXTS = ['.pdf', '.doc', '.docx', '.odt', '.rtf'];
const SCAN_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];
const CREDENTIAL_DOC_EXTS = [...DOC_ONLY_EXTS, ...SCAN_IMAGE_EXTS];
const ID_SCAN_EXTS = ['.pdf', ...SCAN_IMAGE_EXTS];
const BOOK_DOC_EXTS = ['.pdf', '.docx', '.epub'];
const VIDEO_MEDIA_EXTS = ['.mp4', '.webm', '.mov', '.m4v'];

function allowedExtensionsForResourceType(type: ResourceType): string[] {
  switch (type) {
    case 'PDF':
      return ['.pdf'];
    case 'DOCX':
      return ['.docx', '.doc', '.odt', '.rtf', '.pdf'];
    case 'BOOK':
      return BOOK_DOC_EXTS;
    case 'IMAGE':
      return SCAN_IMAGE_EXTS;
    case 'VIDEO':
      return VIDEO_MEDIA_EXTS;
    default:
      return DOC_ONLY_EXTS;
  }
}

function verifyUploadedFileSignature(
  file: Express.Multer.File,
  allowedExts: string[]
): { ok: true; ext: string } | { ok: false; error: string } {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ext || !allowedExts.includes(ext)) {
    return {
      ok: false,
      error: `Unsupported file format "${ext || 'unknown'}". Plain text or markup files are not permitted; upload a verified document (${allowedExts.join(', ')}).`,
    };
  }
  try {
    const fd = fs.openSync(file.path, 'r');
    const head = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    if (bytesRead < 4) {
      return { ok: false, error: 'Uploaded file appears empty or corrupted.' };
    }
    const ascii4 = head.subarray(0, 4).toString('latin1');
    const ascii5 = head.subarray(0, 5).toString('latin1');
    const isZip = head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05);
    const isOle = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
    const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    const isWebp =
      head.subarray(0, 4).toString('latin1') === 'RIFF' &&
      head.subarray(8, 12).toString('latin1') === 'WEBP';
    const isMp4 = head.subarray(4, 8).toString('latin1') === 'ftyp';
    const isWebm = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;

    let validSignature = false;
    if (ext === '.pdf') validSignature = ascii4 === '%PDF';
    else if (ext === '.docx' || ext === '.odt' || ext === '.epub') validSignature = isZip;
    else if (ext === '.doc') validSignature = isOle || isZip;
    else if (ext === '.rtf') validSignature = ascii5.startsWith('{\\rtf');
    else if (ext === '.png') validSignature = isPng;
    else if (ext === '.jpg' || ext === '.jpeg') validSignature = isJpeg;
    else if (ext === '.webp') validSignature = isWebp;
    else if (ext === '.mp4' || ext === '.mov' || ext === '.m4v') validSignature = isMp4;
    else if (ext === '.webm') validSignature = isWebm;

    if (!validSignature) {
      return {
        ok: false,
        error: `The uploaded file "${file.originalname}" does not match a genuine ${ext.toUpperCase()} document signature.`,
      };
    }
    return { ok: true, ext };
  } catch {
    return { ok: false, error: 'Failed to inspect uploaded document file.' };
  }
}

function getDocumentMimeType(fileName: string, fallbackMime?: string): string {
  const ext = path.extname(fileName || '').toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.odt': 'application/vnd.oasis.opendocument.text',
    '.rtf': 'application/rtf',
    '.epub': 'application/epub+zip',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v',
  };
  return map[ext] || fallbackMime || 'application/octet-stream';
}

function sendDiskDocument(
  res: Response,
  resolvedPath: string,
  fileName: string,
  forceDownload: boolean,
  storedMime?: string
) {
  const safeName = (fileName || 'document.pdf').replace(/["\r\n]/g, '_');
  const mime = getDocumentMimeType(safeName, storedMime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', mime);
  if (forceDownload || isActiveMarkupFile(safeName)) {
    res.download(resolvedPath, safeName);
    return;
  }
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.sendFile(resolvedPath);
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

  // Self-service profile update for every authenticated role
  app.patch('/api/auth/profile', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) {
        res.status(400).json({ error: 'Name cannot be empty.' });
        return;
      }
      user.name = name;
    }
    if (req.body?.bio !== undefined) {
      user.bio = String(req.body.bio).trim().slice(0, 800);
    }
    if (req.body?.specialization !== undefined) {
      user.specialization = String(req.body.specialization).trim().slice(0, 120);
    }
    if (req.body?.country !== undefined) {
      user.country = String(req.body.country).trim().slice(0, 80);
    }
    if (req.body?.educationSystem !== undefined) {
      user.educationSystem = String(req.body.educationSystem).trim().slice(0, 120);
    }
    if (req.body?.educationLevel !== undefined) {
      user.educationLevel = String(req.body.educationLevel).trim().slice(0, 120);
    }
    if (req.body?.phone !== undefined) {
      user.phone = String(req.body.phone).trim().slice(0, 40);
    }
    if (req.body?.homeAddress !== undefined) {
      user.homeAddress = String(req.body.homeAddress).trim().slice(0, 200);
    }
    if (req.body?.institutionName !== undefined && user.role === 'INSTITUTION_ADMIN') {
      const instName = String(req.body.institutionName).trim().slice(0, 160);
      if (instName) {
        user.institutionName = instName;
        for (const u of db.users) {
          if (u.institutionId && u.institutionId === user.institutionId) {
            u.institutionName = instName;
          }
        }
      }
    }
    if (req.body?.followPriceUsd !== undefined && isContributorRole(user.role)) {
      user.followPriceUsd = Math.max(0, Number(req.body.followPriceUsd) || 0);
    }

    // Keep denormalized display names in sync system-wide
    const displayOwnerName = user.institutionName || user.name;
    for (const r of db.resources) {
      if (r.ownerId === user.id) r.ownerName = displayOwnerName;
    }
    for (const c of db.courses) {
      if (c.ownerId === user.id) {
        c.ownerName = displayOwnerName;
        if (user.institutionName) c.institutionName = user.institutionName;
      }
    }
    for (const s of db.liveSessions) {
      if (s.hostId === user.id) {
        s.hostName = user.institutionName ? `${user.name} (${user.institutionName})` : user.name;
      }
    }
    for (const e of db.enrollments) {
      if (e.learnerId === user.id) e.learnerName = user.name;
    }

    logAudit(user, 'PROFILE_UPDATED', 'USER', user.id, `${user.name} updated profile settings.`);
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

  // Public Academic Certificate Verification (strictly non-PII public academic ledger fields)
  app.get('/api/public/verify-certificate/:code', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!code) {
      res.status(400).json({ valid: false, error: 'Verification code is required.' });
      return;
    }
    const cert = db.certificates.find((c) => c.certificateCode.toUpperCase() === code);
    if (!cert) {
      res.status(404).json({
        valid: false,
        error: `No verified Akademi credential found matching code "${code}".`,
      });
      return;
    }
    res.json({
      valid: true,
      certificate: {
        id: cert.id,
        certificateCode: cert.certificateCode,
        learnerName: cert.learnerName,
        courseTitle: cert.courseTitle,
        subject: cert.subject,
        educationLevel: cert.educationLevel,
        issuerName: cert.issuerName,
        institutionName: cert.institutionName,
        gradeLabel: cert.gradeLabel,
        attendanceMinutes: cert.attendanceMinutes,
        issuedAt: cert.issuedAt,
      },
    });
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
      .map((u) => {
        const safe = toSafeUser(u, viewer);
        return {
          ...safe,
          email: '',
          followingCreatorIds: [],
          paidFollowCreatorIds: [],
          purchasedResourceIds: [],
          purchasedCourseIds: [],
          resourcesCount: db.resources.filter((r) => r.ownerId === u.id && r.status === 'PUBLISHED')
            .length,
          coursesCount: db.courses.filter((c) => c.ownerId === u.id && c.status === 'ACTIVE').length,
        };
      });

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

    const safePortfolioUrl = portfolioUrl ? sanitizeSafeExternalUrl(portfolioUrl) : undefined;
    if (portfolioUrl && !safePortfolioUrl) {
      res.status(400).json({ error: 'Portfolio URL must be a valid http:// or https:// link.' });
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
      portfolioUrl: safePortfolioUrl,
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
      enrollments: db.enrollments,
      liveSessions: db.liveSessions,
      educationLevels: getPlatformGatewayConfig().educationLevels,
      outboxEmails: db.outboxEmails,
      auditLogs: db.auditLogs.slice(0, 60),
      ledger: db.ledger,
    });
  });

  // Safe upload file deletion helper
  function safeDeleteUploadedFile(relPath?: string) {
    if (!relPath) return;
    const resolved = path.resolve(UPLOAD_DIR, relPath);
    if (resolved.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(resolved)) {
      try {
        fs.unlinkSync(resolved);
      } catch {
        // Ignore filesystem unlink error
      }
    }
  }

  // Master Admin full User CRUD
  app.post('/api/admin/users', requireAuth, requireRole('MASTER_ADMIN'), (req: AuthedRequest, res) => {
    const admin = req.authUser!;
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = String(req.body?.role || 'LEARNER') as UserRole;
    const password = String(req.body?.password || '').trim() || `Akd-${crypto.randomBytes(4).toString('hex')}!`;
    if (!name || !email || password.length < 8) {
      res.status(400).json({ error: 'Name, valid email, and 8+ char password are required.' });
      return;
    }
    if (!['MASTER_ADMIN', 'INSTITUTION_ADMIN', 'SOLO_EDUCATOR', 'COURSE_ADMIN', 'LEARNER'].includes(role)) {
      res.status(400).json({ error: 'Invalid user role.' });
      return;
    }
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'Email is already registered on Akademi.' });
      return;
    }
    const institutionName = req.body?.institutionName ? String(req.body.institutionName).trim() : undefined;
    const institutionId =
      role === 'INSTITUTION_ADMIN'
        ? `inst-${crypto.randomUUID().slice(0, 6)}`
        : req.body?.institutionId
          ? String(req.body.institutionId).trim()
          : undefined;
    const accountCategory = (req.body?.accountCategory ||
      (role === 'INSTITUTION_ADMIN' || role === 'COURSE_ADMIN'
        ? 'SCHOOL_INSTITUTION'
        : role === 'SOLO_EDUCATOR'
          ? 'SOLO_TEACHER'
          : undefined)) as AccountCategory | undefined;

    const newUser: StoredUser = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      email,
      name,
      role,
      accountCategory,
      institutionId,
      institutionName,
      bio: String(req.body?.bio || `Akademi ${role.replace('_', ' ')} profile.`).trim(),
      specialization: String(req.body?.specialization || 'General Studies').trim(),
      educationLevel: req.body?.educationLevel ? String(req.body.educationLevel).trim() : undefined,
      country: String(req.body?.country || 'Uganda').trim(),
      educationSystem: String(req.body?.educationSystem || 'UNEB / NCHE Uganda').trim(),
      phone: req.body?.phone ? String(req.body.phone).trim() : undefined,
      mustChangePassword: Boolean(req.body?.mustChangePassword),
      kycStatus: (req.body?.kycStatus || (role === 'LEARNER' || role === 'MASTER_ADMIN' ? 'VERIFIED' : 'UNSUBMITTED')) as StoredUser['kycStatus'],
      subscriptionStatus: (req.body?.subscriptionStatus || (role === 'LEARNER' ? 'INACTIVE' : 'ACTIVE')) as StoredUser['subscriptionStatus'],
      subscriptionPlan:
        role === 'INSTITUTION_ADMIN'
          ? 'INSTITUTION_CAMPUS'
          : isContributorRole(role)
            ? 'SOLO_PRO'
            : req.body?.platformPassActive
              ? 'AKADEMI_PASS'
              : undefined,
      followPriceUsd: Math.max(0, Number(req.body?.followPriceUsd || 0)),
      followerIds: [],
      followingCreatorIds: [],
      paidFollowCreatorIds: [],
      purchasedResourceIds: [],
      purchasedCourseIds: [],
      platformPassActive: Boolean(req.body?.platformPassActive),
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(password),
    };

    db.users.push(newUser);
    queueOutboxEmail(
      email,
      name,
      'Akademi Account Provisioned by Master Admin',
      `Your Akademi account (${role}) is ready.\nEmail: ${email}\nPassword: ${password}`,
      'CREDENTIALS'
    );
    logAudit(admin, 'USER_CREATED', 'USER', newUser.id, `Master Admin created ${name} (${role}).`);
    persist();
    res.status(201).json({ user: toSafeUser(newUser, admin), issuedPassword: password });
  });

  app.patch('/api/admin/users/:id', requireAuth, requireRole('MASTER_ADMIN'), (req: AuthedRequest, res) => {
    const admin = req.authUser!;
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (req.body?.role !== undefined) {
      const nextRole = String(req.body.role) as UserRole;
      if (!['MASTER_ADMIN', 'INSTITUTION_ADMIN', 'SOLO_EDUCATOR', 'COURSE_ADMIN', 'LEARNER'].includes(nextRole)) {
        res.status(400).json({ error: 'Invalid user role.' });
        return;
      }
      if (
        target.role === 'MASTER_ADMIN' &&
        nextRole !== 'MASTER_ADMIN' &&
        db.users.filter((u) => u.role === 'MASTER_ADMIN').length <= 1
      ) {
        res.status(400).json({ error: 'At least one Master Admin must remain on the platform.' });
        return;
      }
      target.role = nextRole;
      if (nextRole === 'INSTITUTION_ADMIN' && !target.institutionId) {
        target.institutionId = `inst-${crypto.randomUUID().slice(0, 6)}`;
      }
    }

    if (req.body?.email !== undefined) {
      const nextEmail = String(req.body.email).trim().toLowerCase();
      if (!nextEmail) {
        res.status(400).json({ error: 'Email cannot be empty.' });
        return;
      }
      if (db.users.some((u) => u.id !== target.id && u.email.toLowerCase() === nextEmail)) {
        res.status(409).json({ error: 'Another account already uses this email.' });
        return;
      }
      target.email = nextEmail;
    }

    if (req.body?.name !== undefined) target.name = String(req.body.name).trim() || target.name;
    if (req.body?.specialization !== undefined) target.specialization = String(req.body.specialization).trim();
    if (req.body?.bio !== undefined) target.bio = String(req.body.bio).trim();
    if (req.body?.country !== undefined) target.country = String(req.body.country).trim();
    if (req.body?.educationSystem !== undefined) target.educationSystem = String(req.body.educationSystem).trim();
    if (req.body?.educationLevel !== undefined) target.educationLevel = String(req.body.educationLevel).trim();
    if (req.body?.institutionName !== undefined) target.institutionName = String(req.body.institutionName).trim() || undefined;
    if (req.body?.phone !== undefined) target.phone = String(req.body.phone).trim() || undefined;
    if (req.body?.homeAddress !== undefined) target.homeAddress = String(req.body.homeAddress).trim() || undefined;
    if (req.body?.followPriceUsd !== undefined) target.followPriceUsd = Math.max(0, Number(req.body.followPriceUsd) || 0);
    if (req.body?.platformPassActive !== undefined) target.platformPassActive = Boolean(req.body.platformPassActive);
    if (req.body?.mustChangePassword !== undefined) target.mustChangePassword = Boolean(req.body.mustChangePassword);

    if (req.body?.kycStatus !== undefined) {
      target.kycStatus = String(req.body.kycStatus) as StoredUser['kycStatus'];
      sendToUser(target.id, 'kyc:updated', { kycStatus: target.kycStatus });
    }
    if (req.body?.subscriptionStatus !== undefined) {
      target.subscriptionStatus = String(req.body.subscriptionStatus) as StoredUser['subscriptionStatus'];
      target.subscriptionUpdatedAt = new Date().toISOString();
      sendToUser(target.id, 'subscription:updated', {
        subscriptionStatus: target.subscriptionStatus,
        subscriptionPlan: target.subscriptionPlan,
      });
    }
    if (req.body?.resetPassword && String(req.body.resetPassword).trim().length >= 8) {
      target.passwordHash = hashPassword(String(req.body.resetPassword).trim());
    }

    logAudit(admin, 'USER_UPDATED', 'USER', target.id, `Master Admin updated profile/permissions for ${target.name}.`);
    persist();
    res.json({ user: toSafeUser(target, admin) });
  });

  app.delete('/api/admin/users/:id', requireAuth, requireRole('MASTER_ADMIN'), (req: AuthedRequest, res) => {
    const admin = req.authUser!;
    const target = db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (target.id === admin.id) {
      res.status(400).json({ error: 'You cannot delete the currently signed-in Master Admin account.' });
      return;
    }
    if (target.role === 'MASTER_ADMIN' && db.users.filter((u) => u.role === 'MASTER_ADMIN').length <= 1) {
      res.status(400).json({ error: 'Cannot delete the last Master Admin.' });
      return;
    }

    // Cascade cleanup of owned assets & references
    for (const r of db.resources.filter((item) => item.ownerId === target.id)) {
      safeDeleteUploadedFile(r.filePath);
    }
    const deletedResourceIds = new Set(db.resources.filter((r) => r.ownerId === target.id).map((r) => r.id));
    db.resources = db.resources.filter((r) => r.ownerId !== target.id);

    const deletedCourseIds = new Set(db.courses.filter((c) => c.ownerId === target.id).map((c) => c.id));
    db.courses = db.courses
      .filter((c) => c.ownerId !== target.id)
      .map((c) => ({
        ...c,
        enrolledLearnerIds: c.enrolledLearnerIds.filter((id) => id !== target.id),
        resourceIds: c.resourceIds.filter((rid) => !deletedResourceIds.has(rid)),
        assignedInstructorId: c.assignedInstructorId === target.id ? undefined : c.assignedInstructorId,
      }));

    db.enrollments = db.enrollments.filter(
      (e) => e.learnerId !== target.id && e.ownerId !== target.id && !deletedCourseIds.has(e.courseId)
    );
    db.liveSessions = db.liveSessions
      .filter((s) => s.hostId !== target.id && !deletedCourseIds.has(s.courseId))
      .map((s) => ({
        ...s,
        pinnedResourceIds: s.pinnedResourceIds.filter((rid) => !deletedResourceIds.has(rid)),
      }));

    for (const d of db.learnerAcademicDocs.filter((doc) => doc.learnerId === target.id)) {
      safeDeleteUploadedFile(d.filePath);
    }
    db.learnerAcademicDocs = db.learnerAcademicDocs.filter((doc) => doc.learnerId !== target.id);

    for (const k of db.kycSubmissions.filter((sub) => sub.userId === target.id)) {
      safeDeleteUploadedFile(k.idFilePath);
      safeDeleteUploadedFile(k.credentialFilePath);
    }
    db.kycSubmissions = db.kycSubmissions.filter((sub) => sub.userId !== target.id);

    db.tickets = db.tickets.filter((t) => t.userId !== target.id);
    db.messageThreads = db.messageThreads.filter((t) => !t.participantIds.includes(target.id));

    for (const u of db.users) {
      u.followerIds = u.followerIds.filter((id) => id !== target.id);
      u.followingCreatorIds = u.followingCreatorIds.filter((id) => id !== target.id);
      u.paidFollowCreatorIds = u.paidFollowCreatorIds.filter((id) => id !== target.id);
    }

    db.users = db.users.filter((u) => u.id !== target.id);
    logAudit(admin, 'USER_DELETED', 'USER', target.id, `Master Admin deleted user ${target.name} (${target.email}).`);
    persist();
    res.json({ deletedId: target.id });
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

  app.delete('/api/admin/requests/:id', requireAuth, requireRole('MASTER_ADMIN'), (req: AuthedRequest, res) => {
    const admin = req.authUser!;
    const reqItem = db.accountRequests.find((r) => r.id === req.params.id);
    if (!reqItem) {
      res.status(404).json({ error: 'Account request not found.' });
      return;
    }
    db.accountRequests = db.accountRequests.filter((r) => r.id !== reqItem.id);
    logAudit(admin, 'ACCOUNT_REQUEST_DELETED', 'REQUEST', reqItem.id, `Deleted application from ${reqItem.fullName}.`);
    persist();
    res.json({ deletedId: reqItem.id });
  });

  app.delete('/api/admin/kyc/:id', requireAuth, requireRole('MASTER_ADMIN'), (req: AuthedRequest, res) => {
    const admin = req.authUser!;
    const kyc = db.kycSubmissions.find((k) => k.id === req.params.id);
    if (!kyc) {
      res.status(404).json({ error: 'KYC submission not found.' });
      return;
    }
    safeDeleteUploadedFile(kyc.idFilePath);
    safeDeleteUploadedFile(kyc.credentialFilePath);
    db.kycSubmissions = db.kycSubmissions.filter((k) => k.id !== kyc.id);
    logAudit(admin, 'KYC_DELETED', 'KYC', kyc.id, `Deleted KYC submission for ${kyc.userName}.`);
    persist();
    res.json({ deletedId: kyc.id });
  });

  app.patch('/api/admin/requests/:id', requireAuth, requireRole('MASTER_ADMIN'), (req: AuthedRequest, res) => {
    const admin = req.authUser!;
    const reqItem = db.accountRequests.find((r) => r.id === req.params.id);
    if (!reqItem) {
      res.status(404).json({ error: 'Account request not found.' });
      return;
    }
    if (req.body?.fullName !== undefined) reqItem.fullName = String(req.body.fullName).trim() || reqItem.fullName;
    if (req.body?.email !== undefined) reqItem.email = String(req.body.email).trim().toLowerCase() || reqItem.email;
    if (req.body?.phone !== undefined) reqItem.phone = String(req.body.phone).trim() || undefined;
    if (req.body?.accountCategory !== undefined) {
      reqItem.accountCategory = String(req.body.accountCategory) as AccountCategory;
    }
    if (req.body?.organizationName !== undefined) {
      reqItem.organizationName = String(req.body.organizationName).trim() || undefined;
    }
    if (req.body?.country !== undefined) reqItem.country = String(req.body.country).trim() || reqItem.country;
    if (req.body?.educationSystem !== undefined) {
      reqItem.educationSystem = String(req.body.educationSystem).trim() || reqItem.educationSystem;
    }
    if (req.body?.specialization !== undefined) {
      reqItem.specialization = String(req.body.specialization).trim() || reqItem.specialization;
    }
    if (req.body?.statement !== undefined) reqItem.statement = String(req.body.statement).trim() || reqItem.statement;
    logAudit(admin, 'ACCOUNT_REQUEST_UPDATED', 'REQUEST', reqItem.id, `Updated application for ${reqItem.fullName}.`);
    persist();
    res.json({ request: reqItem });
  });

  app.post('/api/admin/enrollments', requireAuth, requireRole('MASTER_ADMIN'), (req: AuthedRequest, res) => {
    const admin = req.authUser!;
    const courseId = String(req.body?.courseId || '');
    const learnerId = String(req.body?.learnerId || '');
    const academicStatus = (req.body?.academicStatus || 'APPROVED') as EnrollmentRecord['academicStatus'];
    const course = db.courses.find((c) => c.id === courseId);
    const learner = db.users.find((u) => u.id === learnerId);
    if (!course || !learner) {
      res.status(404).json({ error: 'Target course and learner account are required.' });
      return;
    }
    const existing = db.enrollments.find((e) => e.courseId === course.id && e.learnerId === learner.id);
    if (existing) {
      res.status(409).json({ error: 'Learner already has an enrollment record in this course.' });
      return;
    }
    const enrollment: EnrollmentRecord = {
      id: `enr-${crypto.randomUUID().slice(0, 8)}`,
      courseId: course.id,
      courseTitle: course.title,
      learnerId: learner.id,
      learnerName: learner.name,
      learnerDeclaredLevel: learner.educationLevel || 'Undergraduate',
      ownerId: course.ownerId,
      institutionId: course.institutionId,
      verifierRoleRequired: course.institutionId ? 'INSTITUTION_ADMIN' : 'SOLO_EDUCATOR',
      academicStatus,
      academicNote: String(req.body?.academicNote || 'Enrolled via Master Admin console.').trim(),
      progressPercent: 0,
      completedResourceIds: [],
      attendanceMinutes: 0,
      requestedAt: new Date().toISOString(),
      verifiedAt: academicStatus === 'APPROVED' ? new Date().toISOString() : undefined,
    };
    db.enrollments.unshift(enrollment);
    if (academicStatus === 'APPROVED' && !course.enrolledLearnerIds.includes(learner.id)) {
      course.enrolledLearnerIds.push(learner.id);
    }
    logAudit(admin, 'ENROLLMENT_CREATED', 'ENROLLMENT', enrollment.id, `Master Admin enrolled ${learner.name} in ${course.title}.`);
    persist();
    res.status(201).json({ enrollment });
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
      const idFile = files?.idDocument?.[0];
      const credFile = files?.credentialDocument?.[0];

      const cleanupFiles = () => {
        if (idFile) safeDeleteUploadedFile(idFile.filename);
        if (credFile) safeDeleteUploadedFile(credFile.filename);
      };

      if (!idFile || !credFile) {
        cleanupFiles();
        res.status(400).json({
          error:
            'Both a National ID / Passport document and a Teaching Credential document file are required (PDF, Word DOCX/DOC, or scan image).',
        });
        return;
      }

      const idCheck = verifyUploadedFileSignature(idFile, ID_SCAN_EXTS);
      if (!idCheck.ok) {
        cleanupFiles();
        res.status(400).json({ error: `ID Document error: ${idCheck.error}` });
        return;
      }
      const credCheck = verifyUploadedFileSignature(credFile, CREDENTIAL_DOC_EXTS);
      if (!credCheck.ok) {
        cleanupFiles();
        res.status(400).json({ error: `Credential Document error: ${credCheck.error}` });
        return;
      }

      const documentType = String(req.body?.documentType || 'NATIONAL_ID') as KycSubmission['documentType'];
      const rawNumber = String(req.body?.documentNumber || '').trim();
      const masked =
        rawNumber.length > 4
          ? `${rawNumber.slice(0, 2)}****${rawNumber.slice(-4)}`
          : '****VERIFIED';

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
        idFileName: idFile.originalname,
        idFilePath: idFile.filename,
        credentialFileName: credFile.originalname,
        credentialFilePath: credFile.filename,
        submittedAt: new Date().toISOString(),
        status: 'PENDING',
      };

      // Replace previous pending submissions for same user
      for (const old of db.kycSubmissions.filter((k) => k.userId === user.id && k.status === 'PENDING')) {
        safeDeleteUploadedFile(old.idFilePath);
        safeDeleteUploadedFile(old.credentialFilePath);
      }
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

      // Build strictly sanitized messaging recipients (students enrolled/following + institution colleagues)
      const recipientMap = new Map<string, { id: string; name: string; label: string }>();
      for (const s of staff) {
        recipientMap.set(s.id, {
          id: s.id,
          name: s.name,
          label: `${s.role.replace('_', ' ')} · ${s.specialization}`,
        });
      }
      for (const e of myEnrollments) {
        if (!recipientMap.has(e.learnerId)) {
          recipientMap.set(e.learnerId, {
            id: e.learnerId,
            name: e.learnerName,
            label: `Student · ${e.courseTitle}`,
          });
        }
      }
      for (const fid of user.followerIds) {
        if (!recipientMap.has(fid)) {
          const follower = db.users.find((u) => u.id === fid);
          if (follower) {
            recipientMap.set(follower.id, {
              id: follower.id,
              name: follower.name,
              label: 'Follower',
            });
          }
        }
      }

      res.json({
        resources: myResources,
        courses: myCourses,
        enrollments: myEnrollments,
        sessions: mySessions,
        staff,
        transactions: myTransactions,
        myKycSubmissions: db.kycSubmissions.filter((k) => k.userId === user.id),
        messageRecipients: Array.from(recipientMap.values()),
        educationLevels: getPlatformGatewayConfig().educationLevels,
      });
    }
  );

  app.post(
    '/api/contributor/resources',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN', 'MASTER_ADMIN'),
    upload.single('file'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      const uploaded = req.file;
      if (user.role !== 'MASTER_ADMIN' && (user.kycStatus !== 'VERIFIED' || user.subscriptionStatus !== 'ACTIVE')) {
        if (uploaded) safeDeleteUploadedFile(uploaded.filename);
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
        if (uploaded) safeDeleteUploadedFile(uploaded.filename);
        res.status(400).json({ error: 'Title and description are required.' });
        return;
      }

      if (!uploaded) {
        res.status(400).json({
          error:
            'A real document or media file is required. Text-only entries without a file are not accepted.',
        });
        return;
      }

      const allowed = allowedExtensionsForResourceType(type);
      const check = verifyUploadedFileSignature(uploaded, allowed);
      if (!check.ok) {
        safeDeleteUploadedFile(uploaded.filename);
        res.status(400).json({ error: check.error });
        return;
      }

      const sizeKb = Math.max(1, Math.round(uploaded.size / 1024));
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
        fileName: uploaded.originalname,
        fileSizeLabel,
        filePath: uploaded.filename,
        mimeType: getDocumentMimeType(uploaded.originalname, uploaded.mimetype),
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

  app.patch(
    '/api/resources/:id',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN', 'MASTER_ADMIN'),
    upload.single('file'),
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const item = db.resources.find((r) => r.id === req.params.id);
      if (!item) {
        if (req.file) safeDeleteUploadedFile(req.file.filename);
        res.status(404).json({ error: 'Resource not found.' });
        return;
      }
      const isAuthorized =
        actor.role === 'MASTER_ADMIN' ||
        item.ownerId === actor.id ||
        (actor.institutionId && item.institutionId === actor.institutionId);
      if (!isAuthorized) {
        if (req.file) safeDeleteUploadedFile(req.file.filename);
        res.status(403).json({ error: 'You do not have permission to edit this resource.' });
        return;
      }
      if (actor.role !== 'MASTER_ADMIN' && (actor.kycStatus !== 'VERIFIED' || actor.subscriptionStatus !== 'ACTIVE')) {
        if (req.file) safeDeleteUploadedFile(req.file.filename);
        res.status(403).json({ error: 'Contributor account must be verified and active to modify materials.' });
        return;
      }

      const nextType = (req.body?.type !== undefined ? String(req.body.type) : item.type) as ResourceType;
      if (req.file) {
        const check = verifyUploadedFileSignature(req.file, allowedExtensionsForResourceType(nextType));
        if (!check.ok) {
          safeDeleteUploadedFile(req.file.filename);
          res.status(400).json({ error: check.error });
          return;
        }
      }

      if (req.body?.title !== undefined) item.title = String(req.body.title).trim() || item.title;
      if (req.body?.description !== undefined) item.description = String(req.body.description).trim() || item.description;
      if (req.body?.type !== undefined) item.type = nextType;
      if (req.body?.subject !== undefined) item.subject = String(req.body.subject).trim() || item.subject;
      if (req.body?.educationLevel !== undefined) item.educationLevel = String(req.body.educationLevel).trim();
      if (req.body?.accessTier !== undefined) item.accessTier = String(req.body.accessTier) as AccessTier;
      if (req.body?.priceUsd !== undefined || req.body?.accessTier !== undefined) {
        item.priceUsd = item.accessTier === 'PAID_SINGLE' ? Math.max(1, Number(req.body?.priceUsd ?? item.priceUsd) || 10) : 0;
      }
      if (req.body?.downloadable !== undefined) {
        item.downloadable = req.body.downloadable !== 'false' && req.body.downloadable !== false;
      }
      if (req.body?.previewSummary !== undefined) {
        item.previewSummary = String(req.body.previewSummary).trim() || item.description;
      }
      if (actor.role === 'MASTER_ADMIN' && req.body?.status !== undefined) {
        item.status = req.body.status === 'SUSPENDED' ? 'SUSPENDED' : 'PUBLISHED';
      }
      if (req.file) {
        safeDeleteUploadedFile(item.filePath);
        const sizeKb = Math.max(1, Math.round(req.file.size / 1024));
        item.fileName = req.file.originalname;
        item.fileSizeLabel = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
        item.filePath = req.file.filename;
        item.mimeType = getDocumentMimeType(req.file.originalname, req.file.mimetype);
      }

      logAudit(actor, 'RESOURCE_UPDATED', 'RESOURCE', item.id, `${actor.name} updated "${item.title}".`);
      persist();
      res.json({ resource: { ...item, filePath: undefined } });
    }
  );

  app.delete(
    '/api/resources/:id',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN', 'MASTER_ADMIN'),
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const item = db.resources.find((r) => r.id === req.params.id);
      if (!item) {
        res.status(404).json({ error: 'Resource not found.' });
        return;
      }
      const isAuthorized =
        actor.role === 'MASTER_ADMIN' ||
        item.ownerId === actor.id ||
        (actor.institutionId && item.institutionId === actor.institutionId);
      if (!isAuthorized) {
        res.status(403).json({ error: 'You do not have permission to delete this resource.' });
        return;
      }

      safeDeleteUploadedFile(item.filePath);
      db.resources = db.resources.filter((r) => r.id !== item.id);
      for (const c of db.courses) {
        c.resourceIds = c.resourceIds.filter((rid) => rid !== item.id);
      }
      for (const s of db.liveSessions) {
        s.pinnedResourceIds = s.pinnedResourceIds.filter((rid) => rid !== item.id);
      }
      logAudit(actor, 'RESOURCE_DELETED', 'RESOURCE', item.id, `${actor.name} deleted "${item.title}".`);
      persist();
      res.json({ deletedId: item.id });
    }
  );

  app.post(
    '/api/contributor/courses',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN', 'MASTER_ADMIN'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      if (user.role !== 'MASTER_ADMIN' && (user.kycStatus !== 'VERIFIED' || user.subscriptionStatus !== 'ACTIVE')) {
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
      const resourceIds = Array.isArray(req.body?.resourceIds)
        ? filterAttachableResourceIds(user, req.body.resourceIds.map(String))
        : [];
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

  app.patch(
    '/api/courses/:id',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN', 'MASTER_ADMIN'),
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const course = db.courses.find((c) => c.id === req.params.id);
      if (!course) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      const isAuthorized =
        actor.role === 'MASTER_ADMIN' ||
        course.ownerId === actor.id ||
        (actor.institutionId && course.institutionId === actor.institutionId);
      if (!isAuthorized) {
        res.status(403).json({ error: 'You do not have permission to edit this course.' });
        return;
      }

      if (req.body?.title !== undefined) course.title = String(req.body.title).trim() || course.title;
      if (req.body?.description !== undefined) course.description = String(req.body.description).trim() || course.description;
      if (req.body?.subject !== undefined) course.subject = String(req.body.subject).trim() || course.subject;
      if (req.body?.requiredLevel !== undefined) course.requiredLevel = String(req.body.requiredLevel).trim();
      if (req.body?.accessTier !== undefined) course.accessTier = String(req.body.accessTier) as AccessTier;
      if (req.body?.priceUsd !== undefined || req.body?.accessTier !== undefined) {
        course.priceUsd = course.accessTier === 'PAID_SINGLE' ? Math.max(1, Number(req.body?.priceUsd ?? course.priceUsd) || 25) : 0;
      }
      if (req.body?.requiresAcademicVerification !== undefined) {
        course.requiresAcademicVerification = Boolean(req.body.requiresAcademicVerification);
      }
      if (req.body?.assignedInstructorId !== undefined) {
        course.assignedInstructorId = req.body.assignedInstructorId ? String(req.body.assignedInstructorId) : undefined;
      }
      if (Array.isArray(req.body?.resourceIds)) {
        course.resourceIds = filterAttachableResourceIds(actor, req.body.resourceIds.map(String));
      }
      if (req.body?.status !== undefined && (req.body.status === 'ACTIVE' || req.body.status === 'PAUSED')) {
        course.status = req.body.status;
      }

      logAudit(actor, 'COURSE_UPDATED', 'RESOURCE', course.id, `${actor.name} updated course "${course.title}".`);
      persist();
      res.json({ course });
    }
  );

  app.delete(
    '/api/courses/:id',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN', 'MASTER_ADMIN'),
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const course = db.courses.find((c) => c.id === req.params.id);
      if (!course) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      const isAuthorized =
        actor.role === 'MASTER_ADMIN' ||
        course.ownerId === actor.id ||
        (actor.institutionId && course.institutionId === actor.institutionId);
      if (!isAuthorized) {
        res.status(403).json({ error: 'You do not have permission to delete this course.' });
        return;
      }

      db.courses = db.courses.filter((c) => c.id !== course.id);
      db.enrollments = db.enrollments.filter((e) => e.courseId !== course.id);
      db.liveSessions = db.liveSessions.filter((s) => s.courseId !== course.id);
      logAudit(actor, 'COURSE_DELETED', 'RESOURCE', course.id, `${actor.name} deleted course "${course.title}".`);
      persist();
      res.json({ deletedId: course.id });
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

  app.patch(
    '/api/institution/staff/:id',
    requireAuth,
    requireRole('INSTITUTION_ADMIN', 'MASTER_ADMIN'),
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const staff = db.users.find((u) => u.id === req.params.id && u.role === 'COURSE_ADMIN');
      if (!staff) {
        res.status(404).json({ error: 'Institution instructor not found.' });
        return;
      }
      if (actor.role !== 'MASTER_ADMIN' && (!actor.institutionId || staff.institutionId !== actor.institutionId)) {
        res.status(403).json({ error: 'You can only manage instructors inside your institution.' });
        return;
      }
      if (req.body?.name !== undefined) staff.name = String(req.body.name).trim() || staff.name;
      if (req.body?.specialization !== undefined) {
        staff.specialization = String(req.body.specialization).trim() || staff.specialization;
      }
      if (req.body?.email !== undefined) {
        const nextEmail = String(req.body.email).trim().toLowerCase();
        if (nextEmail && !db.users.some((u) => u.id !== staff.id && u.email.toLowerCase() === nextEmail)) {
          staff.email = nextEmail;
        }
      }
      if (req.body?.subscriptionStatus !== undefined) {
        const nextSub = String(req.body.subscriptionStatus) as StoredUser['subscriptionStatus'];
        if (['ACTIVE', 'SUSPENDED', 'INACTIVE'].includes(nextSub)) {
          staff.subscriptionStatus = nextSub;
          sendToUser(staff.id, 'subscription:updated', { subscriptionStatus: nextSub });
        }
      }
      if (req.body?.resetPassword && String(req.body.resetPassword).trim().length >= 8) {
        staff.passwordHash = hashPassword(String(req.body.resetPassword).trim());
        staff.mustChangePassword = true;
      }
      logAudit(actor, 'STAFF_UPDATED', 'USER', staff.id, `${actor.name} updated instructor ${staff.name}.`);
      persist();
      res.json({ staff: toSafeUser(staff, null) });
    }
  );

  app.delete(
    '/api/institution/staff/:id',
    requireAuth,
    requireRole('INSTITUTION_ADMIN', 'MASTER_ADMIN'),
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const staff = db.users.find((u) => u.id === req.params.id && u.role === 'COURSE_ADMIN');
      if (!staff) {
        res.status(404).json({ error: 'Institution instructor not found.' });
        return;
      }
      if (actor.role !== 'MASTER_ADMIN' && (!actor.institutionId || staff.institutionId !== actor.institutionId)) {
        res.status(403).json({ error: 'You can only remove instructors inside your institution.' });
        return;
      }
      for (const c of db.courses) {
        if (c.assignedInstructorId === staff.id) {
          c.assignedInstructorId = undefined;
        }
      }
      db.users = db.users.filter((u) => u.id !== staff.id);
      logAudit(actor, 'STAFF_REMOVED', 'USER', staff.id, `${actor.name} removed instructor ${staff.name}.`);
      persist();
      res.json({ deletedId: staff.id });
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
      if (decision === 'APPROVED' && enrollment.progressPercent >= 100) {
        ensureCertificateForEnrollment(enrollment, course);
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

  app.patch(
    '/api/enrollments/:id',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN', 'MASTER_ADMIN'),
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const enrollment = db.enrollments.find((e) => e.id === req.params.id);
      if (!enrollment) {
        res.status(404).json({ error: 'Enrollment not found.' });
        return;
      }
      const inScope =
        actor.role === 'MASTER_ADMIN' ||
        enrollment.ownerId === actor.id ||
        (actor.institutionId && enrollment.institutionId === actor.institutionId);
      if (!inScope) {
        res.status(403).json({ error: 'You do not manage this student enrollment.' });
        return;
      }

      if (req.body?.academicStatus !== undefined) {
        const nextStatus = String(req.body.academicStatus) as EnrollmentRecord['academicStatus'];
        if (!['PENDING', 'APPROVED', 'REJECTED'].includes(nextStatus)) {
          res.status(400).json({ error: 'Invalid academic status.' });
          return;
        }
        if (actor.role !== 'MASTER_ADMIN') {
          if (enrollment.verifierRoleRequired === 'INSTITUTION_ADMIN' && actor.role !== 'INSTITUTION_ADMIN') {
            res.status(403).json({ error: 'Only Institution Admin can change academic verification status.' });
            return;
          }
          if (enrollment.verifierRoleRequired === 'SOLO_EDUCATOR' && actor.role !== 'SOLO_EDUCATOR') {
            res.status(403).json({ error: 'Only owning Solo Educator can change academic verification status.' });
            return;
          }
        }
        enrollment.academicStatus = nextStatus;
        enrollment.verifiedAt = nextStatus === 'PENDING' ? undefined : new Date().toISOString();
        const course = db.courses.find((c) => c.id === enrollment.courseId);
        if (course) {
          if (nextStatus === 'APPROVED' && !course.enrolledLearnerIds.includes(enrollment.learnerId)) {
            course.enrolledLearnerIds.push(enrollment.learnerId);
          } else if (nextStatus !== 'APPROVED') {
            course.enrolledLearnerIds = course.enrolledLearnerIds.filter((id) => id !== enrollment.learnerId);
          }
        }
      }
      if (req.body?.academicNote !== undefined) {
        enrollment.academicNote = String(req.body.academicNote).trim().slice(0, 300);
      }
      if (req.body?.gradeLabel !== undefined) {
        enrollment.gradeLabel = String(req.body.gradeLabel).trim().slice(0, 20);
      }
      if (req.body?.progressPercent !== undefined) {
        enrollment.progressPercent = Math.max(0, Math.min(100, Number(req.body.progressPercent) || 0));
      }

      const issuedCert = ensureCertificateForEnrollment(enrollment);
      logAudit(actor, 'ENROLLMENT_UPDATED', 'ENROLLMENT', enrollment.id, `${actor.name} updated enrollment for ${enrollment.learnerName}.`);
      sendToUser(enrollment.learnerId, 'enrollment:updated', { enrollment });
      persist();
      res.json({ enrollment, issuedCertificate: issuedCert });
    }
  );

  app.delete('/api/enrollments/:id', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const enrollment = db.enrollments.find((e) => e.id === req.params.id);
    if (!enrollment) {
      res.status(404).json({ error: 'Enrollment not found.' });
      return;
    }
    const isLearnerSelf = enrollment.learnerId === actor.id;
    const isVerifier =
      actor.role === 'MASTER_ADMIN' ||
      enrollment.ownerId === actor.id ||
      (actor.role === 'INSTITUTION_ADMIN' && actor.institutionId && enrollment.institutionId === actor.institutionId);
    if (!isLearnerSelf && !isVerifier) {
      res.status(403).json({ error: 'Not authorized to remove or withdraw this enrollment.' });
      return;
    }
    const course = db.courses.find((c) => c.id === enrollment.courseId);
    if (course) {
      course.enrolledLearnerIds = course.enrolledLearnerIds.filter((id) => id !== enrollment.learnerId);
    }
    db.enrollments = db.enrollments.filter((e) => e.id !== enrollment.id);
    logAudit(actor, 'ENROLLMENT_REMOVED', 'ENROLLMENT', enrollment.id, `${actor.name} removed/withdrew enrollment for ${enrollment.courseTitle}.`);
    persist();
    res.json({ deletedId: enrollment.id });
  });

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
        if (req.file) safeDeleteUploadedFile(req.file.filename);
        res.status(400).json({ error: 'Document title and issuing institution are required.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({
          error:
            'Please upload a genuine academic document file (PDF, Word DOCX/DOC, or certificate scan image). Plain text entries are not accepted.',
        });
        return;
      }
      const check = verifyUploadedFileSignature(req.file, CREDENTIAL_DOC_EXTS);
      if (!check.ok) {
        safeDeleteUploadedFile(req.file.filename);
        res.status(400).json({ error: check.error });
        return;
      }

      user.educationLevel = educationLevel;
      const docItem: LearnerAcademicDoc = {
        id: `adoc-${crypto.randomUUID().slice(0, 8)}`,
        learnerId: user.id,
        title,
        educationLevel,
        institutionIssued,
        fileName: req.file.originalname,
        filePath: req.file.filename,
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

  app.patch(
    '/api/learner/academic-docs/:id',
    requireAuth,
    upload.single('document'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      const doc = db.learnerAcademicDocs.find((d) => d.id === req.params.id);
      if (!doc) {
        if (req.file) safeDeleteUploadedFile(req.file.filename);
        res.status(404).json({ error: 'Academic document not found.' });
        return;
      }
      if (user.role !== 'MASTER_ADMIN' && doc.learnerId !== user.id) {
        if (req.file) safeDeleteUploadedFile(req.file.filename);
        res.status(403).json({ error: 'You do not have permission to edit this document.' });
        return;
      }
      if (req.file) {
        const check = verifyUploadedFileSignature(req.file, CREDENTIAL_DOC_EXTS);
        if (!check.ok) {
          safeDeleteUploadedFile(req.file.filename);
          res.status(400).json({ error: check.error });
          return;
        }
      }
      if (req.body?.title !== undefined) doc.title = String(req.body.title).trim() || doc.title;
      if (req.body?.educationLevel !== undefined) {
        doc.educationLevel = String(req.body.educationLevel).trim() || doc.educationLevel;
      }
      if (req.body?.institutionIssued !== undefined) {
        doc.institutionIssued = String(req.body.institutionIssued).trim() || doc.institutionIssued;
      }
      if (req.file) {
        safeDeleteUploadedFile(doc.filePath);
        doc.fileName = req.file.originalname;
        doc.filePath = req.file.filename;
      }
      persist();
      res.json({ doc: { ...doc, filePath: undefined } });
    }
  );

  app.delete('/api/learner/academic-docs/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const doc = db.learnerAcademicDocs.find((d) => d.id === req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Academic document not found.' });
      return;
    }
    if (user.role !== 'MASTER_ADMIN' && doc.learnerId !== user.id) {
      res.status(403).json({ error: 'You do not have permission to delete this document.' });
      return;
    }
    safeDeleteUploadedFile(doc.filePath);
    db.learnerAcademicDocs = db.learnerAcademicDocs.filter((d) => d.id !== doc.id);
    logAudit(user, 'ACADEMIC_DOC_DELETED', 'USER', doc.learnerId, `${user.name} deleted academic doc "${doc.title}".`);
    persist();
    res.json({ deletedId: doc.id });
  });

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
      if (!user.platformPassActive) {
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
      }
      res.json({ user: toSafeUser(user, user) });
      return;
    }

    if (kind === 'CANCEL_PLATFORM_PASS') {
      user.platformPassActive = false;
      if (user.subscriptionPlan === 'AKADEMI_PASS') {
        user.subscriptionPlan = undefined;
        user.subscriptionStatus = 'INACTIVE';
      }
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
      if (existing.academicStatus === 'REJECTED') {
        existing.academicStatus = course.requiresAcademicVerification ? 'PENDING' : 'APPROVED';
        existing.requestedAt = new Date().toISOString();
        existing.verifiedAt = existing.academicStatus === 'APPROVED' ? new Date().toISOString() : undefined;
        existing.academicNote = 'Learner resubmitted prerequisite verification request.';
        if (existing.academicStatus === 'APPROVED' && !course.enrolledLearnerIds.includes(user.id)) {
          course.enrolledLearnerIds.push(user.id);
        }
        persist();
      }
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
    const completed = req.body?.completed !== false;
    const enrollment = db.enrollments.find(
      (e) => e.courseId === courseId && e.learnerId === user.id && e.academicStatus === 'APPROVED'
    );
    const course = db.courses.find((c) => c.id === courseId);
    if (!enrollment || !course) {
      res.status(404).json({ error: 'Approved enrollment not found.' });
      return;
    }
    if (!course.resourceIds.includes(resourceId)) {
      res.status(400).json({ error: 'Resource is not part of this course syllabus.' });
      return;
    }
    if (completed) {
      if (!enrollment.completedResourceIds.includes(resourceId)) {
        enrollment.completedResourceIds.push(resourceId);
      }
    } else {
      enrollment.completedResourceIds = enrollment.completedResourceIds.filter((id) => id !== resourceId);
    }
    enrollment.progressPercent = recalculateEnrollmentProgress(course, enrollment);
    const issuedCertificate = ensureCertificateForEnrollment(enrollment, course);
    persist();
    res.json({ enrollment, issuedCertificate });
  });

  // ---------------- SECURE FILE DELIVERY (DOCUMENTS ONLY — NEVER PLAIN TEXT) ----------------
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
    const forceDownload = req.query.download === '1' && item.downloadable;
    if (forceDownload) {
      item.downloadsCount += 1;
    }
    persist();

    if (item.filePath) {
      const resolved = path.resolve(UPLOAD_DIR, item.filePath);
      if (!resolved.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(resolved)) {
        res.status(404).json({ error: 'File payload missing from vault.' });
        return;
      }
      sendDiskDocument(res, resolved, item.fileName, forceDownload, item.mimeType);
      return;
    }

    // Serve a real rendered PDF document for cataloged/seeded resources
    const pdfBuf = buildPdfDocumentBuffer({
      title: item.title,
      subtitle: `${item.subject} | ${item.educationLevel}`,
      documentCode: item.id.toUpperCase(),
      metadata: [
        { label: 'Author / Institution', value: item.ownerName },
        { label: 'Curriculum System', value: item.educationSystem || 'Pan-African Curriculum' },
        { label: 'Resource Type', value: `${item.type} (${item.fileSizeLabel})` },
        { label: 'Original Document', value: item.fileName },
        { label: 'Published Date', value: new Date(item.createdAt).toLocaleDateString() },
      ],
      sections: [
        {
          heading: '1. Executive Study Outline',
          body: item.previewSummary || item.description,
        },
        {
          heading: '2. Detailed Academic Notes & Scope',
          body: item.description,
        },
        {
          heading: '3. Verification & Academic Integrity Notice',
          body: `This resource was cataloged on Akademi under contributor "${item.ownerName}". Access tier: ${item.accessTier}. Downloadable permission: ${item.downloadable ? 'Permitted for enrolled/entitled learners' : 'In-viewer reading only'}.`,
        },
      ],
    });

    const basePdfName = item.fileName.replace(/\.[^.]+$/, '') || 'akademi_resource';
    const safePdfName = `${basePdfName.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${forceDownload ? 'attachment' : 'inline'}; filename="${safePdfName}"`
    );
    res.send(pdfBuf);
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
    const forceDownload = req.query.download === '1';

    if (relPath) {
      const resolved = path.resolve(UPLOAD_DIR, relPath);
      if (resolved.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(resolved)) {
        sendDiskDocument(res, resolved, fileName, forceDownload);
        return;
      }
    }

    const applicant = db.users.find((u) => u.id === kyc.userId);
    const pdfBuf = buildPdfDocumentBuffer({
      title:
        req.params.kind === 'credential'
          ? `Teaching Credential Dossier — ${kyc.userName}`
          : `Identity Verification Dossier — ${kyc.userName}`,
      subtitle: `Compliance Record ${kyc.id} · Status: ${kyc.status}`,
      documentCode: kyc.id.toUpperCase(),
      metadata: [
        { label: 'Applicant', value: `${kyc.userName} (${kyc.userEmail})` },
        { label: 'Role / Category', value: `${kyc.role} | ${kyc.accountCategory || 'N/A'}` },
        {
          label: 'Country / System',
          value: `${applicant?.country || 'N/A'} | ${applicant?.educationSystem || 'N/A'}`,
        },
        { label: 'Specialization', value: applicant?.specialization || 'N/A' },
        { label: 'Document Type', value: kyc.documentType },
        {
          label: 'Document Reference',
          value: applicant?.nationalIdNumber || kyc.documentNumberMasked,
        },
        { label: 'Submitted File', value: fileName },
        { label: 'Submitted At', value: new Date(kyc.submittedAt).toLocaleString() },
      ],
      sections: [
        {
          heading: '1. Confidential Compliance Attestation',
          body: `Phone: ${applicant?.phone || 'Not provided'} | Address: ${
            applicant?.homeAddress || 'Not provided'
          }. This compliance dossier is visible strictly to the document owner and Master Admin governance officers.`,
        },
        ...(kyc.reviewNotes
          ? [{ heading: '2. Master Admin Review Notes', body: kyc.reviewNotes }]
          : []),
      ],
    });

    const safePdfName = `${(fileName.replace(/\.[^.]+$/, '') || 'kyc_document').replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${forceDownload ? 'attachment' : 'inline'}; filename="${safePdfName}"`
    );
    res.send(pdfBuf);
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

    const forceDownload = req.query.download === '1';
    if (doc.filePath) {
      const resolved = path.resolve(UPLOAD_DIR, doc.filePath);
      if (resolved.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(resolved)) {
        sendDiskDocument(res, resolved, doc.fileName, forceDownload);
        return;
      }
    }

    const learner = db.users.find((u) => u.id === doc.learnerId);
    const pdfBuf = buildPdfDocumentBuffer({
      title: doc.title,
      subtitle: `Learner Academic Credential · ${doc.educationLevel}`,
      documentCode: doc.id.toUpperCase(),
      metadata: [
        {
          label: 'Learner',
          value: `${learner?.name || 'Learner'}${
            user.role === 'MASTER_ADMIN' && learner?.email ? ` (${learner.email})` : ''
          }`,
        },
        { label: 'Education Level', value: doc.educationLevel },
        { label: 'Issuing Authority', value: doc.institutionIssued },
        { label: 'Submitted File', value: doc.fileName },
        { label: 'Uploaded At', value: new Date(doc.uploadedAt).toLocaleString() },
      ],
      sections: [
        {
          heading: '1. Academic Prerequisite Record',
          body: `This verified academic credential ("${doc.title}") was issued by ${doc.institutionIssued} at the ${doc.educationLevel} tier and submitted into the learner's Academic Vault for prerequisite screening.`,
        },
      ],
    });

    const safePdfName = `${(doc.fileName.replace(/\.[^.]+$/, '') || 'academic_credential').replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${forceDownload ? 'attachment' : 'inline'}; filename="${safePdfName}"`
    );
    res.send(pdfBuf);
  });

  // ---------------- LIVE SESSIONS ----------------
  app.post(
    '/api/sessions',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN', 'MASTER_ADMIN'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      if (user.role !== 'MASTER_ADMIN' && (user.kycStatus !== 'VERIFIED' || user.subscriptionStatus !== 'ACTIVE')) {
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
      if (!canManageCourse(user, course)) {
        res.status(403).json({ error: 'You do not have permission to host a session for this course.' });
        return;
      }
      const title = String(req.body?.title || '').trim();
      const topicSummary = String(req.body?.topicSummary || '').trim();
      const scheduledAt = String(req.body?.scheduledAt || new Date().toISOString());
      const durationMinutes = Math.max(15, Number(req.body?.durationMinutes || 60));
      const accessRule = String(req.body?.accessRule || 'ENROLLED_ONLY') as LiveSession['accessRule'];
      const pinnedResourceIds = Array.isArray(req.body?.pinnedResourceIds)
        ? filterAttachableResourceIds(user, req.body.pinnedResourceIds.map(String))
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
        institutionId: user.institutionId || course.institutionId,
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

  app.patch(
    '/api/sessions/:id',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN', 'MASTER_ADMIN'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      const session = db.liveSessions.find((s) => s.id === req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Live session not found.' });
        return;
      }
      const isAuthorized =
        user.role === 'MASTER_ADMIN' ||
        session.hostId === user.id ||
        (user.institutionId && session.institutionId === user.institutionId);
      if (!isAuthorized) {
        res.status(403).json({ error: 'You do not have permission to edit this live session.' });
        return;
      }
      if (req.body?.title !== undefined) session.title = String(req.body.title).trim() || session.title;
      if (req.body?.topicSummary !== undefined) session.topicSummary = String(req.body.topicSummary).trim();
      if (req.body?.scheduledAt !== undefined) session.scheduledAt = String(req.body.scheduledAt);
      if (req.body?.durationMinutes !== undefined) session.durationMinutes = Math.max(15, Number(req.body.durationMinutes) || 60);
      if (req.body?.accessRule !== undefined) session.accessRule = String(req.body.accessRule) as LiveSession['accessRule'];
      if (req.body?.status !== undefined && ['SCHEDULED', 'LIVE', 'ENDED'].includes(String(req.body.status))) {
        session.status = String(req.body.status) as LiveSession['status'];
        broadcastToSession(session.id, 'session:status', { status: session.status });
      }
      if (Array.isArray(req.body?.pinnedResourceIds)) {
        session.pinnedResourceIds = filterAttachableResourceIds(
          user,
          req.body.pinnedResourceIds.map(String)
        );
      }
      logAudit(user, 'SESSION_UPDATED', 'SESSION', session.id, `${user.name} updated session "${session.title}".`);
      persist();
      res.json({ session });
    }
  );

  app.delete(
    '/api/sessions/:id',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN', 'MASTER_ADMIN'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      const session = db.liveSessions.find((s) => s.id === req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Live session not found.' });
        return;
      }
      const isAuthorized =
        user.role === 'MASTER_ADMIN' ||
        session.hostId === user.id ||
        (user.institutionId && session.institutionId === user.institutionId);
      if (!isAuthorized) {
        res.status(403).json({ error: 'You do not have permission to delete this live session.' });
        return;
      }
      broadcastToSession(session.id, 'session:status', { status: 'ENDED' });
      db.liveSessions = db.liveSessions.filter((s) => s.id !== session.id);
      logAudit(user, 'SESSION_DELETED', 'SESSION', session.id, `${user.name} deleted session "${session.title}".`);
      persist();
      res.json({ deletedId: session.id });
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

    const isHostViewer =
      user.role === 'MASTER_ADMIN' ||
      user.id === session.hostId ||
      Boolean(user.institutionId && session.institutionId === user.institutionId);

    res.json({
      session: isHostViewer ? session : { ...session, attendanceLog: {} },
      pinnedResources,
      participantDirectory,
    });
  });

  app.get('/api/sessions/:id/rtc-config', requireAuth, (req: AuthedRequest, res) => {
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
    const lkUrl = process.env.LIVEKIT_URL?.trim();
    const lkKey = process.env.LIVEKIT_API_KEY?.trim();
    const lkSecret = process.env.LIVEKIT_API_SECRET?.trim();
    const canPublish =
      user.role === 'MASTER_ADMIN' ||
      user.id === session.hostId ||
      Boolean(user.institutionId && session.institutionId === user.institutionId) ||
      session.micGrantedUserIds.includes(user.id);

    if (lkUrl && lkKey && lkSecret) {
      const token = buildLiveKitToken(lkKey, lkSecret, session.id, user, canPublish);
      res.json({
        mode: 'LIVEKIT_SFU',
        livekitUrl: lkUrl,
        roomName: session.id,
        token,
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      return;
    }

    res.json({
      mode: 'WEBRTC_MESH',
      roomName: session.id,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
  });

  // ---------------- VERIFIABLE CERTIFICATES ----------------
  app.get('/api/certificates/mine', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    let certificates: CertificateRecord[];
    if (user.role === 'MASTER_ADMIN') {
      certificates = db.certificates;
    } else if (isContributorRole(user.role)) {
      certificates = db.certificates.filter(
        (c) =>
          c.issuerId === user.id ||
          db.courses.some((crs) => crs.id === c.courseId && canManageCourse(user, crs))
      );
    } else {
      certificates = db.certificates.filter((c) => c.learnerId === user.id);
    }
    res.json({ certificates });
  });

  app.get('/api/files/certificate/:id', requireAuth, async (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const cert = db.certificates.find(
      (c) => c.id === req.params.id || c.certificateCode.toUpperCase() === String(req.params.id).toUpperCase()
    );
    if (!cert) {
      res.status(404).json({ error: 'Certificate record not found.' });
      return;
    }
    const course = db.courses.find((c) => c.id === cert.courseId);
    const authorized =
      user.role === 'MASTER_ADMIN' ||
      cert.learnerId === user.id ||
      cert.issuerId === user.id ||
      Boolean(course && canManageCourse(user, course));
    if (!authorized) {
      res.status(403).json({ error: 'Access denied to this certificate document.' });
      return;
    }

    const origin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    const verifyUrl = `${origin}/?verify=${encodeURIComponent(cert.certificateCode)}`;
    const pdfBuf = await buildCertificatePdfBuffer({
      certificateCode: cert.certificateCode,
      learnerName: cert.learnerName,
      courseTitle: cert.courseTitle,
      subject: cert.subject,
      educationLevel: cert.educationLevel,
      issuerName: cert.issuerName,
      institutionName: cert.institutionName,
      gradeLabel: cert.gradeLabel,
      attendanceMinutes: cert.attendanceMinutes,
      issuedAt: cert.issuedAt,
      verifyUrl,
    });

    const forceDownload = req.query.download === '1';
    const safePdfName = `${cert.certificateCode.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${forceDownload ? 'attachment' : 'inline'}; filename="${safePdfName}"`
    );
    res.send(pdfBuf);
  });

  // ---------------- COURSE Q&A, PEER DISCUSSION & OFFICE HOURS ----------------
  app.get('/api/courses/:courseId/qa', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const course = db.courses.find((c) => c.id === req.params.courseId);
    if (!course) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }
    if (!canAccessCourseFeatures(user, course)) {
      res.status(403).json({ error: 'Approved course enrollment or instructor access required.' });
      return;
    }

    const threads = db.courseQaThreads
      .filter((th) => th.courseId === course.id)
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const mentionCandidates: { id: string; name: string; role: UserRole }[] = [];
    const seen = new Set<string>();
    for (const u of db.users) {
      if (
        !seen.has(u.id) &&
        (u.id === course.ownerId ||
          u.id === course.assignedInstructorId ||
          (course.institutionId && u.institutionId === course.institutionId) ||
          course.enrolledLearnerIds.includes(u.id) ||
          db.enrollments.some((e) => e.courseId === course.id && e.learnerId === u.id && e.academicStatus === 'APPROVED'))
      ) {
        seen.add(u.id);
        mentionCandidates.push({ id: u.id, name: u.name, role: u.role });
      }
    }

    res.json({ threads, mentionCandidates });
  });

  app.post('/api/courses/:courseId/qa', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const course = db.courses.find((c) => c.id === req.params.courseId);
    if (!course) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }
    if (!canAccessCourseFeatures(user, course)) {
      res.status(403).json({ error: 'Approved course enrollment or instructor access required.' });
      return;
    }

    const title = String(req.body?.title || '').trim().slice(0, 180);
    const body = String(req.body?.body || '').trim().slice(0, 2400);
    const requestedOfficeHour = Boolean(req.body?.isOfficeHour);
    const officeHourSlotRaw = req.body?.officeHourSlot ?? req.body?.officeHourSchedule;
    const officeHourSlot = officeHourSlotRaw
      ? String(officeHourSlotRaw).trim().slice(0, 120)
      : undefined;

    if (!title || !body) {
      res.status(400).json({ error: 'Thread title and question/announcement body are required.' });
      return;
    }
    const isStaff = canManageCourse(user, course);
    const isOfficeHour = isStaff && requestedOfficeHour;
    const mentions = extractCourseMentions(`${title} ${body}`, course);
    const nowIso = new Date().toISOString();

    const thread: CourseQaThread = {
      id: `qa-${crypto.randomUUID().slice(0, 8)}`,
      courseId: course.id,
      courseTitle: course.title,
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      title,
      body,
      isOfficeHour,
      officeHourSlot: isOfficeHour ? officeHourSlot : undefined,
      isPinned: Boolean(isStaff && req.body?.isPinned),
      upvoterIds: [user.id],
      mentions,
      createdAt: nowIso,
      updatedAt: nowIso,
      replies: [],
    };

    db.courseQaThreads.unshift(thread);
    persist();
    for (const client of connectedSockets) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ event: 'qa:updated', payload: { courseId: course.id, thread } }));
      }
    }
    res.status(201).json({ thread });
  });

  app.post('/api/qa/:threadId/replies', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const thread = db.courseQaThreads.find((th) => th.id === req.params.threadId);
    if (!thread) {
      res.status(404).json({ error: 'Q&A thread not found.' });
      return;
    }
    const course = db.courses.find((c) => c.id === thread.courseId);
    if (!course || !canAccessCourseFeatures(user, course)) {
      res.status(403).json({ error: 'Access denied to this course Q&A room.' });
      return;
    }
    const body = String(req.body?.body || '').trim().slice(0, 2000);
    if (!body) {
      res.status(400).json({ error: 'Reply body cannot be empty.' });
      return;
    }
    const nowIso = new Date().toISOString();
    const reply: CourseQaReply = {
      id: `qar-${crypto.randomUUID().slice(0, 8)}`,
      threadId: thread.id,
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      body,
      upvoterIds: [],
      isInstructorVerified: false,
      mentions: extractCourseMentions(body, course),
      createdAt: nowIso,
    };
    thread.replies.push(reply);
    thread.updatedAt = nowIso;
    persist();
    for (const client of connectedSockets) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ event: 'qa:updated', payload: { courseId: course.id, thread } }));
      }
    }
    res.status(201).json({ thread, reply });
  });

  app.post('/api/qa/:threadId/upvote', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const thread = db.courseQaThreads.find((th) => th.id === req.params.threadId);
    if (!thread) {
      res.status(404).json({ error: 'Q&A thread not found.' });
      return;
    }
    const course = db.courses.find((c) => c.id === thread.courseId);
    if (!course || !canAccessCourseFeatures(user, course)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    if (thread.upvoterIds.includes(user.id)) {
      thread.upvoterIds = thread.upvoterIds.filter((id) => id !== user.id);
    } else {
      thread.upvoterIds.push(user.id);
    }
    persist();
    res.json({ thread });
  });

  app.post('/api/qa/:threadId/replies/:replyId/upvote', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const thread = db.courseQaThreads.find((th) => th.id === req.params.threadId);
    if (!thread) {
      res.status(404).json({ error: 'Q&A thread not found.' });
      return;
    }
    const course = db.courses.find((c) => c.id === thread.courseId);
    if (!course || !canAccessCourseFeatures(user, course)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    const reply = thread.replies.find((r) => r.id === req.params.replyId);
    if (!reply) {
      res.status(404).json({ error: 'Reply not found.' });
      return;
    }
    if (reply.upvoterIds.includes(user.id)) {
      reply.upvoterIds = reply.upvoterIds.filter((id) => id !== user.id);
    } else {
      reply.upvoterIds.push(user.id);
    }
    persist();
    res.json({ thread });
  });

  app.post('/api/qa/:threadId/replies/:replyId/verify', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const thread = db.courseQaThreads.find((th) => th.id === req.params.threadId);
    if (!thread) {
      res.status(404).json({ error: 'Q&A thread not found.' });
      return;
    }
    const course = db.courses.find((c) => c.id === thread.courseId);
    if (!course || !canManageCourse(user, course)) {
      res.status(403).json({ error: 'Only course instructors or admins can verify answers.' });
      return;
    }
    const reply = thread.replies.find((r) => r.id === req.params.replyId);
    if (!reply) {
      res.status(404).json({ error: 'Reply not found.' });
      return;
    }
    reply.isInstructorVerified = !reply.isInstructorVerified;
    if (reply.isInstructorVerified) {
      reply.verifiedByName = user.name;
    } else {
      reply.verifiedByName = undefined;
    }
    thread.updatedAt = new Date().toISOString();
    persist();
    for (const client of connectedSockets) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ event: 'qa:updated', payload: { courseId: course.id, thread } }));
      }
    }
    res.json({ thread });
  });

  app.post('/api/qa/:threadId/pin', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const thread = db.courseQaThreads.find((th) => th.id === req.params.threadId);
    if (!thread) {
      res.status(404).json({ error: 'Q&A thread not found.' });
      return;
    }
    const course = db.courses.find((c) => c.id === thread.courseId);
    if (!course || !canManageCourse(user, course)) {
      res.status(403).json({ error: 'Only course instructors or admins can pin threads.' });
      return;
    }
    thread.isPinned = !thread.isPinned;
    persist();
    res.json({ thread });
  });

  app.delete('/api/qa/:threadId', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const thread = db.courseQaThreads.find((th) => th.id === req.params.threadId);
    if (!thread) {
      res.status(404).json({ error: 'Q&A thread not found.' });
      return;
    }
    const course = db.courses.find((c) => c.id === thread.courseId);
    if (thread.authorId !== user.id && (!course || !canManageCourse(user, course))) {
      res.status(403).json({ error: 'Not authorized to delete this Q&A thread.' });
      return;
    }
    db.courseQaThreads = db.courseQaThreads.filter((th) => th.id !== thread.id);
    persist();
    res.json({ deletedId: thread.id });
  });

  // ---------------- INTERACTIVE ASSESSMENTS & PAST-PAPER QUIZZES ----------------
  function sanitizeQuizForViewer(quiz: QuizItem, user: StoredUser, course: CourseItem): QuizItem {
    if (canManageCourse(user, course)) return quiz;
    return {
      ...quiz,
      questions: quiz.questions.map((q) => ({
        ...q,
        correctOptionIndex: undefined,
        acceptedKeywords: undefined,
      })),
    };
  }

  app.get('/api/quizzes/mine', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const accessibleCourses = db.courses.filter((c) => canAccessCourseFeatures(user, c));
    const accessibleCourseIds = new Set(accessibleCourses.map((c) => c.id));

    const quizzes = db.quizzes
      .filter((q) => {
        if (!accessibleCourseIds.has(q.courseId)) return false;
        const course = accessibleCourses.find((c) => c.id === q.courseId)!;
        return q.published || canManageCourse(user, course);
      })
      .map((q) => {
        const course = accessibleCourses.find((c) => c.id === q.courseId)!;
        return sanitizeQuizForViewer(q, user, course);
      });

    const attempts = db.quizAttempts.filter((a) => {
      if (a.learnerId === user.id) return true;
      const course = db.courses.find((c) => c.id === a.courseId);
      return Boolean(course && canManageCourse(user, course));
    });

    res.json({ quizzes, attempts });
  });

  app.get('/api/courses/:courseId/quizzes', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const course = db.courses.find((c) => c.id === req.params.courseId);
    if (!course) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }
    if (!canAccessCourseFeatures(user, course)) {
      res.status(403).json({ error: 'Approved enrollment or instructor access required.' });
      return;
    }
    const isStaff = canManageCourse(user, course);
    const quizzes = db.quizzes
      .filter((q) => q.courseId === course.id && (isStaff || q.published))
      .map((q) => sanitizeQuizForViewer(q, user, course));

    const attempts = db.quizAttempts.filter(
      (a) => a.courseId === course.id && (isStaff || a.learnerId === user.id)
    );
    res.json({ quizzes, attempts });
  });

  app.post(
    '/api/courses/:courseId/quizzes',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN', 'MASTER_ADMIN'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      const course = db.courses.find((c) => c.id === req.params.courseId);
      if (!course) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      if (!canManageCourse(user, course)) {
        res.status(403).json({ error: 'You do not have permission to create quizzes in this course.' });
        return;
      }
      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      const curriculumTag = String(req.body?.curriculumTag || 'GENERAL') as QuizCurriculumTag;
      const timeLimitMinutes = Math.max(2, Math.min(180, Number(req.body?.timeLimitMinutes || 20)));
      const passingPercent = Math.max(20, Math.min(100, Number(req.body?.passingPercent || 60)));
      const rawQuestions = Array.isArray(req.body?.questions) ? req.body.questions : [];
      if (!title || rawQuestions.length === 0) {
        res.status(400).json({ error: 'Quiz title and at least one question are required.' });
        return;
      }

      const questions: QuizQuestion[] = rawQuestions.map((rq: Record<string, unknown>, idx: number) => {
        const qKind = rq.kind === 'STRUCTURED' || rq.type === 'STRUCTURED' ? 'STRUCTURED' : 'MCQ';
        return {
          id: String(rq.id || `q-${idx + 1}-${crypto.randomUUID().slice(0, 4)}`),
          kind: qKind,
          prompt: String(rq.prompt || '').trim(),
          marks: Math.max(1, Number(rq.marks || 5)),
          options: qKind === 'MCQ' && Array.isArray(rq.options) ? rq.options.map((o) => String(o).trim()).filter(Boolean) : undefined,
          correctOptionIndex: qKind === 'MCQ' ? Math.max(0, Number(rq.correctOptionIndex || 0)) : undefined,
          acceptedKeywords:
            qKind === 'STRUCTURED' && Array.isArray(rq.acceptedKeywords)
              ? rq.acceptedKeywords.map((k) => String(k).trim()).filter(Boolean)
              : undefined,
          sampleAnswer: rq.sampleAnswer ? String(rq.sampleAnswer).trim() : undefined,
          workedSolution: String(rq.workedSolution || 'Review the course syllabus notes for the step-by-step derivation.').trim(),
        };
      });

      const quiz: QuizItem = {
        id: `quiz-${crypto.randomUUID().slice(0, 8)}`,
        courseId: course.id,
        courseTitle: course.title,
        ownerId: user.id,
        ownerName: user.name,
        title,
        description: description || `${curriculumTag} timed assessment for ${course.title}.`,
        curriculumTag,
        isPastPaper: Boolean(req.body?.isPastPaper),
        timeLimitMinutes,
        passingPercent,
        published: req.body?.published !== false,
        questions,
        createdAt: new Date().toISOString(),
      };

      db.quizzes.unshift(quiz);
      persist();
      res.status(201).json({ quiz });
    }
  );

  app.patch(
    '/api/quizzes/:id',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN', 'MASTER_ADMIN'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      const quiz = db.quizzes.find((q) => q.id === req.params.id);
      if (!quiz) {
        res.status(404).json({ error: 'Quiz not found.' });
        return;
      }
      const course = db.courses.find((c) => c.id === quiz.courseId);
      if (!course || !canManageCourse(user, course)) {
        res.status(403).json({ error: 'Not authorized to edit this quiz.' });
        return;
      }
      if (req.body?.title !== undefined) quiz.title = String(req.body.title).trim() || quiz.title;
      if (req.body?.description !== undefined) quiz.description = String(req.body.description).trim();
      if (req.body?.curriculumTag !== undefined) quiz.curriculumTag = String(req.body.curriculumTag) as QuizCurriculumTag;
      if (req.body?.isPastPaper !== undefined) quiz.isPastPaper = Boolean(req.body.isPastPaper);
      if (req.body?.timeLimitMinutes !== undefined) quiz.timeLimitMinutes = Math.max(2, Math.min(180, Number(req.body.timeLimitMinutes) || 20));
      if (req.body?.passingPercent !== undefined) quiz.passingPercent = Math.max(20, Math.min(100, Number(req.body.passingPercent) || 60));
      if (req.body?.published !== undefined) quiz.published = Boolean(req.body.published);
      if (Array.isArray(req.body?.questions) && req.body.questions.length > 0) {
        quiz.questions = req.body.questions.map((rq: Record<string, unknown>, idx: number) => {
          const qKind = rq.kind === 'STRUCTURED' || rq.type === 'STRUCTURED' ? 'STRUCTURED' : 'MCQ';
          return {
            id: String(rq.id || `q-${idx + 1}-${crypto.randomUUID().slice(0, 4)}`),
            kind: qKind,
            prompt: String(rq.prompt || '').trim(),
            marks: Math.max(1, Number(rq.marks || 5)),
            options: qKind === 'MCQ' && Array.isArray(rq.options) ? rq.options.map((o) => String(o).trim()).filter(Boolean) : undefined,
            correctOptionIndex: qKind === 'MCQ' ? Math.max(0, Number(rq.correctOptionIndex || 0)) : undefined,
            acceptedKeywords:
              qKind === 'STRUCTURED' && Array.isArray(rq.acceptedKeywords)
                ? rq.acceptedKeywords.map((k) => String(k).trim()).filter(Boolean)
                : undefined,
            sampleAnswer: rq.sampleAnswer ? String(rq.sampleAnswer).trim() : undefined,
            workedSolution: String(rq.workedSolution || '').trim(),
          };
        });
      }
      persist();
      res.json({ quiz });
    }
  );

  app.delete(
    '/api/quizzes/:id',
    requireAuth,
    requireRole('SOLO_EDUCATOR', 'INSTITUTION_ADMIN', 'COURSE_ADMIN', 'MASTER_ADMIN'),
    (req: AuthedRequest, res) => {
      const user = req.authUser!;
      const quiz = db.quizzes.find((q) => q.id === req.params.id);
      if (!quiz) {
        res.status(404).json({ error: 'Quiz not found.' });
        return;
      }
      const course = db.courses.find((c) => c.id === quiz.courseId);
      if (!course || !canManageCourse(user, course)) {
        res.status(403).json({ error: 'Not authorized to delete this quiz.' });
        return;
      }
      db.quizzes = db.quizzes.filter((q) => q.id !== quiz.id);
      db.quizAttempts = db.quizAttempts.filter((a) => a.quizId !== quiz.id);
      persist();
      res.json({ deletedId: quiz.id });
    }
  );

  app.post('/api/quizzes/:id/submit', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const quiz = db.quizzes.find((q) => q.id === req.params.id);
    if (!quiz) {
      res.status(404).json({ error: 'Quiz not found.' });
      return;
    }
    const course = db.courses.find((c) => c.id === quiz.courseId);
    if (!course || !canAccessCourseFeatures(user, course)) {
      res.status(403).json({ error: 'Approved enrollment required to submit this assessment.' });
      return;
    }

    const answers = (req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {}) as Record<
      string,
      number | string
    >;
    const durationSeconds = Math.max(1, Number(req.body?.durationSeconds || 60));

    let earnedMarks = 0;
    let totalMarks = 0;

    const questionResults: QuizQuestionResult[] = quiz.questions.map((q) => {
      totalMarks += q.marks;
      const submitted = answers[q.id];
      if (q.kind === 'MCQ') {
        const selectedIndex = typeof submitted === 'number' ? submitted : Number(submitted ?? -1);
        const isCorrect = selectedIndex === q.correctOptionIndex;
        const awarded = isCorrect ? q.marks : 0;
        earnedMarks += awarded;
        const correctOptionText =
          q.options && typeof q.correctOptionIndex === 'number'
            ? q.options[q.correctOptionIndex] || ''
            : '';
        return {
          questionId: q.id,
          prompt: q.prompt,
          kind: 'MCQ',
          maxMarks: q.marks,
          earnedMarks: awarded,
          isCorrect,
          submittedAnswer:
            q.options && selectedIndex >= 0 && selectedIndex < q.options.length
              ? q.options[selectedIndex]
              : 'No answer selected',
          correctAnswer: correctOptionText,
          correctAnswerDisplay: correctOptionText,
          workedSolution: q.workedSolution,
        };
      }

      // STRUCTURED auto-grading against rubric acceptedKeywords
      const responseText = String(submitted || '').trim();
      const lowerResp = responseText.toLowerCase();
      const keywords = q.acceptedKeywords || [];
      const matched = keywords.filter((kw) => lowerResp.includes(kw.toLowerCase()));
      let ratio = 0;
      if (keywords.length === 0) {
        ratio = responseText.length >= 12 ? 1 : 0;
      } else if (matched.length >= Math.max(1, Math.ceil(keywords.length * 0.6))) {
        ratio = 1;
      } else if (matched.length >= 1) {
        ratio = Math.min(0.85, matched.length / keywords.length);
      }
      const awarded = Number((q.marks * ratio).toFixed(1));
      earnedMarks += awarded;
      const expectedDisplay = q.sampleAnswer || keywords.join(', ');
      return {
        questionId: q.id,
        prompt: q.prompt,
        kind: 'STRUCTURED',
        maxMarks: q.marks,
        earnedMarks: awarded,
        isCorrect: ratio >= 0.6,
        submittedAnswer: responseText || 'No written response submitted',
        correctAnswer: expectedDisplay,
        correctAnswerDisplay: expectedDisplay,
        matchedKeywords: matched,
        workedSolution: q.workedSolution,
      };
    });

    const percentScore = totalMarks > 0 ? Math.round((earnedMarks / totalMarks) * 100) : 0;
    const passed = percentScore >= quiz.passingPercent;
    const gradeLabel = gradeToLabel(percentScore);

    const attempt: QuizAttempt = {
      id: `qat-${crypto.randomUUID().slice(0, 8)}`,
      quizId: quiz.id,
      courseId: course.id,
      learnerId: user.id,
      learnerName: user.name,
      answers,
      submittedAt: new Date().toISOString(),
      durationSeconds,
      scoreEarned: Number(earnedMarks.toFixed(1)),
      totalMarks,
      percentScore,
      passed,
      gradeLabel,
      questionResults,
    };

    db.quizAttempts.unshift(attempt);

    // Automatically update learner's enrollment progressPercent, gradeLabel, and certificate if 100%
    let updatedEnrollment: EnrollmentRecord | undefined;
    let issuedCertificate: CertificateRecord | null = null;
    const enrollment = db.enrollments.find(
      (e) => e.courseId === course.id && e.learnerId === user.id && e.academicStatus === 'APPROVED'
    );
    if (enrollment) {
      const learnerCourseAttempts = db.quizAttempts.filter(
        (a) => a.courseId === course.id && a.learnerId === user.id
      );
      const bestByQuiz = new Map<string, number>();
      for (const a of learnerCourseAttempts) {
        bestByQuiz.set(a.quizId, Math.max(bestByQuiz.get(a.quizId) || 0, a.percentScore));
      }
      const scores = Array.from(bestByQuiz.values());
      const avgScore =
        scores.length > 0
          ? Math.round(scores.reduce((acc, s) => acc + s, 0) / scores.length)
          : percentScore;
      enrollment.gradeLabel = gradeToLabel(avgScore);
      enrollment.progressPercent = recalculateEnrollmentProgress(course, enrollment);
      issuedCertificate = ensureCertificateForEnrollment(enrollment, course);
      updatedEnrollment = enrollment;
      sendToUser(user.id, 'enrollment:updated', { enrollment });
    }

    logAudit(
      user,
      'QUIZ_SUBMITTED',
      'COURSE',
      course.id,
      `${user.name} submitted "${quiz.title}" (${percentScore}% · ${gradeLabel}).`
    );
    persist();
    res.status(201).json({ attempt, enrollment: updatedEnrollment, issuedCertificate });
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

  // Ticket edit/delete and message edit/delete
  app.patch('/api/tickets/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const ticket = db.tickets.find((t) => t.id === req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }
    if (user.role !== 'MASTER_ADMIN' && ticket.userId !== user.id) {
      res.status(403).json({ error: 'Access denied to edit this support ticket.' });
      return;
    }
    if (req.body?.subject !== undefined) ticket.subject = String(req.body.subject).trim() || ticket.subject;
    if (req.body?.category !== undefined) ticket.category = String(req.body.category) as SupportTicket['category'];
    if (user.role === 'MASTER_ADMIN' && req.body?.status !== undefined) {
      ticket.status = String(req.body.status) as SupportTicket['status'];
    }
    persist();
    res.json({ ticket });
  });

  app.delete('/api/tickets/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const ticket = db.tickets.find((t) => t.id === req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }
    if (user.role !== 'MASTER_ADMIN' && ticket.userId !== user.id) {
      res.status(403).json({ error: 'Access denied to delete this support ticket.' });
      return;
    }
    db.tickets = db.tickets.filter((t) => t.id !== ticket.id);
    persist();
    res.json({ deletedId: ticket.id });
  });

  app.patch('/api/tickets/:ticketId/messages/:msgId', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const ticket = db.tickets.find((t) => t.id === req.params.ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }
    const msg = ticket.messages.find((m) => m.id === req.params.msgId);
    if (!msg) {
      res.status(404).json({ error: 'Message not found.' });
      return;
    }
    if (user.role !== 'MASTER_ADMIN' && msg.senderId !== user.id) {
      res.status(403).json({ error: 'You can only edit your own messages.' });
      return;
    }
    const body = String(req.body?.body || '').trim();
    if (!body) {
      res.status(400).json({ error: 'Message body cannot be empty.' });
      return;
    }
    msg.body = body;
    persist();
    res.json({ ticket });
  });

  app.delete('/api/tickets/:ticketId/messages/:msgId', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const ticket = db.tickets.find((t) => t.id === req.params.ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Support ticket not found.' });
      return;
    }
    const msg = ticket.messages.find((m) => m.id === req.params.msgId);
    if (!msg) {
      res.status(404).json({ error: 'Message not found.' });
      return;
    }
    if (user.role !== 'MASTER_ADMIN' && msg.senderId !== user.id) {
      res.status(403).json({ error: 'You can only delete your own messages.' });
      return;
    }
    ticket.messages = ticket.messages.filter((m) => m.id !== msg.id);
    persist();
    res.json({ ticket });
  });

  app.delete('/api/messages/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const thread = db.messageThreads.find((t) => t.id === req.params.id);
    if (!thread) {
      res.status(404).json({ error: 'Thread not found.' });
      return;
    }
    if (user.role !== 'MASTER_ADMIN' && !thread.participantIds.includes(user.id)) {
      res.status(403).json({ error: 'Access denied to delete this conversation.' });
      return;
    }
    db.messageThreads = db.messageThreads.filter((t) => t.id !== thread.id);
    persist();
    res.json({ deletedId: thread.id });
  });

  app.patch('/api/messages/:threadId/messages/:msgId', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const thread = db.messageThreads.find((t) => t.id === req.params.threadId);
    if (!thread) {
      res.status(404).json({ error: 'Thread not found.' });
      return;
    }
    const msg = thread.messages.find((m) => m.id === req.params.msgId);
    if (!msg) {
      res.status(404).json({ error: 'Message not found.' });
      return;
    }
    if (user.role !== 'MASTER_ADMIN' && msg.senderId !== user.id) {
      res.status(403).json({ error: 'You can only edit your own messages.' });
      return;
    }
    const body = String(req.body?.body || '').trim();
    if (!body) {
      res.status(400).json({ error: 'Message body cannot be empty.' });
      return;
    }
    msg.body = body;
    persist();
    res.json({ thread });
  });

  app.delete('/api/messages/:threadId/messages/:msgId', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const thread = db.messageThreads.find((t) => t.id === req.params.threadId);
    if (!thread) {
      res.status(404).json({ error: 'Thread not found.' });
      return;
    }
    const msg = thread.messages.find((m) => m.id === req.params.msgId);
    if (!msg) {
      res.status(404).json({ error: 'Message not found.' });
      return;
    }
    if (user.role !== 'MASTER_ADMIN' && msg.senderId !== user.id) {
      res.status(403).json({ error: 'You can only delete your own messages.' });
      return;
    }
    thread.messages = thread.messages.filter((m) => m.id !== msg.id);
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
    if (user.mustChangePassword) {
      ws.close(4003, 'Password change required');
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
        } else if (action === 'DISMISS_HAND') {
          const targetId = String(payload.targetUserId || '');
          session.raisedHandUserIds = session.raisedHandUserIds.filter((id) => id !== targetId);
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
          session.raisedHandUserIds = session.raisedHandUserIds.filter((id) => id !== targetId);
          session.micGrantedUserIds = session.micGrantedUserIds.filter((id) => id !== targetId);
          const participantDirectory: Record<string, { id: string; name: string; role: UserRole }> = {};
          for (const pid of session.activeParticipantIds) {
            const pu = db.users.find((u) => u.id === pid);
            if (pu) participantDirectory[pid] = { id: pu.id, name: pu.name, role: pu.role };
          }
          sendToUser(targetId, 'session:kicked', { sessionId: session.id });
          broadcastToSession(session.id, 'session:presence', {
            activeParticipantIds: session.activeParticipantIds,
            participantDirectory,
          });
        } else if (action === 'PIN_RESOURCE') {
          const resourceId = String(payload.resourceId || '');
          const resObj = db.resources.find((r) => r.id === resourceId);
          if (resObj && canAttachResource(freshUser, resObj) && !session.pinnedResourceIds.includes(resourceId)) {
            session.pinnedResourceIds.push(resourceId);
          }
          const course = db.courses.find((c) => c.id === session.courseId);
          if (
            course &&
            resObj &&
            canAttachResource(freshUser, resObj) &&
            !course.resourceIds.includes(resourceId)
          ) {
            course.resourceIds.push(resourceId);
          }
          const pinnedResources = db.resources
            .filter((r) => session.pinnedResourceIds.includes(r.id))
            .map((r) => ({ ...r, filePath: undefined }));
          broadcastToSession(session.id, 'session:pinned_resources', { pinnedResources });
        }
        persist();
      }

      // Collaborative Lecture Whiteboard & Laser Slide Pointer
      if (event === 'session:board_stroke' && client.sessionId) {
        const session = db.liveSessions.find((s) => s.id === client.sessionId);
        const freshUser = db.users.find((u) => u.id === client.userId);
        if (!session || !freshUser) return;
        const strokeRaw = payload.stroke as WhiteboardStroke | undefined;
        if (!strokeRaw || !Array.isArray(strokeRaw.points) || strokeRaw.points.length === 0) return;

        const cleanStroke: WhiteboardStroke = {
          id: String(strokeRaw.id || `stk-${crypto.randomUUID().slice(0, 8)}`),
          userId: freshUser.id,
          userName: freshUser.name,
          tool:
            strokeRaw.tool === 'HIGHLIGHTER' || strokeRaw.tool === 'TEXT'
              ? strokeRaw.tool
              : 'PEN',
          color: String(strokeRaw.color || '#F6F3EB').slice(0, 24),
          width: Math.max(1, Math.min(20, Number(strokeRaw.width || 3))),
          points: strokeRaw.points.slice(0, 250).map((pt) => ({
            x: Math.max(0, Math.min(1, Number(pt.x) || 0)),
            y: Math.max(0, Math.min(1, Number(pt.y) || 0)),
          })),
          text: strokeRaw.text ? String(strokeRaw.text).slice(0, 120) : undefined,
          createdAt: new Date().toISOString(),
        };

        if (!session.whiteboardStrokes) session.whiteboardStrokes = [];
        session.whiteboardStrokes.push(cleanStroke);
        if (session.whiteboardStrokes.length > 350) {
          session.whiteboardStrokes = session.whiteboardStrokes.slice(-350);
        }
        persist();
        broadcastToSession(session.id, 'session:board_stroke', { stroke: cleanStroke });
      }

      if (event === 'session:board_undo' && client.sessionId) {
        const session = db.liveSessions.find((s) => s.id === client.sessionId);
        const freshUser = db.users.find((u) => u.id === client.userId);
        if (!session || !freshUser || !session.whiteboardStrokes) return;
        const isHost =
          freshUser.id === session.hostId ||
          freshUser.role === 'MASTER_ADMIN' ||
          Boolean(freshUser.institutionId && session.institutionId === freshUser.institutionId);
        if (isHost) {
          session.whiteboardStrokes.pop();
        } else {
          for (let i = session.whiteboardStrokes.length - 1; i >= 0; i--) {
            if (session.whiteboardStrokes[i].userId === freshUser.id) {
              session.whiteboardStrokes.splice(i, 1);
              break;
            }
          }
        }
        persist();
        broadcastToSession(session.id, 'session:board_sync', { strokes: session.whiteboardStrokes });
      }

      if (event === 'session:board_clear' && client.sessionId) {
        const session = db.liveSessions.find((s) => s.id === client.sessionId);
        const freshUser = db.users.find((u) => u.id === client.userId);
        if (!session || !freshUser) return;
        const isHost =
          freshUser.id === session.hostId ||
          freshUser.role === 'MASTER_ADMIN' ||
          Boolean(freshUser.institutionId && session.institutionId === freshUser.institutionId);
        if (!isHost) return;
        session.whiteboardStrokes = [];
        persist();
        broadcastToSession(session.id, 'session:board_sync', { strokes: [] });
      }

      if (event === 'session:board_pointer' && client.sessionId) {
        const session = db.liveSessions.find((s) => s.id === client.sessionId);
        const freshUser = db.users.find((u) => u.id === client.userId);
        if (!session || !freshUser) return;
        const active = payload.active !== false;
        const pointer: BoardPointerState | null = active
          ? {
              userId: freshUser.id,
              userName: freshUser.name,
              x: Math.max(0, Math.min(1, Number(payload.x) || 0)),
              y: Math.max(0, Math.min(1, Number(payload.y) || 0)),
              active: true,
            }
          : null;
        session.boardPointer = pointer;
        broadcastToSession(session.id, 'session:board_pointer', { pointer });
      }

      // Live In-Session Comprehension Polls
      if (event === 'session:poll_create' && client.sessionId) {
        const session = db.liveSessions.find((s) => s.id === client.sessionId);
        const freshUser = db.users.find((u) => u.id === client.userId);
        if (!session || !freshUser) return;
        const isHost =
          freshUser.id === session.hostId ||
          freshUser.role === 'MASTER_ADMIN' ||
          Boolean(freshUser.institutionId && session.institutionId === freshUser.institutionId);
        if (!isHost) return;

        const question = String(payload.question || '').trim().slice(0, 220);
        const rawOpts = Array.isArray(payload.options)
          ? payload.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 6)
          : [];
        if (!question || rawOpts.length < 2) return;

        const poll: LivePoll = {
          id: `poll-${crypto.randomUUID().slice(0, 8)}`,
          question,
          createdById: freshUser.id,
          createdByName: freshUser.name,
          createdAt: new Date().toISOString(),
          isOpen: true,
          options: rawOpts.map((text, idx) => ({
            id: `opt-${idx + 1}-${crypto.randomUUID().slice(0, 4)}`,
            text,
            voterIds: [],
          })),
        };
        if (!session.polls) session.polls = [];
        session.polls.unshift(poll);
        persist();
        broadcastToSession(session.id, 'session:polls_sync', { polls: session.polls });
      }

      if (event === 'session:poll_vote' && client.sessionId) {
        const session = db.liveSessions.find((s) => s.id === client.sessionId);
        if (!session || !session.polls) return;
        const pollId = String(payload.pollId || '');
        const optionId = String(payload.optionId || '');
        const poll = session.polls.find((p) => p.id === pollId);
        if (!poll || !poll.isOpen) return;
        const targetOpt = poll.options.find((o) => o.id === optionId);
        if (!targetOpt) return;
        for (const opt of poll.options) {
          opt.voterIds = opt.voterIds.filter((id) => id !== client.userId);
        }
        targetOpt.voterIds.push(client.userId);
        persist();
        broadcastToSession(session.id, 'session:polls_sync', { polls: session.polls });
      }

      if (event === 'session:poll_toggle' && client.sessionId) {
        const session = db.liveSessions.find((s) => s.id === client.sessionId);
        const freshUser = db.users.find((u) => u.id === client.userId);
        if (!session || !freshUser || !session.polls) return;
        const isHost =
          freshUser.id === session.hostId ||
          freshUser.role === 'MASTER_ADMIN' ||
          Boolean(freshUser.institutionId && session.institutionId === freshUser.institutionId);
        if (!isHost) return;
        const pollId = String(payload.pollId || '');
        if (payload.delete) {
          session.polls = session.polls.filter((p) => p.id !== pollId);
        } else {
          const poll = session.polls.find((p) => p.id === pollId);
          if (poll) poll.isOpen = !poll.isOpen;
        }
        persist();
        broadcastToSession(session.id, 'session:polls_sync', { polls: session.polls });
      }

      // Multi-Participant WebRTC Peer-to-Peer Mesh Signaling
      if (event === 'webrtc:signal' && client.sessionId) {
        const session = db.liveSessions.find((s) => s.id === client.sessionId);
        const targetUserId = String(payload.targetUserId || '');
        if (
          !session ||
          !targetUserId ||
          targetUserId === client.userId ||
          !session.activeParticipantIds.includes(client.userId) ||
          !session.activeParticipantIds.includes(targetUserId)
        ) {
          return;
        }
        const sender = db.users.find((u) => u.id === client.userId);
        sendToUser(targetUserId, 'webrtc:signal', {
          sessionId: session.id,
          fromUserId: client.userId,
          fromName: sender?.name || 'Participant',
          signalType: payload.signalType,
          sdp: payload.sdp,
          candidate: payload.candidate,
        });
      }

      if (event === 'webrtc:media_state' && client.sessionId) {
        const session = db.liveSessions.find((s) => s.id === client.sessionId);
        if (!session || !session.activeParticipantIds.includes(client.userId)) return;
        broadcastToSession(session.id, 'webrtc:peer_media', {
          userId: client.userId,
          micEnabled: Boolean(payload.micEnabled),
          camEnabled: Boolean(payload.camEnabled),
          screenSharing: Boolean(payload.screenSharing),
        });
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
          const participantDirectory: Record<string, { id: string; name: string; role: UserRole }> = {};
          for (const pid of session.activeParticipantIds) {
            const pu = db.users.find((u) => u.id === pid);
            if (pu) participantDirectory[pid] = { id: pu.id, name: pu.name, role: pu.role };
          }
          persist();
          broadcastToSession(session.id, 'session:presence', {
            activeParticipantIds: session.activeParticipantIds,
            participantDirectory,
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
