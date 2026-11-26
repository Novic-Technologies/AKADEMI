import React, { useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Edit3,
  Eye,
  FileText,
  GraduationCap,
  Library,
  MessageSquare,
  Play,
  Radio,
  RotateCcw,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { apiFetch, createAkademiSocket, fetchAuthorizedBlob } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type {
  CertificateRecord,
  CourseItem,
  EnrollmentRecord,
  LearnerAcademicDoc,
  LedgerTransaction,
  LiveSession,
  QuizAttempt,
  QuizItem,
  ResourceItem,
  UserProfile,
} from '../types/akademi';
import { CommunicationPanel } from './CommunicationPanel';
import { ContentInspectorModal, type InspectedContent } from './ContentInspectorModal';
import { CourseQaPanel } from './CourseQaPanel';
import { DashboardShell } from './DashboardShell';
import { LiveClassroomModal } from './LiveClassroomModal';
import { QuizRunnerModal } from './QuizRunnerModal';

interface LearnerDashboardProps {
  currentUser: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
  onLogout: () => void;
  onGoPublic: () => void;
}

type LearnerTab = 'DISCOVER' | 'MY_COURSES' | 'LIBRARY' | 'VAULT' | 'LIVE' | 'INBOX';

interface CatalogResource extends ResourceItem {
  canAccess: boolean;
}

interface CatalogCourse extends CourseItem {
  myEnrollment?: EnrollmentRecord;
}

interface CatalogSession extends LiveSession {
  canJoin: { allowed: boolean; reason?: string };
}

type CatalogCreator = UserProfile & { resourcesCount: number; coursesCount: number };

const DARK_INPUT =
  'w-full rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-2 text-sm text-[var(--ak-ink)] placeholder:text-[var(--ak-muted)] focus:border-[#C9642E] focus:outline-none';

export const LearnerDashboard: React.FC<LearnerDashboardProps> = ({
  currentUser,
  onUserUpdated,
  onLogout,
  onGoPublic,
}) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<LearnerTab>('DISCOVER');
  const [creators, setCreators] = useState<CatalogCreator[]>([]);
  const [resources, setResources] = useState<CatalogResource[]>([]);
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [sessions, setSessions] = useState<CatalogSession[]>([]);
  const [academicDocs, setAcademicDocs] = useState<LearnerAcademicDoc[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRecord[]>([]);
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [educationLevels, setEducationLevels] = useState<string[]>([
    'UNEB PLE (Primary Leaving)',
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

  // Discover filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | ResourceItem['type']>('ALL');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [courseSearch, setCourseSearch] = useState('');

  // Modals & cross-tab messaging
  const [activeClassroomId, setActiveClassroomId] = useState<string | null>(null);
  const [inspected, setInspected] = useState<InspectedContent | null>(null);
  const [inspectCreator, setInspectCreator] = useState<CatalogCreator | null>(null);
  const [inspectCourse, setInspectCourse] = useState<CatalogCourse | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<QuizItem | null>(null);
  const [qaCourseModal, setQaCourseModal] = useState<CatalogCourse | null>(null);
  const [messageRecipientId, setMessageRecipientId] = useState('');

  // Inline confirmation states (no window.confirm)
  const [confirmWithdrawId, setConfirmWithdrawId] = useState<string | null>(null);
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null);
  const [confirmCancelPass, setConfirmCancelPass] = useState(false);

  // Academic doc create form
  const [docTitle, setDocTitle] = useState('');
  const [docLevel, setDocLevel] = useState(
    currentUser.educationLevel || 'NCHE Undergraduate (Year 1–4)'
  );
  const [docIssuer, setDocIssuer] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);

  // Academic doc edit modal
  const [editingDoc, setEditingDoc] = useState<LearnerAcademicDoc | null>(null);
  const [editDocTitle, setEditDocTitle] = useState('');
  const [editDocLevel, setEditDocLevel] = useState('');
  const [editDocIssuer, setEditDocIssuer] = useState('');
  const [editDocFile, setEditDocFile] = useState<File | null>(null);
  const [savingDocEdit, setSavingDocEdit] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [catalog, ws, certRes, quizRes] = await Promise.all([
        apiFetch<{
          creators: CatalogCreator[];
          resources: CatalogResource[];
          courses: CatalogCourse[];
          liveSessions: CatalogSession[];
        }>('/api/learner/catalog'),
        apiFetch<{
          academicDocs: LearnerAcademicDoc[];
          enrollments: EnrollmentRecord[];
          transactions: LedgerTransaction[];
          educationLevels?: string[];
        }>('/api/learner/workspace'),
        apiFetch<{ certificates: CertificateRecord[] }>('/api/certificates/mine').catch(() => ({
          certificates: [] as CertificateRecord[],
        })),
        apiFetch<{ quizzes: QuizItem[]; attempts: QuizAttempt[] }>('/api/quizzes/mine').catch(
          () => ({ quizzes: [] as QuizItem[], attempts: [] as QuizAttempt[] })
        ),
      ]);
      setCreators(catalog.creators);
      setResources(catalog.resources);
      setCourses(catalog.courses);
      setSessions(catalog.liveSessions);
      setAcademicDocs(ws.academicDocs);
      setEnrollments(ws.enrollments);
      setCertificates(certRes.certificates);
      setQuizzes(quizRes.quizzes);
      setQuizAttempts(quizRes.attempts);
      setTransactions(ws.transactions);
      if (ws.educationLevels && ws.educationLevels.length > 0) {
        setEducationLevels(ws.educationLevels);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load learner workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [currentUser.id]);

  useEffect(() => {
    const ws = createAkademiSocket((event, payload) => {
      if (event === 'certificate:issued') {
        const cert = payload.certificate as CertificateRecord | undefined;
        if (cert) {
          setNotice(
            `Certificate unlocked for ${cert.courseTitle}: Code ${cert.certificateCode}`
          );
        }
        loadAll();
      } else if (event === 'enrollment:updated') {
        loadAll();
      }
    });
    return () => {
      ws?.close();
    };
  }, [currentUser.id]);

  const openMessageEducator = (recipientId: string) => {
    setMessageRecipientId(recipientId);
    setInspectCreator(null);
    setInspectCourse(null);
    setTab('INBOX');
  };

  const handleFollow = async (creatorId: string, mode: 'FREE' | 'PAID' | 'UNFOLLOW') => {
    setError('');
    try {
      const res = await apiFetch<{ user: UserProfile }>(`/api/learner/follow/${creatorId}`, {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
      onUserUpdated(res.user);
      setNotice(
        mode === 'UNFOLLOW'
          ? 'Unfollowed creator.'
          : mode === 'PAID'
            ? 'Paid Follow membership activated.'
            : 'Following educator updates.'
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update follow status.');
    }
  };

  const handlePurchase = async (
    kind: 'PLATFORM_PASS' | 'CANCEL_PLATFORM_PASS' | 'RESOURCE' | 'COURSE',
    targetId = ''
  ) => {
    setError('');
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/learner/purchase', {
        method: 'POST',
        body: JSON.stringify({ kind, targetId }),
      });
      onUserUpdated(res.user);
      setConfirmCancelPass(false);
      setNotice(
        kind === 'PLATFORM_PASS'
          ? 'Akademi Pass activated across included resources.'
          : kind === 'CANCEL_PLATFORM_PASS'
            ? 'Akademi Pass cancelled. Individual purchases remain in your library.'
            : 'Purchase completed and added to your library.'
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed.');
    }
  };

  const handleEnroll = async (course: CatalogCourse) => {
    setError('');
    try {
      await apiFetch(`/api/courses/${course.id}/enroll`, { method: 'POST' });
      setInspectCourse(null);
      setNotice(
        course.requiresAcademicVerification
          ? `Enrollment requested. Your academic documents were routed to ${
              course.institutionId ? 'the Institution Admin' : course.ownerName
            } for level verification.`
          : 'Enrolled successfully!'
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrollment failed.');
    }
  };

  const handleWithdrawEnrollment = async (enrollmentId: string) => {
    setError('');
    try {
      await apiFetch(`/api/enrollments/${enrollmentId}`, { method: 'DELETE' });
      setConfirmWithdrawId(null);
      setNotice('Enrollment withdrawn.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to withdraw enrollment.');
    }
  };

  const handleOpenResource = async (r: CatalogResource, download = false) => {
    setError('');
    try {
      const blob = await fetchAuthorizedBlob(
        `/api/files/resource/${r.id}${download ? '?download=1' : ''}`
      );
      const normalizedFileName =
        blob.type === 'application/pdf' && !r.fileName.toLowerCase().endsWith('.pdf')
          ? `${r.fileName.replace(/\.[^.]+$/, '')}.pdf`
          : r.fileName;
      if (download) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = normalizedFileName;
        a.click();
        URL.revokeObjectURL(url);
        await loadAll();
      } else {
        setInspected({
          title: r.title,
          subtitle: `${r.ownerName} · ${r.subject} · ${r.educationLevel}`,
          fileName: normalizedFileName,
          mimeType: blob.type || 'application/pdf',
          objectUrl: URL.createObjectURL(blob),
          blob,
          canDownload: r.downloadable,
          metadata: [
            { label: 'Format', value: r.type },
            { label: 'File', value: `${normalizedFileName} (${r.fileSizeLabel})` },
          ],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open material.');
    }
  };

  const handleOpenAcademicDoc = async (doc: LearnerAcademicDoc, download = false) => {
    setError('');
    try {
      const blob = await fetchAuthorizedBlob(
        `/api/files/academic-doc/${doc.id}${download ? '?download=1' : ''}`
      );
      const normalizedFileName =
        blob.type === 'application/pdf' && !doc.fileName.toLowerCase().endsWith('.pdf')
          ? `${doc.fileName.replace(/\.[^.]+$/, '')}.pdf`
          : doc.fileName;
      if (download) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = normalizedFileName;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        setInspected({
          title: doc.title,
          subtitle: `${doc.institutionIssued} · ${doc.educationLevel}`,
          fileName: normalizedFileName,
          mimeType: blob.type || 'application/pdf',
          objectUrl: URL.createObjectURL(blob),
          blob,
          canDownload: true,
          metadata: [
            { label: 'Level', value: doc.educationLevel },
            { label: 'Issuer', value: doc.institutionIssued },
          ],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open academic credential.');
    }
  };

  const handleOpenCertificate = async (certificateId: string, download = false) => {
    setError('');
    try {
      const cert = certificates.find(
        (c) => c.id === certificateId || c.certificateCode === certificateId
      );
      const blob = await fetchAuthorizedBlob(
        `/api/files/certificate/${encodeURIComponent(certificateId)}${download ? '?download=1' : ''}`
      );
      const pdfName = `${cert?.certificateCode || certificateId}.pdf`;
      if (download) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pdfName;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      setInspected({
        title: cert ? `Certificate of Completion — ${cert.courseTitle}` : 'Akademi Certificate',
        subtitle: cert
          ? `${cert.learnerName} · Code ${cert.certificateCode} · Issued by ${cert.issuerName}`
          : 'Verified Akademi Credential',
        fileName: pdfName,
        mimeType: 'application/pdf',
        objectUrl: URL.createObjectURL(blob),
        blob,
        canDownload: true,
        metadata: cert
          ? [
              { label: 'Verification Code', value: cert.certificateCode },
              { label: 'Course', value: cert.courseTitle },
              { label: 'Grade', value: cert.gradeLabel || 'Completed' },
              { label: 'Issued', value: new Date(cert.issuedAt).toLocaleDateString() },
            ]
          : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open certificate PDF.');
    }
  };

  const handleToggleProgress = async (
    courseId: string,
    resourceId: string,
    nextCompleted: boolean
  ) => {
    setError('');
    try {
      const res = await apiFetch<{
        enrollment?: EnrollmentRecord;
        issuedCertificate?: CertificateRecord | null;
      }>('/api/learner/progress', {
        method: 'POST',
        body: JSON.stringify({ courseId, resourceId, completed: nextCompleted }),
      });
      if (res.issuedCertificate) {
        setNotice(
          `Congratulations! Certificate ${res.issuedCertificate.certificateCode} issued for ${res.issuedCertificate.courseTitle}.`
        );
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update progress.');
    }
  };

  const handleUploadAcademicDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!docFile) {
      setError('Please select a document file (PDF, Word DOCX/DOC/ODT/RTF, or image scan).');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('title', docTitle);
      fd.append('educationLevel', docLevel);
      fd.append('institutionIssued', docIssuer);
      fd.append('document', docFile);
      const res = await apiFetch<{ user: UserProfile }>('/api/learner/academic-docs', {
        method: 'POST',
        body: fd,
      });
      onUserUpdated(res.user);
      setDocTitle('');
      setDocIssuer('');
      setDocFile(null);
      setNotice('Academic credential saved to your Education Vault.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  const startEditDoc = (doc: LearnerAcademicDoc) => {
    setEditingDoc(doc);
    setEditDocTitle(doc.title);
    setEditDocLevel(doc.educationLevel);
    setEditDocIssuer(doc.institutionIssued);
    setEditDocFile(null);
  };

  const handleSaveEditDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;
    setError('');
    setSavingDocEdit(true);
    try {
      const fd = new FormData();
      fd.append('title', editDocTitle);
      fd.append('educationLevel', editDocLevel);
      fd.append('institutionIssued', editDocIssuer);
      if (editDocFile) fd.append('document', editDocFile);
      await apiFetch(`/api/learner/academic-docs/${editingDoc.id}`, {
        method: 'PATCH',
        body: fd,
      });
      setEditingDoc(null);
      setNotice('Academic credential updated.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update credential.');
    } finally {
      setSavingDocEdit(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    setError('');
    try {
      await apiFetch(`/api/learner/academic-docs/${docId}`, { method: 'DELETE' });
      setConfirmDeleteDocId(null);
      setNotice('Academic credential removed from your Education Vault.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove credential.');
    }
  };

  const filteredCourses = courses.filter((c) => {
    const matchLevel = levelFilter === 'ALL' || c.requiredLevel === levelFilter;
    const q = courseSearch.trim().toLowerCase();
    const matchQ =
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.subject.toLowerCase().includes(q) ||
      c.ownerName.toLowerCase().includes(q);
    return matchLevel && matchQ;
  });

  const filteredResources = resources.filter((r) => {
    const matchType = typeFilter === 'ALL' || r.type === typeFilter;
    const matchLevel = levelFilter === 'ALL' || r.educationLevel === levelFilter;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      r.title.toLowerCase().includes(q) ||
      r.subject.toLowerCase().includes(q) ||
      r.ownerName.toLowerCase().includes(q);
    return matchType && matchLevel && matchSearch;
  });

  const ownedResources = resources.filter((r) => r.canAccess);

  const creatorCourses = inspectCreator
    ? courses.filter((c) => c.ownerId === inspectCreator.id || c.institutionId === inspectCreator.id)
    : [];
  const creatorResources = inspectCreator
    ? resources.filter((r) => r.ownerId === inspectCreator.id || r.institutionId === inspectCreator.id)
    : [];

  return (
    <>
      <DashboardShell
        breadcrumbLeft={t.myAcademy}
        breadcrumbRight={currentUser.name}
        userName={currentUser.name}
        userMeta={`${currentUser.educationLevel || 'Learner'} · ${
          currentUser.platformPassActive ? t.libraryPassActive : t.freeTier
        }`}
        currentUser={currentUser}
        onUserUpdated={onUserUpdated}
        educationLevels={educationLevels}
        navItems={[
          { id: 'DISCOVER', label: t.tabBrowseEducators, icon: BookOpen },
          { id: 'MY_COURSES', label: `${t.tabMyCourses} (${enrollments.length})`, icon: GraduationCap },
          { id: 'LIBRARY', label: `${t.tabOwnedMaterials} (${ownedResources.length})`, icon: Library },
          { id: 'LIVE', label: `${t.tabLiveSchedule} (${sessions.length})`, icon: Radio },
          { id: 'VAULT', label: `${t.tabAcademicVault} (${academicDocs.length})`, icon: UserCheck },
          { id: 'INBOX', label: t.tabMessagesSupport, icon: MessageSquare },
        ]}
        activeTab={tab}
        onSelectTab={(id) => setTab(id as LearnerTab)}
        onGoPublic={onGoPublic}
        onLogout={onLogout}
        sidebarFooterAddon={
          !currentUser.platformPassActive ? (
            <div className="mt-6 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-4 text-sm">
              <p className="font-bold text-[var(--ak-ink)]">{t.libraryPassTitle}</p>
              <p className="mt-1 text-sm text-[var(--ak-ink-2)]">{t.libraryPassDesc}</p>
              <button
                type="button"
                onClick={() => handlePurchase('PLATFORM_PASS')}
                className="mt-3 min-h-[40px] w-full rounded-lg bg-[#C9642E] px-3 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
              >
                {t.activateLibraryPass}
              </button>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-[var(--ak-ok-bd)] bg-[var(--ak-ok-bg)] p-4 text-sm">
              <p className="font-bold text-[var(--ak-ok-fg)]">{t.libraryPassActive}</p>
              <p className="mt-1 text-xs text-[var(--ak-ink-2)]">
                Full access unlocked across included platform resources.
              </p>
              {confirmCancelPass ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePurchase('CANCEL_PLATFORM_PASS')}
                    className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
                  >
                    Confirm Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancelPass(false)}
                    className="rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--ak-ink-2)]"
                  >
                    Keep Pass
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmCancelPass(true)}
                  className="mt-3 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--ak-ink-2)] hover:border-[var(--ak-err-bd)] hover:text-[var(--ak-err-fg)]"
                >
                  Cancel Pass
                </button>
              )}
            </div>
          )
        }
        headerRight={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-[var(--ak-ink-2)] whitespace-nowrap">
              {t.followingLabel}:{' '}
              <strong className="font-mono-nums text-[var(--ak-ink)]">
                {currentUser.followingCreatorIds.length}
              </strong>
            </span>
            <span className="text-[var(--ak-ink-2)] whitespace-nowrap">
              {t.passLabel}:{' '}
              <strong
                className={
                  currentUser.platformPassActive
                    ? 'text-[var(--ak-ok-fg)]'
                    : 'text-[var(--ak-accent-ink)]'
                }
              >
                {currentUser.platformPassActive ? t.activeLabel : t.freeLabel}
              </strong>
            </span>
          </div>
        }
      >
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--ak-err-bd)] bg-[var(--ak-err-bg)] px-4 py-3 text-sm text-[var(--ak-err-fg)]">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              className="text-xs font-medium underline shrink-0"
            >
              {t.dismiss}
            </button>
          </div>
        )}
        {notice && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--ak-ok-bd)] bg-[var(--ak-ok-bg)] px-4 py-3 text-sm text-[var(--ak-ok-fg)]">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice('')}
              className="text-xs font-medium underline shrink-0"
            >
              {t.dismiss}
            </button>
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-10 text-center text-base font-medium text-[var(--ak-ink-2)]">
            {t.loadingWorkspace}
          </div>
        ) : (
          <>
            {tab === 'DISCOVER' && (
              <div className="space-y-8">
                {/* Verified Educators & Institutions */}
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                      {t.followEducatorsHeading}
                    </h2>
                    <span className="font-mono-nums text-xs text-[var(--ak-muted)]">
                      {creators.length} verified educators &amp; institutions
                    </span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {creators.map((cr) => {
                      const isFollowing = currentUser.followingCreatorIds.includes(cr.id);
                      const isPaidMember = currentUser.paidFollowCreatorIds.includes(cr.id);
                      return (
                        <div
                          key={cr.id}
                          className="flex flex-col justify-between rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5"
                        >
                          <div>
                            <p className="text-xs font-medium text-[var(--ak-accent-ink)]">
                              {cr.role.replace('_', ' ')} ·{' '}
                              <span className="font-mono-nums text-[var(--ak-muted)]">
                                {cr.followerIds.length} followers · {cr.coursesCount} courses ·{' '}
                                {cr.resourcesCount} files
                              </span>
                            </p>
                            <button
                              type="button"
                              onClick={() => setInspectCreator(cr)}
                              className="mt-1.5 text-left text-base font-semibold text-[var(--ak-ink)] hover:text-[var(--ak-accent-ink)]"
                            >
                              {cr.name}
                            </button>
                            <p className="mt-1 text-xs text-[var(--ak-muted)]">
                              {cr.specialization} · {cr.country}
                            </p>
                            <p className="mt-2 line-clamp-2 text-sm text-[var(--ak-ink-2)]">{cr.bio}</p>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--ak-divider)] pt-3">
                            <button
                              type="button"
                              onClick={() => setInspectCreator(cr)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Profile
                            </button>
                            {isFollowing ? (
                              <button
                                type="button"
                                onClick={() => handleFollow(cr.id, 'UNFOLLOW')}
                                className="rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-2.5 py-1.5 text-xs font-medium text-[var(--ak-ink-2)] hover:bg-[var(--ak-elevated)]"
                              >
                                {t.following} ({t.unfollow})
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleFollow(cr.id, 'FREE')}
                                className="rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1.5 text-xs font-medium text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
                              >
                                {t.follow}
                              </button>
                            )}
                            {!isPaidMember && cr.followPriceUsd > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleFollow(cr.id, 'PAID')}
                                className="rounded-lg bg-[#C9642E] px-2.5 py-1.5 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                              >
                                Paid (${cr.followPriceUsd}/mo)
                              </button>
                            ) : isPaidMember ? (
                              <span className="text-xs font-semibold text-[var(--ak-ok-fg)]">
                                Paid Active
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openMessageEducator(cr.id)}
                              title="Message Educator"
                              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1.5 text-xs font-medium text-[var(--ak-accent-ink)] hover:bg-[var(--ak-elevated-hover)]"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              Message
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Courses */}
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                      {t.courseCatalogHeading}
                    </h2>
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                      <input
                        type="search"
                        value={courseSearch}
                        onChange={(e) => setCourseSearch(e.target.value)}
                        placeholder="Search courses..."
                        className="w-full rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-1.5 text-sm text-[var(--ak-ink)] placeholder:text-[var(--ak-muted)] focus:border-[#C9642E] focus:outline-none sm:w-52"
                      />
                      <select
                        aria-label="Filter by education level"
                        value={levelFilter}
                        onChange={(e) => setLevelFilter(e.target.value)}
                        className="w-full rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-1.5 text-sm text-[var(--ak-ink)] focus:border-[#C9642E] focus:outline-none sm:w-56"
                      >
                        <option value="ALL">All Education Levels</option>
                        {educationLevels.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {filteredCourses.map((c) => {
                      const purchased = currentUser.purchasedCourseIds.includes(c.id);
                      return (
                        <div
                          key={c.id}
                          className="flex flex-col justify-between overflow-hidden rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)]"
                        >
                          <div>
                            <img
                              src={c.coverImage}
                              alt={c.title}
                              referrerPolicy="no-referrer"
                              className="h-40 w-full object-cover"
                            />
                            <div className="p-5">
                              <div className="text-xs font-medium text-[var(--ak-accent-ink)]">
                                {c.subject} · {c.requiredLevel} ·{' '}
                                <span className="font-mono-nums">
                                  {c.priceUsd > 0 ? `$${c.priceUsd}` : c.accessTier.replace('_', ' ')}
                                </span>
                              </div>
                              <h3 className="mt-1.5 text-base font-semibold text-[var(--ak-ink)]">
                                {c.title}
                              </h3>
                              <p className="mt-1 line-clamp-2 text-sm text-[var(--ak-ink-2)]">
                                {c.description}
                              </p>
                              <p className="mt-2 text-xs text-[var(--ak-muted)]">
                                Educator: {c.ownerName} · Verified by:{' '}
                                {c.institutionId ? 'Institution Admin' : c.ownerName}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-2 border-t border-[var(--ak-divider)] px-5 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => setInspectCourse(c)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ak-accent-ink)] hover:underline"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View Syllabus ({c.resourceIds.length} files)
                              </button>
                              <button
                                type="button"
                                onClick={() => openMessageEducator(c.ownerId)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ak-ink-2)] hover:text-[var(--ak-ink)]"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                                Ask Educator
                              </button>
                            </div>
                            {c.myEnrollment ? (
                              <div className="flex items-center justify-between gap-2 pt-1">
                                <span
                                  className={`text-sm font-semibold ${
                                    c.myEnrollment.academicStatus === 'APPROVED'
                                      ? 'text-[var(--ak-ok-fg)]'
                                      : c.myEnrollment.academicStatus === 'REJECTED'
                                        ? 'text-[var(--ak-err-fg)]'
                                        : 'text-[var(--ak-warn-fg)]'
                                  }`}
                                >
                                  Enrollment: {c.myEnrollment.academicStatus}
                                </span>
                                {c.myEnrollment.academicStatus === 'REJECTED' && (
                                  <button
                                    type="button"
                                    onClick={() => handleEnroll(c)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-[#C9642E] px-3 py-1.5 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                    Re-apply
                                  </button>
                                )}
                              </div>
                            ) : c.accessTier === 'PAID_SINGLE' && c.priceUsd > 0 && !purchased ? (
                              <button
                                type="button"
                                onClick={() => handlePurchase('COURSE', c.id)}
                                className="w-full rounded-lg bg-[#C9642E] px-3 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                              >
                                Purchase Course (${c.priceUsd})
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleEnroll(c)}
                                className="w-full rounded-lg bg-[var(--ak-elevated)] border border-[var(--ak-border)] px-3 py-2 text-sm font-semibold text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
                              >
                                Request Enrollment &amp; Verify Level
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Resource Library */}
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                      {t.resourceLibraryHeading}
                    </h2>
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t.searchPlaceholder}
                        className="w-full rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-1.5 text-sm text-[var(--ak-ink)] placeholder:text-[var(--ak-muted)] focus:border-[#C9642E] focus:outline-none sm:w-56"
                      />
                      <select
                        aria-label="Format filter"
                        value={typeFilter}
                        onChange={(e) =>
                          setTypeFilter(e.target.value as 'ALL' | ResourceItem['type'])
                        }
                        className="w-full rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-1.5 text-sm font-medium text-[var(--ak-ink)] sm:hidden"
                      >
                        {(['ALL', 'PDF', 'DOCX', 'VIDEO', 'IMAGE', 'BOOK'] as const).map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                      <div className="hidden items-center gap-1 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-1 sm:flex">
                        {(['ALL', 'PDF', 'DOCX', 'VIDEO', 'IMAGE', 'BOOK'] as const).map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setTypeFilter(item)}
                            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                              typeFilter === item
                                ? 'bg-[#C9642E] text-[#F8F5EE]'
                                : 'text-[var(--ak-muted)] hover:text-[var(--ak-ink)]'
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {filteredResources.map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-col justify-between rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5"
                      >
                        <div>
                          <div className="text-xs font-medium text-[var(--ak-accent-ink)]">
                            {r.type} · {r.subject} · {r.educationLevel} · {r.ownerName} ·{' '}
                            <span className="font-mono-nums">
                              {r.priceUsd > 0 ? `$${r.priceUsd}` : r.accessTier.replace('_', ' ')}
                            </span>
                          </div>
                          <h3 className="mt-1.5 text-sm font-semibold text-[var(--ak-ink)]">{r.title}</h3>
                          <p className="mt-1 text-sm text-[var(--ak-ink-2)]">{r.description}</p>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ak-divider)] pt-3">
                          <span className="font-mono-nums text-xs text-[var(--ak-muted)]">
                            {r.fileSizeLabel} · {r.downloadsCount} downloads
                          </span>
                          {r.canAccess ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenResource(r, false)}
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                {t.preview}
                              </button>
                              {r.downloadable && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenResource(r, true)}
                                  className="inline-flex items-center gap-1 rounded-md bg-[#C9642E] px-2.5 py-1 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  {t.download}
                                </button>
                              )}
                            </div>
                          ) : r.accessTier === 'PAID_SINGLE' ? (
                            <button
                              type="button"
                              onClick={() => handlePurchase('RESOURCE', r.id)}
                              className="rounded-md bg-[#C9642E] px-3 py-1 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                            >
                              Buy (${r.priceUsd})
                            </button>
                          ) : (
                            <span className="text-xs font-medium text-[var(--ak-warn-fg)]">
                              Requires {r.accessTier.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {tab === 'MY_COURSES' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-[var(--ak-ink)]">
                  My Education Journey, Quizzes &amp; Verifiable Certificates
                </h2>

                {certificates.length > 0 && (
                  <section className="space-y-3 rounded-xl border border-[var(--ak-ok-bd)] bg-[var(--ak-ok-bg)] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Award className="h-5 w-5 text-[var(--ak-ok-fg)]" />
                        <h3 className="text-base font-semibold text-[var(--ak-ink)]">
                          Earned Verifiable Certificates ({certificates.length})
                        </h3>
                      </div>
                      <span className="text-xs text-[var(--ak-muted)]">
                        Includes scannable QR verification code for employers &amp; registrars
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {certificates.map((cert) => (
                        <div
                          key={cert.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-surface)] p-4 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[var(--ak-ink)] truncate">
                              {cert.courseTitle}
                            </p>
                            <p className="mt-0.5 font-mono text-xs font-semibold text-[var(--ak-accent-ink)]">
                              Code: {cert.certificateCode} · Grade {cert.gradeLabel}
                            </p>
                            <p className="mt-0.5 text-xs text-[var(--ak-muted)]">
                              Issued {new Date(cert.issuedAt).toLocaleDateString()} by {cert.issuerName}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenCertificate(cert.id, false)}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Inspect QR PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenCertificate(cert.id, true)}
                              className="inline-flex items-center gap-1 rounded-md bg-[#C9642E] px-2.5 py-1.5 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {enrollments.length === 0 ? (
                  <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-8 text-center text-sm text-[var(--ak-muted)]">
                    You have not requested any course enrollments yet. Browse courses to start.
                  </div>
                ) : (
                  enrollments.map((enr) => {
                    const course = courses.find((c) => c.id === enr.courseId);
                    const courseResources = resources.filter((r) =>
                      course?.resourceIds.includes(r.id)
                    );
                    const courseQuizzes = quizzes.filter((q) => q.courseId === enr.courseId);
                    const courseCert =
                      certificates.find((c) => c.courseId === enr.courseId) ||
                      (enr.certificateId
                        ? { id: enr.certificateId, certificateCode: enr.certificateCode || '' }
                        : null);
                    return (
                      <div
                        key={enr.id}
                        className="space-y-4 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-base font-semibold text-[var(--ak-ink)]">
                              {enr.courseTitle}
                            </h3>
                            <p className="mt-1 text-sm text-[var(--ak-ink-2)]">
                              Verification Status:{' '}
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
                              </strong>{' '}
                              · Attendance:{' '}
                              <span className="font-mono-nums">{enr.attendanceMinutes} min</span> ·
                              Grade: {enr.gradeLabel || 'In Progress'}
                            </p>
                            {enr.academicNote && (
                              <p className="mt-1 text-sm text-[var(--ak-muted)]">
                                Reviewer Note: {enr.academicNote}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right">
                              <span className="font-mono-nums text-lg font-semibold text-[var(--ak-ink)]">
                                {enr.progressPercent}%
                              </span>
                              <p className="text-xs text-[var(--ak-muted)]">Completed</p>
                            </div>
                          </div>
                        </div>

                        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--ak-recessed)]">
                          <div
                            className="h-full bg-[#C9642E] transition-all"
                            style={{ width: `${enr.progressPercent}%` }}
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {course && enr.academicStatus === 'APPROVED' && (
                              <button
                                type="button"
                                onClick={() => setQaCourseModal(course)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
                              >
                                <MessageSquare className="h-3.5 w-3.5 text-[var(--ak-accent-ink)]" />
                                Course Q&amp;A &amp; Office Hours
                              </button>
                            )}
                            {course && (
                              <button
                                type="button"
                                onClick={() => openMessageEducator(course.ownerId)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--ak-accent-ink)] hover:bg-[var(--ak-elevated-hover)]"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                                Message Educator ({course.ownerName})
                              </button>
                            )}
                            {courseCert && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenCertificate(courseCert.id, false)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
                                >
                                  <Award className="h-3.5 w-3.5" />
                                  Inspect Certificate ({courseCert.certificateCode || 'PDF'})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenCertificate(courseCert.id, true)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--ak-ok-bd)] bg-[var(--ak-ok-bg)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ak-ok-fg)]"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  PDF
                                </button>
                              </>
                            )}
                            {enr.academicStatus === 'REJECTED' && course && (
                              <button
                                type="button"
                                onClick={() => handleEnroll(course)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9642E] px-3 py-1.5 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Re-apply After Updating Vault
                              </button>
                            )}
                          </div>

                          {confirmWithdrawId === enr.id ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleWithdrawEnrollment(enr.id)}
                                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
                              >
                                Confirm Withdraw
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmWithdrawId(null)}
                                className="rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--ak-ink-2)]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmWithdrawId(enr.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-1.5 text-xs font-semibold text-[var(--ak-err-fg)] hover:border-[var(--ak-err-bd)] hover:bg-[var(--ak-err-bg)]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Withdraw
                            </button>
                          )}
                        </div>

                        {enr.academicStatus === 'APPROVED' && courseResources.length > 0 && (
                          <div className="divide-y divide-[var(--ak-divider)] rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)]">
                            {courseResources.map((r) => {
                              const done = enr.completedResourceIds.includes(r.id);
                              return (
                                <div
                                  key={r.id}
                                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                                >
                                  <span className="font-medium text-[var(--ak-ink)]">
                                    <span className="text-[var(--ak-accent-ink)]">[{r.type}]</span> {r.title}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenResource(r, false)}
                                      className="rounded-md border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
                                    >
                                      Study
                                    </button>
                                    {done ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleToggleProgress(enr.courseId, r.id, false)
                                        }
                                        title="Click to unmark completion"
                                        className="inline-flex items-center gap-1 rounded-md border border-[var(--ak-ok-bd)] bg-[var(--ak-ok-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-ok-fg)] hover:opacity-90"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Done (Undo)
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleToggleProgress(enr.courseId, r.id, true)
                                        }
                                        className="rounded-md bg-[#C9642E] px-2.5 py-1 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                                      >
                                        Mark Complete
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {enr.academicStatus === 'APPROVED' && courseQuizzes.length > 0 && (
                          <div className="space-y-2 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-3.5">
                            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ak-muted)]">
                              Timed Assessments &amp; Past-Paper Drills ({courseQuizzes.length})
                            </p>
                            <div className="divide-y divide-[var(--ak-divider)] rounded-lg border border-[var(--ak-border)] bg-[var(--ak-surface)]">
                              {courseQuizzes.map((qz) => {
                                const myAttempts = quizAttempts.filter((a) => a.quizId === qz.id);
                                const bestAttempt = myAttempts.sort(
                                  (a, b) => b.percentScore - a.percentScore
                                )[0];
                                return (
                                  <div
                                    key={qz.id}
                                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ak-accent-ink)] font-semibold">
                                        <span>{qz.curriculumTag}</span>
                                        {qz.isPastPaper && <span>· Past-Paper Drill</span>}
                                        <span className="inline-flex items-center gap-1 font-mono text-[var(--ak-muted)] font-normal">
                                          <Clock className="h-3 w-3" />
                                          {qz.timeLimitMinutes} min · {qz.questions.length} Qs
                                        </span>
                                      </div>
                                      <p className="mt-0.5 font-semibold text-[var(--ak-ink)]">
                                        {qz.title}
                                      </p>
                                      {bestAttempt && (
                                        <p
                                          className={`mt-0.5 font-mono text-xs font-semibold ${
                                            bestAttempt.passed
                                              ? 'text-[var(--ak-ok-fg)]'
                                              : 'text-[var(--ak-warn-fg)]'
                                          }`}
                                        >
                                          Best Score: {bestAttempt.percentScore}% ({bestAttempt.gradeLabel}) ·{' '}
                                          {bestAttempt.passed ? 'PASSED' : `Pass requires ${qz.passingPercent}%`}
                                        </p>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setActiveQuiz(qz)}
                                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9642E] px-3.5 py-2 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C] shrink-0"
                                    >
                                      <Play className="h-3.5 w-3.5" />
                                      {bestAttempt ? 'Retake / Review' : 'Start Timed Quiz'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {tab === 'LIBRARY' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5">
                  <div>
                    <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                      Akademi Pass Membership
                    </h2>
                    <p className="mt-1 text-sm text-[var(--ak-ink-2)]">
                      {currentUser.platformPassActive
                        ? 'Your monthly Akademi Pass is active, unlocking platform-wide pass resources.'
                        : 'Unlock all Akademi Pass materials across verified African educators for $15/month.'}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {!currentUser.platformPassActive ? (
                      <button
                        type="button"
                        onClick={() => handlePurchase('PLATFORM_PASS')}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                      >
                        <CreditCard className="h-4 w-4" />
                        Activate Pass ($15/mo)
                      </button>
                    ) : confirmCancelPass ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handlePurchase('CANCEL_PLATFORM_PASS')}
                          className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600"
                        >
                          Confirm Cancellation
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCancelPass(false)}
                          className="rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3 py-2 text-xs font-semibold text-[var(--ak-ink-2)]"
                        >
                          Keep Active
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmCancelPass(true)}
                        className="rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3.5 py-2 text-sm font-semibold text-[var(--ak-ink-2)] hover:border-[var(--ak-err-bd)] hover:text-[var(--ak-err-fg)]"
                      >
                        Cancel Akademi Pass
                      </button>
                    )}
                  </div>
                </div>

                <h2 className="text-lg font-semibold text-[var(--ak-ink)]">
                  Owned &amp; Unlocked Educational Materials ({ownedResources.length})
                </h2>
                {ownedResources.length === 0 ? (
                  <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-8 text-center text-sm text-[var(--ak-muted)]">
                    No unlocked materials yet. Browse the resource catalog to unlock free or paid resources.
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {ownedResources.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-start justify-between gap-4 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-4"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs text-[var(--ak-accent-ink)]">
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span>{r.type}</span>
                            <span aria-hidden="true">·</span>
                            <span className="truncate text-[var(--ak-muted)]">{r.ownerName}</span>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-[var(--ak-ink)]">{r.title}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenResource(r, false)}
                            className="rounded-md border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
                          >
                            Read
                          </button>
                          {r.downloadable && (
                            <button
                              type="button"
                              onClick={() => handleOpenResource(r, true)}
                              className="rounded-md bg-[#C9642E] px-2.5 py-1 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                            >
                              Download
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {transactions.length > 0 && (
                  <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)]">
                    <div className="border-b border-[var(--ak-divider)] px-5 py-3">
                      <h3 className="text-sm font-semibold text-[var(--ak-ink)]">
                        Payment Receipts &amp; Subscriptions
                      </h3>
                    </div>
                    <div className="divide-y divide-[var(--ak-divider)]">
                      {transactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                        >
                          <span className="font-medium text-[var(--ak-ink)]">{tx.itemTitle}</span>
                          <span className="font-mono-nums text-[var(--ak-ink-2)]">
                            ${tx.grossUsd.toFixed(2)} ·{' '}
                            {new Date(tx.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'LIVE' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-[var(--ak-ink)]">
                  Live Classrooms &amp; Seminars
                </h2>
                {sessions.length === 0 ? (
                  <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-8 text-center text-sm text-[var(--ak-muted)]">
                    No live sessions scheduled yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-[var(--ak-muted)]">
                              <strong
                                className={
                                  s.status === 'LIVE'
                                    ? 'text-[var(--ak-ok-fg)]'
                                    : s.status === 'ENDED'
                                      ? 'text-[var(--ak-muted)]'
                                      : 'text-[var(--ak-accent-ink)]'
                                }
                              >
                                {s.status}
                              </strong>{' '}
                              · {s.courseTitle} · Host: {s.hostName}
                            </div>
                            <h3 className="mt-1 text-base font-semibold text-[var(--ak-ink)]">
                              {s.title}
                            </h3>
                            <p className="mt-1 text-sm text-[var(--ak-ink-2)]">{s.topicSummary}</p>
                          </div>
                          <div className="shrink-0">
                            {s.canJoin.allowed && s.status === 'LIVE' ? (
                              <button
                                type="button"
                                onClick={() => setActiveClassroomId(s.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
                              >
                                <Play className="h-3.5 w-3.5" />
                                {t.joinLive}
                              </button>
                            ) : !s.canJoin.allowed ? (
                              <span className="text-sm text-[var(--ak-warn-fg)]">{s.canJoin.reason}</span>
                            ) : (
                              <span className="font-mono-nums text-xs text-[var(--ak-muted)]">
                                {s.status === 'ENDED'
                                  ? 'Session Ended'
                                  : `Scheduled: ${new Date(s.scheduledAt).toLocaleString()}`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'VAULT' && (
              <div className="grid gap-6 lg:grid-cols-12">
                <form
                  onSubmit={handleUploadAcademicDoc}
                  className="space-y-4 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 lg:col-span-5"
                >
                  <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                    Upload Academic Prerequisite Document
                  </h2>
                  <p className="text-sm text-[var(--ak-ink-2)]">
                    Upload transcripts or certificates to verify fitness for your selected education
                    level. Confidential identity records are never exposed to educators.
                  </p>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                      Document Title
                    </label>
                    <input
                      type="text"
                      required
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      placeholder="e.g. BSc Year 1 Official Transcript"
                      className={DARK_INPUT}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                      Education Level (UNEB / NCHE / EAC)
                    </label>
                    <select
                      value={docLevel}
                      onChange={(e) => setDocLevel(e.target.value)}
                      className={DARK_INPUT}
                    >
                      {educationLevels.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {lvl}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                      Issuing Institution / Board
                    </label>
                    <input
                      type="text"
                      required
                      value={docIssuer}
                      onChange={(e) => setDocIssuer(e.target.value)}
                      placeholder="e.g. Makerere University"
                      className={DARK_INPUT}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">
                      Certificate / Transcript File (Documents Only)
                    </label>
                    <input
                      type="file"
                      required
                      accept=".pdf,.doc,.docx,.odt,.rtf,.png,.jpg,.jpeg,.webp"
                      onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                      className="w-full rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-2 text-sm text-[var(--ak-ink-2)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--ak-elevated)] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[var(--ak-ink)]"
                    />
                    <p className="mt-1 text-xs text-[var(--ak-muted)]">
                      Accepted formats: PDF, Word (.docx/.doc/.odt/.rtf), or clear image scan (.png/.jpg/.webp).
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#C9642E] px-4 py-2.5 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Save to Academic Vault
                  </button>
                </form>

                <div className="min-w-0 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] lg:col-span-7">
                  <div className="border-b border-[var(--ak-divider)] px-5 py-4">
                    <h2 className="text-base font-semibold text-[var(--ak-ink)]">
                      My Academic Documents ({academicDocs.length})
                    </h2>
                  </div>
                  <div className="divide-y divide-[var(--ak-divider)]">
                    {academicDocs.length === 0 ? (
                      <p className="p-8 text-center text-sm text-[var(--ak-muted)]">
                        No academic credentials uploaded yet.
                      </p>
                    ) : (
                      academicDocs.map((d) => (
                        <div
                          key={d.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[var(--ak-ink)] break-words">
                              {d.title}
                            </p>
                            <p className="mt-1 text-xs text-[var(--ak-muted)] break-words">
                              {d.educationLevel} · Issued by {d.institutionIssued} · {d.fileName}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenAcademicDoc(d, false)}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              {t.preview}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenAcademicDoc(d, true)}
                              className="inline-flex items-center gap-1 rounded-md bg-[#C9642E] px-2.5 py-1.5 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                            >
                              <Download className="h-3.5 w-3.5" />
                              {t.download}
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditDoc(d)}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ak-accent-ink)] hover:bg-[var(--ak-elevated-hover)]"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            {confirmDeleteDocId === d.id ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDoc(d.id)}
                                  className="rounded-md bg-red-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteDocId(null)}
                                  className="rounded-md border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ak-ink-2)]"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteDocId(d.id)}
                                title="Delete Document"
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ak-err-fg)] hover:border-[var(--ak-err-bd)] hover:bg-[var(--ak-err-bg)]"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            )}
                          </div>
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
                defaultTab="THREADS"
                initialRecipientId={messageRecipientId}
                qaCourses={courses
                  .filter((c) => c.myEnrollment?.academicStatus === 'APPROVED')
                  .map((c) => ({
                    id: c.id,
                    title: c.title,
                    subject: c.subject,
                  }))}
                availableRecipients={creators.map((c) => ({
                  id: c.id,
                  name: c.name,
                  label: `${c.role.replace('_', ' ')} · ${c.specialization}`,
                }))}
              />
            )}
          </>
        )}
      </DashboardShell>

      {/* Educator Profile Modal */}
      {inspectCreator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4 backdrop-blur-xs">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 text-[var(--ak-ink)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--ak-divider)] pb-4">
              <div>
                <p className="text-xs font-semibold text-[var(--ak-accent-ink)]">
                  {inspectCreator.role.replace('_', ' ')} · {inspectCreator.country}
                </p>
                <h3 className="mt-1 text-xl font-bold text-[var(--ak-ink)]">{inspectCreator.name}</h3>
                <p className="mt-1 text-sm text-[var(--ak-muted)]">{inspectCreator.specialization}</p>
              </div>
              <button
                type="button"
                onClick={() => setInspectCreator(null)}
                aria-label="Close profile"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-sm text-[var(--ak-ink-2)]">{inspectCreator.bio}</p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openMessageEducator(inspectCreator.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9642E] px-3.5 py-2 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Message Educator
                </button>
                {currentUser.followingCreatorIds.includes(inspectCreator.id) ? (
                  <button
                    type="button"
                    onClick={() => handleFollow(inspectCreator.id, 'UNFOLLOW')}
                    className="rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3.5 py-2 text-xs font-semibold text-[var(--ak-ink)]"
                  >
                    {t.following} ({t.unfollow})
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleFollow(inspectCreator.id, 'FREE')}
                    className="rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3.5 py-2 text-xs font-semibold text-[var(--ak-ink)]"
                  >
                    {t.follow}
                  </button>
                )}
              </div>

              {creatorCourses.length > 0 && (
                <div className="space-y-2 border-t border-[var(--ak-divider)] pt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--ak-muted)]">
                    Courses ({creatorCourses.length})
                  </h4>
                  <div className="divide-y divide-[var(--ak-divider)] rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)]">
                    {creatorCourses.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <div>
                          <p className="font-semibold text-[var(--ak-ink)]">{c.title}</p>
                          <p className="text-xs text-[var(--ak-muted)]">{c.requiredLevel}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setInspectCreator(null);
                            setInspectCourse(c);
                          }}
                          className="rounded-md border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-accent-ink)]"
                        >
                          View Course
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {creatorResources.length > 0 && (
                <div className="space-y-2 border-t border-[var(--ak-divider)] pt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--ak-muted)]">
                    Published Resources ({creatorResources.length})
                  </h4>
                  <div className="divide-y divide-[var(--ak-divider)] rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)]">
                    {creatorResources.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <span className="truncate font-medium text-[var(--ak-ink)]">
                          <span className="text-[var(--ak-accent-ink)]">[{r.type}]</span> {r.title}
                        </span>
                        {r.canAccess ? (
                          <button
                            type="button"
                            onClick={() => {
                              setInspectCreator(null);
                              handleOpenResource(r, false);
                            }}
                            className="shrink-0 rounded-md border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-ink)]"
                          >
                            Open
                          </button>
                        ) : (
                          <span className="shrink-0 text-xs text-[var(--ak-muted)]">
                            {r.priceUsd > 0 ? `$${r.priceUsd}` : r.accessTier.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Course Syllabus Modal */}
      {inspectCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4 backdrop-blur-xs">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 text-[var(--ak-ink)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--ak-divider)] pb-4">
              <div>
                <p className="text-xs font-semibold text-[var(--ak-accent-ink)]">
                  {inspectCourse.subject} · {inspectCourse.requiredLevel}
                </p>
                <h3 className="mt-1 text-xl font-bold text-[var(--ak-ink)]">{inspectCourse.title}</h3>
                <p className="mt-1 text-xs text-[var(--ak-muted)]">
                  Educator: {inspectCourse.ownerName} · Verified by:{' '}
                  {inspectCourse.institutionId ? 'Institution Admin' : inspectCourse.ownerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectCourse(null)}
                aria-label="Close syllabus"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-sm text-[var(--ak-ink-2)]">{inspectCourse.description}</p>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--ak-muted)]">
                  Attached Course Syllabus Materials ({inspectCourse.resourceIds.length})
                </h4>
                <div className="divide-y divide-[var(--ak-divider)] rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)]">
                  {inspectCourse.resourceIds.length === 0 ? (
                    <p className="p-4 text-xs text-[var(--ak-muted)]">No syllabus files attached yet.</p>
                  ) : (
                    inspectCourse.resourceIds.map((rid) => {
                      const res = resources.find((r) => r.id === rid);
                      return (
                        <div key={rid} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                          <span className="text-[var(--ak-ink)]">
                            {res ? `[${res.type}] ${res.title}` : `Resource ${rid}`}
                          </span>
                          {res?.canAccess && (
                            <button
                              type="button"
                              onClick={() => {
                                setInspectCourse(null);
                                handleOpenResource(res, false);
                              }}
                              className="rounded-md border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-accent-ink)]"
                            >
                              Preview
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--ak-divider)] pt-4">
                <button
                  type="button"
                  onClick={() => openMessageEducator(inspectCourse.ownerId)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3.5 py-2 text-xs font-semibold text-[var(--ak-ink)]"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Message Educator
                </button>
                {inspectCourse.myEnrollment ? (
                  inspectCourse.myEnrollment.academicStatus === 'REJECTED' ? (
                    <button
                      type="button"
                      onClick={() => handleEnroll(inspectCourse)}
                      className="rounded-lg bg-[#C9642E] px-4 py-2 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                    >
                      Re-apply for Enrollment
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-[var(--ak-ok-fg)]">
                      Enrollment: {inspectCourse.myEnrollment.academicStatus}
                    </span>
                  )
                ) : inspectCourse.accessTier === 'PAID_SINGLE' &&
                  inspectCourse.priceUsd > 0 &&
                  !currentUser.purchasedCourseIds.includes(inspectCourse.id) ? (
                  <button
                    type="button"
                    onClick={() => handlePurchase('COURSE', inspectCourse.id)}
                    className="rounded-lg bg-[#C9642E] px-4 py-2 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                  >
                    Purchase Course (${inspectCourse.priceUsd})
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleEnroll(inspectCourse)}
                    className="rounded-lg bg-[#C9642E] px-4 py-2 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                  >
                    Request Enrollment &amp; Verify Level
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Academic Document Modal */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ak-backdrop)] p-4 backdrop-blur-xs">
          <form
            onSubmit={handleSaveEditDoc}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-6 text-[var(--ak-ink)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
              <h3 className="text-base font-bold text-[var(--ak-ink)]">Edit Academic Credential</h3>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                aria-label="Close edit modal"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ak-ink-2)]">Document Title</label>
              <input
                type="text"
                required
                value={editDocTitle}
                onChange={(e) => setEditDocTitle(e.target.value)}
                className={DARK_INPUT}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ak-ink-2)]">
                Education Level
              </label>
              <select
                value={editDocLevel}
                onChange={(e) => setEditDocLevel(e.target.value)}
                className={DARK_INPUT}
              >
                {educationLevels.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ak-ink-2)]">
                Issuing Institution / Board
              </label>
              <input
                type="text"
                required
                value={editDocIssuer}
                onChange={(e) => setEditDocIssuer(e.target.value)}
                className={DARK_INPUT}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ak-ink-2)]">
                Replace File (Optional — current: {editingDoc.fileName})
              </label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.odt,.rtf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => setEditDocFile(e.target.files?.[0] || null)}
                className="w-full rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-2 text-xs text-[var(--ak-ink-2)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--ak-elevated)] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[var(--ak-ink)]"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--ak-divider)] pt-4">
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-4 py-2 text-xs font-semibold text-[var(--ak-ink-2)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingDocEdit}
                className="rounded-lg bg-[#C9642E] px-4 py-2 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C] disabled:opacity-60"
              >
                {savingDocEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeQuiz && (
        <QuizRunnerModal
          quiz={activeQuiz}
          existingAttempt={quizAttempts
            .filter((a) => a.quizId === activeQuiz.id)
            .sort((a, b) => b.percentScore - a.percentScore)[0]}
          onClose={() => setActiveQuiz(null)}
          onSubmitted={async (res) => {
            if (res.issuedCertificate) {
              setNotice(
                `Certificate ${res.issuedCertificate.certificateCode} unlocked for ${res.issuedCertificate.courseTitle}!`
              );
            }
            await loadAll();
          }}
          onOpenCertificate={(certificateId) => {
            setActiveQuiz(null);
            handleOpenCertificate(certificateId, false);
          }}
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
          onClose={() => {
            setActiveClassroomId(null);
            loadAll();
          }}
        />
      )}

      <ContentInspectorModal item={inspected} onClose={() => setInspected(null)} />
    </>
  );
};
