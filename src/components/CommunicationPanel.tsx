import React, { useEffect, useState } from 'react';
import {
  Check,
  Edit3,
  MessageSquare,
  Send,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type {
  DirectMessageThread,
  MessageRecipient,
  SupportTicket,
  UserProfile,
} from '../types/akademi';

interface CommunicationPanelProps {
  currentUser: UserProfile;
  availableRecipients?: MessageRecipient[];
  defaultTab?: 'THREADS' | 'SUPPORT';
  initialRecipientId?: string;
}

export const CommunicationPanel: React.FC<CommunicationPanelProps> = ({
  currentUser,
  availableRecipients = [],
  defaultTab = 'THREADS',
  initialRecipientId = '',
}) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<'THREADS' | 'SUPPORT'>(
    initialRecipientId
      ? 'THREADS'
      : currentUser.role === 'MASTER_ADMIN'
        ? 'SUPPORT'
        : defaultTab
  );
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [threads, setThreads] = useState<DirectMessageThread[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  const [selectedThreadId, setSelectedThreadId] = useState<string>('');
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New Ticket form
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketCategory, setTicketCategory] =
    useState<SupportTicket['category']>('GENERAL');
  const [ticketBody, setTicketBody] = useState('');

  // Edit Ticket form
  const [editingTicket, setEditingTicket] = useState(false);
  const [editTicketSubject, setEditTicketSubject] = useState('');
  const [editTicketCategory, setEditTicketCategory] =
    useState<SupportTicket['category']>('GENERAL');
  const [editTicketStatus, setEditTicketStatus] =
    useState<SupportTicket['status']>('OPEN');

  // New Thread form
  const [showNewThread, setShowNewThread] = useState(Boolean(initialRecipientId));
  const [recipientId, setRecipientId] = useState(initialRecipientId);
  const [threadTitle, setThreadTitle] = useState('');
  const [threadBody, setThreadBody] = useState('');

  // Inline Message edit state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgBody, setEditingMsgBody] = useState('');

  const loadInbox = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<{
        tickets: SupportTicket[];
        threads: DirectMessageThread[];
      }>('/api/communication/inbox');
      setTickets(data.tickets);
      setThreads(data.threads);
      if (!selectedTicketId && data.tickets.length > 0) {
        setSelectedTicketId(data.tickets[0].id);
      }
      if (!selectedThreadId && data.threads.length > 0) {
        setSelectedThreadId(data.threads[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load inbox.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInbox();
  }, [currentUser.id]);

  useEffect(() => {
    if (initialRecipientId) {
      setTab('THREADS');
      setShowNewThread(true);
      setRecipientId(initialRecipientId);
    }
  }, [initialRecipientId]);

  const selectedTicket = tickets.find((tk) => tk.id === selectedTicketId) || tickets[0];
  const selectedThread = threads.find((th) => th.id === selectedThreadId) || threads[0];

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch<{ ticket: SupportTicket }>('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          subject: ticketSubject,
          category: ticketCategory,
          body: ticketBody,
        }),
      });
      setTickets((prev) => [res.ticket, ...prev]);
      setSelectedTicketId(res.ticket.id);
      setTicketSubject('');
      setTicketBody('');
      setShowNewTicket(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create ticket.');
    }
  };

  const handleUpdateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;
    setError('');
    try {
      const payload: Record<string, string> = {
        subject: editTicketSubject,
        category: editTicketCategory,
      };
      if (currentUser.role === 'MASTER_ADMIN') {
        payload.status = editTicketStatus;
      }
      const res = await apiFetch<{ ticket: SupportTicket }>(
        `/api/tickets/${selectedTicket.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      );
      setTickets((prev) => prev.map((tk) => (tk.id === res.ticket.id ? res.ticket : tk)));
      setEditingTicket(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update ticket.');
    }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    setError('');
    try {
      await apiFetch(`/api/tickets/${ticketId}`, { method: 'DELETE' });
      const remaining = tickets.filter((tk) => tk.id !== ticketId);
      setTickets(remaining);
      setSelectedTicketId(remaining[0]?.id || '');
      setEditingTicket(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete ticket.');
    }
  };

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch<{ thread: DirectMessageThread }>('/api/messages/thread', {
        method: 'POST',
        body: JSON.stringify({
          recipientId,
          contextTitle: threadTitle || 'Course & Academic Inquiry',
          contextType: 'COURSE_QA',
          body: threadBody,
        }),
      });
      setThreads((prev) => [res.thread, ...prev]);
      setSelectedThreadId(res.thread.id);
      setThreadTitle('');
      setThreadBody('');
      setShowNewThread(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start conversation.');
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    setError('');
    try {
      await apiFetch(`/api/messages/${threadId}`, { method: 'DELETE' });
      const remaining = threads.filter((th) => th.id !== threadId);
      setThreads(remaining);
      setSelectedThreadId(remaining[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete conversation.');
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setError('');
    try {
      if (tab === 'SUPPORT' && selectedTicket) {
        const res = await apiFetch<{ ticket: SupportTicket }>(
          `/api/tickets/${selectedTicket.id}/reply`,
          {
            method: 'POST',
            body: JSON.stringify({ body: replyText }),
          }
        );
        setTickets((prev) => prev.map((tk) => (tk.id === res.ticket.id ? res.ticket : tk)));
      } else if (tab === 'THREADS' && selectedThread) {
        const res = await apiFetch<{ thread: DirectMessageThread }>(
          `/api/messages/${selectedThread.id}/reply`,
          {
            method: 'POST',
            body: JSON.stringify({ body: replyText }),
          }
        );
        setThreads((prev) => prev.map((th) => (th.id === res.thread.id ? res.thread : th)));
      }
      setReplyText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply.');
    }
  };

  const handleSaveEditedMessage = async (msgId: string) => {
    if (!editingMsgBody.trim()) return;
    setError('');
    try {
      if (tab === 'SUPPORT' && selectedTicket) {
        const res = await apiFetch<{ ticket: SupportTicket }>(
          `/api/tickets/${selectedTicket.id}/messages/${msgId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ body: editingMsgBody }),
          }
        );
        setTickets((prev) => prev.map((tk) => (tk.id === res.ticket.id ? res.ticket : tk)));
      } else if (tab === 'THREADS' && selectedThread) {
        const res = await apiFetch<{ thread: DirectMessageThread }>(
          `/api/messages/${selectedThread.id}/messages/${msgId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ body: editingMsgBody }),
          }
        );
        setThreads((prev) => prev.map((th) => (th.id === res.thread.id ? res.thread : th)));
      }
      setEditingMsgId(null);
      setEditingMsgBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to edit message.');
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    setError('');
    try {
      if (tab === 'SUPPORT' && selectedTicket) {
        const res = await apiFetch<{ ticket: SupportTicket }>(
          `/api/tickets/${selectedTicket.id}/messages/${msgId}`,
          { method: 'DELETE' }
        );
        setTickets((prev) => prev.map((tk) => (tk.id === res.ticket.id ? res.ticket : tk)));
      } else if (tab === 'THREADS' && selectedThread) {
        const res = await apiFetch<{ thread: DirectMessageThread }>(
          `/api/messages/${selectedThread.id}/messages/${msgId}`,
          { method: 'DELETE' }
        );
        setThreads((prev) => prev.map((th) => (th.id === res.thread.id ? res.thread : th)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete message.');
    }
  };

  const handleTicketStatus = async (ticketId: string, status: SupportTicket['status']) => {
    try {
      const res = await apiFetch<{ ticket: SupportTicket }>(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setTickets((prev) => prev.map((tk) => (tk.id === res.ticket.id ? res.ticket : tk)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update ticket status.');
    }
  };

  const fieldCls =
    'w-full rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-2 text-sm text-[var(--ak-ink)] placeholder:text-[var(--ak-muted)] focus:border-[#C9642E] focus:outline-none';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ak-divider)] pb-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--ak-ink)]">{t.commsHeading}</h2>
          <p className="mt-1 text-sm text-[var(--ak-muted)]">{t.commsSub}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-1">
            <button
              type="button"
              onClick={() => {
                setTab('THREADS');
                setEditingMsgId(null);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                tab === 'THREADS'
                  ? 'bg-[#C9642E] text-[#F8F5EE]'
                  : 'text-[var(--ak-ink-2)] hover:text-[var(--ak-ink)]'
              }`}
            >
              {t.tabAcademicThreads} ({threads.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('SUPPORT');
                setEditingMsgId(null);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                tab === 'SUPPORT'
                  ? 'bg-[#C9642E] text-[#F8F5EE]'
                  : 'text-[var(--ak-ink-2)] hover:text-[var(--ak-ink)]'
              }`}
            >
              {t.tabMasterAdminDesk} ({tickets.length})
            </button>
          </div>

          {tab === 'SUPPORT' && currentUser.role !== 'MASTER_ADMIN' && (
            <button
              type="button"
              onClick={() => setShowNewTicket((v) => !v)}
              className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] whitespace-nowrap shrink-0"
            >
              {t.newSupportTicket}
            </button>
          )}
          {tab === 'THREADS' && availableRecipients.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setShowNewThread((v) => !v);
                if (!recipientId && availableRecipients[0]) {
                  setRecipientId(availableRecipients[0].id);
                }
              }}
              className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] whitespace-nowrap shrink-0"
            >
              {t.newMessageThread}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--ak-err-bd)] bg-[var(--ak-err-bg)] px-4 py-3 text-sm text-[var(--ak-err-fg)]">
          {error}
        </div>
      )}

      {showNewTicket && tab === 'SUPPORT' && (
        <form
          onSubmit={handleCreateTicket}
          className="space-y-4 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--ak-ink)]">
              Submit Support or Compliance Ticket to Master Admin
            </h3>
            <button
              type="button"
              onClick={() => setShowNewTicket(false)}
              className="text-sm text-[var(--ak-muted)] hover:text-[var(--ak-ink)]"
            >
              Cancel
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">Category</label>
              <select
                value={ticketCategory}
                onChange={(e) =>
                  setTicketCategory(e.target.value as SupportTicket['category'])
                }
                className={fieldCls}
              >
                <option value="KYC_APPEAL">KYC / ID Verification Inquiry</option>
                <option value="SUBSCRIPTION">Subscription &amp; Billing</option>
                <option value="CONTENT_REPORT">Report Content / Copyright</option>
                <option value="ACADEMIC_DISPUTE">Academic Verification Dispute</option>
                <option value="GENERAL">General Platform Support</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">Subject</label>
              <input
                type="text"
                required
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
                placeholder="Brief summary of your request"
                className={fieldCls}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">Message</label>
            <textarea
              required
              rows={3}
              value={ticketBody}
              onChange={(e) => setTicketBody(e.target.value)}
              placeholder="Provide details for the Master Admin support team..."
              className={fieldCls}
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
          >
            Submit Ticket
          </button>
        </form>
      )}

      {showNewThread && tab === 'THREADS' && availableRecipients.length > 0 && (
        <form
          onSubmit={handleCreateThread}
          className="space-y-4 rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--ak-ink)]">
              Start Protected Academic Thread
            </h3>
            <button
              type="button"
              onClick={() => setShowNewThread(false)}
              className="text-sm text-[var(--ak-muted)] hover:text-[var(--ak-ink)]"
            >
              Cancel
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">Recipient</label>
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className={fieldCls}
              >
                {availableRecipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.label})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">Topic</label>
              <input
                type="text"
                required
                value={threadTitle}
                onChange={(e) => setThreadTitle(e.target.value)}
                placeholder="e.g. Prerequisite check or syllabus question"
                className={fieldCls}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--ak-ink-2)]">Message</label>
            <textarea
              required
              rows={3}
              value={threadBody}
              onChange={(e) => setThreadBody(e.target.value)}
              placeholder="Write your academic message (confidential contact info stays protected)..."
              className={fieldCls}
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
          >
            Send Message
          </button>
        </form>
      )}

      {loading ? (
        <div className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] p-8 text-center text-sm text-[var(--ak-muted)]">
          Loading communication channels...
        </div>
      ) : (
        <div className="grid min-h-[420px] overflow-hidden rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] lg:grid-cols-12">
          {/* List column */}
          <div className="border-b border-[var(--ak-divider)] bg-[var(--ak-recessed)] lg:col-span-4 lg:border-b-0 lg:border-r">
            {tab === 'SUPPORT' ? (
              tickets.length === 0 ? (
                <div className="p-6 text-sm text-[var(--ak-muted)]">
                  No support tickets yet. Open a ticket anytime to reach Master Admin support.
                </div>
              ) : (
                <div className="divide-y divide-[var(--ak-divider)]">
                  {tickets.map((tk) => (
                    <button
                      key={tk.id}
                      type="button"
                      onClick={() => {
                        setSelectedTicketId(tk.id);
                        setEditingTicket(false);
                        setEditingMsgId(null);
                      }}
                      className={`w-full px-4 py-3.5 text-left transition-colors ${
                        selectedTicket?.id === tk.id
                          ? 'bg-[var(--ak-elevated)]'
                          : 'hover:bg-[var(--ak-elevated)]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-[var(--ak-ink)]">
                          {tk.subject}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[var(--ak-muted)]">
                        <span>{tk.userName}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            tk.status === 'RESOLVED'
                              ? 'text-[var(--ak-ok-fg)] font-semibold'
                              : tk.status === 'IN_REVIEW'
                                ? 'text-[var(--ak-warn-fg)] font-semibold'
                                : 'text-[var(--ak-accent-ink)] font-semibold'
                          }
                        >
                          {tk.status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : threads.length === 0 ? (
              <div className="p-6 text-sm text-[var(--ak-muted)]">
                No academic threads yet. Course enrollment inquiries and educator Q&amp;A appear here.
              </div>
            ) : (
              <div className="divide-y divide-[var(--ak-divider)]">
                {threads.map((thr) => (
                  <button
                    key={thr.id}
                    type="button"
                    onClick={() => {
                      setSelectedThreadId(thr.id);
                      setEditingMsgId(null);
                    }}
                    className={`w-full px-4 py-3.5 text-left transition-colors ${
                      selectedThread?.id === thr.id
                        ? 'bg-[var(--ak-elevated)]'
                        : 'hover:bg-[var(--ak-elevated)]/60'
                    }`}
                  >
                    <p className="truncate text-sm font-semibold text-[var(--ak-ink)]">
                      {thr.contextTitle}
                    </p>
                    <p className="mt-1 truncate text-xs text-[var(--ak-muted)]">
                      {Object.values(thr.participantNames).join(' · ')}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Conversation column */}
          <div className="flex flex-col lg:col-span-8">
            {tab === 'SUPPORT' && selectedTicket ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ak-divider)] px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-[var(--ak-accent-ink)]" />
                      <h3 className="truncate text-sm font-semibold text-[var(--ak-ink)]">
                        {selectedTicket.subject}
                      </h3>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--ak-muted)]">
                      {selectedTicket.category} · Opened by {selectedTicket.userName} · Status:{' '}
                      {selectedTicket.status}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {currentUser.role === 'MASTER_ADMIN' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleTicketStatus(selectedTicket.id, 'IN_REVIEW')}
                          className="rounded-md border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
                        >
                          Mark In Review
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTicketStatus(selectedTicket.id, 'RESOLVED')}
                          className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-[#F8F5EE] hover:bg-emerald-600"
                        >
                          Resolve
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      title="Edit Ticket"
                      onClick={() => {
                        setEditingTicket((v) => !v);
                        setEditTicketSubject(selectedTicket.subject);
                        setEditTicketCategory(selectedTicket.category);
                        setEditTicketStatus(selectedTicket.status);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-ink-2)] hover:text-[var(--ak-ink)]"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      title="Delete Ticket"
                      onClick={() => handleDeleteTicket(selectedTicket.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--ak-err-bd)] bg-[var(--ak-err-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-err-fg)] hover:opacity-90"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>

                {editingTicket && (
                  <form
                    onSubmit={handleUpdateTicket}
                    className="grid gap-3 border-b border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-4 sm:grid-cols-3"
                  >
                    <input
                      type="text"
                      required
                      value={editTicketSubject}
                      onChange={(e) => setEditTicketSubject(e.target.value)}
                      className={fieldCls}
                    />
                    <select
                      value={editTicketCategory}
                      onChange={(e) =>
                        setEditTicketCategory(e.target.value as SupportTicket['category'])
                      }
                      className={fieldCls}
                    >
                      <option value="KYC_APPEAL">KYC_APPEAL</option>
                      <option value="SUBSCRIPTION">SUBSCRIPTION</option>
                      <option value="CONTENT_REPORT">CONTENT_REPORT</option>
                      <option value="ACADEMIC_DISPUTE">ACADEMIC_DISPUTE</option>
                      <option value="GENERAL">GENERAL</option>
                    </select>
                    <div className="flex gap-2">
                      {currentUser.role === 'MASTER_ADMIN' && (
                        <select
                          value={editTicketStatus}
                          onChange={(e) =>
                            setEditTicketStatus(e.target.value as SupportTicket['status'])
                          }
                          className={fieldCls}
                        >
                          <option value="OPEN">OPEN</option>
                          <option value="IN_REVIEW">IN_REVIEW</option>
                          <option value="RESOLVED">RESOLVED</option>
                        </select>
                      )}
                      <button
                        type="submit"
                        className="rounded-lg bg-[#C9642E] px-3 py-1.5 text-xs font-semibold text-[#F8F5EE] shrink-0"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                )}

                <div className="flex-1 space-y-3 overflow-y-auto p-5 max-h-[360px]">
                  {selectedTicket.messages.map((m) => {
                    const canModifyMsg =
                      currentUser.role === 'MASTER_ADMIN' || m.senderId === currentUser.id;
                    const isMine = m.senderId === currentUser.id;
                    return (
                      <div
                        key={m.id}
                        className={`rounded-lg border px-4 py-3 text-sm ${
                          isMine
                            ? 'ml-6 border-[#C9642E]/45 bg-[var(--ak-elevated)]'
                            : 'mr-6 border-[var(--ak-divider)] bg-[var(--ak-recessed)]'
                        }`}
                      >
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ak-muted)]">
                          <span className="font-semibold text-[var(--ak-accent-ink)]">
                            {m.senderName} · {m.senderRole.replace('_', ' ')}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums">
                              {new Date(m.timestamp).toLocaleString()}
                            </span>
                            {canModifyMsg && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMsgId(m.id);
                                    setEditingMsgBody(m.body);
                                  }}
                                  className="text-[var(--ak-muted)] hover:text-[var(--ak-ink)]"
                                  title="Edit message"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(m.id)}
                                  className="text-[var(--ak-muted)] hover:text-[var(--ak-err-fg)]"
                                  title="Delete message"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {editingMsgId === m.id ? (
                          <div className="mt-2 flex gap-2">
                            <input
                              type="text"
                              value={editingMsgBody}
                              onChange={(e) => setEditingMsgBody(e.target.value)}
                              className={fieldCls}
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveEditedMessage(m.id)}
                              className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingMsgId(null)}
                              className="rounded-lg border border-[var(--ak-border)] px-2.5 py-1 text-xs text-[var(--ak-ink-2)]"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-[var(--ak-ink)]">{m.body}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <form
                  onSubmit={handleSendReply}
                  className="flex items-center gap-2 border-t border-[var(--ak-divider)] p-4"
                >
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write an official reply..."
                    className={fieldCls}
                  />
                  <button
                    type="submit"
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] shrink-0"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {t.sendReply}
                  </button>
                </form>
              </>
            ) : tab === 'THREADS' && selectedThread ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ak-divider)] px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 shrink-0 text-[var(--ak-accent-ink)]" />
                      <h3 className="truncate text-sm font-semibold text-[var(--ak-ink)]">
                        {selectedThread.contextTitle}
                      </h3>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--ak-muted)]">
                      Participants: {Object.values(selectedThread.participantNames).join(' · ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteThread(selectedThread.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--ak-err-bd)] bg-[var(--ak-err-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-err-fg)] hover:opacity-90"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Thread
                  </button>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-5 max-h-[360px]">
                  {selectedThread.messages.map((m) => {
                    const canModifyMsg =
                      currentUser.role === 'MASTER_ADMIN' || m.senderId === currentUser.id;
                    const isMine = m.senderId === currentUser.id;
                    return (
                      <div
                        key={m.id}
                        className={`rounded-lg border px-4 py-3 text-sm ${
                          isMine
                            ? 'ml-6 border-[#C9642E]/45 bg-[var(--ak-elevated)]'
                            : 'mr-6 border-[var(--ak-divider)] bg-[var(--ak-recessed)]'
                        }`}
                      >
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ak-muted)]">
                          <span className="font-semibold text-[var(--ak-accent-ink)]">{m.senderName}</span>
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums">
                              {new Date(m.timestamp).toLocaleString()}
                            </span>
                            {canModifyMsg && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMsgId(m.id);
                                    setEditingMsgBody(m.body);
                                  }}
                                  className="text-[var(--ak-muted)] hover:text-[var(--ak-ink)]"
                                  title="Edit message"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(m.id)}
                                  className="text-[var(--ak-muted)] hover:text-[var(--ak-err-fg)]"
                                  title="Delete message"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {editingMsgId === m.id ? (
                          <div className="mt-2 flex gap-2">
                            <input
                              type="text"
                              value={editingMsgBody}
                              onChange={(e) => setEditingMsgBody(e.target.value)}
                              className={fieldCls}
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveEditedMessage(m.id)}
                              className="rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingMsgId(null)}
                              className="rounded-lg border border-[var(--ak-border)] px-2.5 py-1 text-xs text-[var(--ak-ink-2)]"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-[var(--ak-ink)]">{m.body}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <form
                  onSubmit={handleSendReply}
                  className="flex items-center gap-2 border-t border-[var(--ak-divider)] p-4"
                >
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Reply inside protected course thread..."
                    className={fieldCls}
                  />
                  <button
                    type="submit"
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#C9642E] px-4 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] shrink-0"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {t.sendReply}
                  </button>
                </form>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--ak-muted)]">
                Select a conversation on the left to view messages.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
