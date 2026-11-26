import React, { useEffect, useState } from 'react';
import {
  AtSign,
  Award,
  CalendarClock,
  CheckCircle2,
  MessageSquare,
  Pin,
  Plus,
  Send,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { apiFetch, createAkademiSocket } from '../lib/api';
import type { CourseQaThread, UserProfile, UserRole } from '../types/akademi';

export interface QaCourseOption {
  id: string;
  title: string;
  subject?: string;
}

interface MentionCandidate {
  id: string;
  name: string;
  role: UserRole;
}

interface CourseQaPanelProps {
  currentUser: UserProfile;
  courses: QaCourseOption[];
  initialCourseId?: string;
  onClose?: () => void;
}

export const CourseQaPanel: React.FC<CourseQaPanelProps> = ({
  currentUser,
  courses,
  initialCourseId,
  onClose,
}) => {
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    initialCourseId || courses[0]?.id || ''
  );
  const [threads, setThreads] = useState<CourseQaThread[]>([]);
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const [filterMode, setFilterMode] = useState<'ALL' | 'OFFICE_HOURS' | 'VERIFIED' | 'UNANSWERED'>(
    'ALL'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Composer state
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [isOfficeHour, setIsOfficeHour] = useState(false);
  const [officeHourSchedule, setOfficeHourSchedule] = useState('');
  const [submittingThread, setSubmittingThread] = useState(false);

  // Per-thread reply drafts
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const isStaff = currentUser.role !== 'LEARNER';

  useEffect(() => {
    if (initialCourseId) {
      setSelectedCourseId(initialCourseId);
    } else if (!selectedCourseId && courses.length > 0) {
      setSelectedCourseId(courses[0].id);
    }
  }, [initialCourseId, courses]);

  const loadQa = async (courseId: string) => {
    if (!courseId) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<{
        threads: CourseQaThread[];
        mentionCandidates: MentionCandidate[];
      }>(`/api/courses/${courseId}/qa`);
      setThreads(data.threads);
      setMentionCandidates(data.mentionCandidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load course discussion room.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCourseId) {
      loadQa(selectedCourseId);
    }
  }, [selectedCourseId]);

  useEffect(() => {
    const ws = createAkademiSocket((event, payload) => {
      if (event === 'qa:updated' && payload.courseId === selectedCourseId && payload.thread) {
        const updated = payload.thread as CourseQaThread;
        setThreads((prev) => {
          const exists = prev.some((t) => t.id === updated.id);
          const next = exists
            ? prev.map((t) => (t.id === updated.id ? updated : t))
            : [updated, ...prev];
          return next.sort((a, b) => {
            if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
        });
      }
    });
    return () => {
      ws?.close();
    };
  }, [selectedCourseId]);

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId || !newTitle.trim() || !newBody.trim()) return;
    setSubmittingThread(true);
    setError('');
    try {
      const res = await apiFetch<{ thread: CourseQaThread }>(
        `/api/courses/${selectedCourseId}/qa`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: newTitle.trim(),
            body: newBody.trim(),
            isOfficeHour: isStaff && isOfficeHour,
            officeHourSlot: isStaff && isOfficeHour ? officeHourSchedule.trim() : undefined,
          }),
        }
      );
      setThreads((prev) => [res.thread, ...prev.filter((t) => t.id !== res.thread.id)]);
      setNewTitle('');
      setNewBody('');
      setIsOfficeHour(false);
      setOfficeHourSchedule('');
      setShowNewForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post question.');
    } finally {
      setSubmittingThread(false);
    }
  };

  const handleAddReply = async (threadId: string) => {
    const text = (replyDrafts[threadId] || '').trim();
    if (!text) return;
    setError('');
    try {
      const res = await apiFetch<{ thread: CourseQaThread }>(`/api/qa/${threadId}/replies`, {
        method: 'POST',
        body: JSON.stringify({ body: text }),
      });
      setThreads((prev) => prev.map((t) => (t.id === res.thread.id ? res.thread : t)));
      setReplyDrafts((prev) => ({ ...prev, [threadId]: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit reply.');
    }
  };

  const handleUpvoteThread = async (threadId: string) => {
    try {
      const res = await apiFetch<{ thread: CourseQaThread }>(`/api/qa/${threadId}/upvote`, {
        method: 'POST',
      });
      setThreads((prev) => prev.map((t) => (t.id === res.thread.id ? res.thread : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update upvote.');
    }
  };

  const handleUpvoteReply = async (threadId: string, replyId: string) => {
    try {
      const res = await apiFetch<{ thread: CourseQaThread }>(
        `/api/qa/${threadId}/replies/${replyId}/upvote`,
        { method: 'POST' }
      );
      setThreads((prev) => prev.map((t) => (t.id === res.thread.id ? res.thread : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upvote reply.');
    }
  };

  const handleVerifyReply = async (threadId: string, replyId: string) => {
    try {
      const res = await apiFetch<{ thread: CourseQaThread }>(
        `/api/qa/${threadId}/replies/${replyId}/verify`,
        { method: 'POST' }
      );
      setThreads((prev) => prev.map((t) => (t.id === res.thread.id ? res.thread : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to toggle verification.');
    }
  };

  const handlePinThread = async (threadId: string) => {
    try {
      const res = await apiFetch<{ thread: CourseQaThread }>(`/api/qa/${threadId}/pin`, {
        method: 'POST',
      });
      setThreads((prev) => prev.map((t) => (t.id === res.thread.id ? res.thread : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to pin thread.');
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    try {
      await apiFetch(`/api/qa/${threadId}`, { method: 'DELETE' });
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete thread.');
    }
  };

  const insertMentionIntoNew = (name: string) => {
    setNewBody((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}@${name} `);
  };

  const insertMentionIntoReply = (threadId: string, name: string) => {
    setReplyDrafts((prev) => {
      const cur = prev[threadId] || '';
      return {
        ...prev,
        [threadId]: `${cur}${cur && !cur.endsWith(' ') ? ' ' : ''}@${name} `,
      };
    });
  };

  const filteredThreads = threads.filter((th) => {
    if (filterMode === 'OFFICE_HOURS') return th.isOfficeHour;
    if (filterMode === 'VERIFIED') return th.replies.some((r) => r.isInstructorVerified);
    if (filterMode === 'UNANSWERED') return !th.isOfficeHour && th.replies.length === 0;
    return true;
  });

  const fieldCls =
    'w-full rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-2 text-sm text-[var(--ak-ink)] placeholder:text-[var(--ak-muted)] focus:border-[#C9642E] focus:outline-none';

  const renderMentionHighlightedText = (text: string) => {
    const parts = text.split(/(@[A-Za-z0-9._-]+(?:\s+[A-Za-z0-9._-]+)?)/g);
    return parts.map((part, idx) =>
      part.startsWith('@') && part.length > 2 ? (
        <span key={idx} className="font-semibold text-[var(--ak-accent-ink)]">
          {part}
        </span>
      ) : (
        <React.Fragment key={idx}>{part}</React.Fragment>
      )
    );
  };

  if (courses.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-8 text-center text-sm text-[var(--ak-muted)]">
        Enroll in an approved course or create a course to unlock course Q&amp;A rooms and
        instructor office hours.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header & Course Picker */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ak-divider)] pb-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--ak-ink)]">
            Course Discussion Room, Peer Q&amp;A &amp; Office Hours
          </h3>
          <p className="mt-0.5 text-sm text-[var(--ak-muted)]">
            Ask study questions between live classes, upvote peer answers, tag peers with @mentions,
            and review instructor-verified solutions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Select course room"
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="min-h-[40px] rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-1.5 text-sm font-semibold text-[var(--ak-ink)]"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowNewForm((v) => !v)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
          >
            <Plus className="h-4 w-4" />
            {isStaff ? 'Post Topic / Office Hours' : 'Ask Question'}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3.5 py-2 text-sm font-semibold text-[var(--ak-ink)]"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--ak-err-bd)] bg-[var(--ak-err-bg)] px-4 py-3 text-sm text-[var(--ak-err-fg)]">
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-1">
          {(
            [
              ['ALL', `All (${threads.length})`],
              ['OFFICE_HOURS', 'Office Hours'],
              ['VERIFIED', 'Verified Answers'],
              ['UNANSWERED', 'Unanswered'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilterMode(mode)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                filterMode === mode
                  ? 'bg-[#C9642E] text-[#F8F5EE]'
                  : 'text-[var(--ak-ink-2)] hover:text-[var(--ak-ink)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mentionCandidates.length > 0 && (
          <p className="text-xs text-[var(--ak-muted)]">
            Room members ({mentionCandidates.length}) available for @mentions
          </p>
        )}
      </div>

      {/* New Question / Office Hour Form */}
      {showNewForm && (
        <form
          onSubmit={handleCreateThread}
          className="space-y-4 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5"
        >
          <div className="flex items-center justify-between border-b border-[var(--ak-divider)] pb-3">
            <h4 className="text-sm font-semibold text-[var(--ak-ink)]">
              {isStaff
                ? 'Post Course Discussion or Instructor Office Hours Notice'
                : 'Ask a Course Question'}
            </h4>
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="text-xs font-medium text-[var(--ak-muted)] hover:text-[var(--ak-ink)]"
            >
              Cancel
            </button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--ak-ink-2)]">Title</label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={
                isOfficeHour
                  ? 'e.g. Weekly Office Hours — Past-Paper Clinic'
                  : 'e.g. How do we calibrate priors when sample size is small?'
              }
              className={fieldCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--ak-ink-2)]">
              Details &amp; @Mentions
            </label>
            <textarea
              required
              rows={3}
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Describe your question or discussion prompt. Use @Name to mention an instructor or peer..."
              className={fieldCls}
            />
            {mentionCandidates.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1 text-[var(--ak-muted)]">
                  <AtSign className="h-3 w-3" /> Mention:
                </span>
                {mentionCandidates.slice(0, 6).map((mc) => (
                  <button
                    key={mc.id}
                    type="button"
                    onClick={() => insertMentionIntoNew(mc.name)}
                    className="rounded border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2 py-0.5 font-medium text-[var(--ak-ink-2)] hover:text-[var(--ak-ink)]"
                  >
                    @{mc.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isStaff && (
            <div className="grid gap-3 rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm font-medium text-[var(--ak-ink)]">
                <input
                  type="checkbox"
                  checked={isOfficeHour}
                  onChange={(e) => setIsOfficeHour(e.target.checked)}
                />
                Mark as Instructor Office Hours Notice
              </label>
              {isOfficeHour && (
                <input
                  type="text"
                  value={officeHourSchedule}
                  onChange={(e) => setOfficeHourSchedule(e.target.value)}
                  placeholder="Schedule (e.g. Thursdays 16:00 EAT)"
                  className={fieldCls}
                />
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submittingThread}
            className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] disabled:opacity-50"
          >
            {submittingThread ? 'Posting...' : 'Publish to Course Room'}
          </button>
        </form>
      )}

      {/* Thread List */}
      {loading ? (
        <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-8 text-center text-sm text-[var(--ak-muted)]">
          Loading course Q&amp;A threads...
        </div>
      ) : filteredThreads.length === 0 ? (
        <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-8 text-center text-sm text-[var(--ak-muted)]">
          No Q&amp;A threads in this filter yet. Start the discussion above.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredThreads.map((thread) => {
            const hasUpvoted = thread.upvoterIds.includes(currentUser.id);
            const hasVerified = thread.replies.some((r) => r.isInstructorVerified);
            const sortedReplies = [...thread.replies].sort((a, b) => {
              if (a.isInstructorVerified !== b.isInstructorVerified) {
                return a.isInstructorVerified ? -1 : 1;
              }
              return b.upvoterIds.length - a.upvoterIds.length;
            });

            return (
              <article
                key={thread.id}
                className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ak-muted)]">
                      {thread.isPinned && (
                        <span className="inline-flex items-center gap-1 font-semibold text-[var(--ak-accent-ink)]">
                          <Pin className="h-3.5 w-3.5" /> Pinned
                        </span>
                      )}
                      {thread.isOfficeHour && (
                        <span className="inline-flex items-center gap-1 font-semibold text-[var(--ak-info-fg)]">
                          <CalendarClock className="h-3.5 w-3.5" /> Office Hours
                          {thread.officeHourSlot ? ` · ${thread.officeHourSlot}` : ''}
                        </span>
                      )}
                      {hasVerified && (
                        <span className="inline-flex items-center gap-1 font-semibold text-[var(--ak-ok-fg)]">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Verified Answer
                        </span>
                      )}
                      <span>
                        {thread.authorName} ({thread.authorRole.replace('_', ' ')})
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{new Date(thread.createdAt).toLocaleString()}</span>
                    </div>

                    <h4 className="text-base font-bold text-[var(--ak-ink)]">{thread.title}</h4>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ak-ink-2)]">
                      {renderMentionHighlightedText(thread.body)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleUpvoteThread(thread.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        hasUpvoted
                          ? 'border-[#C9642E] bg-[#C9642E] text-[#F8F5EE]'
                          : 'border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]'
                      }`}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      <span className="font-mono-nums">{thread.upvoterIds.length}</span>
                    </button>

                    {isStaff && (
                      <button
                        type="button"
                        onClick={() => handlePinThread(thread.id)}
                        title={thread.isPinned ? 'Unpin thread' : 'Pin thread'}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                          thread.isPinned
                            ? 'border-[#C9642E] text-[var(--ak-accent-ink)]'
                            : 'border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-muted)] hover:text-[var(--ak-ink)]'
                        }`}
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {(isStaff || thread.authorId === currentUser.id) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteThread(thread.id)}
                        title="Delete thread"
                        className="rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] p-1.5 text-[var(--ak-muted)] hover:text-[var(--ak-err-fg)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Replies */}
                <div className="space-y-2.5 border-t border-[var(--ak-divider)] pt-3">
                  {sortedReplies.length === 0 ? (
                    <p className="text-xs text-[var(--ak-muted)]">
                      No answers yet — reply below to help your cohort.
                    </p>
                  ) : (
                    sortedReplies.map((r) => {
                      const replyUpvoted = r.upvoterIds.includes(currentUser.id);
                      return (
                        <div
                          key={r.id}
                          className={`rounded-lg border p-3.5 text-sm ${
                            r.isInstructorVerified
                              ? 'border-[var(--ak-ok-bd)] bg-[var(--ak-ok-bg)]'
                              : 'border-[var(--ak-divider)] bg-[var(--ak-recessed)]'
                          }`}
                        >
                          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-[var(--ak-ink)]">
                                {r.authorName}
                              </span>
                              <span className="text-[var(--ak-muted)]">
                                {r.authorRole.replace('_', ' ')}
                              </span>
                              {r.isInstructorVerified && (
                                <span className="inline-flex items-center gap-1 font-semibold text-[var(--ak-ok-fg)]">
                                  <Award className="h-3.5 w-3.5" />
                                  Instructor Verified Answer
                                  {r.verifiedByName ? ` · by ${r.verifiedByName}` : ''}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleUpvoteReply(thread.id, r.id)}
                                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${
                                  replyUpvoted
                                    ? 'border-[#C9642E] bg-[#C9642E] text-[#F8F5EE]'
                                    : 'border-[var(--ak-border)] bg-[var(--ak-surface)] text-[var(--ak-ink-2)]'
                                }`}
                              >
                                <ThumbsUp className="h-3 w-3" />
                                <span className="font-mono-nums">{r.upvoterIds.length}</span>
                              </button>
                              {isStaff && (
                                <button
                                  type="button"
                                  onClick={() => handleVerifyReply(thread.id, r.id)}
                                  className={`rounded border px-2 py-0.5 text-xs font-semibold ${
                                    r.isInstructorVerified
                                      ? 'border-[var(--ak-ok-bd)] bg-[var(--ak-surface)] text-[var(--ak-ok-fg)]'
                                      : 'border-[var(--ak-border)] bg-[var(--ak-surface)] text-[var(--ak-ink)]'
                                  }`}
                                >
                                  {r.isInstructorVerified ? 'Unverify' : 'Verify Answer'}
                                </button>
                              )}
                            </div>
                          </div>

                          <p className="whitespace-pre-wrap text-[var(--ak-ink-2)]">
                            {renderMentionHighlightedText(r.body)}
                          </p>
                        </div>
                      );
                    })
                  )}

                  {/* Add Reply */}
                  <div className="pt-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 shrink-0 text-[var(--ak-muted)]" />
                      <input
                        type="text"
                        value={replyDrafts[thread.id] || ''}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({ ...prev, [thread.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAddReply(thread.id);
                          }
                        }}
                        placeholder="Write a peer reply or instructor clarification (use @Name to mention)..."
                        className={fieldCls}
                      />
                      <button
                        type="button"
                        onClick={() => handleAddReply(thread.id)}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#C9642E] px-3.5 py-1.5 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C] shrink-0"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Reply
                      </button>
                    </div>
                    {mentionCandidates.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pl-6 text-xs">
                        {mentionCandidates.slice(0, 4).map((mc) => (
                          <button
                            key={mc.id}
                            type="button"
                            onClick={() => insertMentionIntoReply(thread.id, mc.name)}
                            className="text-[var(--ak-muted)] hover:text-[var(--ak-accent-ink)]"
                          >
                            @{mc.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
