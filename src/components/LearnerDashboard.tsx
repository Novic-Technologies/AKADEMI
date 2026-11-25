import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Library,
  MessageSquare,
  Play,
  Radio,
  Upload,
  UserCheck,
} from 'lucide-react';
import { apiFetch, fetchAuthorizedBlob } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type {
  CourseItem,
  EnrollmentRecord,
  LearnerAcademicDoc,
  LedgerTransaction,
  LiveSession,
  ResourceItem,
  UserProfile,
} from '../types/akademi';
import { CommunicationPanel } from './CommunicationPanel';
import { ContentInspectorModal, type InspectedContent } from './ContentInspectorModal';
import { DashboardShell } from './DashboardShell';
import { LiveClassroomModal } from './LiveClassroomModal';

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

export const LearnerDashboard: React.FC<LearnerDashboardProps> = ({
  currentUser,
  onUserUpdated,
  onLogout,
  onGoPublic,
}) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<LearnerTab>('DISCOVER');
  const [creators, setCreators] = useState<
    (UserProfile & { resourcesCount: number; coursesCount: number })[]
  >([]);
  const [resources, setResources] = useState<CatalogResource[]>([]);
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [sessions, setSessions] = useState<CatalogSession[]>([]);
  const [academicDocs, setAcademicDocs] = useState<LearnerAcademicDoc[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRecord[]>([]);
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
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | ResourceItem['type']>('ALL');

  const [activeClassroomId, setActiveClassroomId] = useState<string | null>(null);
  const [inspected, setInspected] = useState<InspectedContent | null>(null);

  // Academic doc form
  const [docTitle, setDocTitle] = useState('');
  const [docLevel, setDocLevel] = useState(
    currentUser.educationLevel || 'NCHE Undergraduate (Year 1–4)'
  );
  const [docIssuer, setDocIssuer] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [catalog, ws] = await Promise.all([
        apiFetch<{
          creators: (UserProfile & { resourcesCount: number; coursesCount: number })[];
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
      ]);
      setCreators(catalog.creators);
      setResources(catalog.resources);
      setCourses(catalog.courses);
      setSessions(catalog.liveSessions);
      setAcademicDocs(ws.academicDocs);
      setEnrollments(ws.enrollments);
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

  const handlePurchase = async (kind: 'PLATFORM_PASS' | 'RESOURCE' | 'COURSE', targetId = '') => {
    setError('');
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/learner/purchase', {
        method: 'POST',
        body: JSON.stringify({ kind, targetId }),
      });
      onUserUpdated(res.user);
      setNotice(
        kind === 'PLATFORM_PASS'
          ? 'Akademi Pass activated across included resources.'
          : 'Purchase completed and added to your library.'
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed.');
    }
  };

  const handleEnroll = async (course: CatalogCourse) => {
    setError('');
    try {
      await apiFetch(`/api/courses/${course.id}/enroll`, { method: 'POST' });
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

  const handleOpenResource = async (r: CatalogResource, download = false) => {
    setError('');
    try {
      const blob = await fetchAuthorizedBlob(
        `/api/files/resource/${r.id}${download ? '?download=1' : ''}`
      );
      if (download) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = r.fileName;
        a.click();
        URL.revokeObjectURL(url);
        await loadAll();
      } else {
        const isText = blob.type.startsWith('text/') || blob.type === 'application/json';
        setInspected({
          title: r.title,
          subtitle: `${r.ownerName} · ${r.subject} · ${r.educationLevel}`,
          fileName: r.fileName,
          mimeType: blob.type || 'application/octet-stream',
          textContent: isText ? await blob.text() : undefined,
          objectUrl: isText ? undefined : URL.createObjectURL(blob),
          metadata: [
            { label: 'Format', value: r.type },
            { label: 'File', value: `${r.fileName} (${r.fileSizeLabel})` },
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
      if (download) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const isText = blob.type.startsWith('text/') || blob.type === 'application/json';
        setInspected({
          title: doc.title,
          subtitle: `${doc.institutionIssued} · ${doc.educationLevel}`,
          fileName: doc.fileName,
          mimeType: blob.type || 'application/octet-stream',
          textContent: isText ? await blob.text() : undefined,
          objectUrl: isText ? undefined : URL.createObjectURL(blob),
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

  const handleMarkProgress = async (courseId: string, resourceId: string) => {
    try {
      await apiFetch('/api/learner/progress', {
        method: 'POST',
        body: JSON.stringify({ courseId, resourceId }),
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update progress.');
    }
  };

  const handleUploadAcademicDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const fd = new FormData();
      fd.append('title', docTitle);
      fd.append('educationLevel', docLevel);
      fd.append('institutionIssued', docIssuer);
      if (docFile) fd.append('document', docFile);
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

  const filteredResources = resources.filter((r) => {
    const matchType = typeFilter === 'ALL' || r.type === typeFilter;
    const matchSearch =
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.subject.toLowerCase().includes(search.toLowerCase()) ||
      r.ownerName.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const ownedResources = resources.filter((r) => r.canAccess);

  return (
    <>
      <DashboardShell
        breadcrumbLeft={t.myAcademy}
        breadcrumbRight={currentUser.name}
        userName={currentUser.name}
        userMeta={`${currentUser.educationLevel || 'Learner'} · ${
          currentUser.platformPassActive ? t.libraryPassActive : t.freeTier
        }`}
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
            <div className="mt-6 rounded-xl border border-[#C8BFA8] bg-[#EFECE3] p-4 text-sm">
              <p className="font-bold text-[#0C1B2E]">{t.libraryPassTitle}</p>
              <p className="mt-1 text-sm text-[#2D3D50]">
                {t.libraryPassDesc}
              </p>
              <button
                type="button"
                onClick={() => handlePurchase('PLATFORM_PASS')}
                className="mt-3 min-h-[40px] w-full rounded-lg bg-[#A44A1C] px-3 py-2 text-sm font-semibold text-[#F6F3EB] hover:bg-[#8A3B14]"
              >
                {t.activateLibraryPass}
              </button>
            </div>
          ) : null
        }
        headerRight={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-[#2D3D50] whitespace-nowrap">
              {t.followingLabel}:{' '}
              <strong className="font-mono-nums text-[#0C1B2E]">
                {currentUser.followingCreatorIds.length}
              </strong>
            </span>
            <span className="text-[#2D3D50] whitespace-nowrap">
              {t.passLabel}:{' '}
              <strong
                className={currentUser.platformPassActive ? 'text-[#1E5631]' : 'text-[#0C1B2E]'}
              >
                {currentUser.platformPassActive ? t.activeLabel : t.freeLabel}
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
                className="text-xs font-medium underline shrink-0"
              >
                {t.dismiss}
              </button>
            </div>
          )}

          {loading ? (
            <div className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-10 text-center text-base font-medium text-[#334155]">
              {t.loadingWorkspace}
            </div>
          ) : (
            <>
              {tab === 'DISCOVER' && (
                <div className="space-y-8">
                  {/* Verified Educators & Institutions */}
                  <section className="space-y-3">
                    <h2 className="text-base font-semibold text-slate-900">
                      {t.followEducatorsHeading}
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {creators.map((cr) => {
                        const isFollowing = currentUser.followingCreatorIds.includes(cr.id);
                        const isPaidMember = currentUser.paidFollowCreatorIds.includes(cr.id);
                        return (
                          <div
                            key={cr.id}
                            className="flex flex-col justify-between rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5"
                          >
                            <div>
                              <p className="text-sm text-slate-500">
                                {cr.role.replace('_', ' ')} · {cr.followerIds.length} followers
                              </p>
                              <h3 className="mt-1 text-base font-semibold text-slate-900">
                                {cr.name}
                              </h3>
                              <p className="mt-1 text-sm text-slate-600">{cr.bio}</p>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                              {isFollowing ? (
                                <button
                                  type="button"
                                  onClick={() => handleFollow(cr.id, 'UNFOLLOW')}
                                  className="rounded-lg border border-[#C8BFA8] px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-[#EFECE3]"
                                >
                                  {t.following} ({t.unfollow})
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleFollow(cr.id, 'FREE')}
                                  className="rounded-lg border border-[#C8BFA8] px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-[#EFECE3]"
                                >
                                  {t.follow}
                                </button>
                              )}
                              {!isPaidMember && cr.followPriceUsd > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => handleFollow(cr.id, 'PAID')}
                                  className="rounded-lg bg-[#0C1B2E] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1A2F4A]"
                                >
                                  Paid Member (${cr.followPriceUsd}/mo)
                                </button>
                              ) : isPaidMember ? (
                                <span className="text-sm font-semibold text-emerald-700">
                                  Paid Member Active
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* Courses */}
                  <section className="space-y-3">
                    <h2 className="text-base font-semibold text-slate-900">
                      {t.courseCatalogHeading}
                    </h2>
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                      {courses.map((c) => {
                        const purchased = currentUser.purchasedCourseIds.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            className="flex flex-col justify-between overflow-hidden rounded-xl border border-[#C8BFA8] bg-[#F6F3EB]"
                          >
                            <div>
                              <img
                                src={c.coverImage}
                                alt={c.title}
                                referrerPolicy="no-referrer"
                                className="h-40 w-full object-cover"
                              />
                              <div className="p-5">
                                <div className="text-sm text-slate-500">
                                  {c.subject} · Required: {c.requiredLevel} ·{' '}
                                  {c.priceUsd > 0 ? `$${c.priceUsd}` : c.accessTier}
                                </div>
                                <h3 className="mt-1.5 text-base font-semibold text-slate-900">
                                  {c.title}
                                </h3>
                                <p className="mt-1 text-sm text-slate-600">{c.description}</p>
                                <p className="mt-2 text-sm text-slate-500">
                                  Verified by:{' '}
                                  {c.institutionId ? 'Institution Admin' : c.ownerName}
                                </p>
                              </div>
                            </div>
                            <div className="border-t border-slate-100 px-5 py-3">
                              {c.myEnrollment ? (
                                <span
                                  className={`text-sm font-semibold ${
                                    c.myEnrollment.academicStatus === 'APPROVED'
                                      ? 'text-emerald-700'
                                      : c.myEnrollment.academicStatus === 'REJECTED'
                                        ? 'text-red-700'
                                        : 'text-amber-700'
                                  }`}
                                >
                                  Enrollment: {c.myEnrollment.academicStatus}
                                </span>
                              ) : c.accessTier === 'PAID_SINGLE' && c.priceUsd > 0 && !purchased ? (
                                <button
                                  type="button"
                                  onClick={() => handlePurchase('COURSE', c.id)}
                                  className="w-full rounded-lg bg-[#0C1B2E] px-3 py-2 text-sm font-medium text-white hover:bg-[#1A2F4A]"
                                >
                                  Purchase Course (${c.priceUsd})
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleEnroll(c)}
                                  className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
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
                      <h2 className="text-base font-semibold text-slate-900">
                        {t.resourceLibraryHeading}
                      </h2>
                      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                        <input
                          type="search"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder={t.searchPlaceholder}
                          className="w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3 py-1.5 text-sm sm:w-56"
                        />
                        <select
                          aria-label="Format filter"
                          value={typeFilter}
                          onChange={(e) =>
                            setTypeFilter(e.target.value as 'ALL' | ResourceItem['type'])
                          }
                          className="w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3 py-1.5 text-sm font-medium text-[#0C1B2E] sm:hidden"
                        >
                          {(['ALL', 'PDF', 'DOCX', 'VIDEO', 'IMAGE', 'BOOK'] as const).map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                        <div className="hidden items-center gap-1 rounded-lg bg-[#E6E0D3] p-1 sm:flex">
                          {(['ALL', 'PDF', 'DOCX', 'VIDEO', 'IMAGE', 'BOOK'] as const).map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => setTypeFilter(item)}
                              className={`rounded-md px-2.5 py-1 text-sm font-medium ${
                                typeFilter === item
                                  ? 'bg-[#F6F3EB] text-slate-900 shadow-xs'
                                  : 'text-slate-600'
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
                          className="flex flex-col justify-between rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5"
                        >
                          <div>
                            <div className="text-sm text-slate-500">
                              {r.type} · {r.subject} · {r.ownerName} ·{' '}
                              {r.priceUsd > 0 ? `$${r.priceUsd}` : r.accessTier}
                            </div>
                            <h3 className="mt-1 text-sm font-semibold text-slate-900">{r.title}</h3>
                            <p className="mt-1 text-sm text-slate-600">{r.description}</p>
                          </div>
                          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                            <span className="text-sm font-mono-nums text-slate-500">
                              {r.fileSizeLabel} · {r.downloadsCount} downloads
                            </span>
                            {r.canAccess ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleOpenResource(r, false)}
                                  className="inline-flex items-center gap-1 rounded-md border border-[#C8BFA8] px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-[#EFECE3]"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  {t.preview}
                                </button>
                                {r.downloadable && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenResource(r, true)}
                                    className="inline-flex items-center gap-1 rounded-md bg-[#0C1B2E] px-2.5 py-1 text-sm font-medium text-white hover:bg-[#1A2F4A]"
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
                                className="rounded-md bg-[#0C1B2E] px-3 py-1 text-sm font-medium text-white hover:bg-[#1A2F4A]"
                              >
                                Buy (${r.priceUsd})
                              </button>
                            ) : (
                              <span className="text-sm text-amber-700">
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
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-slate-900">
                    My Education Journey &amp; Enrolled Courses
                  </h2>
                  {enrollments.length === 0 ? (
                    <div className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-8 text-center text-sm text-slate-500">
                      You have not requested any course enrollments yet. Browse courses to start.
                    </div>
                  ) : (
                    enrollments.map((enr) => {
                      const course = courses.find((c) => c.id === enr.courseId);
                      const courseResources = resources.filter((r) =>
                        course?.resourceIds.includes(r.id)
                      );
                      return (
                        <div
                          key={enr.id}
                          className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5 space-y-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <h3 className="text-base font-semibold text-slate-900">
                                {enr.courseTitle}
                              </h3>
                              <p className="mt-1 text-sm text-slate-500">
                                Verification Status:{' '}
                                <strong
                                  className={
                                    enr.academicStatus === 'APPROVED'
                                      ? 'text-emerald-700'
                                      : 'text-amber-700'
                                  }
                                >
                                  {enr.academicStatus}
                                </strong>{' '}
                                · Attendance: {enr.attendanceMinutes} min · Grade:{' '}
                                {enr.gradeLabel || 'In Progress'}
                              </p>
                              {enr.academicNote && (
                                <p className="mt-1 text-sm text-slate-600">
                                  Reviewer Note: {enr.academicNote}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-semibold font-mono-nums text-slate-900">
                                {enr.progressPercent}%
                              </span>
                              <p className="text-sm text-slate-500">Completed</p>
                            </div>
                          </div>

                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full bg-[#0C1B2E] transition-all"
                              style={{ width: `${enr.progressPercent}%` }}
                            />
                          </div>

                          {enr.academicStatus === 'APPROVED' && courseResources.length > 0 && (
                            <div className="divide-y divide-slate-100 rounded-lg border border-[#C8BFA8]">
                              {courseResources.map((r) => {
                                const done = enr.completedResourceIds.includes(r.id);
                                return (
                                  <div
                                    key={r.id}
                                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                                  >
                                    <span className="font-medium text-slate-800">
                                      [{r.type}] {r.title}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenResource(r, false)}
                                        className="rounded border border-[#C8BFA8] px-2.5 py-1 text-slate-700 hover:bg-[#EFECE3]"
                                      >
                                        Study
                                      </button>
                                      {done ? (
                                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          Done
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => handleMarkProgress(enr.courseId, r.id)}
                                          className="rounded bg-[#0C1B2E] px-2.5 py-1 text-white hover:bg-[#1A2F4A]"
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
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {tab === 'LIBRARY' && (
                <div className="space-y-6">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Owned &amp; Unlocked Educational Materials
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    {ownedResources.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-start justify-between gap-4 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-4"
                      >
                        <div>
                          <div className="flex items-center gap-1.5 text-sm text-slate-500">
                            <FileText className="h-3.5 w-3.5 text-blue-900" />
                            <span>{r.type}</span>
                            <span aria-hidden="true">·</span>
                            <span>{r.ownerName}</span>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{r.title}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenResource(r, false)}
                            className="rounded-md border border-[#C8BFA8] px-2.5 py-1 text-sm font-medium text-slate-700"
                          >
                            Read
                          </button>
                          {r.downloadable && (
                            <button
                              type="button"
                              onClick={() => handleOpenResource(r, true)}
                              className="rounded-md bg-[#0C1B2E] px-2.5 py-1 text-sm font-medium text-white"
                            >
                              Download
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {transactions.length > 0 && (
                    <div className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB]">
                      <div className="border-b border-[#C8BFA8] px-5 py-3">
                        <h3 className="text-sm font-semibold text-slate-900">
                          Payment Receipts &amp; Subscriptions
                        </h3>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {transactions.map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between px-5 py-3 text-sm"
                          >
                            <span className="font-medium text-slate-800">{t.itemTitle}</span>
                            <span className="font-mono-nums text-slate-600">
                              ${t.grossUsd.toFixed(2)} ·{' '}
                              {new Date(t.timestamp).toLocaleDateString()}
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
                  <h2 className="text-lg font-semibold text-slate-900">
                    Live Classrooms &amp; Seminars
                  </h2>
                  <div className="space-y-3">
                    {sessions.map((s) => (
                      <div key={s.id} className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <div className="text-sm text-slate-500">
                              <strong
                                className={
                                  s.status === 'LIVE' ? 'text-emerald-700' : 'text-blue-900'
                                }
                              >
                                {s.status}
                              </strong>{' '}
                              · {s.courseTitle} · Host: {s.hostName}
                            </div>
                            <h3 className="mt-1 text-base font-semibold text-slate-900">
                              {s.title}
                            </h3>
                            <p className="mt-1 text-sm text-slate-600">{s.topicSummary}</p>
                          </div>
                          <div>
                            {s.canJoin.allowed && s.status === 'LIVE' ? (
                              <button
                                type="button"
                                onClick={() => setActiveClassroomId(s.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                              >
                                <Play className="h-3.5 w-3.5" />
                                {t.joinLive}
                              </button>
                            ) : !s.canJoin.allowed ? (
                              <span className="text-sm text-amber-700">{s.canJoin.reason}</span>
                            ) : (
                              <span className="text-sm text-slate-500">
                                Scheduled: {new Date(s.scheduledAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === 'VAULT' && (
                <div className="grid gap-6 lg:grid-cols-12">
                  <form
                    onSubmit={handleUploadAcademicDoc}
                    className="space-y-4 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6 lg:col-span-5"
                  >
                    <h2 className="text-base font-semibold text-slate-900">
                      Upload Academic Prerequisite Document
                    </h2>
                    <p className="text-sm text-slate-600">
                      Upload transcripts or certificates to verify fitness for your selected
                      education level. Confidential identity records are never exposed to educators.
                    </p>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Document Title
                      </label>
                      <input
                        type="text"
                        required
                        value={docTitle}
                        onChange={(e) => setDocTitle(e.target.value)}
                        placeholder="e.g. BSc Year 1 Official Transcript"
                        className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Education Level (UNEB / NCHE / EAC)
                      </label>
                      <select
                        value={docLevel}
                        onChange={(e) => setDocLevel(e.target.value)}
                        className="w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3 py-2 text-sm"
                      >
                        {educationLevels.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Issuing Institution / Board
                      </label>
                      <input
                        type="text"
                        required
                        value={docIssuer}
                        onChange={(e) => setDocIssuer(e.target.value)}
                        placeholder="e.g. Makerere University"
                        className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Certificate / Transcript File
                      </label>
                      <input
                        type="file"
                        onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                        className="w-full rounded-lg border border-[#C8BFA8] p-2 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0C1B2E] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1A2F4A]"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Save to Academic Vault
                    </button>
                  </form>

                  <div className="min-w-0 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] lg:col-span-7">
                    <div className="border-b border-[#C8BFA8] px-5 py-4">
                      <h2 className="text-base font-semibold text-slate-900">
                        My Academic Documents ({academicDocs.length})
                      </h2>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {academicDocs.map((d) => (
                        <div
                          key={d.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900 break-words">
                              {d.title}
                            </p>
                            <p className="mt-1 text-slate-500 break-words">
                              {d.educationLevel} · Issued by {d.institutionIssued} · {d.fileName}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenAcademicDoc(d, false)}
                              className="inline-flex items-center gap-1 rounded-md border border-[#C8BFA8] px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-[#EFECE3]"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              {t.preview}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenAcademicDoc(d, true)}
                              className="inline-flex items-center gap-1 rounded-md bg-[#0C1B2E] px-2.5 py-1.5 text-sm font-medium text-white hover:bg-[#1A2F4A]"
                            >
                              <Download className="h-3.5 w-3.5" />
                              {t.download}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'INBOX' && (
                <CommunicationPanel
                  currentUser={currentUser}
                  availableRecipients={creators.map((c) => ({
                    id: c.id,
                    name: c.name,
                    label: c.role.replace('_', ' '),
                  }))}
                />
              )}
            </>
          )}
      </DashboardShell>

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
