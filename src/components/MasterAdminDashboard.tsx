import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  Mail,
  MessageSquare,
  ShieldCheck,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { apiFetch, fetchAuthorizedBlob } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type {
  AccountRequest,
  AuditLogEntry,
  KycSubmission,
  LearnerAcademicDoc,
  LedgerTransaction,
  MasterAnalyticsSummary,
  OutboxEmail,
  ResourceItem,
  UserProfile,
} from '../types/akademi';
import { CommunicationPanel } from './CommunicationPanel';
import { ContentInspectorModal, type InspectedContent } from './ContentInspectorModal';
import { DashboardShell } from './DashboardShell';

interface AdminAcademicDoc extends LearnerAcademicDoc {
  learnerName: string;
  learnerEmail: string;
}

interface MasterAdminDashboardProps {
  currentUser: UserProfile;
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
  const [outboxEmails, setOutboxEmails] = useState<OutboxEmail[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [ledger, setLedger] = useState<LedgerTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Approval credentials modal
  const [approvingReq, setApprovingReq] = useState<AccountRequest | null>(null);
  const [customTempPass, setCustomTempPass] = useState('');
  const [issuedCredentialBanner, setIssuedCredentialBanner] = useState<{
    email: string;
    password: string;
  } | null>(null);

  // Reject request modal
  const [rejectingReq, setRejectingReq] = useState<AccountRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Request submission detail modal & universal inline content inspector
  const [viewingRequest, setViewingRequest] = useState<AccountRequest | null>(null);
  const [inspected, setInspected] = useState<InspectedContent | null>(null);
  const [kycNotesMap, setKycNotesMap] = useState<Record<string, string>>({});

  // Search filter on contributor table
  const [searchTerm, setSearchTerm] = useState('');

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
      setError(err instanceof Error ? err.message : 'Unable to inspect document.');
    }
  };

  const handleInspectKycDoc = async (k: KycSubmission, kind: 'id' | 'credential') => {
    const fileName = kind === 'id' ? k.idFileName : k.credentialFileName;
    await inspectRemoteFile(`/api/files/kyc/${k.id}/${kind}`, {
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
    });
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

  const filteredContributors =
    summary?.contributorBreakdown.filter(
      (c) =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

  return (
    <>
      <DashboardShell
        breadcrumbLeft="Akademi"
        breadcrumbRight={t.masterAdminConsole}
        userName={currentUser.name}
        userMeta={t.masterAdminRole}
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
            className="min-h-[40px] rounded-lg border border-[#C8BFA8] bg-[#EFECE3] px-3.5 py-2 text-sm font-semibold text-[#0C1B2E] hover:bg-[#E6E0D3] whitespace-nowrap"
          >
            {t.refreshMetrics}
          </button>
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

          {issuedCredentialBanner && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">
                    Temporary Credentials Provisioned &amp; Emailed to User
                  </p>
                  <p className="mt-1 text-sm">
                    Email: <span className="font-mono font-semibold">{issuedCredentialBanner.email}</span>{' '}
                    · Temp Password:{' '}
                    <span className="font-mono font-semibold">{issuedCredentialBanner.password}</span>
                  </p>
                  <p className="mt-1 text-sm text-blue-800">
                    The user will be required to change this password on first login before
                    uploading identity documents.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIssuedCredentialBanner(null)}
                  className="text-sm font-medium underline"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {loading && !summary ? (
            <div className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-10 text-center text-sm text-slate-500">
              Loading platform governance metrics...
            </div>
          ) : (
            <>
              {tab === 'OVERVIEW' && summary && (
                <div className="space-y-8">
                  {/* KPI Strip — comfortably 3 columns max to prevent cramped text or overflow */}
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
                        className="min-w-0 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-4"
                      >
                        <p className="text-sm text-slate-500">{kpi.label}</p>
                        <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-nums">
                          {kpi.value}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">{kpi.sub}</p>
                      </div>
                    ))}
                  </div>

                  {/* Contributor Resource & Subscription Matrix — Responsive Zero-Overflow */}
                  <section className="min-w-0 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#C8BFA8] px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <h2 className="text-base font-semibold text-slate-900">
                          Contributor Directory, Resource Breakdown &amp; Instant Subscription Control
                        </h2>
                        <p className="text-sm text-slate-500">
                          Toggling a subscription immediately opens or locks the user&apos;s
                          dashboard and live session permissions.
                        </p>
                      </div>
                      <input
                        type="search"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Filter by contributor or email..."
                        className="w-full sm:w-64 rounded-lg border border-[#C8BFA8] bg-[#EFECE3] px-3 py-1.5 text-sm text-slate-900"
                      />
                    </div>

                    {/* Mobile / Tablet Stacked Cards */}
                    <div className="divide-y divide-[#D4CCB9] md:hidden">
                      {filteredContributors.map((c) => (
                        <div key={c.userId} className="p-4 space-y-3 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900 break-words">{c.name}</p>
                              <p className="text-slate-600 break-all">
                                {c.role.replace('_', ' ')} · {c.email}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleSubscription(
                                  c.userId,
                                  c.subscriptionStatus,
                                  c.name
                                )
                              }
                              className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
                                c.subscriptionStatus === 'ACTIVE'
                                  ? 'border border-red-200 text-red-700 hover:bg-red-50'
                                  : 'bg-emerald-700 text-white hover:bg-emerald-800'
                              }`}
                            >
                              {c.subscriptionStatus === 'ACTIVE'
                                ? t.suspendAction
                                : t.activateAction}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono-nums text-slate-700">
                            <span>
                              KYC:{' '}
                              <strong
                                className={
                                  c.kycStatus === 'VERIFIED'
                                    ? 'text-emerald-700'
                                    : c.kycStatus === 'REJECTED'
                                      ? 'text-red-700'
                                      : 'text-amber-700'
                                }
                              >
                                {c.kycStatus}
                              </strong>
                            </span>
                            <span>
                              Plan:{' '}
                              <strong
                                className={
                                  c.subscriptionStatus === 'ACTIVE'
                                    ? 'text-emerald-700'
                                    : 'text-amber-700'
                                }
                              >
                                {c.subscriptionStatus}
                              </strong>
                            </span>
                            <span>Uploads: {c.totalUploads}</span>
                            <span>Courses: {c.coursesCount}</span>
                            <span>Students: {c.studentsCount}</span>
                            <span>Followers: {c.followersCount}</span>
                          </div>
                          <p className="text-xs font-mono-nums text-slate-500">
                            {c.byType.PDF} PDF · {c.byType.DOCX} DOCX · {c.byType.VIDEO} Video ·{' '}
                            {c.byType.IMAGE} Img · {c.byType.BOOK} Book
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Compact Desktop Table (Fits 100% Width, Zero Horizontal Scroll) */}
                    <div className="hidden md:block">
                      <table className="w-full table-fixed text-left text-sm">
                        <thead className="border-b border-[#C8BFA8] bg-[#EFECE3] text-slate-600">
                          <tr>
                            <th className="w-[28%] px-4 py-3 font-medium">Contributor</th>
                            <th className="w-[12%] px-3 py-3 font-medium">KYC</th>
                            <th className="w-[22%] px-3 py-3 font-medium">Materials</th>
                            <th className="w-[14%] px-3 py-3 text-right font-medium">Reach</th>
                            <th className="w-[12%] px-3 py-3 font-medium">Plan</th>
                            <th className="w-[12%] px-4 py-3 text-right font-medium">Switch</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredContributors.map((c) => (
                            <tr key={c.userId} className="hover:bg-[#EFECE3]/70">
                              <td className="px-4 py-3 align-top">
                                <p className="font-medium text-slate-900 break-words">{c.name}</p>
                                <p className="text-slate-500 break-all">
                                  {c.role.replace('_', ' ')} · {c.email}
                                </p>
                              </td>
                              <td className="px-3 py-3 align-top">
                                <span
                                  className={`font-medium ${
                                    c.kycStatus === 'VERIFIED'
                                      ? 'text-emerald-700'
                                      : c.kycStatus === 'REJECTED'
                                        ? 'text-red-700'
                                        : 'text-amber-700'
                                  }`}
                                >
                                  {c.kycStatus}
                                </span>
                              </td>
                              <td className="px-3 py-3 align-top font-mono-nums">
                                <p className="font-semibold text-slate-900">
                                  {c.totalUploads} total
                                </p>
                                <p className="text-xs text-slate-500">
                                  {c.byType.PDF} PDF · {c.byType.DOCX} DOCX · {c.byType.VIDEO} Vid ·{' '}
                                  {c.byType.IMAGE} Img · {c.byType.BOOK} Bk
                                </p>
                              </td>
                              <td className="px-3 py-3 align-top text-right font-mono-nums text-slate-700">
                                <p>{c.coursesCount} courses</p>
                                <p className="text-xs text-slate-500">
                                  {c.studentsCount} stud · {c.followersCount} fol
                                </p>
                              </td>
                              <td className="px-3 py-3 align-top">
                                <span
                                  className={`font-medium break-words ${
                                    c.subscriptionStatus === 'ACTIVE'
                                      ? 'text-emerald-700'
                                      : c.subscriptionStatus === 'PENDING_APPROVAL'
                                        ? 'text-amber-700'
                                        : 'text-red-700'
                                  }`}
                                >
                                  {c.subscriptionStatus.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="px-4 py-3 align-top text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleSubscription(
                                      c.userId,
                                      c.subscriptionStatus,
                                      c.name
                                    )
                                  }
                                  className={`rounded-md px-2.5 py-1 text-sm font-medium whitespace-nowrap ${
                                    c.subscriptionStatus === 'ACTIVE'
                                      ? 'border border-red-200 text-red-700 hover:bg-red-50'
                                      : 'bg-emerald-700 text-white hover:bg-emerald-800'
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
                  <section className="min-w-0 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB]">
                    <div className="border-b border-[#C8BFA8] px-5 py-4">
                      <h2 className="text-base font-semibold text-slate-900">
                        Most Enrolled Courses Across Akademi
                      </h2>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {summary.mostEnrolledCourses.map((course, idx) => (
                        <div
                          key={course.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900 break-words">
                              0{idx + 1}. {course.title}
                            </p>
                            <p className="text-sm text-slate-500 break-words">
                              {course.ownerName} · {course.subject}
                            </p>
                          </div>
                          <span className="font-mono-nums text-sm font-semibold text-slate-900 shrink-0">
                            {course.enrolledCount} enrolled learners
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Full Platform Users Directory */}
                  <section className="min-w-0 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] overflow-hidden">
                    <div className="border-b border-[#C8BFA8] px-5 py-4">
                      <h2 className="text-base font-semibold text-slate-900">
                        Registered Platform Users Directory ({allUsers.length})
                      </h2>
                      <p className="text-sm text-slate-500">
                        Complete system directory visible exclusively to Master Admin.
                      </p>
                    </div>

                    {/* Mobile / Tablet Stacked Cards */}
                    <div className="divide-y divide-[#D4CCB9] md:hidden">
                      {allUsers.map((u) => (
                        <div key={u.id} className="p-4 space-y-1.5 text-sm">
                          <p className="font-semibold text-slate-900 break-words">{u.name}</p>
                          <p className="font-mono text-slate-600 break-all">{u.email}</p>
                          <p className="text-slate-700 break-words">
                            {u.role.replace('_', ' ')}
                            {u.institutionName ? ` · ${u.institutionName}` : ''}
                          </p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600 pt-1">
                            <span>KYC: {u.kycStatus}</span>
                            <span>
                              Plan:{' '}
                              {u.role === 'LEARNER'
                                ? u.platformPassActive
                                  ? 'AKADEMI PASS'
                                  : 'FREE'
                                : u.subscriptionStatus}
                            </span>
                            <span>
                              Password: {u.mustChangePassword ? 'Reset required' : 'Completed'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table (5-column table-fixed, zero horizontal scroll) */}
                    <div className="hidden md:block">
                      <table className="w-full table-fixed text-left text-sm">
                        <thead className="border-b border-[#C8BFA8] bg-[#EFECE3] text-slate-600">
                          <tr>
                            <th className="w-[34%] px-4 py-3 font-medium">User</th>
                            <th className="w-[24%] px-3 py-3 font-medium">Role &amp; Institution</th>
                            <th className="w-[14%] px-3 py-3 font-medium">KYC</th>
                            <th className="w-[14%] px-3 py-3 font-medium">Plan / Pass</th>
                            <th className="w-[14%] px-4 py-3 font-medium">Password</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {allUsers.map((u) => (
                            <tr key={u.id} className="hover:bg-[#EFECE3]/70">
                              <td className="px-4 py-2.5 align-top">
                                <p className="font-medium text-slate-900 break-words">{u.name}</p>
                                <p className="font-mono text-slate-600 break-all">{u.email}</p>
                              </td>
                              <td className="px-3 py-2.5 align-top text-slate-700 break-words">
                                {u.role.replace('_', ' ')}
                                {u.institutionName ? ` · ${u.institutionName}` : ''}
                              </td>
                              <td className="px-3 py-2.5 align-top text-slate-700">{u.kycStatus}</td>
                              <td className="px-3 py-2.5 align-top text-slate-700 break-words">
                                {u.role === 'LEARNER'
                                  ? u.platformPassActive
                                    ? 'AKADEMI PASS'
                                    : 'FREE'
                                  : u.subscriptionStatus.replace('_', ' ')}
                              </td>
                              <td className="px-4 py-2.5 align-top text-slate-600">
                                {u.mustChangePassword ? 'Reset required' : 'Completed'}
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
                  <div className="border-b border-[#C8BFA8] pb-3">
                    <h2 className="text-lg font-semibold text-slate-900">
                      Public Account Requests Queue
                    </h2>
                    <p className="text-sm text-slate-600">
                      Review teachers, institutions, and freelancers applying for Akademi access.
                      Approving automatically issues temporary login credentials.
                    </p>
                  </div>

                  {requests.length === 0 ? (
                    <div className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-8 text-center text-sm text-slate-500">
                      No contributor requests submitted yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {requests.map((req) => (
                        <div
                          key={req.id}
                          className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0 flex-1 max-w-2xl">
                              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                                <span className="font-semibold text-slate-900 break-words">
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
                              <p className="mt-1 text-sm text-slate-500 break-all">
                                {req.email}
                                {req.phone ? ` · ${req.phone}` : ''}
                                {req.educationSystem ? ` · System: ${req.educationSystem}` : ''}
                                {req.plannedLevels ? ` · Levels: ${req.plannedLevels}` : ''}
                                {req.organizationName ? ` · Org: ${req.organizationName}` : ''}
                              </p>
                              <p className="mt-3 text-sm text-slate-700 break-words">
                                {req.statement}
                              </p>
                              {req.portfolioUrl && (
                                <p className="mt-1 text-sm text-blue-900 break-all">
                                  Sample / Portfolio: {req.portfolioUrl}
                                </p>
                              )}
                              {req.rejectionReason && (
                                <p className="mt-2 text-sm text-red-700">
                                  Rejection Reason: {req.rejectionReason}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => setViewingRequest(req)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#C8BFA8] bg-[#EFECE3] px-3 py-2 text-sm font-medium text-[#0C1B2E] hover:bg-[#E6E0D3]"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                {t.viewSubmission}
                              </button>
                              {req.status === 'PENDING' ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setApprovingReq(req);
                                      setCustomTempPass('');
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-800"
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
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                    {t.rejectAction}
                                  </button>
                                </>
                              ) : (
                                <span
                                  className={`text-sm font-semibold ${
                                    req.status === 'APPROVED'
                                      ? 'text-emerald-700'
                                      : 'text-red-700'
                                  }`}
                                >
                                  {req.status}
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

              {tab === 'COMPLIANCE' && (
                <div className="space-y-8">
                  <div className="space-y-4">
                    <div className="border-b border-[#C8BFA8] pb-3">
                      <h2 className="text-lg font-semibold text-slate-900">
                        Compliance &amp; National ID / Passport Verification Queue
                      </h2>
                      <p className="text-sm text-slate-600">
                        Every document inspection is recorded in the Master Admin audit log.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {kycList.map((k) => (
                        <div key={k.id} className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                                <FileCheck2 className="h-4 w-4 shrink-0 text-blue-900" />
                                <span className="font-semibold text-slate-900">{k.userName}</span>
                                <span aria-hidden="true">·</span>
                                <span>{k.documentType}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono">{k.documentNumberMasked}</span>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={`font-semibold ${
                                    k.status === 'APPROVED'
                                      ? 'text-emerald-700'
                                      : k.status === 'REJECTED'
                                        ? 'text-red-700'
                                        : 'text-amber-700'
                                  }`}
                                >
                                  {k.status}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-slate-500 break-all">{k.userEmail}</p>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleInspectKycDoc(k, 'id')}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-[#C8BFA8] bg-[#EFECE3] px-3 py-1.5 text-sm font-medium text-[#0C1B2E] hover:bg-[#E6E0D3]"
                                >
                                  <Eye className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate max-w-[220px]">
                                    Inspect ID ({k.idFileName})
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleInspectKycDoc(k, 'credential')}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-[#C8BFA8] bg-[#EFECE3] px-3 py-1.5 text-sm font-medium text-[#0C1B2E] hover:bg-[#E6E0D3]"
                                >
                                  <Eye className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate max-w-[220px]">
                                    Inspect Credential ({k.credentialFileName})
                                  </span>
                                </button>
                              </div>
                            </div>

                            <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end shrink-0">
                              {k.status === 'PENDING' && (
                                <>
                                  <input
                                    type="text"
                                    value={kycNotesMap[k.id] || ''}
                                    onChange={(e) =>
                                      setKycNotesMap((prev) => ({
                                        ...prev,
                                        [k.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Optional verification note / rejection reason..."
                                    className="w-full sm:w-64 rounded-lg border border-[#C8BFA8] bg-[#EFECE3] px-3 py-1.5 text-sm"
                                  />
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleReviewKyc(k.id, 'APPROVED')}
                                      className="rounded-lg bg-emerald-700 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
                                    >
                                      {t.approveAction}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleReviewKyc(k.id, 'REJECTED')}
                                      className="rounded-lg border border-red-200 px-3.5 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                                    >
                                      {t.rejectAction}
                                    </button>
                                  </div>
                                </>
                              )}
                              {k.reviewNotes && (
                                <p className="text-sm text-slate-500">Notes: {k.reviewNotes}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Submitted Learner Academic Transcripts & Certificates */}
                  <section className="min-w-0 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] overflow-hidden">
                    <div className="border-b border-[#C8BFA8] px-5 py-4">
                      <h2 className="text-base font-semibold text-slate-900">
                        Submitted Learner Academic Credentials ({academicDocs.length})
                      </h2>
                      <p className="text-sm text-slate-500">
                        Master Admin can inspect any learner transcript or qualification certificate
                        submitted for academic prerequisite clearance.
                      </p>
                    </div>
                    {academicDocs.length === 0 ? (
                      <p className="p-6 text-sm text-slate-500">
                        No learner academic credentials submitted yet.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {academicDocs.map((d) => (
                          <div
                            key={d.id}
                            className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 text-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-slate-900">
                                <GraduationCap className="h-4 w-4 shrink-0 text-[#A44A1C]" />
                                <span className="font-semibold break-words">{d.title}</span>
                              </div>
                              <p className="mt-0.5 text-slate-600 break-words">
                                {d.learnerName} ({d.learnerEmail}) · {d.educationLevel} ·{' '}
                                {d.institutionIssued}
                              </p>
                              <p className="mt-0.5 font-mono text-xs text-slate-500 break-all">
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
                                className="inline-flex items-center gap-1.5 rounded-md border border-[#C8BFA8] bg-[#EFECE3] px-3 py-1.5 font-medium text-[#0C1B2E] hover:bg-[#E6E0D3]"
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
                                className="inline-flex items-center gap-1.5 rounded-md bg-[#0C1B2E] px-3 py-1.5 font-medium text-white hover:bg-[#1A2F4A]"
                              >
                                <Download className="h-3.5 w-3.5" />
                                {t.download}
                              </button>
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
                  <section className="min-w-0 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB]">
                    <div className="border-b border-[#C8BFA8] px-5 py-4">
                      <h2 className="text-base font-semibold text-slate-900">
                        Uploaded Resources Moderation
                      </h2>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {resources.map((r) => (
                        <div
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900 break-words">
                              {r.title}
                            </p>
                            <p className="mt-0.5 text-slate-500 break-words">
                              {r.ownerName} · {r.type} · {r.accessTier} · {r.viewsCount} views ·{' '}
                              {r.downloadsCount} downloads
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                            <span
                              className={`font-semibold ${
                                r.status === 'PUBLISHED' ? 'text-emerald-700' : 'text-red-700'
                              }`}
                            >
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
                              className="inline-flex items-center gap-1.5 rounded-md border border-[#C8BFA8] bg-[#EFECE3] px-3 py-1.5 font-medium text-[#0C1B2E] hover:bg-[#E6E0D3]"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              {t.viewContent}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleResourceModeration(r)}
                              className="rounded-md border border-[#C8BFA8] px-3 py-1.5 font-medium text-slate-700 hover:bg-[#EFECE3]"
                            >
                              {r.status === 'PUBLISHED' ? 'Suspend Resource' : 'Restore'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="min-w-0 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] overflow-hidden">
                    <div className="border-b border-[#C8BFA8] px-5 py-4">
                      <h2 className="text-base font-semibold text-slate-900">
                        Platform Financial Ledger (15% Platform Fee Split)
                      </h2>
                    </div>

                    {/* Mobile / Tablet Cards */}
                    <div className="divide-y divide-[#D4CCB9] md:hidden">
                      {ledger.map((tx) => (
                        <div key={tx.id} className="p-4 space-y-1.5 text-sm">
                          <p className="font-semibold text-slate-900 break-words">{tx.itemTitle}</p>
                          <p className="text-slate-600">
                            {tx.itemType} · Buyer: {tx.buyerName} · Creator:{' '}
                            {tx.sellerName || 'Akademi Platform'}
                          </p>
                          <div className="flex flex-wrap gap-4 font-mono-nums pt-1">
                            <span>Gross: ${tx.grossUsd.toFixed(2)}</span>
                            <span className="text-emerald-700 font-semibold">
                              Fee: ${tx.platformFeeUsd.toFixed(2)}
                            </span>
                            <span>Net: ${tx.creatorNetUsd.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Fixed-Width Table (Zero Horizontal Scroll) */}
                    <div className="hidden md:block">
                      <table className="w-full table-fixed text-left text-sm">
                        <thead className="border-b border-[#C8BFA8] bg-[#EFECE3] text-slate-600">
                          <tr>
                            <th className="w-[28%] px-4 py-3 font-medium">Item</th>
                            <th className="w-[14%] px-3 py-3 font-medium">Type</th>
                            <th className="w-[24%] px-3 py-3 font-medium">Buyer / Creator</th>
                            <th className="w-[11%] px-3 py-3 text-right font-medium">Gross</th>
                            <th className="w-[12%] px-3 py-3 text-right font-medium">Fee</th>
                            <th className="w-[11%] px-4 py-3 text-right font-medium">Net</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {ledger.map((tx) => (
                            <tr key={tx.id}>
                              <td className="px-4 py-3 align-top font-medium text-slate-900 break-words">
                                {tx.itemTitle}
                              </td>
                              <td className="px-3 py-3 align-top text-slate-600 break-words">
                                {tx.itemType}
                              </td>
                              <td className="px-3 py-3 align-top text-slate-600 break-words">
                                <p>{tx.buyerName}</p>
                                <p className="text-xs text-slate-500">
                                  → {tx.sellerName || 'Akademi Platform'}
                                </p>
                              </td>
                              <td className="px-3 py-3 align-top text-right font-mono-nums">
                                ${tx.grossUsd.toFixed(2)}
                              </td>
                              <td className="px-3 py-3 align-top text-right font-mono-nums text-emerald-700">
                                ${tx.platformFeeUsd.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 align-top text-right font-mono-nums">
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
                  <section className="min-w-0 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] overflow-hidden">
                    <div className="border-b border-[#C8BFA8] px-5 py-4">
                      <h2 className="text-base font-semibold text-slate-900">
                        Automated Email Outbox
                      </h2>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
                      {outboxEmails.map((m) => (
                        <div key={m.id} className="p-4 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500">
                            <span className="font-semibold text-slate-900 break-all">
                              {m.toEmail}
                            </span>
                            <span className="font-mono-nums shrink-0">
                              {new Date(m.sentAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="mt-1 font-medium text-blue-900 break-words">
                            [{m.tag}] {m.subject}
                          </p>
                          <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-[#EFECE3] p-3 font-sans text-slate-700">
                            {m.body}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="min-w-0 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] overflow-hidden">
                    <div className="border-b border-[#C8BFA8] px-5 py-4">
                      <h2 className="text-base font-semibold text-slate-900">
                        Immutable Compliance &amp; Admin Audit Log
                      </h2>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
                      {auditLogs.map((a) => (
                        <div key={a.id} className="px-5 py-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500">
                            <span className="font-semibold text-slate-900 break-words">
                              {a.action}
                            </span>
                            <span className="font-mono-nums shrink-0">
                              {new Date(a.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="mt-1 text-slate-700 break-words">{a.details}</p>
                          <p className="mt-0.5 text-slate-400 break-words">
                            Actor: {a.actorName} · Target: {a.targetType} ({a.targetId})
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {tab === 'SUPPORT' && (
                <CommunicationPanel currentUser={currentUser} defaultTab="SUPPORT" />
              )}
            </>
          )}
      </DashboardShell>

      {/* Approve Request Modal */}
      {approvingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleApproveRequest}
            className="w-full max-w-md rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6 shadow-xl"
          >
            <h3 className="text-base font-semibold text-slate-900">
              Approve &amp; Configure Temporary Credentials
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Applicant: <span className="font-medium text-slate-900">{approvingReq.fullName}</span>{' '}
              ({approvingReq.email})
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Temporary Password (leave blank to auto-generate)
              </label>
              <input
                type="text"
                value={customTempPass}
                onChange={(e) => setCustomTempPass(e.target.value)}
                placeholder="Min 8 chars or leave empty for secure random"
                className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setApprovingReq(null)}
                className="rounded-lg border border-[#C8BFA8] px-3.5 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Approve &amp; Send Email
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reject Request Modal */}
      {rejectingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleRejectRequest}
            className="w-full max-w-md rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6 shadow-xl"
          >
            <h3 className="text-base font-semibold text-slate-900">Reject Contributor Request</h3>
            <p className="mt-1 text-sm text-slate-600">
              Provide a clear reason to email to {rejectingReq.email}.
            </p>
            <textarea
              required
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Unable to verify institutional accreditation..."
              className="mt-4 w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm text-slate-900"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingReq(null)}
                className="rounded-lg border border-[#C8BFA8] px-3.5 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
              >
                Confirm Rejection
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Account Request Submission Full Details Modal */}
      {viewingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0C1B2E]/75 p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] shadow-2xl">
            <div className="african-weave-rule shrink-0" />
            <div className="flex items-center justify-between gap-3 border-b border-[#D4CCB9] px-5 py-4">
              <div className="min-w-0">
                <h3 className="truncate font-display text-lg font-bold text-[#0C1B2E]">
                  {viewingRequest.fullName}
                </h3>
                <p className="text-sm text-[#4A463F]">
                  {viewingRequest.accountCategory.replace('_', ' ')} · {viewingRequest.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingRequest(null)}
                aria-label={t.dismiss}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#C8BFA8] bg-[#EFECE3] text-[#0C1B2E]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
              <div className="grid gap-3 rounded-lg border border-[#D4CCB9] bg-[#EFECE3] p-4 sm:grid-cols-2">
                <div>
                  <span className="font-semibold text-[#4A463F]">Email: </span>
                  <span className="break-all text-[#0C1B2E]">{viewingRequest.email}</span>
                </div>
                <div>
                  <span className="font-semibold text-[#4A463F]">Phone / WhatsApp: </span>
                  <span className="text-[#0C1B2E]">{viewingRequest.phone || 'Not provided'}</span>
                </div>
                <div>
                  <span className="font-semibold text-[#4A463F]">Country / District: </span>
                  <span className="text-[#0C1B2E]">
                    {viewingRequest.country}
                    {viewingRequest.district ? ` (${viewingRequest.district})` : ''}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-[#4A463F]">Organization: </span>
                  <span className="text-[#0C1B2E]">
                    {viewingRequest.organizationName || 'Independent'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-[#4A463F]">Education System: </span>
                  <span className="text-[#0C1B2E]">
                    {viewingRequest.educationSystem || 'Standard'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-[#4A463F]">Planned Levels: </span>
                  <span className="text-[#0C1B2E]">
                    {viewingRequest.plannedLevels || 'Not specified'}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="font-semibold text-[#4A463F]">Specialization: </span>
                  <span className="text-[#0C1B2E]">{viewingRequest.specialization}</span>
                </div>
                {viewingRequest.portfolioUrl && (
                  <div className="sm:col-span-2">
                    <span className="font-semibold text-[#4A463F]">Portfolio / Sample: </span>
                    <span className="break-all text-blue-900">{viewingRequest.portfolioUrl}</span>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-[#D4CCB9] bg-[#EFECE3] p-4">
                <p className="font-semibold text-[#4A463F] mb-1">Submitted Statement</p>
                <p className="whitespace-pre-wrap leading-relaxed text-[#0C1B2E]">
                  {viewingRequest.statement}
                </p>
              </div>

              {viewingRequest.rejectionReason && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
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
                    className="rounded-lg border border-red-200 px-4 py-2 font-medium text-red-700 hover:bg-red-50"
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
                    className="rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800"
                  >
                    {t.approveAction}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ContentInspectorModal item={inspected} onClose={() => setInspected(null)} />
    </>
  );
};
