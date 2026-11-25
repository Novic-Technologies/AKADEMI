import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  FileText,
  FolderUp,
  GraduationCap,
  MessageSquare,
  Play,
  Radio,
  ShieldCheck,
  Users,
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
  ResourceItem,
  ResourceType,
  UserProfile,
} from '../types/akademi';
import { CommunicationPanel } from './CommunicationPanel';
import { ContentInspectorModal, type InspectedContent } from './ContentInspectorModal';
import { DashboardShell } from './DashboardShell';
import { LiveClassroomModal } from './LiveClassroomModal';

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

  // Live Session Scheduler
  const [sessTitle, setSessTitle] = useState('');
  const [sessCourseId, setSessCourseId] = useState('');
  const [sessTopic, setSessTopic] = useState('');
  const [sessAccess, setSessAccess] = useState<LiveSession['accessRule']>('ENROLLED_ONLY');
  const [sessStartNow, setSessStartNow] = useState(true);

  // Staff Invite (Institution Admin)
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffSpec, setStaffSpec] = useState('');
  const [issuedStaffCreds, setIssuedStaffCreds] = useState<{
    email: string;
    password: string;
  } | null>(null);

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
        educationLevels?: string[];
      }>('/api/contributor/workspace');
      setResources(data.resources);
      setCourses(data.courses);
      setEnrollments(data.enrollments);
      setSessions(data.sessions);
      setStaff(data.staff);
      setTransactions(data.transactions);
      setMyKyc(data.myKycSubmissions);
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
    try {
      const fd = new FormData();
      fd.append('documentType', docType);
      fd.append('documentNumber', docNumber);
      fd.append('phone', phone);
      fd.append('homeAddress', homeAddress);
      fd.append('bio', bio);
      fd.append('specialization', specialization);
      if (idFile) fd.append('idDocument', idFile);
      if (credFile) fd.append('credentialDocument', credFile);

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
      if (resFile) fd.append('file', resFile);

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
          startImmediately: sessStartNow,
        }),
      });
      setSessTitle('');
      setSessTopic('');
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
      if (download) {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = meta.fileName;
        a.click();
        URL.revokeObjectURL(objUrl);
        return;
      }
      const isText = blob.type.startsWith('text/') || blob.type === 'application/json';
      setInspected({
        title: meta.title,
        subtitle: meta.subtitle,
        fileName: meta.fileName,
        mimeType: blob.type || 'application/octet-stream',
        textContent: isText ? await blob.text() : undefined,
        objectUrl: isText ? undefined : URL.createObjectURL(blob),
        metadata: meta.metadata,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open document.');
    }
  };

  const totalNetEarnings = transactions.reduce((sum, t) => sum + t.creatorNetUsd, 0);

  return (
    <>
      <DashboardShell
        breadcrumbLeft={currentUser.institutionName || currentUser.name}
        breadcrumbRight={t.contributorStudio}
        userName={currentUser.name}
        userMeta={`${formatRoleLabel(currentUser)} · ${currentUser.followerIds.length} followers`}
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
            <span className="text-[#2D3D50] whitespace-nowrap">
              KYC:{' '}
              <strong
                className={
                  currentUser.kycStatus === 'VERIFIED' ? 'text-[#1E5631]' : 'text-[#A44A1C]'
                }
              >
                {currentUser.kycStatus}
              </strong>
            </span>
            <span className="text-[#2D3D50] whitespace-nowrap">
              Subscription:{' '}
              <strong
                className={
                  currentUser.subscriptionStatus === 'ACTIVE' ? 'text-[#1E5631]' : 'text-red-800'
                }
              >
                {currentUser.subscriptionStatus}
              </strong>
            </span>
          </div>
        }
      >
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
          {notice && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
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
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              <p className="font-semibold">
                Restricted Onboarding Portal — Complete Verification &amp; Subscription to Unlock
                Publishing
              </p>
              <p className="mt-1 text-sm text-amber-900">
                1. Profile &amp; National ID/Passport verified by Master Admin (
                <strong>{currentUser.kycStatus}</strong>) · 2. Subscription activated by Master
                Admin (<strong>{currentUser.subscriptionStatus}</strong>). Once approved, your
                dashboard unlocks automatically.
              </p>
            </div>
          )}

          {tab === 'VERIFICATION' && (
            <div className="grid gap-6 lg:grid-cols-12">
              <form
                onSubmit={handleSubmitKyc}
                className="space-y-4 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6 lg:col-span-7"
              >
                <div className="border-b border-[#C8BFA8] pb-3">
                  <h2 className="text-base font-semibold text-slate-900">
                    01. Identity Verification &amp; Profile Setup
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Submit your National ID or Passport and academic/teaching credentials for
                    Master Admin compliance review.
                  </p>
                </div>

                {currentUser.kycRejectionReason && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    Previous submission returned: {currentUser.kycRejectionReason}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Document Type
                    </label>
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value as KycSubmission['documentType'])}
                      className="w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3 py-2 text-sm"
                    >
                      <option value="NATIONAL_ID">National ID</option>
                      <option value="PASSPORT">Passport</option>
                      <option value="INSTITUTION_CHARTER">Institution Charter / License</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      ID / Passport Number
                    </label>
                    <input
                      type="text"
                      required
                      value={docNumber}
                      onChange={(e) => setDocNumber(e.target.value)}
                      placeholder="Stored strictly confidential"
                      className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Specialization / Subject Area
                    </label>
                    <input
                      type="text"
                      required
                      value={specialization}
                      onChange={(e) => setSpecialization(e.target.value)}
                      className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Confidential Phone Contact
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+256 ..."
                      className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Public Educator / Institution Bio
                  </label>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      National ID / Passport Scan (PDF/Image)
                    </label>
                    <input
                      type="file"
                      onChange={(e) => setIdFile(e.target.files?.[0] || null)}
                      className="w-full rounded-lg border border-[#C8BFA8] p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Teaching License / Accreditation
                    </label>
                    <input
                      type="file"
                      onChange={(e) => setCredFile(e.target.files?.[0] || null)}
                      className="w-full rounded-lg border border-[#C8BFA8] p-2 text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="rounded-lg bg-[#0C1B2E] px-4 py-2 text-sm font-medium text-white hover:bg-[#1A2F4A]"
                >
                  {t.submitVerification}
                </button>
              </form>

              <div className="space-y-4 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6 lg:col-span-5">
                <div className="border-b border-[#C8BFA8] pb-3">
                  <h2 className="text-base font-semibold text-slate-900">
                    02. Subscription Activation
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Available after identity verification. Once Master Admin approves your
                    subscription, your publishing workspace opens instantaneously.
                  </p>
                </div>

                <div className="rounded-lg border border-[#C8BFA8] bg-[#EFECE3] p-4 text-sm">
                  <p className="font-semibold text-slate-900">
                    {currentUser.role === 'INSTITUTION_ADMIN'
                      ? 'Institution Campus Plan — $149 / month'
                      : 'Solo Educator Pro Plan — $29 / month'}
                  </p>
                  <p className="mt-1 text-slate-600">
                    Includes unlimited PDF, DOCX, Video, Image &amp; Book hosting, paid course
                    monetization, student prerequisite verification, and live classrooms.
                  </p>
                  <p className="mt-3 font-medium text-slate-900">
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
                  className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
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
                  <div className="border-t border-[#C8BFA8] pt-4">
                    <p className="mb-2 text-sm font-semibold text-slate-800">
                      Recent Verification Submissions
                    </p>
                    <div className="space-y-2">
                      {myKyc.map((k) => (
                        <div
                          key={k.id}
                          className="rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                        >
                          <p className="font-medium text-slate-900">
                            {k.documentType} ({k.documentNumberMasked}) — {k.status}
                          </p>
                          {k.reviewNotes && (
                            <p className="mt-0.5 text-slate-500">{k.reviewNotes}</p>
                          )}
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
                className="space-y-4 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6 lg:col-span-5"
              >
                <h2 className="text-base font-semibold text-slate-900">
                  Upload Educational Resource
                </h2>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
                  <input
                    type="text"
                    required
                    value={resTitle}
                    onChange={(e) => setResTitle(e.target.value)}
                    placeholder="e.g. Linear Algebra Problem Set IV"
                    className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Format</label>
                    <select
                      value={resType}
                      onChange={(e) => setResType(e.target.value as ResourceType)}
                      className="w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3 py-2 text-sm"
                    >
                      <option value="PDF">PDF Document</option>
                      <option value="DOCX">Word Document (DOCX)</option>
                      <option value="VIDEO">Video Lecture</option>
                      <option value="IMAGE">Reference Image / Plate</option>
                      <option value="BOOK">Digital Book / Textbook</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Access Rule
                    </label>
                    <select
                      value={resTier}
                      onChange={(e) => setResTier(e.target.value as AccessTier)}
                      className="w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3 py-2 text-sm"
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
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Price (USD)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={resPrice}
                      onChange={(e) => setResPrice(Number(e.target.value))}
                      className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Subject</label>
                    <input
                      type="text"
                      value={resSubject}
                      onChange={(e) => setResSubject(e.target.value)}
                      className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Education Level (UNEB / NCHE / EAC)
                    </label>
                    <select
                      value={resLevel}
                      onChange={(e) => setResLevel(e.target.value)}
                      className="w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3 py-2 text-sm"
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
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Description
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={resDesc}
                    onChange={(e) => setResDesc(e.target.value)}
                    className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Attach File (PDF, DOCX, MP4, PNG, ePub)
                  </label>
                  <input
                    type="file"
                    onChange={(e) => setResFile(e.target.files?.[0] || null)}
                    className="w-full rounded-lg border border-[#C8BFA8] p-2 text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={resDownloadable}
                    onChange={(e) => setResDownloadable(e.target.checked)}
                  />
                  Allow authorized learners to download offline copy
                </label>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-[#0C1B2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1A2F4A]"
                >
                  {t.publishMaterial}
                </button>
              </form>

              <div className="min-w-0 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] lg:col-span-7">
                <div className="border-b border-[#C8BFA8] px-5 py-4">
                  <h2 className="text-base font-semibold text-slate-900">
                    Your Uploaded Materials ({resources.length})
                  </h2>
                </div>
                {loading ? (
                  <p className="p-6 text-sm text-slate-500">Loading resources...</p>
                ) : resources.length === 0 ? (
                  <p className="p-6 text-sm text-slate-500">
                    No resources uploaded yet. Use the uploader on the left to publish your first
                    PDF, Word doc, video, image, or book.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {resources.map((r) => (
                      <div key={r.id} className="flex flex-wrap items-start justify-between gap-4 p-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                            <FileText className="h-3.5 w-3.5 text-blue-900" />
                            <span className="font-semibold text-slate-900">{r.type}</span>
                            <span aria-hidden="true">·</span>
                            <span>{r.subject}</span>
                            <span aria-hidden="true">·</span>
                            <span>{r.accessTier}</span>
                            {r.priceUsd > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono-nums font-semibold text-slate-900">
                                  ${r.priceUsd}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="mt-1 text-sm font-medium text-slate-900 break-words">
                            {r.title}
                          </p>
                          <p className="mt-0.5 text-sm text-slate-500 break-words">
                            {r.fileName} ({r.fileSizeLabel})
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2 text-right text-sm font-mono-nums text-slate-600 shrink-0">
                          <div>
                            <p>{r.viewsCount} views</p>
                            <p>{r.downloadsCount} downloads</p>
                          </div>
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
                            className="inline-flex items-center gap-1.5 rounded-md border border-[#C8BFA8] bg-[#EFECE3] px-2.5 py-1 font-sans text-sm font-medium text-[#0C1B2E] hover:bg-[#E6E0D3]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {t.viewContent}
                          </button>
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
                className="space-y-4 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6 lg:col-span-5"
              >
                <h2 className="text-base font-semibold text-slate-900">Build Structured Course</h2>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Course Title
                  </label>
                  <input
                    type="text"
                    required
                    value={crsTitle}
                    onChange={(e) => setCrsTitle(e.target.value)}
                    placeholder="e.g. Structural Timber Modeling"
                    className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={crsSubject}
                      onChange={(e) => setCrsSubject(e.target.value)}
                      className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Required Academic Level
                    </label>
                    <select
                      value={crsLevel}
                      onChange={(e) => setCrsLevel(e.target.value)}
                      className="w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3 py-2 text-sm"
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
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Pricing Model
                    </label>
                    <select
                      value={crsTier}
                      onChange={(e) => setCrsTier(e.target.value as AccessTier)}
                      className="w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3 py-2 text-sm"
                    >
                      <option value="ENROLLED_ONLY">Free on Approval</option>
                      <option value="PLATFORM_PASS">Akademi Pass</option>
                      <option value="PAID_SINGLE">Paid Course</option>
                    </select>
                  </div>
                  {crsTier === 'PAID_SINGLE' && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Price (USD)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={crsPrice}
                        onChange={(e) => setCrsPrice(Number(e.target.value))}
                        className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                </div>
                {currentUser.role === 'INSTITUTION_ADMIN' && staff.length > 0 && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Assign Institution Course Admin / Instructor
                    </label>
                    <select
                      value={crsInstructorId}
                      onChange={(e) => setCrsInstructorId(e.target.value)}
                      className="w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3 py-2 text-sm"
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
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Description
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={crsDesc}
                    onChange={(e) => setCrsDesc(e.target.value)}
                    className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                  />
                </div>
                {resources.length > 0 && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Attach Vault Materials
                    </label>
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-[#C8BFA8] p-2">
                      {resources.map((r) => (
                        <label key={r.id} className="flex items-center gap-2 text-sm text-slate-700">
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
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={crsReqVerify}
                    onChange={(e) => setCrsReqVerify(e.target.checked)}
                  />
                  Require academic transcript verification before enrollment
                </label>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-[#0C1B2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1A2F4A]"
                >
                  {t.createCourse}
                </button>
              </form>

              <div className="space-y-4 lg:col-span-7">
                {courses.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col gap-4 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5 sm:flex-row"
                  >
                    <img
                      src={c.coverImage}
                      alt={c.title}
                      referrerPolicy="no-referrer"
                      className="h-28 w-full rounded-lg object-cover sm:w-40 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                        <span>{c.subject}</span>
                        <span aria-hidden="true">·</span>
                        <span>Level: {c.requiredLevel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{c.priceUsd > 0 ? `$${c.priceUsd}` : c.accessTier}</span>
                      </div>
                      <h3 className="mt-1 text-base font-semibold text-slate-900">{c.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{c.description}</p>
                      <p className="mt-2 text-sm font-mono-nums text-slate-700">
                        {c.enrolledLearnerIds.length} enrolled learners · {c.resourceIds.length}{' '}
                        materials
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'STUDENTS' && isUnlocked && (
            <div className="space-y-4">
              <div className="border-b border-[#C8BFA8] pb-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  Enrolled Students &amp; Academic Prerequisite Ownership
                </h2>
                <p className="text-sm text-slate-600">
                  Confidential learner PII (National ID, private phone, address) is strictly hidden.
                  {currentUser.role === 'COURSE_ADMIN'
                    ? ' Institution academic prerequisite checks are authorized solely by your Institution Admin.'
                    : ' Review uploaded academic transcripts to clear learners for course admission.'}
                </p>
              </div>

              {enrollments.length === 0 ? (
                <div className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-8 text-center text-sm text-slate-500">
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
                        className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                              <span className="text-sm font-semibold text-slate-900">
                                {enr.learnerName}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{enr.learnerDeclaredLevel}</span>
                              <span aria-hidden="true">·</span>
                              <span>{enr.courseTitle}</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 text-sm font-mono-nums text-slate-600">
                              <span>
                                Academic Status:{' '}
                                <strong
                                  className={
                                    enr.academicStatus === 'APPROVED'
                                      ? 'text-emerald-700'
                                      : enr.academicStatus === 'REJECTED'
                                        ? 'text-red-700'
                                        : 'text-amber-700'
                                  }
                                >
                                  {enr.academicStatus}
                                </strong>
                              </span>
                              <span>Progress: {enr.progressPercent}%</span>
                              <span>Live Attendance: {enr.attendanceMinutes} min</span>
                              <span>Grade: {enr.gradeLabel || 'Unassigned'}</span>
                            </div>

                            {enr.learnerAcademicDocs.length > 0 && (
                              <div className="rounded-lg border border-[#C8BFA8] bg-[#EFECE3] p-3 text-sm space-y-2">
                                <p className="font-semibold text-slate-800">
                                  Submitted Academic Transcripts / Certificates:
                                </p>
                                {enr.learnerAcademicDocs.map((d) => (
                                  <div
                                    key={d.id}
                                    className="flex flex-wrap items-center justify-between gap-2 border-t border-[#D4CCB9] pt-2 first:border-t-0 first:pt-0"
                                  >
                                    <p className="min-w-0 flex-1 text-slate-700 break-words">
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
                                        className="inline-flex items-center gap-1 rounded-md border border-[#C8BFA8] bg-[#F6F3EB] px-2.5 py-1 text-sm font-medium text-[#0C1B2E] hover:bg-[#E6E0D3]"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        {t.inspectDoc}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleInspectFile(
                                            `/api/files/academic-doc/${d.id}`,
                                            {
                                              title: d.title,
                                              fileName: d.fileName,
                                            },
                                            true
                                          )
                                        }
                                        className="inline-flex items-center gap-1 rounded-md bg-[#0C1B2E] px-2.5 py-1 text-sm font-medium text-white hover:bg-[#1A2F4A]"
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
                            {enr.academicStatus === 'PENDING' && canVerifyThis && (
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleVerifyLearner(enr.id, 'APPROVED')}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {t.approveAction}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleVerifyLearner(enr.id, 'REJECTED')}
                                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                                >
                                  {t.rejectAction}
                                </button>
                              </div>
                            )}
                            {enr.academicStatus === 'PENDING' && !canVerifyThis && (
                              <span className="text-sm text-amber-700">
                                Pending Institution Admin clearance
                              </span>
                            )}
                            {enr.academicStatus === 'APPROVED' && (
                              <div className="flex items-center gap-2">
                                <select
                                  value={enr.gradeLabel || ''}
                                  onChange={(e) => handleUpdateGrade(enr.id, e.target.value)}
                                  className="rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-2.5 py-1.5 text-sm"
                                >
                                  <option value="">Assign Grade...</option>
                                  <option value="A+">A+</option>
                                  <option value="A">A</option>
                                  <option value="A-">A-</option>
                                  <option value="B+">B+</option>
                                  <option value="B">B</option>
                                  <option value="Pass">Pass</option>
                                </select>
                              </div>
                            )}
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
                className="space-y-4 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6 lg:col-span-5"
              >
                <h2 className="text-base font-semibold text-slate-900">
                  Launch or Schedule Live Classroom
                </h2>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Course</label>
                  <select
                    required
                    value={sessCourseId}
                    onChange={(e) => setSessCourseId(e.target.value)}
                    className="w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3 py-2 text-sm"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Session Title
                  </label>
                  <input
                    type="text"
                    required
                    value={sessTitle}
                    onChange={(e) => setSessTitle(e.target.value)}
                    placeholder="e.g. Week 4 Live Critique & Q&A"
                    className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Access Rule
                  </label>
                  <select
                    value={sessAccess}
                    onChange={(e) =>
                      setSessAccess(e.target.value as LiveSession['accessRule'])
                    }
                    className="w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3 py-2 text-sm"
                  >
                    <option value="ENROLLED_ONLY">Approved Enrolled Students Only</option>
                    <option value="PAID_FOLLOWERS">Paid Followers &amp; Akademi Pass</option>
                    <option value="PUBLIC_SEMINAR">Open Public Seminar</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Agenda / Topic Summary
                  </label>
                  <textarea
                    rows={2}
                    value={sessTopic}
                    onChange={(e) => setSessTopic(e.target.value)}
                    className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
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
                  className="w-full rounded-lg bg-[#0C1B2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1A2F4A] disabled:opacity-50"
                >
                  {sessStartNow ? t.scheduleLive : t.scheduleLive}
                </button>
              </form>

              <div className="space-y-3 lg:col-span-7">
                {sessions.map((s) => (
                  <div key={s.id} className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <span
                            className={`font-semibold ${
                              s.status === 'LIVE'
                                ? 'text-emerald-700'
                                : s.status === 'ENDED'
                                  ? 'text-slate-500'
                                  : 'text-blue-900'
                            }`}
                          >
                            {s.status}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{s.courseTitle}</span>
                          <span aria-hidden="true">·</span>
                          <span>{s.accessRule}</span>
                        </div>
                        <h3 className="mt-1 text-base font-semibold text-slate-900">{s.title}</h3>
                        <p className="mt-1 text-sm text-slate-600">{s.topicSummary}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {s.status === 'SCHEDULED' && (
                          <button
                            type="button"
                            onClick={() => handleSessionStatus(s.id, 'LIVE')}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800"
                          >
                            Go Live
                          </button>
                        )}
                        {s.status === 'LIVE' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setActiveClassroomId(s.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0C1B2E] px-3.5 py-1.5 text-sm font-medium text-white hover:bg-[#1A2F4A]"
                            >
                              <Play className="h-3.5 w-3.5" />
                              Enter Classroom
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSessionStatus(s.id, 'ENDED')}
                              className="rounded-lg border border-[#C8BFA8] px-3 py-1.5 text-sm font-medium text-slate-700"
                            >
                              End
                            </button>
                          </>
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
                className="space-y-4 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6 lg:col-span-5"
              >
                <h2 className="text-base font-semibold text-slate-900">
                  Add Institution Course Admin / Instructor
                </h2>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Instructor Name
                  </label>
                  <input
                    type="text"
                    required
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Institution Email
                  </label>
                  <input
                    type="email"
                    required
                    value={staffEmail}
                    onChange={(e) => setStaffEmail(e.target.value)}
                    className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Department / Subject
                  </label>
                  <input
                    type="text"
                    required
                    value={staffSpec}
                    onChange={(e) => setStaffSpec(e.target.value)}
                    className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-[#0C1B2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1A2F4A]"
                >
                  Appoint Course Admin
                </button>
                {issuedStaffCreds && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
                    Credentials issued: <span className="font-mono">{issuedStaffCreds.email}</span>{' '}
                    / <span className="font-mono">{issuedStaffCreds.password}</span>
                  </div>
                )}
              </form>

              <div className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] lg:col-span-7">
                <div className="border-b border-[#C8BFA8] px-5 py-4">
                  <h2 className="text-base font-semibold text-slate-900">
                    Institution Staff Directory ({staff.length})
                  </h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {staff.map((s) => (
                    <div key={s.id} className="px-5 py-4 text-sm">
                      <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                      <p className="text-slate-500">
                        {s.email} · {s.specialization} · Subscription: {s.subscriptionStatus}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'EARNINGS' && isUnlocked && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5">
                  <p className="text-sm text-slate-500">Net Creator Earnings (85%)</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900 font-mono-nums">
                    ${totalNetEarnings.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5">
                  <p className="text-sm text-slate-500">Followers</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900 font-mono-nums">
                    {currentUser.followerIds.length}
                  </p>
                </div>
                <div className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5">
                  <p className="text-sm text-slate-500">Paid Follow Rate</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900 font-mono-nums">
                    ${currentUser.followPriceUsd}/mo
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB]">
                <div className="border-b border-[#C8BFA8] px-5 py-4">
                  <h2 className="text-base font-semibold text-slate-900">Sales &amp; Payouts</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {transactions.length === 0 ? (
                    <p className="p-6 text-sm text-slate-500">
                      No paid course, book, or follower sales recorded yet.
                    </p>
                  ) : (
                    transactions.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between px-5 py-3 text-sm"
                      >
                        <div>
                          <p className="font-medium text-slate-900">{t.itemTitle}</p>
                          <p className="text-slate-500">
                            Buyer: {t.buyerName} · {t.itemType}
                          </p>
                        </div>
                        <span className="font-mono-nums font-semibold text-emerald-700">
                          +${t.creatorNetUsd.toFixed(2)} net
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
            />
          )}
      </DashboardShell>

      {activeClassroomId && (
        <LiveClassroomModal
          sessionId={activeClassroomId}
          currentUser={currentUser}
          hostLibrary={resources}
          onClose={() => setActiveClassroomId(null)}
        />
      )}

      <ContentInspectorModal item={inspected} onClose={() => setInspected(null)} />
    </>
  );
};
