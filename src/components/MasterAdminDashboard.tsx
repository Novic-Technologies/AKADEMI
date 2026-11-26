import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  CreditCard,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Play,
  Plus,
  Radio,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { apiFetch, fetchAuthorizedBlob } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type {
  AccessTier,
  AccountCategory,
  AccountRequest,
  AuditLogEntry,
  CourseItem,
  EnrollmentRecord,
  KycSubmission,
  LearnerAcademicDoc,
  LedgerTransaction,
  LiveSession,
  MasterAnalyticsSummary,
  OutboxEmail,
  ResourceItem,
  ResourceType,
  UserProfile,
  UserRole,
} from '../types/akademi';
import { CommunicationPanel } from './CommunicationPanel';
import { ContentInspectorModal, type InspectedContent } from './ContentInspectorModal';
import { DashboardShell } from './DashboardShell';
import { LiveClassroomModal } from './LiveClassroomModal';

interface AdminAcademicDoc extends LearnerAcademicDoc {
  learnerName: string;
  learnerEmail: string;
}

interface MasterAdminDashboardProps {
  currentUser: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
  onLogout: () => void;
  onGoPublic: () => void;
}

type AdminTab =
  | 'OVERVIEW'
  | 'REQUESTS'
  | 'COMPLIANCE'
  | 'CONTENT_LEDGER'
  | 'OUTBOX_AUDIT'
  | 'SUPPORT';

