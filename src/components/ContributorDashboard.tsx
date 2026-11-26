import React, { useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  CreditCard,
  Download,
  Edit3,
  Eye,
  FileText,
  FolderUp,
  GraduationCap,
  MessageSquare,
  Play,
  Radio,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { apiFetch, fetchAuthorizedBlob, formatRoleLabel } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type {
  AccessTier,
  CourseItem,
  EnrollmentRecord,
  KycSubmission,
  LearnerAcademicDoc,
  LedgerTransaction,
  LiveSession,
  MessageRecipient,
  ResourceItem,
  ResourceType,
  UserProfile,
} from '../types/akademi';
import { CommunicationPanel } from './CommunicationPanel';
import { ContentInspectorModal, type InspectedContent } from './ContentInspectorModal';
import { CourseQaPanel } from './CourseQaPanel';
import { DashboardShell } from './DashboardShell';
import { LiveClassroomModal } from './LiveClassroomModal';
import { QuizManagerModal } from './QuizManagerModal';

interface ContributorDashboardProps {
  currentUser: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
  onLogout: () => void;
  onGoPublic: () => void;
}

type StudioTab =
  | 'VAULT'
  | 'COURSES'
  | 'STUDENTS'
  | 'LIVE'
  | 'FACULTY'
  | 'EARNINGS'
  | 'VERIFICATION'
  | 'INBOX';

interface EnrichedEnrollment extends EnrollmentRecord {
  learnerAcademicDocs: LearnerAcademicDoc[];
  learnerSpecialization: string;
}

export const ContributorDashboard: React.FC<ContributorDashboardProps> = ({
  currentUser,
  onUserUpdated,
  onLogout,
  onGoPublic,
}) => {
  const { t } = useI18n();
  const isUnlocked =
    currentUser.kycStatus === 'VERIFIED' && currentUser.subscriptionStatus === 'ACTIVE';

  const [tab, setTab] = useState<StudioTab>(isUnlocked ? 'VAULT' : 'VERIFICATION');
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [enrollments, setEnrollments] = useState<EnrichedEnrollment[]>([]);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [myKyc, setMyKyc] = useState<KycSubmission[]>([]);
  const [messageRecipients, setMessageRecipients] = useState<MessageRecipient[]>([]);
  const [educationLevels, setEducationLevels] = useState<string[]>([
    'UNEB UCE (Uganda O-Level)',
    'UNEB UACE (Uganda A-Level)',
    'UBTEB / DIT Technical & TVET',
    'NCHE Undergraduate (Year 1–4)',
    'BSc / BA Graduate',
    'Postgraduate / Masters / PhD',
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeClassroomId, setActiveClassroomId] = useState<string | null>(null);
  const [inspected, setInspected] = useState<InspectedContent | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [messageRecipientId, setMessageRecipientId] = useState<string | undefined>(undefined);

  // KYC form state
  const [docType, setDocType] = useState<KycSubmission['documentType']>('NATIONAL_ID');
  const [docNumber, setDocNumber] = useState('');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [homeAddress, setHomeAddress] = useState(currentUser.homeAddress || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [specialization, setSpecialization] = useState(currentUser.specialization || '');
  const [idFile, setIdFile] = useState<File | null>(null);
  const [credFile, setCredFile] = useState<File | null>(null);

  // Resource Upload state
  const [resTitle, setResTitle] = useState('');
  const [resDesc, setResDesc] = useState('');
  const [resType, setResType] = useState<ResourceType>('PDF');
  const [resSubject, setResSubject] = useState(currentUser.specialization || 'Computer Science');
  const [resLevel, setResLevel] = useState('NCHE Undergraduate (Year 1–4)');
  const [resTier, setResTier] = useState<AccessTier>('PUBLIC_FREE');
  const [resPrice, setResPrice] = useState(15);
  const [resDownloadable, setResDownloadable] = useState(true);
  const [resFile, setResFile] = useState<File | null>(null);
  const [editingResource, setEditingResource] = useState<ResourceItem | null>(null);
  const [editResFile, setEditResFile] = useState<File | null>(null);

  // Course Builder state
  const [crsTitle, setCrsTitle] = useState('');
  const [crsDesc, setCrsDesc] = useState('');
  const [crsSubject, setCrsSubject] = useState(currentUser.specialization || 'Data Science');
  const [crsLevel, setCrsLevel] = useState('NCHE Undergraduate (Year 1–4)');
  const [crsTier, setCrsTier] = useState<AccessTier>('ENROLLED_ONLY');
  const [crsPrice, setCrsPrice] = useState(35);
  const [crsReqVerify, setCrsReqVerify] = useState(true);
  const [crsInstructorId, setCrsInstructorId] = useState('');
  const [crsResourceIds, setCrsResourceIds] = useState<string[]>([]);
  const [viewingCourse, setViewingCourse] = useState<CourseItem | null>(null);
  const [editingCourse, setEditingCourse] = useState<CourseItem | null>(null);
  const [managingQuizCourse, setManagingQuizCourse] = useState<CourseItem | null>(null);
  const [qaCourseModal, setQaCourseModal] = useState<CourseItem | null>(null);

  // Student enrollment edit modal
  const [editingEnrollment, setEditingEnrollment] = useState<EnrichedEnrollment | null>(null);

  // Live Session Scheduler & Edit / Log modals
  const [sessTitle, setSessTitle] = useState('');
  const [sessCourseId, setSessCourseId] = useState('');
  const [sessTopic, setSessTopic] = useState('');
  const [sessAccess, setSessAccess] = useState<LiveSession['accessRule']>('ENROLLED_ONLY');
  const [sessScheduledAt, setSessScheduledAt] = useState('');
  const [sessDuration, setSessDuration] = useState(60);
  const [sessPinnedIds, setSessPinnedIds] = useState<string[]>([]);
  const [sessStartNow, setSessStartNow] = useState(true);
  const [editingSession, setEditingSession] = useState<LiveSession | null>(null);
  const [viewingSessionLog, setViewingSessionLog] = useState<LiveSession | null>(null);

  // Staff Invite & Edit (Institution Admin)
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffSpec, setStaffSpec] = useState('');
  const [issuedStaffCreds, setIssuedStaffCreds] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [editingStaff, setEditingStaff] = useState<UserProfile | null>(null);
  const [editStaffPassword, setEditStaffPassword] = useState('');

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

  const loadWorkspace = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<{
        resources: ResourceItem[];
        courses: CourseItem[];
        enrollments: EnrichedEnrollment[];
        sessions: LiveSession[];
        staff: UserProfile[];
        transactions: LedgerTransaction[];
        myKycSubmissions: KycSubmission[];
        messageRecipients?: MessageRecipient[];
        educationLevels?: string[];
      }>('/api/contributor/workspace');
      setResources(data.resources);
      setCourses(data.courses);
      setEnrollments(data.enrollments);
      setSessions(data.sessions);
      setStaff(data.staff);
      setTransactions(data.transactions);
      setMyKyc(data.myKycSubmissions);
      setMessageRecipients(data.messageRecipients || []);
      if (data.educationLevels && data.educationLevels.length > 0) {
        setEducationLevels(data.educationLevels);
      }
      if (!sessCourseId && data.courses.length > 0) setSessCourseId(data.courses[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load studio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, [currentUser.id, currentUser.subscriptionStatus, currentUser.kycStatus]);

  useEffect(() => {
    if (!isUnlocked && tab !== 'VERIFICATION' && tab !== 'INBOX') {
      setTab('VERIFICATION');
    } else if (isUnlocked && tab === 'VERIFICATION') {
      setTab('VAULT');
    }
  }, [isUnlocked]);

  const handleSubmitKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!idFile || !credFile) {
      setError('Please attach both your Identity Document scan and Teaching License / Accreditation document.');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('documentType', docType);
      fd.append('documentNumber', docNumber);
      fd.append('phone', phone);
      fd.append('homeAddress', homeAddress);
      fd.append('bio', bio);
      fd.append('specialization', specialization);
      fd.append('idDocument', idFile);
      fd.append('credentialDocument', credFile);

      const res = await apiFetch<{ user: UserProfile }>('/api/contributor/kyc', {
        method: 'POST',
        body: fd,
      });
      onUserUpdated(res.user);
      setNotice(
        'Identity and accreditation documents submitted to the Master Admin Compliance Queue.'
      );
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit KYC.');
    }
  };

  const handleRequestSubscription = async () => {
    setError('');
    setNotice('');
    try {
      const plan =
        currentUser.role === 'INSTITUTION_ADMIN' ? 'INSTITUTION_CAMPUS' : 'SOLO_PRO';
      const res = await apiFetch<{ user: UserProfile }>(
        '/api/contributor/subscription/request',
        {
          method: 'POST',
          body: JSON.stringify({ plan }),
        }
      );
      onUserUpdated(res.user);
      setNotice(
        'Subscription activation requested. As soon as Master Admin approves it, your portal unlocks automatically.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to request subscription.');
    }
  };

  const handleUploadResource = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!resFile) {
      setError('Please select a document or media file to publish (plain text is not accepted).');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('title', resTitle);
      fd.append('description', resDesc);
      fd.append('type', resType);
      fd.append('subject', resSubject);
      fd.append('educationLevel', resLevel);
      fd.append('accessTier', resTier);
      fd.append('priceUsd', String(resPrice));
      fd.append('downloadable', String(resDownloadable));
      fd.append('file', resFile);

      await apiFetch('/api/contributor/resources', {
        method: 'POST',
        body: fd,
      });
      setResTitle('');
      setResDesc('');
      setResFile(null);
      setNotice('Resource published to your Akademi Vault.');
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
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
      if (editResFile) fd.append('file', editResFile);

      await apiFetch(`/api/resources/${editingResource.id}`, {
        method: 'PATCH',
        body: fd,
      });
      setEditingResource(null);
      setEditResFile(null);
      setNotice('Material updated.');
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update resource.');
    }
  };

  const handleDeleteResource = async (id: string) => {
    setError('');
    try {
      await apiFetch(`/api/resources/${id}`, { method: 'DELETE' });
      setConfirmDeleteKey(null);
      setNotice('Material deleted from your Vault.');
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete resource.');
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/contributor/courses', {
        method: 'POST',
        body: JSON.stringify({
          title: crsTitle,
          description: crsDesc,
          subject: crsSubject,
          requiredLevel: crsLevel,
          accessTier: crsTier,
          priceUsd: crsPrice,
          requiresAcademicVerification: crsReqVerify,
          assignedInstructorId: crsInstructorId || undefined,
          resourceIds: crsResourceIds,
        }),
      });
      setCrsTitle('');
      setCrsDesc('');
      setCrsResourceIds([]);
      setNotice('Course published and ready for student enrollments.');
      await loadWorkspace();
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
          assignedInstructorId: editingCourse.assignedInstructorId || '',
          resourceIds: editingCourse.resourceIds,
          status: editingCourse.status,
        }),
      });
      setEditingCourse(null);
      setNotice('Course updated.');
      await loadWorkspace();
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
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete course.');
    }
  };

  const handleVerifyLearner = async (enrollmentId: string, decision: 'APPROVED' | 'REJECTED') => {
    setError('');
    try {
      await apiFetch(`/api/enrollments/${enrollmentId}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          note:
            decision === 'APPROVED'
              ? `Verified by ${currentUser.name}`
              : 'Academic prerequisite level not matched.',
        }),
      });
      setNotice(`Learner academic check marked ${decision}.`);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify learner.');
    }
  };

  const handleUpdateGrade = async (enrollmentId: string, gradeLabel: string) => {
    try {
      await apiFetch(`/api/enrollments/${enrollmentId}/grade`, {
        method: 'POST',
        body: JSON.stringify({ gradeLabel }),
      });
      setNotice('Student grade updated.');
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update grade.');
    }
  };

  const handleSaveEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEnrollment) return;
    setError('');
    try {
      const canVerifyThis =
        (editingEnrollment.verifierRoleRequired === 'INSTITUTION_ADMIN' &&
          currentUser.role === 'INSTITUTION_ADMIN') ||
        (editingEnrollment.verifierRoleRequired === 'SOLO_EDUCATOR' &&
          currentUser.role === 'SOLO_EDUCATOR');
      const payload: Record<string, unknown> = {
        academicNote: editingEnrollment.academicNote || '',
        gradeLabel: editingEnrollment.gradeLabel || '',
        progressPercent: editingEnrollment.progressPercent,
      };
      if (canVerifyThis) {
        payload.academicStatus = editingEnrollment.academicStatus;
      }
      await apiFetch(`/api/enrollments/${editingEnrollment.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setEditingEnrollment(null);
      setNotice('Student enrollment details saved.');
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update student record.');
    }
  };

  const handleDeleteEnrollment = async (id: string) => {
    setError('');
    try {
      await apiFetch(`/api/enrollments/${id}`, { method: 'DELETE' });
      setConfirmDeleteKey(null);
      setNotice('Student enrollment removed.');
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove enrollment.');
    }
  };

  const handleScheduleSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch<{ session: LiveSession }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          courseId: sessCourseId,
          title: sessTitle,
          topicSummary: sessTopic,
          accessRule: sessAccess,
          scheduledAt: sessScheduledAt
            ? new Date(sessScheduledAt).toISOString()
            : new Date().toISOString(),
          durationMinutes: sessDuration,
          pinnedResourceIds: sessPinnedIds,
          startImmediately: sessStartNow,
        }),
      });
      setSessTitle('');
      setSessTopic('');
      setSessScheduledAt('');
      setSessPinnedIds([]);
      await loadWorkspace();
      if (sessStartNow) {
        setActiveClassroomId(res.session.id);
      } else {
        setNotice('Live session scheduled and learners notified.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create live session.');
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
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update session.');
    }
  };

  const handleSessionStatus = async (sessionId: string, status: LiveSession['status']) => {
    try {
      await apiFetch(`/api/sessions/${sessionId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      await loadWorkspace();
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
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete session.');
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch<{ staff: UserProfile; issuedTempPassword: string }>(
        '/api/institution/staff',
        {
          method: 'POST',
          body: JSON.stringify({
            name: staffName,
            email: staffEmail,
            specialization: staffSpec,
          }),
        }
      );
      setIssuedStaffCreds({ email: res.staff.email, password: res.issuedTempPassword });
      setStaffName('');
      setStaffEmail('');
      setStaffSpec('');
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add instructor.');
    }
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    setError('');
    try {
      await apiFetch(`/api/institution/staff/${editingStaff.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingStaff.name,
          email: editingStaff.email,
          specialization: editingStaff.specialization,
          subscriptionStatus: editingStaff.subscriptionStatus,
          resetPassword: editStaffPassword.trim() || undefined,
        }),
      });
      setEditingStaff(null);
      setEditStaffPassword('');
      setNotice('Instructor details updated.');
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update instructor.');
    }
  };

  const handleDeleteStaff = async (id: string) => {
    setError('');
    try {
      await apiFetch(`/api/institution/staff/${id}`, { method: 'DELETE' });
      setConfirmDeleteKey(null);
      setNotice('Instructor removed from institution directory.');
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove instructor.');
    }
  };

  const handleInspectFile = async (
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
      setError(err instanceof Error ? err.message : 'Unable to open document.');
    }
  };

  const totalNetEarnings = transactions.reduce((sum, tx) => sum + tx.creatorNetUsd, 0);

  return (
    <>
      <DashboardShell
        breadcrumbLeft={currentUser.institutionName || currentUser.name}
        breadcrumbRight={t.contributorStudio}
        userName={currentUser.name}
        userMeta={`${formatRoleLabel(currentUser)} · ${currentUser.followerIds.length} followers`}
        currentUser={currentUser}
        onUserUpdated={onUserUpdated}
        educationLevels={educationLevels}
        navItems={[
          { id: 'VAULT', label: `${t.tabResourceVault} (${resources.length})`, icon: FolderUp, locked: !isUnlocked },
          { id: 'COURSES', label: `${t.tabCoursesBuilder} (${courses.length})`, icon: BookOpen, locked: !isUnlocked },
          {
            id: 'STUDENTS',
            label: `${t.tabStudentsClearance} (${enrollments.length})`,
            icon: GraduationCap,
            locked: !isUnlocked,
          },
          { id: 'LIVE', label: `${t.tabLiveClassrooms} (${sessions.length})`, icon: Radio, locked: !isUnlocked },
          ...(currentUser.role === 'INSTITUTION_ADMIN'
            ? [{ id: 'FACULTY', label: `${t.tabFacultyStaff} (${staff.length})`, icon: Users, locked: !isUnlocked }]
            : []),
          { id: 'EARNINGS', label: t.tabRevenueLedger, icon: CreditCard, locked: !isUnlocked },
          { id: 'VERIFICATION', label: t.tabKycSubscription, icon: ShieldCheck, locked: false },
          { id: 'INBOX', label: t.tabMessagesSupport, icon: MessageSquare, locked: false },
        ]}
        activeTab={tab}
        onSelectTab={(id) => setTab(id as StudioTab)}
        onGoPublic={onGoPublic}
        onLogout={onLogout}
        headerRight={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-[var(--ak-muted)] whitespace-nowrap">
              KYC:{' '}
              <strong
                className={
                  currentUser.kycStatus === 'VERIFIED' ? 'text-[var(--ak-ok-fg)]' : 'text-[var(--ak-accent-ink)]'
                }
              >
                {currentUser.kycStatus}
              </strong>
            </span>
            <span className="text-[var(--ak-muted)] whitespace-nowrap">
              Subscription:{' '}
              <strong
                className={
                  currentUser.subscriptionStatus === 'ACTIVE' ? 'text-[var(--ak-ok-fg)]' : 'text-[var(--ak-err-fg)]'
                }
              >
                {currentUser.subscriptionStatus}
              </strong>
            </span>
          </div>
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

        {!isUnlocked && (
          <div className="rounded-xl border border-[var(--ak-warn-bd)] bg-[var(--ak-warn-bg)] p-5 text-sm text-[var(--ak-warn-fg)]">
            <p className="font-semibold text-[var(--ak-ink)]">
              Restricted Onboarding Portal — Complete Verification &amp; Subscription to Unlock
              Publishing
            </p>
            <p className="mt-1 text-sm">
              1. Profile &amp; National ID/Passport verified by Master Admin (
              <strong>{currentUser.kycStatus}</strong>) · 2. Subscription activated by Master Admin
              (<strong>{currentUser.subscriptionStatus}</strong>). Once approved, your dashboard
              unlocks automatically.
            </p>
          </div>
        )}

        {tab === 'VERIFICATION' && (
          <div className="grid gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleSubmitKyc}
              className="space-y-4 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 lg:col-span-7"
            >
              <div className="border-b border-[var(--ak-divider)] pb-3">
                <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                  01. Identity Verification &amp; Profile Setup
                </h2>
                <p className="mt-1 text-sm text-[var(--ak-muted)]">
                  Submit your National ID or Passport and academic/teaching credentials for Master
                  Admin compliance review.
                </p>
              </div>

              {currentUser.kycRejectionReason && (
                <div className="rounded-lg border border-[var(--ak-err-bd)] bg-[var(--ak-err-bg)] p-3 text-sm text-[var(--ak-err-fg)]">
                  Previous submission returned: {currentUser.kycRejectionReason}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    Document Type
                  </label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as KycSubmission['documentType'])}
                    className={inputCls}
                  >
                    <option value="NATIONAL_ID">National ID</option>
                    <option value="PASSPORT">Passport</option>
                    <option value="INSTITUTION_CHARTER">Institution Charter / License</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    ID / Passport Number
                  </label>
                  <input
                    type="text"
                    required
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                    placeholder="Stored strictly confidential"
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    Specialization / Subject Area
                  </label>
                  <input
                    type="text"
                    required
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    Confidential Phone Contact
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+256 ..."
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                  Confidential Address / Campus Location
                </label>
                <input
                  type="text"
                  value={homeAddress}
                  onChange={(e) => setHomeAddress(e.target.value)}
                  placeholder="Optional street or campus address"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                  Public Educator / Institution Bio
                </label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    National ID / Passport Scan (PDF or Image)
                  </label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => setIdFile(e.target.files?.[0] || null)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    Teaching License / Accreditation Document
                  </label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.doc,.docx,.odt,.rtf,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => setCredFile(e.target.files?.[0] || null)}
                    className={inputCls}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-4 py-2.5 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
              >
                {t.submitVerification}
              </button>
            </form>

            <div className="space-y-4 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 lg:col-span-5">
              <div className="border-b border-[var(--ak-divider)] pb-3">
                <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                  02. Subscription Activation
                </h2>
                <p className="mt-1 text-sm text-[var(--ak-muted)]">
                  Available after identity verification. Once Master Admin approves your
                  subscription, your publishing workspace opens instantaneously.
                </p>
              </div>

              <div className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-4 text-sm">
                <p className="font-semibold text-[var(--ak-ink)]">
                  {currentUser.role === 'INSTITUTION_ADMIN'
                    ? 'Institution Campus Plan — $149 / month'
                    : 'Solo Educator Pro Plan — $29 / month'}
                </p>
                <p className="mt-1 text-[var(--ak-ink-2)]">
                  Includes unlimited PDF, DOCX, Video, Image &amp; Book hosting, paid course
                  monetization, student prerequisite verification, and live classrooms.
                </p>
                <p className="mt-3 font-medium text-[var(--ak-accent-ink)]">
                  Current Status: {currentUser.subscriptionStatus}
                </p>
              </div>

              <button
                type="button"
                disabled={
                  currentUser.kycStatus !== 'VERIFIED' ||
                  currentUser.subscriptionStatus === 'ACTIVE' ||
                  currentUser.subscriptionStatus === 'PENDING_APPROVAL'
                }
                onClick={handleRequestSubscription}
                className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {currentUser.subscriptionStatus === 'ACTIVE'
                  ? 'Subscription Active'
                  : currentUser.subscriptionStatus === 'PENDING_APPROVAL'
                    ? 'Awaiting Master Admin Approval...'
                    : currentUser.kycStatus !== 'VERIFIED'
                      ? 'Verify Identity First'
                      : 'Submit Subscription Activation'}
              </button>

              {myKyc.length > 0 && (
                <div className="border-t border-[var(--ak-divider)] pt-4">
                  <p className="mb-2 text-sm font-semibold text-[var(--ak-ink)]">
                    Recent Verification Submissions
                  </p>
                  <div className="space-y-2">
                    {myKyc.map((k) => (
                      <div
                        key={k.id}
                        className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-3 text-sm space-y-2"
                      >
                        <p className="font-medium text-[var(--ak-ink)]">
                          {k.documentType} ({k.documentNumberMasked}) — {k.status}
                        </p>
                        {k.reviewNotes && <p className="text-[var(--ak-muted)]">{k.reviewNotes}</p>}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleInspectFile(`/api/files/kyc/${k.id}/id`, {
                                title: 'Submitted Identity Document',
                                fileName: k.idFileName,
                              })
                            }
                            className={btnSecondary}
                          >
                            <Eye className="h-3.5 w-3.5" /> View ID
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleInspectFile(`/api/files/kyc/${k.id}/credential`, {
                                title: 'Submitted Accreditation',
                                fileName: k.credentialFileName,
                              })
                            }
                            className={btnSecondary}
                          >
                            <Eye className="h-3.5 w-3.5" /> View Credential
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'VAULT' && isUnlocked && (
          <div className="grid gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleUploadResource}
              className="space-y-4 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 lg:col-span-5"
            >
              <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                Upload Educational Resource
              </h2>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">Title</label>
                <input
                  type="text"
                  required
                  value={resTitle}
                  onChange={(e) => setResTitle(e.target.value)}
                  placeholder="e.g. Linear Algebra Problem Set IV"
                  className={inputCls}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">Format</label>
                  <select
                    value={resType}
                    onChange={(e) => setResType(e.target.value as ResourceType)}
                    className={inputCls}
                  >
                    <option value="PDF">PDF Document</option>
                    <option value="DOCX">Word Document (DOCX)</option>
                    <option value="VIDEO">Video Lecture</option>
                    <option value="IMAGE">Reference Image / Plate</option>
                    <option value="BOOK">Digital Book / Textbook</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    Access Rule
                  </label>
                  <select
                    value={resTier}
                    onChange={(e) => setResTier(e.target.value as AccessTier)}
                    className={inputCls}
                  >
                    <option value="PUBLIC_FREE">Public Free</option>
                    <option value="PLATFORM_PASS">Akademi Pass</option>
                    <option value="ENROLLED_ONLY">Enrolled Students Only</option>
                    <option value="PAID_SINGLE">Paid Single Purchase</option>
                  </select>
                </div>
              </div>
              {resTier === 'PAID_SINGLE' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    Price (USD)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={resPrice}
                    onChange={(e) => setResPrice(Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">Subject</label>
                  <input
                    type="text"
                    value={resSubject}
                    onChange={(e) => setResSubject(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    Education Level
                  </label>
                  <select
                    value={resLevel}
                    onChange={(e) => setResLevel(e.target.value)}
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
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">Description</label>
                <textarea
                  required
                  rows={2}
                  value={resDesc}
                  onChange={(e) => setResDesc(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                  Attach Document / Media File ({resourceAcceptForType(resType)})
                </label>
                <input
                  type="file"
                  required
                  accept={resourceAcceptForType(resType)}
                  onChange={(e) => setResFile(e.target.files?.[0] || null)}
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-[var(--ak-muted)]">
                  Real formatted documents or media only (PDF, DOCX/DOC/ODT/RTF, ePub, MP4/WebM, PNG/JPG). Plain text is not permitted.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--ak-ink-2)]">
                <input
                  type="checkbox"
                  checked={resDownloadable}
                  onChange={(e) => setResDownloadable(e.target.checked)}
                />
                Allow authorized learners to download offline copy
              </label>
              <button
                type="submit"
                className="w-full rounded-lg bg-[#C9642E] px-4 py-2.5 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
              >
                {t.publishMaterial}
              </button>
            </form>

            <div className="min-w-0 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] lg:col-span-7">
              <div className="border-b border-[var(--ak-divider)] px-5 py-4">
                <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                  Your Uploaded Materials ({resources.length})
                </h2>
              </div>
              {loading ? (
                <p className="p-6 text-sm text-[var(--ak-muted)]">Loading resources...</p>
              ) : resources.length === 0 ? (
                <p className="p-6 text-sm text-[var(--ak-muted)]">
                  No resources uploaded yet. Use the uploader on the left to publish your first PDF,
                  Word doc, video, image, or book.
                </p>
              ) : (
                <div className="divide-y divide-[var(--ak-divider)]">
                  {resources.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-start justify-between gap-4 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ak-muted)]">
                          <FileText className="h-3.5 w-3.5 text-[var(--ak-accent-ink)]" />
                          <span className="font-semibold text-[var(--ak-ink)]">{r.type}</span>
                          <span aria-hidden="true">·</span>
                          <span>{r.subject}</span>
                          <span aria-hidden="true">·</span>
                          <span>{r.accessTier}</span>
                          {r.priceUsd > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-nums font-semibold text-[var(--ak-accent-ink)]">
                                ${r.priceUsd}
                              </span>
                            </>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-medium text-[var(--ak-ink)] break-words">
                          {r.title}
                        </p>
                        <p className="mt-0.5 text-sm text-[var(--ak-muted)] break-words">
                          {r.fileName} ({r.fileSizeLabel}) · {r.viewsCount} views · {r.downloadsCount}{' '}
                          downloads
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            handleInspectFile(`/api/files/resource/${r.id}`, {
                              title: r.title,
                              subtitle: `${r.subject} · ${r.educationLevel}`,
                              fileName: r.fileName,
                              metadata: [
                                { label: 'Format', value: r.type },
                                { label: 'Access Tier', value: r.accessTier },
                                { label: 'File', value: `${r.fileName} (${r.fileSizeLabel})` },
                                { label: 'Status', value: r.status },
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
                            handleInspectFile(
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
                            aria-label={`Delete ${r.title}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'COURSES' && isUnlocked && (
          <div className="grid gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleCreateCourse}
              className="space-y-4 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 lg:col-span-5"
            >
              <h2 className="text-base font-semibold text-[var(--ak-ink)]">Build Structured Course</h2>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                  Course Title
                </label>
                <input
                  type="text"
                  required
                  value={crsTitle}
                  onChange={(e) => setCrsTitle(e.target.value)}
                  placeholder="e.g. Structural Timber Modeling"
                  className={inputCls}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">Subject</label>
                  <input
                    type="text"
                    value={crsSubject}
                    onChange={(e) => setCrsSubject(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    Required Academic Level
                  </label>
                  <select
                    value={crsLevel}
                    onChange={(e) => setCrsLevel(e.target.value)}
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    Pricing Model
                  </label>
                  <select
                    value={crsTier}
                    onChange={(e) => setCrsTier(e.target.value as AccessTier)}
                    className={inputCls}
                  >
                    <option value="ENROLLED_ONLY">Free on Approval</option>
                    <option value="PLATFORM_PASS">Akademi Pass</option>
                    <option value="PAID_SINGLE">Paid Course</option>
                  </select>
                </div>
                {crsTier === 'PAID_SINGLE' && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                      Price (USD)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={crsPrice}
                      onChange={(e) => setCrsPrice(Number(e.target.value))}
                      className={inputCls}
                    />
                  </div>
                )}
              </div>
              {currentUser.role === 'INSTITUTION_ADMIN' && staff.length > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    Assign Institution Course Admin / Instructor
                  </label>
                  <select
                    value={crsInstructorId}
                    onChange={(e) => setCrsInstructorId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Institution Lead</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.specialization})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">Description</label>
                <textarea
                  required
                  rows={2}
                  value={crsDesc}
                  onChange={(e) => setCrsDesc(e.target.value)}
                  className={inputCls}
                />
              </div>
              {resources.length > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    Attach Vault Materials
                  </label>
                  <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-2">
                    {resources.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 text-sm text-[var(--ak-ink-2)]">
                        <input
                          type="checkbox"
                          checked={crsResourceIds.includes(r.id)}
                          onChange={(e) => {
                            setCrsResourceIds((prev) =>
                              e.target.checked
                                ? [...prev, r.id]
                                : prev.filter((id) => id !== r.id)
                            );
                          }}
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
                  checked={crsReqVerify}
                  onChange={(e) => setCrsReqVerify(e.target.checked)}
                />
                Require academic transcript verification before enrollment
              </label>
              <button
                type="submit"
                className="w-full rounded-lg bg-[#C9642E] px-4 py-2.5 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
              >
                {t.createCourse}
              </button>
            </form>

            <div className="space-y-4 lg:col-span-7">
              {courses.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-4 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5 sm:flex-row"
                >
                  <img
                    src={c.coverImage}
                    alt={c.title}
                    referrerPolicy="no-referrer"
                    className="h-28 w-full rounded-lg object-cover sm:w-40 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ak-muted)]">
                      <span>{c.subject}</span>
                      <span aria-hidden="true">·</span>
                      <span>Level: {c.requiredLevel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{c.priceUsd > 0 ? `$${c.priceUsd}` : c.accessTier}</span>
                      <span aria-hidden="true">·</span>
                      <span className={c.status === 'ACTIVE' ? 'text-[var(--ak-ok-fg)]' : 'text-[var(--ak-warn-fg)]'}>
                        {c.status}
                      </span>
                    </div>
                    <h3 className="mt-1 text-base font-semibold text-[var(--ak-ink)]">{c.title}</h3>
                    <p className="mt-1 text-sm text-[var(--ak-ink-2)]">{c.description}</p>
                    <p className="mt-2 text-sm font-mono-nums text-[var(--ak-muted)]">
                      {c.enrolledLearnerIds.length} enrolled learners · {c.resourceIds.length}{' '}
                      materials
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setViewingCourse(c)}
                        className={btnSecondary}
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                      <button
                        type="button"
                        onClick={() => setManagingQuizCourse(c)}
                        className={btnSecondary}
                      >
                        <GraduationCap className="h-3.5 w-3.5" /> Quizzes
                      </button>
                      <button
                        type="button"
                        onClick={() => setQaCourseModal(c)}
                        className={btnSecondary}
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> Q&amp;A
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
                          Confirm Delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteKey(`crs:${c.id}`)}
                          className={btnDanger}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'STUDENTS' && isUnlocked && (
          <div className="space-y-4">
            <div className="border-b border-[var(--ak-divider)] pb-3">
              <h2 className="text-lg font-semibold text-[var(--ak-ink)]">
                Enrolled Students &amp; Academic Prerequisite Ownership
              </h2>
              <p className="text-sm text-[var(--ak-muted)]">
                Confidential learner PII (National ID, private phone, address) is strictly hidden.
                {currentUser.role === 'COURSE_ADMIN'
                  ? ' Institution academic prerequisite checks are authorized solely by your Institution Admin.'
                  : ' Review uploaded academic transcripts to clear learners, edit grades/notes, or message students.'}
              </p>
            </div>

            {enrollments.length === 0 ? (
              <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-8 text-center text-sm text-[var(--ak-muted)]">
                No student enrollments or pending academic checks yet.
              </div>
            ) : (
              <div className="space-y-3">
                {enrollments.map((enr) => {
                  const canVerifyThis =
                    (enr.verifierRoleRequired === 'INSTITUTION_ADMIN' &&
                      currentUser.role === 'INSTITUTION_ADMIN') ||
                    (enr.verifierRoleRequired === 'SOLO_EDUCATOR' &&
                      currentUser.role === 'SOLO_EDUCATOR');
                  return (
                    <div
                      key={enr.id}
                      className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ak-muted)]">
                            <span className="text-sm font-semibold text-[var(--ak-ink)]">
                              {enr.learnerName}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{enr.learnerDeclaredLevel}</span>
                            <span aria-hidden="true">·</span>
                            <span>{enr.courseTitle}</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-sm font-mono-nums text-[var(--ak-ink-2)]">
                            <span>
                              Academic Status:{' '}
                              <strong
                                className={
                                  enr.academicStatus === 'APPROVED'
                                    ? 'text-[var(--ak-ok-fg)]'
                                    : enr.academicStatus === 'REJECTED'
                                      ? 'text-[var(--ak-err-fg)]'
                                      : 'text-[var(--ak-warn-fg)]'
                                }
                              >
                                {enr.academicStatus}
                              </strong>
                            </span>
                            <span>Progress: {enr.progressPercent}%</span>
                            <span>Live Attendance: {enr.attendanceMinutes} min</span>
                            <span>Grade: {enr.gradeLabel || 'Unassigned'}</span>
                            {enr.certificateCode && (
                              <span className="text-[var(--ak-ok-fg)] font-semibold">
                                Cert: {enr.certificateCode}
                              </span>
                            )}
                          </div>
                          {enr.academicNote && (
                            <p className="text-xs text-[var(--ak-muted)]">Note: {enr.academicNote}</p>
                          )}

                          {enr.learnerAcademicDocs.length > 0 && (
                            <div className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-3 text-sm space-y-2">
                              <p className="font-semibold text-[var(--ak-ink)]">
                                Submitted Academic Transcripts / Certificates:
                              </p>
                              {enr.learnerAcademicDocs.map((d) => (
                                <div
                                  key={d.id}
                                  className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ak-divider)] pt-2 first:border-t-0 first:pt-0"
                                >
                                  <p className="min-w-0 flex-1 text-[var(--ak-ink-2)] break-words">
                                    • {d.title} ({d.institutionIssued} · {d.educationLevel}) —{' '}
                                    <span className="font-mono">{d.fileName}</span>
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleInspectFile(`/api/files/academic-doc/${d.id}`, {
                                          title: d.title,
                                          subtitle: `${enr.learnerName} · ${d.institutionIssued}`,
                                          fileName: d.fileName,
                                          metadata: [
                                            { label: 'Learner', value: enr.learnerName },
                                            { label: 'Education Level', value: d.educationLevel },
                                            { label: 'Issuing Body', value: d.institutionIssued },
                                            { label: 'Course', value: enr.courseTitle },
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
                                        handleInspectFile(
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
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {enr.academicStatus === 'PENDING' && canVerifyThis && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleVerifyLearner(enr.id, 'APPROVED')}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {t.approveAction}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleVerifyLearner(enr.id, 'REJECTED')}
                                  className={btnDanger}
                                >
                                  {t.rejectAction}
                                </button>
                              </>
                            )}
                            {enr.academicStatus === 'PENDING' && !canVerifyThis && (
                              <span className="text-sm text-[var(--ak-warn-fg)]">
                                Pending Institution Admin clearance
                              </span>
                            )}
                            {enr.academicStatus === 'APPROVED' && (
                              <select
                                value={enr.gradeLabel || ''}
                                onChange={(e) => handleUpdateGrade(enr.id, e.target.value)}
                                className="rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-2.5 py-1.5 text-sm text-[var(--ak-ink)]"
                              >
                                <option value="">Assign Grade...</option>
                                <option value="A+">A+</option>
                                <option value="A">A</option>
                                <option value="A-">A-</option>
                                <option value="B+">B+</option>
                                <option value="B">B</option>
                                <option value="Pass">Pass</option>
                              </select>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {enr.certificateId && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleInspectFile(`/api/files/certificate/${enr.certificateId}`, {
                                    title: `Certificate — ${enr.courseTitle}`,
                                    subtitle: `${enr.learnerName} · ${enr.certificateCode || ''}`,
                                    fileName: `${enr.certificateCode || enr.certificateId}.pdf`,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
                              >
                                <Award className="h-3.5 w-3.5" />
                                Inspect Certificate
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditingEnrollment({ ...enr })}
                              className={btnSecondary}
                            >
                              <Edit3 className="h-3.5 w-3.5" /> Edit Record
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMessageRecipientId(enr.learnerId);
                                setTab('INBOX');
                              }}
                              className={btnSecondary}
                            >
                              <MessageSquare className="h-3.5 w-3.5" /> Message
                            </button>
                            {canVerifyThis && (
                              confirmDeleteKey === `enr:${enr.id}` ? (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEnrollment(enr.id)}
                                  className={btnDanger}
                                >
                                  Confirm Remove
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteKey(`enr:${enr.id}`)}
                                  className={btnDanger}
                                  aria-label="Remove enrollment"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'LIVE' && isUnlocked && (
          <div className="grid gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleScheduleSession}
              className="space-y-4 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 lg:col-span-5"
            >
              <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                Launch or Schedule Live Classroom
              </h2>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">Course</label>
                <select
                  required
                  value={sessCourseId}
                  onChange={(e) => setSessCourseId(e.target.value)}
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
                <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                  Session Title
                </label>
                <input
                  type="text"
                  required
                  value={sessTitle}
                  onChange={(e) => setSessTitle(e.target.value)}
                  placeholder="e.g. Week 4 Live Critique & Q&A"
                  className={inputCls}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    Access Rule
                  </label>
                  <select
                    value={sessAccess}
                    onChange={(e) =>
                      setSessAccess(e.target.value as LiveSession['accessRule'])
                    }
                    className={inputCls}
                  >
                    <option value="ENROLLED_ONLY">Approved Enrolled Students Only</option>
                    <option value="PAID_FOLLOWERS">Paid Followers &amp; Akademi Pass</option>
                    <option value="PUBLIC_SEMINAR">Open Public Seminar</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    Duration (min)
                  </label>
                  <input
                    type="number"
                    min={15}
                    value={sessDuration}
                    onChange={(e) => setSessDuration(Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
              </div>
              {!sessStartNow && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    Scheduled Date &amp; Time
                  </label>
                  <input
                    type="datetime-local"
                    value={sessScheduledAt}
                    onChange={(e) => setSessScheduledAt(e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                  Agenda / Topic Summary
                </label>
                <textarea
                  rows={2}
                  value={sessTopic}
                  onChange={(e) => setSessTopic(e.target.value)}
                  className={inputCls}
                />
              </div>
              {resources.length > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                    Pin Classroom Resources
                  </label>
                  <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-2">
                    {resources.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 text-xs text-[var(--ak-ink-2)]">
                        <input
                          type="checkbox"
                          checked={sessPinnedIds.includes(r.id)}
                          onChange={(e) =>
                            setSessPinnedIds((prev) =>
                              e.target.checked
                                ? [...prev, r.id]
                                : prev.filter((id) => id !== r.id)
                            )
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
                  checked={sessStartNow}
                  onChange={(e) => setSessStartNow(e.target.checked)}
                />
                Start live session immediately and enter classroom
              </label>
              <button
                type="submit"
                disabled={courses.length === 0}
                className="w-full rounded-lg bg-[#C9642E] px-4 py-2.5 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] disabled:opacity-50"
              >
                {t.scheduleLive}
              </button>
            </form>

            <div className="space-y-3 lg:col-span-7">
              {sessions.map((s) => (
                <div key={s.id} className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ak-muted)]">
                        <span
                          className={`font-semibold ${
                            s.status === 'LIVE'
                              ? 'text-[var(--ak-ok-fg)]'
                              : s.status === 'ENDED'
                                ? 'text-[var(--ak-muted)]'
                                : 'text-[var(--ak-accent-ink)]'
                          }`}
                        >
                          {s.status}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{s.courseTitle}</span>
                        <span aria-hidden="true">·</span>
                        <span>{s.accessRule}</span>
                      </div>
                      <h3 className="mt-1 text-base font-semibold text-[var(--ak-ink)]">{s.title}</h3>
                      <p className="mt-1 text-sm text-[var(--ak-ink-2)]">{s.topicSummary}</p>
                      <p className="mt-1 text-xs text-[var(--ak-muted)]">
                        Scheduled: {new Date(s.scheduledAt).toLocaleString()} · {s.durationMinutes}{' '}
                        min
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {s.status !== 'LIVE' && (
                        <button
                          type="button"
                          onClick={() => handleSessionStatus(s.id, 'LIVE')}
                          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
                        >
                          Go Live
                        </button>
                      )}
                      {s.status === 'LIVE' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setActiveClassroomId(s.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9642E] px-3.5 py-1.5 text-sm font-medium text-[#F8F5EE] hover:bg-[#D8733C]"
                          >
                            <Play className="h-3.5 w-3.5" />
                            Enter Classroom
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSessionStatus(s.id, 'ENDED')}
                            className={btnSecondary}
                          >
                            End
                          </button>
                        </>
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
                          aria-label={`Delete ${s.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'FACULTY' && currentUser.role === 'INSTITUTION_ADMIN' && isUnlocked && (
          <div className="grid gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleAddStaff}
              className="space-y-4 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 lg:col-span-5"
            >
              <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                Add Institution Course Admin / Instructor
              </h2>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                  Instructor Name
                </label>
                <input
                  type="text"
                  required
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                  Institution Email
                </label>
                <input
                  type="email"
                  required
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                  Department / Subject
                </label>
                <input
                  type="text"
                  required
                  value={staffSpec}
                  onChange={(e) => setStaffSpec(e.target.value)}
                  className={inputCls}
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-[#C9642E] px-4 py-2.5 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
              >
                Appoint Course Admin
              </button>
              {issuedStaffCreds && (
                <div className="rounded-lg border border-[var(--ak-info-bd)] bg-[var(--ak-info-bg)] p-3 text-sm text-[var(--ak-info-fg)]">
                  Credentials issued:{' '}
                  <span className="font-mono text-[var(--ak-accent-ink)]">{issuedStaffCreds.email}</span> /{' '}
                  <span className="font-mono text-[var(--ak-accent-ink)]">{issuedStaffCreds.password}</span>
                </div>
              )}
            </form>

            <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] lg:col-span-7">
              <div className="border-b border-[var(--ak-divider)] px-5 py-4">
                <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                  Institution Staff Directory ({staff.length})
                </h2>
              </div>
              {staff.length === 0 ? (
                <p className="p-6 text-sm text-[var(--ak-muted)]">No Course Admins appointed yet.</p>
              ) : (
                <div className="divide-y divide-[var(--ak-divider)]">
                  {staff.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--ak-ink)]">{s.name}</p>
                        <p className="text-[var(--ak-muted)]">
                          {s.email} · {s.specialization} · Access: {s.subscriptionStatus}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStaff({ ...s });
                            setEditStaffPassword('');
                          }}
                          className={btnSecondary}
                        >
                          <Edit3 className="h-3.5 w-3.5" /> Edit
                        </button>
                        {confirmDeleteKey === `stf:${s.id}` ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteStaff(s.id)}
                            className={btnDanger}
                          >
                            Confirm Remove
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteKey(`stf:${s.id}`)}
                            className={btnDanger}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'EARNINGS' && isUnlocked && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5">
                <p className="text-sm text-[var(--ak-muted)]">Net Creator Earnings (85%)</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--ak-ok-fg)] font-mono-nums">
                  ${totalNetEarnings.toFixed(2)}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5">
                <p className="text-sm text-[var(--ak-muted)]">Followers</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--ak-ink)] font-mono-nums">
                  {currentUser.followerIds.length}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5">
                <p className="text-sm text-[var(--ak-muted)]">Paid Follow Rate</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--ak-accent-ink)] font-mono-nums">
                  ${currentUser.followPriceUsd}/mo
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)]">
              <div className="border-b border-[var(--ak-divider)] px-5 py-4">
                <h2 className="text-base font-semibold text-[var(--ak-ink)]">Sales &amp; Payouts</h2>
              </div>
              <div className="divide-y divide-[var(--ak-divider)]">
                {transactions.length === 0 ? (
                  <p className="p-6 text-sm text-[var(--ak-muted)]">
                    No paid course, book, or follower sales recorded yet.
                  </p>
                ) : (
                  transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between px-5 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium text-[var(--ak-ink)]">{tx.itemTitle}</p>
                        <p className="text-[var(--ak-muted)]">
                          Buyer: {tx.buyerName} · {tx.itemType}
                        </p>
                      </div>
                      <span className="font-mono-nums font-semibold text-[var(--ak-ok-fg)]">
                        +${tx.creatorNetUsd.toFixed(2)} net
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'INBOX' && (
          <CommunicationPanel
            currentUser={currentUser}
            defaultTab={isUnlocked ? 'THREADS' : 'SUPPORT'}
            initialRecipientId={messageRecipientId}
            qaCourses={courses.map((c) => ({
              id: c.id,
              title: c.title,
              subject: c.subject,
            }))}
            availableRecipients={messageRecipients}
          />
        )}
      </DashboardShell>

      {/* Edit Resource Modal */}
      {editingResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleSaveResource}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
              <h3 className="text-base font-semibold text-[var(--ak-ink)]">Edit Material</h3>
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
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Access Rule
                </label>
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
                  <option value="PUBLIC_FREE">Public Free</option>
                  <option value="PLATFORM_PASS">Akademi Pass</option>
                  <option value="ENROLLED_ONLY">Enrolled Students Only</option>
                  <option value="PAID_SINGLE">Paid Single Purchase</option>
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
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Level</label>
                <select
                  value={editingResource.educationLevel}
                  onChange={(e) =>
                    setEditingResource({ ...editingResource, educationLevel: e.target.value })
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
            {editingResource.accessTier === 'PAID_SINGLE' && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Price (USD)
                </label>
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
              Allow offline download
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingResource(null)} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE]"
              >
                Save Material
              </button>
            </div>
          </form>
        </div>
      )}

      {/* View & Edit Course Modals */}
      {viewingCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <div className="w-full max-w-lg rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-4 shadow-2xl text-sm">
            <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
              <div>
                <h3 className="text-lg font-bold text-[var(--ak-ink)]">{viewingCourse.title}</h3>
                <p className="text-[var(--ak-muted)]">
                  {viewingCourse.subject} · {viewingCourse.requiredLevel}
                </p>
              </div>
              <button type="button" onClick={() => setViewingCourse(null)} className={btnSecondary}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[var(--ak-ink-2)]">{viewingCourse.description}</p>
            <div className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-3">
              <p className="font-semibold text-[var(--ak-ink)] mb-1">
                Syllabus Materials ({viewingCourse.resourceIds.length})
              </p>
              {viewingCourse.resourceIds.length === 0 ? (
                <p className="text-[var(--ak-muted)]">No attached resources.</p>
              ) : (
                <ul className="space-y-1 text-[var(--ak-ink-2)]">
                  {viewingCourse.resourceIds.map((rid) => {
                    const item = resources.find((r) => r.id === rid);
                    return <li key={rid}>• {item ? `[${item.type}] ${item.title}` : rid}</li>;
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
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Price (USD)
                </label>
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
            {currentUser.role === 'INSTITUTION_ADMIN' && staff.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Assigned Instructor
                </label>
                <select
                  value={editingCourse.assignedInstructorId || ''}
                  onChange={(e) =>
                    setEditingCourse({
                      ...editingCourse,
                      assignedInstructorId: e.target.value || undefined,
                    })
                  }
                  className={inputCls}
                >
                  <option value="">Institution Lead</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.specialization})
                    </option>
                  ))}
                </select>
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
                  Attached Materials
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

      {/* Edit Student Enrollment Modal */}
      {editingEnrollment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleSaveEnrollment}
            className="w-full max-w-md rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-3 shadow-2xl"
          >
            <h3 className="text-base font-semibold text-[var(--ak-ink)]">
              Update Student Record — {editingEnrollment.learnerName}
            </h3>
            <p className="text-xs text-[var(--ak-muted)]">{editingEnrollment.courseTitle}</p>
            {((editingEnrollment.verifierRoleRequired === 'INSTITUTION_ADMIN' &&
              currentUser.role === 'INSTITUTION_ADMIN') ||
              (editingEnrollment.verifierRoleRequired === 'SOLO_EDUCATOR' &&
                currentUser.role === 'SOLO_EDUCATOR')) && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Academic Verification Status
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
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Grade</label>
                <input
                  value={editingEnrollment.gradeLabel || ''}
                  onChange={(e) =>
                    setEditingEnrollment({ ...editingEnrollment, gradeLabel: e.target.value })
                  }
                  placeholder="A+, A, Pass..."
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
                Feedback / Reviewer Note
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
                Save Record
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Live Session & View Logs Modals */}
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
                <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                  Access Rule
                </label>
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
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                Agenda / Topic Summary
              </label>
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
                <p className="text-[var(--ak-muted)]">No attendance recorded yet.</p>
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
                <p className="text-[var(--ak-muted)]">No chat messages recorded.</p>
              ) : (
                viewingSessionLog.chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="border-t border-[var(--ak-divider)] pt-2 first:border-t-0 first:pt-0"
                  >
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

      {/* Edit Staff Modal */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4">
          <form
            onSubmit={handleSaveStaff}
            className="w-full max-w-md rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 space-y-3 shadow-2xl"
          >
            <h3 className="text-base font-semibold text-[var(--ak-ink)]">Edit Course Admin</h3>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Name</label>
              <input
                required
                value={editingStaff.name}
                onChange={(e) => setEditingStaff({ ...editingStaff, name: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">Email</label>
              <input
                type="email"
                required
                value={editingStaff.email}
                onChange={(e) => setEditingStaff({ ...editingStaff, email: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                Department / Subject
              </label>
              <input
                required
                value={editingStaff.specialization}
                onChange={(e) =>
                  setEditingStaff({ ...editingStaff, specialization: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                Access Status
              </label>
              <select
                value={editingStaff.subscriptionStatus}
                onChange={(e) =>
                  setEditingStaff({
                    ...editingStaff,
                    subscriptionStatus: e.target.value as UserProfile['subscriptionStatus'],
                  })
                }
                className={inputCls}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ak-muted)]">
                Reset Temp Password (optional, 8+ chars)
              </label>
              <input
                type="text"
                minLength={8}
                value={editStaffPassword}
                onChange={(e) => setEditStaffPassword(e.target.value)}
                placeholder="Leave blank to keep existing"
                className={inputCls}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingStaff(null)} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE]"
              >
                Save Instructor
              </button>
            </div>
          </form>
        </div>
      )}

      {managingQuizCourse && (
        <QuizManagerModal
          course={managingQuizCourse}
          onClose={() => setManagingQuizCourse(null)}
        />
      )}

      {qaCourseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[var(--ak-border)] bg-[var(--ak-canvas)] p-5 shadow-2xl">
            <CourseQaPanel
              currentUser={currentUser}
              courses={[
                {
                  id: qaCourseModal.id,
                  title: qaCourseModal.title,
                  subject: qaCourseModal.subject,
                },
              ]}
              initialCourseId={qaCourseModal.id}
              onClose={() => setQaCourseModal(null)}
            />
          </div>
        </div>
      )}

      {activeClassroomId && (
        <LiveClassroomModal
          sessionId={activeClassroomId}
          currentUser={currentUser}
          hostLibrary={resources}
          onClose={() => {
            setActiveClassroomId(null);
            loadWorkspace();
          }}
        />
      )}

      <ContentInspectorModal item={inspected} onClose={() => setInspected(null)} />
    </>
  );
};