export const MasterAdminDashboard: React.FC<MasterAdminDashboardProps> = ({
  currentUser,
  onUserUpdated,
  onLogout,
  onGoPublic,
}) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<AdminTab>('OVERVIEW');
  const [summary, setSummary] = useState<MasterAnalyticsSummary | null>(null);
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [kycList, setKycList] = useState<KycSubmission[]>([]);
  const [academicDocs, setAcademicDocs] = useState<AdminAcademicDoc[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRecord[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [educationLevels, setEducationLevels] = useState<string[]>([
    'UNEB PLE (Primary Leaving)',
    'UNEB UCE (Uganda O-Level)',
    'UNEB UACE (Uganda A-Level)',
    'UBTEB / DIT Technical & TVET',
    'NCHE Undergraduate (Year 1–4)',
    'BSc / BA Graduate',
    'Postgraduate / Masters / PhD',
  ]);
  const [outboxEmails, setOutboxEmails] = useState<OutboxEmail[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [ledger, setLedger] = useState<LedgerTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Quick messaging target
  const [commTab, setCommTab] = useState<'SUPPORT' | 'THREADS'>('SUPPORT');
  const [messageRecipientId, setMessageRecipientId] = useState<string | undefined>(undefined);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [resourceSearch, setResourceSearch] = useState('');

  // Inline confirmation id for deletes
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  // Request modals
  const [approvingReq, setApprovingReq] = useState<AccountRequest | null>(null);
  const [customTempPass, setCustomTempPass] = useState('');
  const [issuedCredentialBanner, setIssuedCredentialBanner] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [rejectingReq, setRejectingReq] = useState<AccountRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [viewingRequest, setViewingRequest] = useState<AccountRequest | null>(null);
  const [editingRequest, setEditingRequest] = useState<AccountRequest | null>(null);

  // Content & classroom modals
  const [inspected, setInspected] = useState<InspectedContent | null>(null);
  const [activeClassroomId, setActiveClassroomId] = useState<string | null>(null);
  const [viewingSessionLog, setViewingSessionLog] = useState<LiveSession | null>(null);
  const [viewingCourse, setViewingCourse] = useState<CourseItem | null>(null);
  const [kycNotesMap, setKycNotesMap] = useState<Record<string, string>>({});

  // User CRUD modals
  const [viewingUser, setViewingUser] = useState<UserProfile | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    role: 'LEARNER' as UserRole,
    password: '',
    institutionName: '',
    specialization: '',
    bio: '',
    country: 'Uganda',
    educationSystem: 'UNEB / NCHE Uganda',
    educationLevel: 'NCHE Undergraduate (Year 1–4)',
    kycStatus: 'VERIFIED' as UserProfile['kycStatus'],
    subscriptionStatus: 'ACTIVE' as UserProfile['subscriptionStatus'],
    platformPassActive: false,
    mustChangePassword: false,
  });
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editUserPassword, setEditUserPassword] = useState('');

  // Academic Doc edit modal
  const [editingAcademicDoc, setEditingAcademicDoc] = useState<AdminAcademicDoc | null>(null);

  // Resource Add / Edit modals
  const [showAddResource, setShowAddResource] = useState(false);
  const [newResForm, setNewResForm] = useState({
    title: '',
    description: '',
    type: 'PDF' as ResourceType,
    subject: 'General',
    educationLevel: 'NCHE Undergraduate (Year 1–4)',
    accessTier: 'PUBLIC_FREE' as AccessTier,
    priceUsd: 10,
    downloadable: true,
  });
  const [newResFile, setNewResFile] = useState<File | null>(null);
  const [editingResource, setEditingResource] = useState<ResourceItem | null>(null);
  const [editResFile, setEditResFile] = useState<File | null>(null);

  // Course Add / Edit modals
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [newCourseForm, setNewCourseForm] = useState({
    title: '',
    description: '',
    subject: 'General',
    requiredLevel: 'NCHE Undergraduate (Year 1–4)',
    accessTier: 'ENROLLED_ONLY' as AccessTier,
    priceUsd: 25,
    requiresAcademicVerification: true,
    resourceIds: [] as string[],
  });
  const [editingCourse, setEditingCourse] = useState<CourseItem | null>(null);

  // Live Session Add / Edit modals
  const [showAddSession, setShowAddSession] = useState(false);
  const [newSessionForm, setNewSessionForm] = useState({
    courseId: '',
    title: '',
    topicSummary: '',
    accessRule: 'ENROLLED_ONLY' as LiveSession['accessRule'],
    scheduledAt: '',
    durationMinutes: 60,
    startImmediately: false,
    pinnedResourceIds: [] as string[],
  });
  const [editingSession, setEditingSession] = useState<LiveSession | null>(null);

  // Enrollment Add / Edit modals
  const [showAddEnrollment, setShowAddEnrollment] = useState(false);
  const [newEnrollmentForm, setNewEnrollmentForm] = useState({
    courseId: '',
    learnerId: '',
    academicStatus: 'APPROVED' as EnrollmentRecord['academicStatus'],
    academicNote: 'Enrolled via Master Admin governance console.',
  });
  const [editingEnrollment, setEditingEnrollment] = useState<EnrollmentRecord | null>(null);

  const loadAdminData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<{
        summary: MasterAnalyticsSummary;
        accountRequests: AccountRequest[];
        kycSubmissions: KycSubmission[];
        academicDocs?: AdminAcademicDoc[];
        users: UserProfile[];
        resources: ResourceItem[];
        courses?: CourseItem[];
        enrollments?: EnrollmentRecord[];
        liveSessions?: LiveSession[];
        educationLevels?: string[];
        outboxEmails: OutboxEmail[];
        auditLogs: AuditLogEntry[];
        ledger: LedgerTransaction[];
      }>('/api/admin/overview');

      setSummary(data.summary);
      setRequests(data.accountRequests);
      setKycList(data.kycSubmissions);
      setAcademicDocs(data.academicDocs || []);
      setAllUsers(data.users);
      setResources(data.resources);
      setCourses(data.courses || []);
      setEnrollments(data.enrollments || []);
      setLiveSessions(data.liveSessions || []);
      if (data.educationLevels && data.educationLevels.length > 0) {
        setEducationLevels(data.educationLevels);
      }
      setOutboxEmails(data.outboxEmails);
      setAuditLogs(data.auditLogs);
      setLedger(data.ledger);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Master Admin console.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const resourceAcceptForType = (type: ResourceType) => {
    switch (type) {
      case 'PDF':
        return '.pdf';
      case 'DOCX':
        return '.docx,.doc,.odt,.rtf,.pdf';
      case 'BOOK':
        return '.pdf,.docx,.epub';
      case 'IMAGE':
        return '.png,.jpg,.jpeg,.webp';
      case 'VIDEO':
        return '.mp4,.webm,.mov,.m4v';
      default:
        return '.pdf,.docx,.doc,.odt,.rtf,.epub,.png,.jpg,.jpeg,.webp,.mp4,.webm,.mov,.m4v';
    }
  };

  const inputCls =
    'w-full rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-2 text-sm text-[var(--ak-ink)] placeholder:text-[var(--ak-muted)] focus:border-[#C9642E] focus:outline-none';
  const btnSecondary =
    'inline-flex items-center gap-1.5 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3 py-1.5 text-sm font-medium text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)] whitespace-nowrap shrink-0';
  const btnDanger =
    'inline-flex items-center gap-1.5 rounded-lg border border-[var(--ak-err-bd)] bg-[var(--ak-err-bg)] px-3 py-1.5 text-sm font-medium text-[var(--ak-err-fg)] hover:opacity-90 whitespace-nowrap shrink-0';

  const statusTone = (status: string) => {
    if (status === 'APPROVED' || status === 'VERIFIED' || status === 'ACTIVE' || status === 'PUBLISHED' || status === 'LIVE') {
      return 'text-[var(--ak-ok-fg)]';
    }
    if (status === 'REJECTED' || status === 'SUSPENDED' || status === 'ENDED') {
      return 'text-[var(--ak-err-fg)]';
    }
    return 'text-[var(--ak-warn-fg)]';
  };

  // ---- USER CRUD ----
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch<{ user: UserProfile; issuedPassword: string }>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(newUserForm),
      });
      setIssuedCredentialBanner({ email: res.user.email, password: res.issuedPassword });
      setShowAddUser(false);
      setNewUserForm({
        name: '',
        email: '',
        role: 'LEARNER',
        password: '',
        institutionName: '',
        specialization: '',
        bio: '',
        country: 'Uganda',
        educationSystem: 'UNEB / NCHE Uganda',
        educationLevel: educationLevels[0] || 'NCHE Undergraduate (Year 1–4)',
        kycStatus: 'VERIFIED',
        subscriptionStatus: 'ACTIVE',
        platformPassActive: false,
        mustChangePassword: false,
      });
      setNotice(`Account created for ${res.user.name}.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create user.');
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setError('');
    try {
      const res = await apiFetch<{ user: UserProfile }>(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingUser.name,
          email: editingUser.email,
          role: editingUser.role,
          institutionName: editingUser.institutionName || '',
          specialization: editingUser.specialization,
          bio: editingUser.bio,
          country: editingUser.country || '',
          educationSystem: editingUser.educationSystem || '',
          educationLevel: editingUser.educationLevel || '',
          phone: editingUser.phone || '',
          homeAddress: editingUser.homeAddress || '',
          followPriceUsd: editingUser.followPriceUsd,
          kycStatus: editingUser.kycStatus,
          subscriptionStatus: editingUser.subscriptionStatus,
          platformPassActive: editingUser.platformPassActive,
          mustChangePassword: editingUser.mustChangePassword,
          resetPassword: editUserPassword.trim() || undefined,
        }),
      });
      if (res.user.id === currentUser.id) {
        onUserUpdated(res.user);
      }
      setEditingUser(null);
      setEditUserPassword('');
      setNotice(`Updated user account for ${res.user.name}.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update user.');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setError('');
    try {
      await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      setConfirmDeleteKey(null);
      setNotice('User account and owned assets removed.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete user.');
    }
  };

  // ---- REQUESTS CRUD ----
  const handleApproveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingReq) return;
    setError('');
    try {
      const res = await apiFetch<{ issuedTempPassword: string; user: UserProfile }>(
        `/api/admin/requests/${approvingReq.id}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ tempPassword: customTempPass.trim() }),
        }
      );
      setIssuedCredentialBanner({
        email: res.user.email,
        password: res.issuedTempPassword,
      });
      setApprovingReq(null);
      setCustomTempPass('');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve request.');
    }
  };

  const handleRejectRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingReq) return;
    try {
      await apiFetch(`/api/admin/requests/${rejectingReq.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason }),
      });
      setRejectingReq(null);
      setRejectReason('');
      setNotice('Contributor request rejected and notification queued.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request.');
    }
  };

  const handleSaveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest) return;
    setError('');
    try {
      await apiFetch(`/api/admin/requests/${editingRequest.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editingRequest),
      });
      setEditingRequest(null);
      setNotice('Contributor request updated.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update request.');
    }
  };

  const handleDeleteRequest = async (id: string) => {
    setError('');
    try {
      await apiFetch(`/api/admin/requests/${id}`, { method: 'DELETE' });
      setConfirmDeleteKey(null);
      setNotice('Account request deleted.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete request.');
    }
  };

  // ---- KYC & ACADEMIC DOCS CRUD ----
  const handleReviewKyc = async (kycId: string, decision: 'APPROVED' | 'REJECTED') => {
    setError('');
    try {
      await apiFetch(`/api/admin/kyc/${kycId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          notes: kycNotesMap[kycId] || '',
        }),
      });
      setNotice(`Identity verification marked ${decision}.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'KYC review failed.');
    }
  };

  const handleDeleteKyc = async (kycId: string) => {
    setError('');
    try {
      await apiFetch(`/api/admin/kyc/${kycId}`, { method: 'DELETE' });
      setConfirmDeleteKey(null);
      setNotice('KYC submission removed.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete KYC record.');
    }
  };

  const handleSaveAcademicDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAcademicDoc) return;
    setError('');
    try {
      const fd = new FormData();
      fd.append('title', editingAcademicDoc.title);
      fd.append('educationLevel', editingAcademicDoc.educationLevel);
      fd.append('institutionIssued', editingAcademicDoc.institutionIssued);
      await apiFetch(`/api/learner/academic-docs/${editingAcademicDoc.id}`, {
        method: 'PATCH',
        body: fd,
      });
      setEditingAcademicDoc(null);
      setNotice('Learner academic document updated.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update academic document.');
    }
  };

  const handleDeleteAcademicDoc = async (docId: string) => {
    setError('');
    try {
      await apiFetch(`/api/learner/academic-docs/${docId}`, { method: 'DELETE' });
      setConfirmDeleteKey(null);
      setNotice('Learner academic document deleted.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete academic document.');
    }
  };

  const inspectRemoteFile = async (
    url: string,
    meta: {
      title: string;
      subtitle?: string;
      fileName: string;
      metadata?: { label: string; value: string }[];
    },
    download = false
  ) => {
    setError('');
    try {
      const targetUrl = download ? `${url}${url.includes('?') ? '&' : '?'}download=1` : url;
      const blob = await fetchAuthorizedBlob(targetUrl);
      const normalizedFileName =
        blob.type === 'application/pdf' && !meta.fileName.toLowerCase().endsWith('.pdf')
          ? `${meta.fileName.replace(/\.[^.]+$/, '')}.pdf`
          : meta.fileName;
      if (download) {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = normalizedFileName;
        a.click();
        URL.revokeObjectURL(objUrl);
        return;
      }
      setInspected({
        title: meta.title,
        subtitle: meta.subtitle,
        fileName: normalizedFileName,
        mimeType: blob.type || 'application/pdf',
        objectUrl: URL.createObjectURL(blob),
        blob,
        canDownload: true,
        metadata: meta.metadata,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to inspect document.');
    }
  };

  const handleInspectKycDoc = async (k: KycSubmission, kind: 'id' | 'credential', download = false) => {
    const fileName = kind === 'id' ? k.idFileName : k.credentialFileName;
    await inspectRemoteFile(
      `/api/files/kyc/${k.id}/${kind}`,
      {
        title: `${k.userName} — ${kind === 'id' ? 'Identity Document' : 'Credential Document'}`,
        subtitle: `${k.documentType} (${k.documentNumberMasked}) · ${k.userEmail}`,
        fileName,
        metadata: [
          { label: 'Applicant', value: k.userName },
          { label: 'Email', value: k.userEmail },
          { label: 'Document Type', value: k.documentType },
          { label: 'ID Number', value: k.documentNumberMasked },
          { label: 'Status', value: k.status },
          { label: 'Submitted', value: new Date(k.submittedAt).toLocaleString() },
        ],
      },
      download
    );
  };

  const handleToggleSubscription = async (
    userId: string,
    currentStatus: string,
    name: string
  ) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setError('');
    try {
      await apiFetch(`/api/admin/users/${userId}/subscription`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus }),
      });
      setNotice(
        `${name} subscription automatically switched to ${nextStatus}. Live sessions and publishing updated instantaneously.`
      );
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change subscription.');
    }
  };

  // ---- RESOURCES CRUD ----
  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!newResFile) {
      setError('Please select a document or media file to publish (plain text is not accepted).');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('title', newResForm.title);
      fd.append('description', newResForm.description);
      fd.append('type', newResForm.type);
      fd.append('subject', newResForm.subject);
      fd.append('educationLevel', newResForm.educationLevel);
      fd.append('accessTier', newResForm.accessTier);
      fd.append('priceUsd', String(newResForm.priceUsd));
      fd.append('downloadable', String(newResForm.downloadable));
      fd.append('file', newResFile);
      await apiFetch('/api/contributor/resources', { method: 'POST', body: fd });
      setShowAddResource(false);
      setNewResFile(null);
      setNewResForm({
        title: '',
        description: '',
        type: 'PDF',
        subject: 'General',
        educationLevel: educationLevels[0] || 'NCHE Undergraduate (Year 1–4)',
        accessTier: 'PUBLIC_FREE',
        priceUsd: 10,
        downloadable: true,
      });
      setNotice('Resource published to platform catalog.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create resource.');
    }
  };

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingResource) return;
    setError('');
    try {
      const fd = new FormData();
      fd.append('title', editingResource.title);
      fd.append('description', editingResource.description);
      fd.append('type', editingResource.type);
      fd.append('subject', editingResource.subject);
      fd.append('educationLevel', editingResource.educationLevel);
      fd.append('accessTier', editingResource.accessTier);
      fd.append('priceUsd', String(editingResource.priceUsd));
      fd.append('downloadable', String(editingResource.downloadable));
      fd.append('status', editingResource.status);
      if (editResFile) fd.append('file', editResFile);

      await apiFetch(`/api/resources/${editingResource.id}`, { method: 'PATCH', body: fd });
      setEditingResource(null);
      setEditResFile(null);
      setNotice('Resource updated.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update resource.');
    }
  };

  const handleToggleResourceModeration = async (item: ResourceItem) => {
    const next = item.status === 'PUBLISHED' ? 'SUSPENDED' : 'PUBLISHED';
    try {
      await apiFetch(`/api/admin/resources/${item.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: next }),
      });
      setNotice(`Resource "${item.title}" updated to ${next}.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update resource.');
    }
  };

  const handleDeleteResource = async (id: string) => {
    setError('');
    try {
      await apiFetch(`/api/resources/${id}`, { method: 'DELETE' });
      setConfirmDeleteKey(null);
      setNotice('Resource removed from platform.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete resource.');
    }
  };

  // ---- COURSES CRUD ----
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/contributor/courses', {
        method: 'POST',
        body: JSON.stringify(newCourseForm),
      });
      setShowAddCourse(false);
      setNewCourseForm({
        title: '',
        description: '',
        subject: 'General',
        requiredLevel: educationLevels[0] || 'NCHE Undergraduate (Year 1–4)',
        accessTier: 'ENROLLED_ONLY',
        priceUsd: 25,
        requiresAcademicVerification: true,
        resourceIds: [],
      });
      setNotice('Course created.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create course.');
    }
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse) return;
    setError('');
    try {
      await apiFetch(`/api/courses/${editingCourse.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editingCourse.title,
          description: editingCourse.description,
          subject: editingCourse.subject,
          requiredLevel: editingCourse.requiredLevel,
          accessTier: editingCourse.accessTier,
          priceUsd: editingCourse.priceUsd,
          requiresAcademicVerification: editingCourse.requiresAcademicVerification,
          resourceIds: editingCourse.resourceIds,
          status: editingCourse.status,
        }),
      });
      setEditingCourse(null);
      setNotice('Course updated.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update course.');
    }
  };

  const handleDeleteCourse = async (id: string) => {
    setError('');
    try {
      await apiFetch(`/api/courses/${id}`, { method: 'DELETE' });
      setConfirmDeleteKey(null);
      setNotice('Course deleted.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete course.');
    }
  };

  // ---- SESSIONS CRUD ----
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const targetCourseId = newSessionForm.courseId || courses[0]?.id;
      const res = await apiFetch<{ session: LiveSession }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          courseId: targetCourseId,
          title: newSessionForm.title,
          topicSummary: newSessionForm.topicSummary,
          accessRule: newSessionForm.accessRule,
          scheduledAt: newSessionForm.scheduledAt
            ? new Date(newSessionForm.scheduledAt).toISOString()
            : new Date().toISOString(),
          durationMinutes: newSessionForm.durationMinutes,
          startImmediately: newSessionForm.startImmediately,
          pinnedResourceIds: newSessionForm.pinnedResourceIds,
        }),
      });
      setShowAddSession(false);
      setNewSessionForm({
        courseId: courses[0]?.id || '',
        title: '',
        topicSummary: '',
        accessRule: 'ENROLLED_ONLY',
        scheduledAt: '',
        durationMinutes: 60,
        startImmediately: false,
        pinnedResourceIds: [],
      });
      await loadAdminData();
      if (res.session.status === 'LIVE') {
        setActiveClassroomId(res.session.id);
      } else {
        setNotice('Live session scheduled.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to schedule session.');
    }
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession) return;
    setError('');
    try {
      await apiFetch(`/api/sessions/${editingSession.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editingSession.title,
          topicSummary: editingSession.topicSummary,
          scheduledAt: editingSession.scheduledAt,
          durationMinutes: editingSession.durationMinutes,
          accessRule: editingSession.accessRule,
          status: editingSession.status,
          pinnedResourceIds: editingSession.pinnedResourceIds,
        }),
      });
      setEditingSession(null);
      setNotice('Live session updated.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update session.');
    }
  };

  const handleSessionStatus = async (sessionId: string, status: LiveSession['status']) => {
    setError('');
    try {
      await apiFetch(`/api/sessions/${sessionId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change session status.');
    }
  };

  const handleDeleteSession = async (id: string) => {
    setError('');
    try {
      await apiFetch(`/api/sessions/${id}`, { method: 'DELETE' });
      setConfirmDeleteKey(null);
      setNotice('Live session deleted.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete session.');
    }
  };

  // ---- ENROLLMENTS CRUD ----
  const handleCreateEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/admin/enrollments', {
        method: 'POST',
        body: JSON.stringify({
          courseId: newEnrollmentForm.courseId || courses[0]?.id,
          learnerId: newEnrollmentForm.learnerId || learnerUsers[0]?.id,
          academicStatus: newEnrollmentForm.academicStatus,
          academicNote: newEnrollmentForm.academicNote,
        }),
      });
      setShowAddEnrollment(false);
      setNotice('Learner enrolled.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create enrollment.');
    }
  };

  const handleSaveEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEnrollment) return;
    setError('');
    try {
      await apiFetch(`/api/enrollments/${editingEnrollment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          academicStatus: editingEnrollment.academicStatus,
          academicNote: editingEnrollment.academicNote || '',
          gradeLabel: editingEnrollment.gradeLabel || '',
          progressPercent: editingEnrollment.progressPercent,
        }),
      });
      setEditingEnrollment(null);
      setNotice('Enrollment record updated.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update enrollment.');
    }
  };

  const handleDeleteEnrollment = async (id: string) => {
    setError('');
    try {
      await apiFetch(`/api/enrollments/${id}`, { method: 'DELETE' });
      setConfirmDeleteKey(null);
      setNotice('Enrollment removed.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove enrollment.');
    }
  };

  const jumpToMessageUser = (userId: string) => {
    setMessageRecipientId(userId);
    setCommTab('THREADS');
    setTab('SUPPORT');
  };

  const filteredContributors =
    summary?.contributorBreakdown.filter(
      (c) =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

  const filteredUsers = allUsers.filter((u) => {
    const matchRole = userRoleFilter === 'ALL' || u.role === userRoleFilter;
    const q = userSearch.trim().toLowerCase();
    const matchQ =
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.institutionName || '').toLowerCase().includes(q);
    return matchRole && matchQ;
  });

  const filteredResources = resources.filter((r) => {
    const q = resourceSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      r.title.toLowerCase().includes(q) ||
      r.ownerName.toLowerCase().includes(q) ||
      r.subject.toLowerCase().includes(q)
    );
  });

  const learnerUsers = allUsers.filter((u) => u.role === 'LEARNER');

  return (
    <>
      <DashboardShell
        breadcrumbLeft="Akademi"
        breadcrumbRight={t.masterAdminConsole}
        userName={currentUser.name}
        userMeta={t.masterAdminRole}
        currentUser={currentUser}
        onUserUpdated={onUserUpdated}
        educationLevels={educationLevels}
        navItems={[
          { id: 'OVERVIEW', label: t.tabPlatformOverview, icon: LayoutDashboard },
          {
            id: 'REQUESTS',
            label: `${t.tabAccountRequests} (${summary?.pendingRequests ?? 0})`,
            icon: UserCheck,
          },
          {
            id: 'COMPLIANCE',
            label: `${t.tabIdVerification} (${summary?.pendingKyc ?? 0})`,
            icon: ShieldCheck,
          },
          { id: 'CONTENT_LEDGER', label: t.tabModerationLedger, icon: CreditCard },
          { id: 'OUTBOX_AUDIT', label: t.tabOutboxAudit, icon: Mail },
          { id: 'SUPPORT', label: t.tabSupportAppeals, icon: MessageSquare },
        ]}
        activeTab={tab}
        onSelectTab={(id) => setTab(id as AdminTab)}
        onGoPublic={onGoPublic}
        onLogout={onLogout}
        headerRight={
          <button
            type="button"
            onClick={loadAdminData}
            className="min-h-[40px] rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3.5 py-2 text-sm font-semibold text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)] whitespace-nowrap"
          >
            {t.refreshMetrics}
          </button>
        }
      >
        {error && (
          <div className="rounded-lg border border-[var(--ak-err-bd)] bg-[var(--ak-err-bg)] px-4 py-3 text-sm text-[var(--ak-err-fg)]">
            {error}
          </div>
        )}
        {notice && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--ak-ok-bd)] bg-[var(--ak-ok-bg)] px-4 py-3 text-sm text-[var(--ak-ok-fg)]">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice('')}
              className="text-sm font-medium underline shrink-0"
            >
              {t.dismiss}
            </button>
          </div>
        )}

        {issuedCredentialBanner && (
          <div className="rounded-xl border border-[var(--ak-info-bd)] bg-[var(--ak-info-bg)] p-4 text-sm text-[var(--ak-info-fg)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-[var(--ak-ink)]">
                  Account Credentials Provisioned &amp; Emailed to User
                </p>
                <p className="mt-1 text-sm">
                  Email: <span className="font-mono font-semibold text-[var(--ak-accent-ink)]">{issuedCredentialBanner.email}</span>{' '}
                  · Temp Password:{' '}
                  <span className="font-mono font-semibold text-[var(--ak-accent-ink)]">{issuedCredentialBanner.password}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIssuedCredentialBanner(null)}
                className="text-sm font-medium underline shrink-0"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {loading && !summary ? (
          <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-10 text-center text-sm text-[var(--ak-muted)]">
            Loading platform governance metrics...
          </div>
        ) : (
          <>
            {tab === 'OVERVIEW' && summary && (
              <div className="space-y-8">
                {/* KPI Strip */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    {
                      label: 'Contributors',
                      value: summary.totalContributors,
                      sub: `${summary.activeContributors} active plans`,
                    },
                    {
                      label: 'Learners',
                      value: summary.totalLearners,
                      sub: `${summary.totalEnrollments} approved enrollments`,
                    },
                    {
                      label: 'Uploaded Materials',
                      value: summary.totalResources,
                      sub: `${summary.totalCourses} structured courses`,
                    },
                    {
                      label: 'Pending Approvals',
                      value: summary.pendingRequests + summary.pendingKyc,
                      sub: `${summary.pendingRequests} req · ${summary.pendingKyc} IDs`,
                    },
                    {
                      label: 'Gross Volume',
                      value: `$${summary.grossPlatformVolumeUsd.toFixed(2)}`,
                      sub: 'Courses, books & plans',
                    },
                    {
                      label: 'Platform Commission',
                      value: `$${summary.platformCommissionUsd.toFixed(2)}`,
                      sub: 'Platform fee + subs',
                    },
                  ].map((kpi) => (
                    <div
                      key={kpi.label}
                      className="min-w-0 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-4"
                    >
                      <p className="text-sm text-[var(--ak-muted)]">{kpi.label}</p>
                      <p className="mt-1.5 text-2xl font-semibold text-[var(--ak-ink)] font-mono-nums">
                        {kpi.value}
                      </p>
                      <p className="mt-1 text-sm text-[var(--ak-muted)]">{kpi.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Contributor Directory & Instant Subscription Control */}
                <section className="min-w-0 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ak-divider)] px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                        Contributor Directory, Resource Breakdown &amp; Instant Subscription Control
                      </h2>
                      <p className="text-sm text-[var(--ak-muted)]">
                        Toggling a subscription immediately opens or locks the user&apos;s dashboard
                        and live session permissions.
                      </p>
                    </div>
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Filter by contributor or email..."
                      className="w-full sm:w-64 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-1.5 text-sm text-[var(--ak-ink)] placeholder:text-[var(--ak-muted)]"
                    />
                  </div>

                  {/* Mobile Cards */}
                  <div className="divide-y divide-[var(--ak-divider)] md:hidden">
                    {filteredContributors.map((c) => (
                      <div key={c.userId} className="p-4 space-y-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[var(--ak-ink)] break-words">{c.name}</p>
                            <p className="text-[var(--ak-muted)] break-all">
                              {c.role.replace('_', ' ')} · {c.email}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleSubscription(c.userId, c.subscriptionStatus, c.name)
                            }
                            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
                              c.subscriptionStatus === 'ACTIVE'
                                ? 'border border-[var(--ak-err-bd)] bg-[var(--ak-err-bg)] text-[var(--ak-err-fg)]'
                                : 'bg-emerald-700 text-white hover:bg-emerald-600'
                            }`}
                          >
                            {c.subscriptionStatus === 'ACTIVE' ? t.suspendAction : t.activateAction}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono-nums text-[var(--ak-ink-2)]">
                          <span>
                            KYC: <strong className={statusTone(c.kycStatus)}>{c.kycStatus}</strong>
                          </span>
                          <span>
                            Plan:{' '}
                            <strong className={statusTone(c.subscriptionStatus)}>
                              {c.subscriptionStatus}
                            </strong>
                          </span>
                          <span>Uploads: {c.totalUploads}</span>
                          <span>Courses: {c.coursesCount}</span>
                          <span>Students: {c.studentsCount}</span>
                          <span>Followers: {c.followersCount}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block">
                    <table className="w-full table-fixed text-left text-sm">
                      <thead className="border-b border-[var(--ak-divider)] bg-[var(--ak-recessed)] text-[var(--ak-muted)]">
                        <tr>
                          <th className="w-[28%] px-4 py-3 font-medium">Contributor</th>
                          <th className="w-[12%] px-3 py-3 font-medium">KYC</th>
                          <th className="w-[22%] px-3 py-3 font-medium">Materials</th>
                          <th className="w-[14%] px-3 py-3 text-right font-medium">Reach</th>
                          <th className="w-[12%] px-3 py-3 font-medium">Plan</th>
                          <th className="w-[12%] px-4 py-3 text-right font-medium">Switch</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--ak-divider)]">
                        {filteredContributors.map((c) => (
                          <tr key={c.userId} className="hover:bg-[var(--ak-elevated)]">
                            <td className="px-4 py-3 align-top">
                              <p className="font-medium text-[var(--ak-ink)] break-words">{c.name}</p>
                              <p className="text-[var(--ak-muted)] break-all">
                                {c.role.replace('_', ' ')} · {c.email}
                              </p>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <span className={`font-medium ${statusTone(c.kycStatus)}`}>
                                {c.kycStatus}
                              </span>
                            </td>
                            <td className="px-3 py-3 align-top font-mono-nums">
                              <p className="font-semibold text-[var(--ak-ink)]">{c.totalUploads} total</p>
                              <p className="text-xs text-[var(--ak-muted)]">
                                {c.byType.PDF} PDF · {c.byType.DOCX} DOCX · {c.byType.VIDEO} Vid ·{' '}
                                {c.byType.IMAGE} Img · {c.byType.BOOK} Bk
                              </p>
                            </td>
                            <td className="px-3 py-3 align-top text-right font-mono-nums text-[var(--ak-ink-2)]">
                              <p>{c.coursesCount} courses</p>
                              <p className="text-xs text-[var(--ak-muted)]">
                                {c.studentsCount} stud · {c.followersCount} fol
                              </p>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <span className={`font-medium break-words ${statusTone(c.subscriptionStatus)}`}>
                                {c.subscriptionStatus.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-top text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleSubscription(c.userId, c.subscriptionStatus, c.name)
                                }
                                className={`rounded-md px-2.5 py-1 text-sm font-medium whitespace-nowrap ${
                                  c.subscriptionStatus === 'ACTIVE'
                                    ? 'border border-[var(--ak-err-bd)] bg-[var(--ak-err-bg)] text-[var(--ak-err-fg)] hover:opacity-90'
                                    : 'bg-emerald-700 text-white hover:bg-emerald-600'
                                }`}
                              >
                                {c.subscriptionStatus === 'ACTIVE'
                                  ? t.suspendAction
                                  : t.activateAction}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Most Enrolled Courses */}
                <section className="min-w-0 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)]">
                  <div className="border-b border-[var(--ak-divider)] px-5 py-4">
                    <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                      Most Enrolled Courses Across Akademi
                    </h2>
                  </div>
                  <div className="divide-y divide-[var(--ak-divider)]">
                    {summary.mostEnrolledCourses.map((course, idx) => (
                      <div
                        key={course.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-[var(--ak-ink)] break-words">
                            0{idx + 1}. {course.title}
                          </p>
                          <p className="text-sm text-[var(--ak-muted)] break-words">
                            {course.ownerName} · {course.subject}
                          </p>
                        </div>
                        <span className="font-mono-nums text-sm font-semibold text-[var(--ak-accent-ink)] shrink-0">
                          {course.enrolledCount} enrolled learners
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Full Platform Users Directory with Complete CRUD */}
                <section className="min-w-0 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ak-divider)] px-5 py-4">
                    <div>
                      <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                        Registered Platform Users Directory ({filteredUsers.length} of {allUsers.length})
                      </h2>
                      <p className="text-sm text-[var(--ak-muted)]">
                        Create, inspect, edit permissions/passwords, message, or remove any account.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="search"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search user name or email..."
                        className="w-48 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-1.5 text-sm text-[var(--ak-ink)]"
                      />
                      <select
                        value={userRoleFilter}
                        onChange={(e) => setUserRoleFilter(e.target.value as 'ALL' | UserRole)}
                        className="rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-1.5 text-sm text-[var(--ak-ink)]"
                      >
                        <option value="ALL">All Roles</option>
                        <option value="MASTER_ADMIN">Master Admin</option>
                        <option value="INSTITUTION_ADMIN">Institution Admin</option>
                        <option value="SOLO_EDUCATOR">Solo Educator</option>
                        <option value="COURSE_ADMIN">Course Admin</option>
                        <option value="LEARNER">Learner</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowAddUser(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9642E] px-3.5 py-1.5 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] whitespace-nowrap"
                      >
                        <Plus className="h-4 w-4" />
                        Add User
                      </button>
                    </div>
                  </div>

                  {/* Mobile Users List */}
                  <div className="divide-y divide-[var(--ak-divider)] md:hidden">
                    {filteredUsers.map((u) => (
                      <div key={u.id} className="p-4 space-y-2.5 text-sm">
                        <div>
                          <p className="font-semibold text-[var(--ak-ink)] break-words">{u.name}</p>
                          <p className="font-mono text-[var(--ak-muted)] break-all">{u.email}</p>
                          <p className="text-[var(--ak-ink-2)] break-words">
                            {u.role.replace('_', ' ')}
                            {u.institutionName ? ` · ${u.institutionName}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ak-muted)]">
                          <span>KYC: {u.kycStatus}</span>
                          <span>
                            Plan:{' '}
                            {u.role === 'LEARNER'
                              ? u.platformPassActive
                                ? 'AKADEMI PASS'
                                : 'FREE'
                              : u.subscriptionStatus}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button type="button" onClick={() => setViewingUser(u)} className={btnSecondary}>
                            <Eye className="h-3.5 w-3.5" /> View
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUser({ ...u });
                              setEditUserPassword('');
                            }}
                            className={btnSecondary}
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Edit
                          </button>
                          {u.id !== currentUser.id && (
                            <button
                              type="button"
                              onClick={() => jumpToMessageUser(u.id)}
                              className={btnSecondary}
                            >
                              <MessageSquare className="h-3.5 w-3.5" /> Message
                            </button>
                          )}
                          {u.id !== currentUser.id && (
                            confirmDeleteKey === `user:${u.id}` ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u.id)}
                                className={btnDanger}
                              >
                                Confirm Delete
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteKey(`user:${u.id}`)}
                                className={btnDanger}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Users Table */}
                  <div className="hidden md:block">
                    <table className="w-full table-fixed text-left text-sm">
                      <thead className="border-b border-[var(--ak-divider)] bg-[var(--ak-recessed)] text-[var(--ak-muted)]">
                        <tr>
                          <th className="w-[26%] px-4 py-3 font-medium">User</th>
                          <th className="w-[20%] px-3 py-3 font-medium">Role &amp; Institution</th>
                          <th className="w-[11%] px-3 py-3 font-medium">KYC</th>
                          <th className="w-[13%] px-3 py-3 font-medium">Plan / Pass</th>
                          <th className="w-[30%] px-4 py-3 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--ak-divider)]">
                        {filteredUsers.map((u) => (
                          <tr key={u.id} className="hover:bg-[var(--ak-elevated)]">
                            <td className="px-4 py-2.5 align-top">
                              <p className="font-medium text-[var(--ak-ink)] break-words">{u.name}</p>
                              <p className="font-mono text-xs text-[var(--ak-muted)] break-all">{u.email}</p>
                            </td>
                            <td className="px-3 py-2.5 align-top text-[var(--ak-ink-2)] break-words">
                              {u.role.replace('_', ' ')}
                              {u.institutionName ? ` · ${u.institutionName}` : ''}
                            </td>
                            <td className={`px-3 py-2.5 align-top font-medium ${statusTone(u.kycStatus)}`}>
                              {u.kycStatus}
                            </td>
                            <td className="px-3 py-2.5 align-top text-[var(--ak-ink-2)] break-words">
                              {u.role === 'LEARNER'
                                ? u.platformPassActive
                                  ? 'AKADEMI PASS'
                                  : 'FREE'
                                : u.subscriptionStatus.replace('_', ' ')}
                            </td>
                            <td className="px-4 py-2.5 align-top text-right">
                              <div className="flex flex-wrap justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setViewingUser(u)}
                                  className={btnSecondary}
                                >
                                  <Eye className="h-3.5 w-3.5" /> View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingUser({ ...u });
                                    setEditUserPassword('');
                                  }}
                                  className={btnSecondary}
                                >
                                  <Edit3 className="h-3.5 w-3.5" /> Edit
                                </button>
                                {u.id !== currentUser.id && (
                                  <button
                                    type="button"
                                    onClick={() => jumpToMessageUser(u.id)}
                                    className={btnSecondary}
                                  >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {u.id !== currentUser.id && (
                                  confirmDeleteKey === `user:${u.id}` ? (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteUser(u.id)}
                                      className={btnDanger}
                                    >
                                      Confirm
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteKey(`user:${u.id}`)}
                                      className={btnDanger}
                                      aria-label={`Delete ${u.name}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {tab === 'REQUESTS' && (
              <div className="space-y-4">
                <div className="border-b border-[var(--ak-divider)] pb-3">
                  <h2 className="text-lg font-semibold text-[var(--ak-ink)]">
                    Public Account Requests Queue
                  </h2>
                  <p className="text-sm text-[var(--ak-muted)]">
                    View, edit, approve, reject, or delete contributor applications across Africa.
                  </p>
                </div>

                {requests.length === 0 ? (
                  <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-8 text-center text-sm text-[var(--ak-muted)]">
                    No contributor requests submitted yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {requests.map((req) => (
                      <div
                        key={req.id}
                        className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1 max-w-2xl">
                            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ak-muted)]">
                              <span className="font-semibold text-[var(--ak-ink)] break-words">
                                {req.fullName}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{req.accountCategory.replace('_', ' ')}</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {req.country}
                                {req.district ? ` (${req.district})` : ''}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{req.specialization}</span>
                            </div>
                            <p className="mt-1 text-sm text-[var(--ak-muted)] break-all">
                              {req.email}
                              {req.phone ? ` · ${req.phone}` : ''}
                              {req.educationSystem ? ` · System: ${req.educationSystem}` : ''}
                              {req.plannedLevels ? ` · Levels: ${req.plannedLevels}` : ''}
                              {req.organizationName ? ` · Org: ${req.organizationName}` : ''}
                            </p>
                            <p className="mt-3 text-sm text-[var(--ak-ink-2)] break-words">
                              {req.statement}
                            </p>
                            {req.portfolioUrl && (
                              <p className="mt-1 text-sm text-[var(--ak-accent-ink)] break-all">
                                Sample / Portfolio: {req.portfolioUrl}
                              </p>
                            )}
                            {req.rejectionReason && (
                              <p className="mt-2 text-sm text-[var(--ak-err-fg)]">
                                Rejection Reason: {req.rejectionReason}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setViewingRequest(req)}
                              className={btnSecondary}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              {t.viewSubmission}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingRequest({ ...req })}
                              className={btnSecondary}
                            >
                              <Edit3 className="h-3.5 w-3.5" /> Edit
                            </button>
                            {req.status === 'PENDING' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setApprovingReq(req);
                                    setCustomTempPass('');
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {t.approveAction}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectingReq(req);
                                    setRejectReason('');
                                  }}
                                  className={btnDanger}
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  {t.rejectAction}
                                </button>
                              </>
                            ) : (
                              <span className={`text-sm font-semibold ${statusTone(req.status)}`}>
                                {req.status}
                              </span>
                            )}
                            {confirmDeleteKey === `req:${req.id}` ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteRequest(req.id)}
                                className={btnDanger}
                              >
                                Confirm Delete
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteKey(`req:${req.id}`)}
                                className={btnDanger}
                                aria-label="Delete request"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'COMPLIANCE' && (
              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="border-b border-[var(--ak-divider)] pb-3">
                    <h2 className="text-lg font-semibold text-[var(--ak-ink)]">
                      Compliance &amp; National ID / Passport Verification Queue
                    </h2>
                    <p className="text-sm text-[var(--ak-muted)]">
                      Inspect, download, approve, reject, or purge contributor verification records.
                    </p>
                  </div>

                  {kycList.length === 0 ? (
                    <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 text-sm text-[var(--ak-muted)]">
                      No KYC submissions on record.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {kycList.map((k) => (
                        <div key={k.id} className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ak-muted)]">
                                <FileCheck2 className="h-4 w-4 shrink-0 text-[var(--ak-accent-ink)]" />
                                <span className="font-semibold text-[var(--ak-ink)]">{k.userName}</span>
                                <span aria-hidden="true">·</span>
                                <span>{k.documentType}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono">{k.documentNumberMasked}</span>
                                <span aria-hidden="true">·</span>
                                <span className={`font-semibold ${statusTone(k.status)}`}>
                                  {k.status}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-[var(--ak-muted)] break-all">{k.userEmail}</p>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleInspectKycDoc(k, 'id', false)}
                                  className={btnSecondary}
                                >
                                  <Eye className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate max-w-[200px]">ID ({k.idFileName})</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleInspectKycDoc(k, 'id', true)}
                                  className={btnSecondary}
                                  title="Download ID"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleInspectKycDoc(k, 'credential', false)}
                                  className={btnSecondary}
                                >
                                  <Eye className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate max-w-[200px]">
                                    Cred ({k.credentialFileName})
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleInspectKycDoc(k, 'credential', true)}
                                  className={btnSecondary}
                                  title="Download Credential"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end shrink-0">
                              <input
                                type="text"
                                value={kycNotesMap[k.id] ?? k.reviewNotes ?? ''}
                                onChange={(e) =>
                                  setKycNotesMap((prev) => ({
                                    ...prev,
                                    [k.id]: e.target.value,
                                  }))
                                }
                                placeholder="Verification note / rejection reason..."
                                className="w-full sm:w-64 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-1.5 text-sm text-[var(--ak-ink)]"
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleReviewKyc(k.id, 'APPROVED')}
                                  className="rounded-lg bg-emerald-700 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
                                >
                                  {k.status === 'APPROVED' ? 'Re-Approve' : t.approveAction}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReviewKyc(k.id, 'REJECTED')}
                                  className={btnDanger}
                                >
                                  {t.rejectAction}
                                </button>
                                {confirmDeleteKey === `kyc:${k.id}` ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteKyc(k.id)}
                                    className={btnDanger}
                                  >
                                    Confirm
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteKey(`kyc:${k.id}`)}
                                    className={btnDanger}
                                    aria-label="Delete KYC record"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Learner Academic Transcripts & Certificates */}
                <section className="min-w-0 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] overflow-hidden">
                  <div className="border-b border-[var(--ak-divider)] px-5 py-4">
                    <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                      Submitted Learner Academic Credentials ({academicDocs.length})
                    </h2>
                    <p className="text-sm text-[var(--ak-muted)]">
                      Inspect, download, edit metadata, or remove any learner academic credential.
                    </p>
                  </div>
                  {academicDocs.length === 0 ? (
                    <p className="p-6 text-sm text-[var(--ak-muted)]">
                      No learner academic credentials submitted yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-[var(--ak-divider)]">
                      {academicDocs.map((d) => (
                        <div
                          key={d.id}
                          className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-[var(--ak-ink)]">
                              <GraduationCap className="h-4 w-4 shrink-0 text-[var(--ak-accent-ink)]" />
                              <span className="font-semibold break-words">{d.title}</span>
                            </div>
                            <p className="mt-0.5 text-[var(--ak-ink-2)] break-words">
                              {d.learnerName} ({d.learnerEmail}) · {d.educationLevel} ·{' '}
                              {d.institutionIssued}
                            </p>
                            <p className="mt-0.5 font-mono text-xs text-[var(--ak-muted)] break-all">
                              {d.fileName}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                inspectRemoteFile(`/api/files/academic-doc/${d.id}`, {
                                  title: d.title,
                                  subtitle: `${d.learnerName} · ${d.institutionIssued}`,
                                  fileName: d.fileName,
                                  metadata: [
                                    { label: 'Learner', value: `${d.learnerName} (${d.learnerEmail})` },
                                    { label: 'Education Level', value: d.educationLevel },
                                    { label: 'Issuing Institution', value: d.institutionIssued },
                                    { label: 'Uploaded', value: new Date(d.uploadedAt).toLocaleString() },
                                  ],
                                })
                              }
                              className={btnSecondary}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              {t.inspectDoc}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                inspectRemoteFile(
                                  `/api/files/academic-doc/${d.id}`,
                                  { title: d.title, fileName: d.fileName },
                                  true
                                )
                              }
                              className={btnSecondary}
                            >
                              <Download className="h-3.5 w-3.5" />
                              {t.download}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingAcademicDoc({ ...d })}
                              className={btnSecondary}
                            >
                              <Edit3 className="h-3.5 w-3.5" /> Edit
                            </button>
                            {confirmDeleteKey === `adoc:${d.id}` ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteAcademicDoc(d.id)}
                                className={btnDanger}
                              >
                                Confirm
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteKey(`adoc:${d.id}`)}
                                className={btnDanger}
                                aria-label="Delete academic credential"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {tab === 'CONTENT_LEDGER' && (
              <div className="space-y-8">
                {/* 1. Uploaded Resources Full CRUD */}
                <section className="min-w-0 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ak-divider)] px-5 py-4">
                    <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                      Uploaded Resources Moderation ({filteredResources.length})
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="search"
                        value={resourceSearch}
                        onChange={(e) => setResourceSearch(e.target.value)}
                        placeholder="Search resources..."
                        className="w-48 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-1.5 text-sm text-[var(--ak-ink)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAddResource(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9642E] px-3.5 py-1.5 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] whitespace-nowrap"
                      >
                        <Plus className="h-4 w-4" /> Add Resource
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-[var(--ak-divider)]">
                    {filteredResources.map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--ak-ink)] break-words">
                            {r.title}
                          </p>
                          <p className="mt-0.5 text-[var(--ak-muted)] break-words">
                            {r.ownerName} · {r.type} · {r.accessTier} ·{' '}
                            {r.priceUsd > 0 ? `$${r.priceUsd} · ` : ''}
                            {r.viewsCount} views · {r.downloadsCount} downloads
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <span className={`font-semibold ${statusTone(r.status)}`}>
                            {r.status}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              inspectRemoteFile(`/api/files/resource/${r.id}`, {
                                title: r.title,
                                subtitle: `${r.ownerName} · ${r.subject} · ${r.educationLevel}`,
                                fileName: r.fileName,
                                metadata: [
                                  { label: 'Contributor', value: r.ownerName },
                                  { label: 'Format', value: r.type },
                                  { label: 'Access Tier', value: r.accessTier },
                                  { label: 'Status', value: r.status },
                                  { label: 'File', value: `${r.fileName} (${r.fileSizeLabel})` },
                                ],
                              })
                            }
                            className={btnSecondary}
                          >
                            <Eye className="h-3.5 w-3.5" /> {t.viewContent}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              inspectRemoteFile(
                                `/api/files/resource/${r.id}`,
                                { title: r.title, fileName: r.fileName },
                                true
                              )
                            }
                            className={btnSecondary}
                            title="Download"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingResource({ ...r });
                              setEditResFile(null);
                            }}
                            className={btnSecondary}
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleResourceModeration(r)}
                            className={btnSecondary}
                          >
                            {r.status === 'PUBLISHED' ? 'Suspend' : 'Restore'}
                          </button>
                          {confirmDeleteKey === `res:${r.id}` ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteResource(r.id)}
                              className={btnDanger}
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(`res:${r.id}`)}
                              className={btnDanger}
                              aria-label="Delete resource"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 2. Courses Full CRUD */}
                <section className="min-w-0 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ak-divider)] px-5 py-4">
                    <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                      Platform Courses ({courses.length})
                    </h2>
                    <button
                      type="button"
                      onClick={() => setShowAddCourse(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9642E] px-3.5 py-1.5 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] whitespace-nowrap"
                    >
                      <Plus className="h-4 w-4" /> Create Course
                    </button>
                  </div>
                  <div className="divide-y divide-[var(--ak-divider)]">
                    {courses.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[var(--ak-ink)] break-words">
                            <BookOpen className="mr-1.5 inline h-4 w-4 text-[var(--ak-accent-ink)]" />
                            {c.title}
                          </p>
                          <p className="mt-0.5 text-[var(--ak-muted)]">
                            {c.ownerName} · {c.subject} · {c.requiredLevel} ·{' '}
                            {c.priceUsd > 0 ? `$${c.priceUsd}` : c.accessTier} ·{' '}
                            {c.enrolledLearnerIds.length} enrolled · {c.resourceIds.length} materials
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <span className={`font-semibold ${statusTone(c.status)}`}>{c.status}</span>
                          <button
                            type="button"
                            onClick={() => setViewingCourse(c)}
                            className={btnSecondary}
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCourse({ ...c })}
                            className={btnSecondary}
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Edit
                          </button>
                          {confirmDeleteKey === `crs:${c.id}` ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteCourse(c.id)}
                              className={btnDanger}
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(`crs:${c.id}`)}
                              className={btnDanger}
                              aria-label="Delete course"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 3. Live Sessions Full CRUD */}
                <section className="min-w-0 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ak-divider)] px-5 py-4">
                    <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                      Live Classrooms &amp; Seminars ({liveSessions.length})
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setNewSessionForm((p) => ({
                          ...p,
                          courseId: p.courseId || courses[0]?.id || '',
                        }));
                        setShowAddSession(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9642E] px-3.5 py-1.5 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] whitespace-nowrap"
                    >
                      <Plus className="h-4 w-4" /> Schedule Session
                    </button>
                  </div>
                  <div className="divide-y divide-[var(--ak-divider)]">
                    {liveSessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[var(--ak-ink)] break-words">
                            <Radio className="mr-1.5 inline h-4 w-4 text-[var(--ak-accent-ink)]" />
                            {s.title}
                          </p>
                          <p className="mt-0.5 text-[var(--ak-muted)]">
                            {s.hostName} · {s.courseTitle} · {s.accessRule} ·{' '}
                            {new Date(s.scheduledAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <span className={`font-semibold ${statusTone(s.status)}`}>{s.status}</span>
                          {s.status === 'LIVE' ? (
                            <button
                              type="button"
                              onClick={() => setActiveClassroomId(s.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
                            >
                              <Play className="h-3.5 w-3.5" /> Enter Room
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSessionStatus(s.id, 'LIVE')}
                              className={btnSecondary}
                            >
                              Go Live
                            </button>
                          )}
                          {s.status === 'LIVE' && (
                            <button
                              type="button"
                              onClick={() => handleSessionStatus(s.id, 'ENDED')}
                              className={btnSecondary}
                            >
                              End
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setViewingSessionLog(s)}
                            className={btnSecondary}
                          >
                            <Eye className="h-3.5 w-3.5" /> Logs
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSession({ ...s })}
                            className={btnSecondary}
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Edit
                          </button>
                          {confirmDeleteKey === `sess:${s.id}` ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteSession(s.id)}
                              className={btnDanger}
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(`sess:${s.id}`)}
                              className={btnDanger}
                              aria-label="Delete session"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 4. Enrollments Full CRUD */}
                <section className="min-w-0 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ak-divider)] px-5 py-4">
                    <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                      Student Enrollments &amp; Grades ({enrollments.length})
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setNewEnrollmentForm({
                          courseId: courses[0]?.id || '',
                          learnerId: learnerUsers[0]?.id || '',
                          academicStatus: 'APPROVED',
                          academicNote: 'Enrolled via Master Admin governance console.',
                        });
                        setShowAddEnrollment(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9642E] px-3.5 py-1.5 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] whitespace-nowrap"
                    >
                      <Plus className="h-4 w-4" /> Enroll Learner
                    </button>
                  </div>
                  <div className="divide-y divide-[var(--ak-divider)]">
                    {enrollments.map((enr) => (
                      <div
                        key={enr.id}
                        className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[var(--ak-ink)]">
                            {enr.learnerName} → {enr.courseTitle}
                          </p>
                          <p className="mt-0.5 text-[var(--ak-muted)] font-mono-nums">
                            {enr.learnerDeclaredLevel} · Progress {enr.progressPercent}% · Attendance{' '}
                            {enr.attendanceMinutes} min · Grade: {enr.gradeLabel || 'Unassigned'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <span className={`font-semibold ${statusTone(enr.academicStatus)}`}>
                            {enr.academicStatus}
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingEnrollment({ ...enr })}
                            className={btnSecondary}
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Edit
                          </button>
                          {confirmDeleteKey === `enr:${enr.id}` ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteEnrollment(enr.id)}
                              className={btnDanger}
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(`enr:${enr.id}`)}
                              className={btnDanger}
                              aria-label="Delete enrollment"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 5. Financial Ledger */}
                <section className="min-w-0 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] overflow-hidden">
                  <div className="border-b border-[var(--ak-divider)] px-5 py-4">
                    <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                      Platform Financial Ledger (15% Platform Fee Split)
                    </h2>
                  </div>

                  <div className="divide-y divide-[var(--ak-divider)] md:hidden">
                    {ledger.map((tx) => (
                      <div key={tx.id} className="p-4 space-y-1.5 text-sm">
                        <p className="font-semibold text-[var(--ak-ink)] break-words">{tx.itemTitle}</p>
                        <p className="text-[var(--ak-muted)]">
                          {tx.itemType} · Buyer: {tx.buyerName} · Creator:{' '}
                          {tx.sellerName || 'Akademi Platform'}
                        </p>
                        <div className="flex flex-wrap gap-4 font-mono-nums pt-1 text-[var(--ak-ink-2)]">
                          <span>Gross: ${tx.grossUsd.toFixed(2)}</span>
                          <span className="text-[var(--ak-ok-fg)] font-semibold">
                            Fee: ${tx.platformFeeUsd.toFixed(2)}
                          </span>
                          <span>Net: ${tx.creatorNetUsd.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden md:block">
                    <table className="w-full table-fixed text-left text-sm">
                      <thead className="border-b border-[var(--ak-divider)] bg-[var(--ak-recessed)] text-[var(--ak-muted)]">
                        <tr>
                          <th className="w-[28%] px-4 py-3 font-medium">Item</th>
                          <th className="w-[14%] px-3 py-3 font-medium">Type</th>
                          <th className="w-[24%] px-3 py-3 font-medium">Buyer / Creator</th>
                          <th className="w-[11%] px-3 py-3 text-right font-medium">Gross</th>
                          <th className="w-[12%] px-3 py-3 text-right font-medium">Fee</th>
                          <th className="w-[11%] px-4 py-3 text-right font-medium">Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--ak-divider)]">
                        {ledger.map((tx) => (
                          <tr key={tx.id}>
                            <td className="px-4 py-3 align-top font-medium text-[var(--ak-ink)] break-words">
                              {tx.itemTitle}
                            </td>
                            <td className="px-3 py-3 align-top text-[var(--ak-ink-2)] break-words">
                              {tx.itemType}
                            </td>
                            <td className="px-3 py-3 align-top text-[var(--ak-ink-2)] break-words">
                              <p>{tx.buyerName}</p>
                              <p className="text-xs text-[var(--ak-muted)]">
                                → {tx.sellerName || 'Akademi Platform'}
                              </p>
                            </td>
                            <td className="px-3 py-3 align-top text-right font-mono-nums text-[var(--ak-ink)]">
                              ${tx.grossUsd.toFixed(2)}
                            </td>
                            <td className="px-3 py-3 align-top text-right font-mono-nums text-[var(--ak-ok-fg)]">
                              ${tx.platformFeeUsd.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 align-top text-right font-mono-nums text-[var(--ak-ink-2)]">
                              ${tx.creatorNetUsd.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {tab === 'OUTBOX_AUDIT' && (
              <div className="grid gap-6 lg:grid-cols-2">
                <section className="min-w-0 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] overflow-hidden">
                  <div className="border-b border-[var(--ak-divider)] px-5 py-4">
                    <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                      Automated Email Outbox
                    </h2>
                  </div>
                  <div className="divide-y divide-[var(--ak-divider)] max-h-[540px] overflow-y-auto">
                    {outboxEmails.map((m) => (
                      <div key={m.id} className="p-4 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[var(--ak-muted)]">
                          <span className="font-semibold text-[var(--ak-ink)] break-all">
                            {m.toEmail}
                          </span>
                          <span className="font-mono-nums shrink-0">
                            {new Date(m.sentAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 font-medium text-[var(--ak-accent-ink)] break-words">
                          [{m.tag}] {m.subject}
                        </p>
                        <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-3 font-sans text-[var(--ak-ink-2)]">
                          {m.body}
                        </pre>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="min-w-0 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] overflow-hidden">
                  <div className="border-b border-[var(--ak-divider)] px-5 py-4">
                    <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                      Immutable Compliance &amp; Admin Audit Log
                    </h2>
                  </div>
                  <div className="divide-y divide-[var(--ak-divider)] max-h-[540px] overflow-y-auto">
                    {auditLogs.map((a) => (
                      <div key={a.id} className="px-5 py-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[var(--ak-muted)]">
                          <span className="font-semibold text-[var(--ak-ink)] break-words">
                            {a.action}
                          </span>
                          <span className="font-mono-nums shrink-0">
                            {new Date(a.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-[var(--ak-ink-2)] break-words">{a.details}</p>
                        <p className="mt-0.5 text-[var(--ak-muted)] break-words">
                          Actor: {a.actorName} · Target: {a.targetType} ({a.targetId})
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {tab === 'SUPPORT' && (
              <CommunicationPanel
                currentUser={currentUser}
                defaultTab={commTab}
                initialRecipientId={messageRecipientId}
                availableRecipients={allUsers
                  .filter((u) => u.id !== currentUser.id)
                  .map((u) => ({
                    id: u.id,
                    name: u.name,
                    label: `${u.role.replace('_', ' ')} (${u.email})`,
                  }))}
              />
            )}
          </>
        )}
      </DashboardShell>

      {/* Approve Request Modal */}
      {approvingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleApproveRequest}
            className="w-full max-w-md rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 shadow-2xl"
          >
            <h3 className="text-base font-semibold text-[var(--ak-ink)]">
              Approve &amp; Configure Temporary Credentials
            </h3>
            <p className="mt-1 text-sm text-[var(--ak-muted)]">
              Applicant: <span className="font-medium text-[var(--ak-ink)]">{approvingReq.fullName}</span>{' '}
              ({approvingReq.email})
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                Temporary Password (leave blank to auto-generate)
              </label>
              <input
                type="text"
                value={customTempPass}
                onChange={(e) => setCustomTempPass(e.target.value)}
                placeholder="Min 8 chars or leave empty for secure random"
                className={inputCls}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setApprovingReq(null)}
                className={btnSecondary}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
              >
                Approve &amp; Send Email
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reject Request Modal */}
      {rejectingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleRejectRequest}
            className="w-full max-w-md rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 shadow-2xl"
          >
            <h3 className="text-base font-semibold text-[var(--ak-ink)]">Reject Contributor Request</h3>
            <p className="mt-1 text-sm text-[var(--ak-muted)]">
              Provide a clear reason to email to {rejectingReq.email}.
            </p>
            <textarea
              required
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Unable to verify institutional accreditation..."
              className={`mt-4 ${inputCls}`}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingReq(null)}
                className={btnSecondary}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
              >
                Confirm Rejection
              </button>
            </div>
          </form>
        </div>
      )}

      {/* View Account Request Details Modal */}
      {viewingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] shadow-2xl">
            <div className="african-weave-rule shrink-0" />
            <div className="flex items-center justify-between gap-3 border-b border-[var(--ak-divider)] px-5 py-4">
              <div className="min-w-0">
                <h3 className="truncate font-display text-lg font-bold text-[var(--ak-ink)]">
                  {viewingRequest.fullName}
                </h3>
                <p className="text-sm text-[var(--ak-muted)]">
                  {viewingRequest.accountCategory.replace('_', ' ')} · {viewingRequest.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingRequest(null)}
                aria-label={t.dismiss}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
              <div className="grid gap-3 rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-4 sm:grid-cols-2">
                <div>
                  <span className="font-semibold text-[var(--ak-muted)]">Email: </span>
                  <span className="break-all text-[var(--ak-ink)]">{viewingRequest.email}</span>
                </div>
                <div>
                  <span className="font-semibold text-[var(--ak-muted)]">Phone / WhatsApp: </span>
                  <span className="text-[var(--ak-ink)]">{viewingRequest.phone || 'Not provided'}</span>
                </div>
                <div>
                  <span className="font-semibold text-[var(--ak-muted)]">Country / District: </span>
                  <span className="text-[var(--ak-ink)]">
                    {viewingRequest.country}
                    {viewingRequest.district ? ` (${viewingRequest.district})` : ''}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-[var(--ak-muted)]">Organization: </span>
                  <span className="text-[var(--ak-ink)]">
                    {viewingRequest.organizationName || 'Independent'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-[var(--ak-muted)]">Education System: </span>
                  <span className="text-[var(--ak-ink)]">
                    {viewingRequest.educationSystem || 'Standard'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-[var(--ak-muted)]">Planned Levels: </span>
                  <span className="text-[var(--ak-ink)]">
                    {viewingRequest.plannedLevels || 'Not specified'}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="font-semibold text-[var(--ak-muted)]">Specialization: </span>
                  <span className="text-[var(--ak-ink)]">{viewingRequest.specialization}</span>
                </div>
                {viewingRequest.portfolioUrl && (
                  <div className="sm:col-span-2">
                    <span className="font-semibold text-[var(--ak-muted)]">Portfolio / Sample: </span>
                    <span className="break-all text-[var(--ak-accent-ink)]">{viewingRequest.portfolioUrl}</span>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-4">
                <p className="font-semibold text-[var(--ak-muted)] mb-1">Submitted Statement</p>
                <p className="whitespace-pre-wrap leading-relaxed text-[var(--ak-ink-2)]">
                  {viewingRequest.statement}
                </p>
              </div>

              {viewingRequest.rejectionReason && (
                <div className="rounded-lg border border-[var(--ak-err-bd)] bg-[var(--ak-err-bg)] p-3 text-[var(--ak-err-fg)]">
                  <strong>Rejection Reason:</strong> {viewingRequest.rejectionReason}
                </div>
              )}

              {viewingRequest.status === 'PENDING' && (
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const target = viewingRequest;
                      setViewingRequest(null);
                      setRejectingReq(target);
                      setRejectReason('');
                    }}
                    className={btnDanger}
                  >
                    {t.rejectAction}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const target = viewingRequest;
                      setViewingRequest(null);
                      setApprovingReq(target);
                      setCustomTempPass('');
                    }}
                    className="rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-600"
                  >
                    {t.approveAction}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Request Modal */}
      {editingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleSaveRequest}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
              <h3 className="text-base font-semibold text-[var(--ak-ink)]">Edit Contributor Request</h3>
              <button type="button" onClick={() => setEditingRequest(null)} className={btnSecondary}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Full Name</label>
                <input
                  required
                  value={editingRequest.fullName}
                  onChange={(e) => setEditingRequest({ ...editingRequest, fullName: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Email</label>
                <input
                  type="email"
                  required
                  value={editingRequest.email}
                  onChange={(e) => setEditingRequest({ ...editingRequest, email: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Category</label>
                <select
                  value={editingRequest.accountCategory}
                  onChange={(e) =>
                    setEditingRequest({
                      ...editingRequest,
                      accountCategory: e.target.value as AccountCategory,
                    })
                  }
                  className={inputCls}
                >
                  <option value="SOLO_TEACHER">Solo Teacher</option>
                  <option value="SCHOOL_INSTITUTION">School / Institution</option>
                  <option value="FREELANCER">Freelancer / Specialist</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Phone</label>
                <input
                  value={editingRequest.phone || ''}
                  onChange={(e) => setEditingRequest({ ...editingRequest, phone: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Country</label>
                <input
                  value={editingRequest.country}
                  onChange={(e) => setEditingRequest({ ...editingRequest, country: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Organization</label>
                <input
                  value={editingRequest.organizationName || ''}
                  onChange={(e) =>
                    setEditingRequest({ ...editingRequest, organizationName: e.target.value })
                  }
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Specialization</label>
              <input
                value={editingRequest.specialization}
                onChange={(e) =>
                  setEditingRequest({ ...editingRequest, specialization: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Statement</label>
              <textarea
                rows={3}
                value={editingRequest.statement}
                onChange={(e) => setEditingRequest({ ...editingRequest, statement: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingRequest(null)} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
              >
                Save Request
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleCreateUser}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
              <h3 className="text-base font-semibold text-[var(--ak-ink)]">Provision New User Account</h3>
              <button type="button" onClick={() => setShowAddUser(false)} className={btnSecondary}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Full Name</label>
                <input
                  required
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Email</label>
                <input
                  type="email"
                  required
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Role</label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value as UserRole })}
                  className={inputCls}
                >
                  <option value="LEARNER">Learner</option>
                  <option value="SOLO_EDUCATOR">Solo Educator</option>
                  <option value="INSTITUTION_ADMIN">Institution Admin</option>
                  <option value="COURSE_ADMIN">Course Admin</option>
                  <option value="MASTER_ADMIN">Master Admin</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Password (optional, min 8)
                </label>
                <input
                  type="text"
                  minLength={8}
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  placeholder="Blank to auto-generate"
                  className={inputCls}
                />
              </div>
              {newUserForm.role === 'INSTITUTION_ADMIN' && (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                    Institution Name
                  </label>
                  <input
                    value={newUserForm.institutionName}
                    onChange={(e) =>
                      setNewUserForm({ ...newUserForm, institutionName: e.target.value })
                    }
                    className={inputCls}
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">KYC Status</label>
                <select
                  value={newUserForm.kycStatus}
                  onChange={(e) =>
                    setNewUserForm({
                      ...newUserForm,
                      kycStatus: e.target.value as UserProfile['kycStatus'],
                    })
                  }
                  className={inputCls}
                >
                  <option value="VERIFIED">VERIFIED</option>
                  <option value="PENDING_REVIEW">PENDING_REVIEW</option>
                  <option value="UNSUBMITTED">UNSUBMITTED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Subscription</label>
                <select
                  value={newUserForm.subscriptionStatus}
                  onChange={(e) =>
                    setNewUserForm({
                      ...newUserForm,
                      subscriptionStatus: e.target.value as UserProfile['subscriptionStatus'],
                    })
                  }
                  className={inputCls}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Specialization</label>
              <input
                value={newUserForm.specialization}
                onChange={(e) => setNewUserForm({ ...newUserForm, specialization: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-[var(--ak-ink-2)]">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newUserForm.platformPassActive}
                  onChange={(e) =>
                    setNewUserForm({ ...newUserForm, platformPassActive: e.target.checked })
                  }
                />
                Akademi Pass Active
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newUserForm.mustChangePassword}
                  onChange={(e) =>
                    setNewUserForm({ ...newUserForm, mustChangePassword: e.target.checked })
                  }
                />
                Require password reset on login
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAddUser(false)} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
              >
                Create User
              </button>
            </div>
          </form>
        </div>
      )}

      {/* View User Profile Modal */}
      {viewingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <div className="w-full max-w-lg rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-4 shadow-2xl text-sm">
            <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
              <div>
                <h3 className="text-lg font-bold text-[var(--ak-ink)]">{viewingUser.name}</h3>
                <p className="text-[var(--ak-muted)]">
                  {viewingUser.role.replace('_', ' ')} · {viewingUser.email}
                </p>
              </div>
              <button type="button" onClick={() => setViewingUser(null)} className={btnSecondary}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-4">
              <div>
                <p className="text-xs text-[var(--ak-muted)]">Country / System</p>
                <p className="text-[var(--ak-ink)]">
                  {viewingUser.country || 'N/A'} · {viewingUser.educationSystem || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--ak-muted)]">KYC &amp; Subscription</p>
                <p className="text-[var(--ak-ink)]">
                  {viewingUser.kycStatus} · {viewingUser.subscriptionStatus}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--ak-muted)]">Phone (Admin Only)</p>
                <p className="text-[var(--ak-ink)]">{viewingUser.phone || 'Not provided'}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--ak-muted)]">Home Address (Admin Only)</p>
                <p className="text-[var(--ak-ink)]">{viewingUser.homeAddress || 'Not provided'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-[var(--ak-muted)]">Specialization &amp; Level</p>
                <p className="text-[var(--ak-ink)]">
                  {viewingUser.specialization || 'General'}
                  {viewingUser.educationLevel ? ` · ${viewingUser.educationLevel}` : ''}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-[var(--ak-muted)]">Bio</p>
                <p className="text-[var(--ak-ink-2)]">{viewingUser.bio}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = viewingUser;
                  setViewingUser(null);
                  setEditingUser({ ...target });
                }}
                className={btnSecondary}
              >
                <Edit3 className="h-3.5 w-3.5" /> Edit User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleSaveUser}
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
              <h3 className="text-base font-semibold text-[var(--ak-ink)]">Edit User Account</h3>
              <button type="button" onClick={() => setEditingUser(null)} className={btnSecondary}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Name</label>
                <input
                  required
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Email</label>
                <input
                  type="email"
                  required
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Role</label>
                <select
                  value={editingUser.role}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, role: e.target.value as UserRole })
                  }
                  className={inputCls}
                >
                  <option value="LEARNER">LEARNER</option>
                  <option value="SOLO_EDUCATOR">SOLO_EDUCATOR</option>
                  <option value="INSTITUTION_ADMIN">INSTITUTION_ADMIN</option>
                  <option value="COURSE_ADMIN">COURSE_ADMIN</option>
                  <option value="MASTER_ADMIN">MASTER_ADMIN</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Institution Name
                </label>
                <input
                  value={editingUser.institutionName || ''}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, institutionName: e.target.value })
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">KYC Status</label>
                <select
                  value={editingUser.kycStatus}
                  onChange={(e) =>
                    setEditingUser({
                      ...editingUser,
                      kycStatus: e.target.value as UserProfile['kycStatus'],
                    })
                  }
                  className={inputCls}
                >
                  <option value="VERIFIED">VERIFIED</option>
                  <option value="PENDING_REVIEW">PENDING_REVIEW</option>
                  <option value="UNSUBMITTED">UNSUBMITTED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Subscription Status
                </label>
                <select
                  value={editingUser.subscriptionStatus}
                  onChange={(e) =>
                    setEditingUser({
                      ...editingUser,
                      subscriptionStatus: e.target.value as UserProfile['subscriptionStatus'],
                    })
                  }
                  className={inputCls}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Specialization
                </label>
                <input
                  value={editingUser.specialization}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, specialization: e.target.value })
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Follow Rate ($/mo)
                </label>
                <input
                  type="number"
                  min={0}
                  value={editingUser.followPriceUsd}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, followPriceUsd: Number(e.target.value) })
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Reset Password (optional, 8+ chars)
                </label>
                <input
                  type="text"
                  minLength={8}
                  value={editUserPassword}
                  onChange={(e) => setEditUserPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Country</label>
                <input
                  value={editingUser.country || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, country: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Bio</label>
              <textarea
                rows={2}
                value={editingUser.bio}
                onChange={(e) => setEditingUser({ ...editingUser, bio: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-[var(--ak-ink-2)]">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editingUser.platformPassActive}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, platformPassActive: e.target.checked })
                  }
                />
                Akademi Pass Active
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editingUser.mustChangePassword}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, mustChangePassword: e.target.checked })
                  }
                />
                Require password change on next login
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingUser(null)} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Learner Academic Doc Modal */}
      {editingAcademicDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleSaveAcademicDoc}
            className="w-full max-w-md rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-3 shadow-2xl"
          >
            <h3 className="text-base font-semibold text-[var(--ak-ink)]">Edit Academic Credential</h3>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Title</label>
              <input
                required
                value={editingAcademicDoc.title}
                onChange={(e) =>
                  setEditingAcademicDoc({ ...editingAcademicDoc, title: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Level</label>
              <select
                value={editingAcademicDoc.educationLevel}
                onChange={(e) =>
                  setEditingAcademicDoc({ ...editingAcademicDoc, educationLevel: e.target.value })
                }
                className={inputCls}
              >
                {educationLevels.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                Issuing Institution
              </label>
              <input
                required
                value={editingAcademicDoc.institutionIssued}
                onChange={(e) =>
                  setEditingAcademicDoc({
                    ...editingAcademicDoc,
                    institutionIssued: e.target.value,
                  })
                }
                className={inputCls}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingAcademicDoc(null)}
                className={btnSecondary}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE]"
              >
                Save Document
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Resource Modal */}
      {showAddResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleCreateResource}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
              <h3 className="text-base font-semibold text-[var(--ak-ink)]">Publish New Resource</h3>
              <button type="button" onClick={() => setShowAddResource(false)} className={btnSecondary}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Title</label>
              <input
                required
                value={newResForm.title}
                onChange={(e) => setNewResForm({ ...newResForm, title: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Format</label>
                <select
                  value={newResForm.type}
                  onChange={(e) =>
                    setNewResForm({ ...newResForm, type: e.target.value as ResourceType })
                  }
                  className={inputCls}
                >
                  <option value="PDF">PDF</option>
                  <option value="DOCX">DOCX</option>
                  <option value="VIDEO">VIDEO</option>
                  <option value="IMAGE">IMAGE</option>
                  <option value="BOOK">BOOK</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Access Tier</label>
                <select
                  value={newResForm.accessTier}
                  onChange={(e) =>
                    setNewResForm({ ...newResForm, accessTier: e.target.value as AccessTier })
                  }
                  className={inputCls}
                >
                  <option value="PUBLIC_FREE">PUBLIC_FREE</option>
                  <option value="PLATFORM_PASS">PLATFORM_PASS</option>
                  <option value="ENROLLED_ONLY">ENROLLED_ONLY</option>
                  <option value="PAID_SINGLE">PAID_SINGLE</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Subject</label>
                <input
                  value={newResForm.subject}
                  onChange={(e) => setNewResForm({ ...newResForm, subject: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Level</label>
                <select
                  value={newResForm.educationLevel}
                  onChange={(e) =>
                    setNewResForm({ ...newResForm, educationLevel: e.target.value })
                  }
                  className={inputCls}
                >
                  {educationLevels.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {newResForm.accessTier === 'PAID_SINGLE' && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Price ($)</label>
                <input
                  type="number"
                  min={1}
                  value={newResForm.priceUsd}
                  onChange={(e) =>
                    setNewResForm({ ...newResForm, priceUsd: Number(e.target.value) })
                  }
                  className={inputCls}
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Description</label>
              <textarea
                required
                rows={2}
                value={newResForm.description}
                onChange={(e) => setNewResForm({ ...newResForm, description: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                Attach Document / Media File ({resourceAcceptForType(newResForm.type)})
              </label>
              <input
                type="file"
                required
                accept={resourceAcceptForType(newResForm.type)}
                onChange={(e) => setNewResFile(e.target.files?.[0] || null)}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-[var(--ak-muted)]">
                Formatted documents or media only (PDF, DOCX/DOC/ODT/RTF, ePub, MP4/WebM, PNG/JPG). Plain text is not permitted.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--ak-ink-2)]">
              <input
                type="checkbox"
                checked={newResForm.downloadable}
                onChange={(e) =>
                  setNewResForm({ ...newResForm, downloadable: e.target.checked })
                }
              />
              Allow download
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAddResource(false)} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE]"
              >
                Publish Resource
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Resource Modal */}
      {editingResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleSaveResource}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
              <h3 className="text-base font-semibold text-[var(--ak-ink)]">Edit Resource</h3>
              <button type="button" onClick={() => setEditingResource(null)} className={btnSecondary}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Title</label>
              <input
                required
                value={editingResource.title}
                onChange={(e) => setEditingResource({ ...editingResource, title: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Format</label>
                <select
                  value={editingResource.type}
                  onChange={(e) =>
                    setEditingResource({
                      ...editingResource,
                      type: e.target.value as ResourceType,
                    })
                  }
                  className={inputCls}
                >
                  <option value="PDF">PDF</option>
                  <option value="DOCX">DOCX</option>
                  <option value="VIDEO">VIDEO</option>
                  <option value="IMAGE">IMAGE</option>
                  <option value="BOOK">BOOK</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Access Tier</label>
                <select
                  value={editingResource.accessTier}
                  onChange={(e) =>
                    setEditingResource({
                      ...editingResource,
                      accessTier: e.target.value as AccessTier,
                    })
                  }
                  className={inputCls}
                >
                  <option value="PUBLIC_FREE">PUBLIC_FREE</option>
                  <option value="PLATFORM_PASS">PLATFORM_PASS</option>
                  <option value="ENROLLED_ONLY">ENROLLED_ONLY</option>
                  <option value="PAID_SINGLE">PAID_SINGLE</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Subject</label>
                <input
                  value={editingResource.subject}
                  onChange={(e) =>
                    setEditingResource({ ...editingResource, subject: e.target.value })
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Status</label>
                <select
                  value={editingResource.status}
                  onChange={(e) =>
                    setEditingResource({
                      ...editingResource,
                      status: e.target.value as ResourceItem['status'],
                    })
                  }
                  className={inputCls}
                >
                  <option value="PUBLISHED">PUBLISHED</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
              </div>
            </div>
            {editingResource.accessTier === 'PAID_SINGLE' && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Price ($)</label>
                <input
                  type="number"
                  min={1}
                  value={editingResource.priceUsd}
                  onChange={(e) =>
                    setEditingResource({ ...editingResource, priceUsd: Number(e.target.value) })
                  }
                  className={inputCls}
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Description</label>
              <textarea
                required
                rows={2}
                value={editingResource.description}
                onChange={(e) =>
                  setEditingResource({ ...editingResource, description: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                Replace File (optional — {resourceAcceptForType(editingResource.type)})
              </label>
              <input
                type="file"
                accept={resourceAcceptForType(editingResource.type)}
                onChange={(e) => setEditResFile(e.target.files?.[0] || null)}
                className={inputCls}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--ak-ink-2)]">
              <input
                type="checkbox"
                checked={editingResource.downloadable}
                onChange={(e) =>
                  setEditingResource({ ...editingResource, downloadable: e.target.checked })
                }
              />
              Downloadable
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingResource(null)} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE]"
              >
                Save Resource
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add / Edit Course Modals */}
      {showAddCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleCreateCourse}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
              <h3 className="text-base font-semibold text-[var(--ak-ink)]">Create Course</h3>
              <button type="button" onClick={() => setShowAddCourse(false)} className={btnSecondary}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Course Title</label>
              <input
                required
                value={newCourseForm.title}
                onChange={(e) => setNewCourseForm({ ...newCourseForm, title: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Subject</label>
                <input
                  value={newCourseForm.subject}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, subject: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Required Level
                </label>
                <select
                  value={newCourseForm.requiredLevel}
                  onChange={(e) =>
                    setNewCourseForm({ ...newCourseForm, requiredLevel: e.target.value })
                  }
                  className={inputCls}
                >
                  {educationLevels.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Access Tier
                </label>
                <select
                  value={newCourseForm.accessTier}
                  onChange={(e) =>
                    setNewCourseForm({ ...newCourseForm, accessTier: e.target.value as AccessTier })
                  }
                  className={inputCls}
                >
                  <option value="ENROLLED_ONLY">Free on Approval</option>
                  <option value="PLATFORM_PASS">Akademi Pass</option>
                  <option value="PAID_SINGLE">Paid Course</option>
                </select>
              </div>
              {newCourseForm.accessTier === 'PAID_SINGLE' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Price ($)</label>
                  <input
                    type="number"
                    min={1}
                    value={newCourseForm.priceUsd}
                    onChange={(e) =>
                      setNewCourseForm({ ...newCourseForm, priceUsd: Number(e.target.value) })
                    }
                    className={inputCls}
                  />
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Description</label>
              <textarea
                required
                rows={2}
                value={newCourseForm.description}
                onChange={(e) => setNewCourseForm({ ...newCourseForm, description: e.target.value })}
                className={inputCls}
              />
            </div>
            {resources.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Attach Materials
                </label>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-2">
                  {resources.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-xs text-[var(--ak-ink-2)]">
                      <input
                        type="checkbox"
                        checked={newCourseForm.resourceIds.includes(r.id)}
                        onChange={(e) =>
                          setNewCourseForm({
                            ...newCourseForm,
                            resourceIds: e.target.checked
                              ? [...newCourseForm.resourceIds, r.id]
                              : newCourseForm.resourceIds.filter((id) => id !== r.id),
                          })
                        }
                      />
                      <span className="truncate">
                        [{r.type}] {r.title}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-[var(--ak-ink-2)]">
              <input
                type="checkbox"
                checked={newCourseForm.requiresAcademicVerification}
                onChange={(e) =>
                  setNewCourseForm({
                    ...newCourseForm,
                    requiresAcademicVerification: e.target.checked,
                  })
                }
              />
              Require academic transcript verification
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAddCourse(false)} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE]"
              >
                Create Course
              </button>
            </div>
          </form>
        </div>
      )}

      {viewingCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <div className="w-full max-w-lg rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-4 shadow-2xl text-sm">
            <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
              <div>
                <h3 className="text-lg font-bold text-[var(--ak-ink)]">{viewingCourse.title}</h3>
                <p className="text-[var(--ak-muted)]">
                  {viewingCourse.ownerName} · {viewingCourse.subject} · {viewingCourse.requiredLevel}
                </p>
              </div>
              <button type="button" onClick={() => setViewingCourse(null)} className={btnSecondary}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[var(--ak-ink-2)]">{viewingCourse.description}</p>
            <div className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-3">
              <p className="font-semibold text-[var(--ak-ink)] mb-1">
                Attached Syllabus Resources ({viewingCourse.resourceIds.length})
              </p>
              {viewingCourse.resourceIds.length === 0 ? (
                <p className="text-[var(--ak-muted)]">No materials attached yet.</p>
              ) : (
                <ul className="space-y-1 text-[var(--ak-ink-2)]">
                  {viewingCourse.resourceIds.map((rid) => {
                    const resItem = resources.find((r) => r.id === rid);
                    return (
                      <li key={rid}>
                        • {resItem ? `[${resItem.type}] ${resItem.title}` : rid}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {editingCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleSaveCourse}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
              <h3 className="text-base font-semibold text-[var(--ak-ink)]">Edit Course</h3>
              <button type="button" onClick={() => setEditingCourse(null)} className={btnSecondary}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Title</label>
              <input
                required
                value={editingCourse.title}
                onChange={(e) => setEditingCourse({ ...editingCourse, title: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Subject</label>
                <input
                  value={editingCourse.subject}
                  onChange={(e) => setEditingCourse({ ...editingCourse, subject: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Status</label>
                <select
                  value={editingCourse.status}
                  onChange={(e) =>
                    setEditingCourse({
                      ...editingCourse,
                      status: e.target.value as CourseItem['status'],
                    })
                  }
                  className={inputCls}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="PAUSED">PAUSED</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Required Level
                </label>
                <select
                  value={editingCourse.requiredLevel}
                  onChange={(e) =>
                    setEditingCourse({ ...editingCourse, requiredLevel: e.target.value })
                  }
                  className={inputCls}
                >
                  {educationLevels.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Pricing</label>
                <select
                  value={editingCourse.accessTier}
                  onChange={(e) =>
                    setEditingCourse({
                      ...editingCourse,
                      accessTier: e.target.value as AccessTier,
                    })
                  }
                  className={inputCls}
                >
                  <option value="ENROLLED_ONLY">Free on Approval</option>
                  <option value="PLATFORM_PASS">Akademi Pass</option>
                  <option value="PAID_SINGLE">Paid Course</option>
                </select>
              </div>
            </div>
            {editingCourse.accessTier === 'PAID_SINGLE' && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Price ($)</label>
                <input
                  type="number"
                  min={1}
                  value={editingCourse.priceUsd}
                  onChange={(e) =>
                    setEditingCourse({ ...editingCourse, priceUsd: Number(e.target.value) })
                  }
                  className={inputCls}
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Description</label>
              <textarea
                required
                rows={2}
                value={editingCourse.description}
                onChange={(e) =>
                  setEditingCourse({ ...editingCourse, description: e.target.value })
                }
                className={inputCls}
              />
            </div>
            {resources.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Syllabus Materials
                </label>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-2">
                  {resources.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-xs text-[var(--ak-ink-2)]">
                      <input
                        type="checkbox"
                        checked={editingCourse.resourceIds.includes(r.id)}
                        onChange={(e) =>
                          setEditingCourse({
                            ...editingCourse,
                            resourceIds: e.target.checked
                              ? [...editingCourse.resourceIds, r.id]
                              : editingCourse.resourceIds.filter((id) => id !== r.id),
                          })
                        }
                      />
                      <span className="truncate">
                        [{r.type}] {r.title}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-[var(--ak-ink-2)]">
              <input
                type="checkbox"
                checked={editingCourse.requiresAcademicVerification}
                onChange={(e) =>
                  setEditingCourse({
                    ...editingCourse,
                    requiresAcademicVerification: e.target.checked,
                  })
                }
              />
              Require academic verification
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingCourse(null)} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE]"
              >
                Save Course
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add / Edit / Log Session Modals */}
      {showAddSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleCreateSession}
            className="w-full max-w-lg rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
              <h3 className="text-base font-semibold text-[var(--ak-ink)]">Schedule Live Session</h3>
              <button type="button" onClick={() => setShowAddSession(false)} className={btnSecondary}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Course</label>
              <select
                required
                value={newSessionForm.courseId}
                onChange={(e) => setNewSessionForm({ ...newSessionForm, courseId: e.target.value })}
                className={inputCls}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Title</label>
              <input
                required
                value={newSessionForm.title}
                onChange={(e) => setNewSessionForm({ ...newSessionForm, title: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Access Rule</label>
                <select
                  value={newSessionForm.accessRule}
                  onChange={(e) =>
                    setNewSessionForm({
                      ...newSessionForm,
                      accessRule: e.target.value as LiveSession['accessRule'],
                    })
                  }
                  className={inputCls}
                >
                  <option value="ENROLLED_ONLY">Enrolled Students Only</option>
                  <option value="PAID_FOLLOWERS">Paid Followers &amp; Pass</option>
                  <option value="PUBLIC_SEMINAR">Open Public Seminar</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Scheduled Time
                </label>
                <input
                  type="datetime-local"
                  value={newSessionForm.scheduledAt}
                  onChange={(e) =>
                    setNewSessionForm({ ...newSessionForm, scheduledAt: e.target.value })
                  }
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Topic Summary</label>
              <textarea
                rows={2}
                value={newSessionForm.topicSummary}
                onChange={(e) =>
                  setNewSessionForm({ ...newSessionForm, topicSummary: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--ak-ink-2)]">
              <input
                type="checkbox"
                checked={newSessionForm.startImmediately}
                onChange={(e) =>
                  setNewSessionForm({ ...newSessionForm, startImmediately: e.target.checked })
                }
              />
              Start live immediately
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAddSession(false)} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE]"
              >
                Create Session
              </button>
            </div>
          </form>
        </div>
      )}

      {editingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleSaveSession}
            className="w-full max-w-lg rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
              <h3 className="text-base font-semibold text-[var(--ak-ink)]">Edit Live Session</h3>
              <button type="button" onClick={() => setEditingSession(null)} className={btnSecondary}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Title</label>
              <input
                required
                value={editingSession.title}
                onChange={(e) => setEditingSession({ ...editingSession, title: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Access Rule</label>
                <select
                  value={editingSession.accessRule}
                  onChange={(e) =>
                    setEditingSession({
                      ...editingSession,
                      accessRule: e.target.value as LiveSession['accessRule'],
                    })
                  }
                  className={inputCls}
                >
                  <option value="ENROLLED_ONLY">Enrolled Students Only</option>
                  <option value="PAID_FOLLOWERS">Paid Followers &amp; Pass</option>
                  <option value="PUBLIC_SEMINAR">Open Public Seminar</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Status</label>
                <select
                  value={editingSession.status}
                  onChange={(e) =>
                    setEditingSession({
                      ...editingSession,
                      status: e.target.value as LiveSession['status'],
                    })
                  }
                  className={inputCls}
                >
                  <option value="SCHEDULED">SCHEDULED</option>
                  <option value="LIVE">LIVE</option>
                  <option value="ENDED">ENDED</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Topic Summary</label>
              <textarea
                rows={2}
                value={editingSession.topicSummary}
                onChange={(e) =>
                  setEditingSession({ ...editingSession, topicSummary: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingSession(null)} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE]"
              >
                Save Session
              </button>
            </div>
          </form>
        </div>
      )}

      {viewingSessionLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-4 shadow-2xl text-sm">
            <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
              <div>
                <h3 className="text-lg font-bold text-[var(--ak-ink)]">{viewingSessionLog.title}</h3>
                <p className="text-[var(--ak-muted)]">
                  Attendance &amp; Chat Log · {viewingSessionLog.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingSessionLog(null)}
                className={btnSecondary}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-4 space-y-1.5">
              <p className="font-semibold text-[var(--ak-ink)]">
                Attendance ({Object.keys(viewingSessionLog.attendanceLog || {}).length})
              </p>
              {Object.values(viewingSessionLog.attendanceLog || {}).length === 0 ? (
                <p className="text-[var(--ak-muted)]">No attendance entries logged yet.</p>
              ) : (
                Object.values(viewingSessionLog.attendanceLog).map((att, idx) => (
                  <p key={idx} className="text-[var(--ak-ink-2)]">
                    • {att.name} — Joined {new Date(att.joinedAt).toLocaleString()} ({att.minutes}{' '}
                    min)
                  </p>
                ))
              )}
            </div>
            <div className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-4 space-y-2">
              <p className="font-semibold text-[var(--ak-ink)]">
                Chat Transcript ({viewingSessionLog.chatMessages.length})
              </p>
              {viewingSessionLog.chatMessages.length === 0 ? (
                <p className="text-[var(--ak-muted)]">No chat messages yet.</p>
              ) : (
                viewingSessionLog.chatMessages.map((msg) => (
                  <div key={msg.id} className="border-t border-[var(--ak-divider)] pt-2 first:border-t-0 first:pt-0">
                    <p className="text-xs text-[var(--ak-muted)]">
                      <strong className="text-[var(--ak-accent-ink)]">{msg.senderName}</strong> ·{' '}
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                    <p className="text-[var(--ak-ink-2)]">{msg.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Enrollment Modals */}
      {showAddEnrollment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleCreateEnrollment}
            className="w-full max-w-md rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-3 shadow-2xl"
          >
            <h3 className="text-base font-semibold text-[var(--ak-ink)]">Enroll Learner into Course</h3>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Course</label>
              <select
                required
                value={newEnrollmentForm.courseId}
                onChange={(e) =>
                  setNewEnrollmentForm({ ...newEnrollmentForm, courseId: e.target.value })
                }
                className={inputCls}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Learner</label>
              <select
                required
                value={newEnrollmentForm.learnerId}
                onChange={(e) =>
                  setNewEnrollmentForm({ ...newEnrollmentForm, learnerId: e.target.value })
                }
                className={inputCls}
              >
                {learnerUsers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Status</label>
              <select
                value={newEnrollmentForm.academicStatus}
                onChange={(e) =>
                  setNewEnrollmentForm({
                    ...newEnrollmentForm,
                    academicStatus: e.target.value as EnrollmentRecord['academicStatus'],
                  })
                }
                className={inputCls}
              >
                <option value="APPROVED">APPROVED</option>
                <option value="PENDING">PENDING</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Note</label>
              <input
                value={newEnrollmentForm.academicNote}
                onChange={(e) =>
                  setNewEnrollmentForm({ ...newEnrollmentForm, academicNote: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddEnrollment(false)}
                className={btnSecondary}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE]"
              >
                Create Enrollment
              </button>
            </div>
          </form>
        </div>
      )}

      {editingEnrollment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleSaveEnrollment}
            className="w-full max-w-md rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-3 shadow-2xl"
          >
            <h3 className="text-base font-semibold text-[var(--ak-ink)]">
              Edit Enrollment — {editingEnrollment.learnerName}
            </h3>
            <p className="text-xs text-[var(--ak-muted)]">{editingEnrollment.courseTitle}</p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                Academic Status
              </label>
              <select
                value={editingEnrollment.academicStatus}
                onChange={(e) =>
                  setEditingEnrollment({
                    ...editingEnrollment,
                    academicStatus: e.target.value as EnrollmentRecord['academicStatus'],
                  })
                }
                className={inputCls}
              >
                <option value="APPROVED">APPROVED</option>
                <option value="PENDING">PENDING</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>
            <div className="grid gap-3 grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Grade</label>
                <input
                  value={editingEnrollment.gradeLabel || ''}
                  onChange={(e) =>
                    setEditingEnrollment({ ...editingEnrollment, gradeLabel: e.target.value })
                  }
                  placeholder="A+, A, B..."
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Progress (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={editingEnrollment.progressPercent}
                  onChange={(e) =>
                    setEditingEnrollment({
                      ...editingEnrollment,
                      progressPercent: Number(e.target.value),
                    })
                  }
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                Reviewer Note
              </label>
              <textarea
                rows={2}
                value={editingEnrollment.academicNote || ''}
                onChange={(e) =>
                  setEditingEnrollment({ ...editingEnrollment, academicNote: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingEnrollment(null)}
                className={btnSecondary}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE]"
              >
                Save Enrollment
              </button>
            </div>
          </form>
        </div>
      )}

      {activeClassroomId && (
        <LiveClassroomModal
          sessionId={activeClassroomId}
          currentUser={currentUser}
          hostLibrary={resources}
          onClose={() => {
            setActiveClassroomId(null);
            loadAdminData();
          }}
        />
      )}

      <ContentInspectorModal item={inspected} onClose={() => setInspected(null)} />
    </>
  );
};
