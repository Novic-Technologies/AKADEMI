import React, { useEffect, useState } from 'react';
import { MessageSquare, Send, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type { DirectMessageThread, SupportTicket, UserProfile } from '../types/akademi';

interface CommunicationPanelProps {
  currentUser: UserProfile;
  availableRecipients?: { id: string; name: string; label: string }[];
  defaultTab?: 'THREADS' | 'SUPPORT';
}

export const CommunicationPanel: React.FC<CommunicationPanelProps> = ({
  currentUser,
  availableRecipients = [],
  defaultTab = 'THREADS',
}) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<'THREADS' | 'SUPPORT'>(
    currentUser.role === 'MASTER_ADMIN' ? 'SUPPORT' : defaultTab
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
  const [ticketCategory, setTicketCategory] = useState<SupportTicket['category']>('GENERAL');
  const [ticketBody, setTicketBody] = useState('');

  // New Thread form
  const [showNewThread, setShowNewThread] = useState(false);
  const [recipientId, setRecipientId] = useState('');
  const [threadTitle, setThreadTitle] = useState('');
  const [threadBody, setThreadBody] = useState('');

  const loadInbox = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<{ tickets: SupportTicket[]; threads: DirectMessageThread[] }>(
        '/api/communication/inbox'
      );
      setTickets(data.tickets);
      setThreads(data.threads);
      if (!selectedTicketId && data.tickets.length > 0) setSelectedTicketId(data.tickets[0].id);
      if (!selectedThreadId && data.threads.length > 0) setSelectedThreadId(data.threads[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load inbox.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInbox();
  }, [currentUser.id]);

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || tickets[0];
  const selectedThread = threads.find((t) => t.id === selectedThreadId) || threads[0];

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
        setTickets((prev) => prev.map((t) => (t.id === res.ticket.id ? res.ticket : t)));
      } else if (tab === 'THREADS' && selectedThread) {
        const res = await apiFetch<{ thread: DirectMessageThread }>(
          `/api/messages/${selectedThread.id}/reply`,
          {
            method: 'POST',
            body: JSON.stringify({ body: replyText }),
          }
        );
        setThreads((prev) => prev.map((t) => (t.id === res.thread.id ? res.thread : t)));
      }
      setReplyText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply.');
    }
  };

  const handleTicketStatus = async (ticketId: string, status: SupportTicket['status']) => {
    try {
      const res = await apiFetch<{ ticket: SupportTicket }>(`/api/tickets/${ticketId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ body: `Case status updated to ${status}.`, status }),
      });
      setTickets((prev) => prev.map((t) => (t.id === res.ticket.id ? res.ticket : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update ticket status.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#C8BFA8] pb-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {t.commsHeading}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {t.commsSub}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#E6E0D3] p-1">
            <button
              type="button"
              onClick={() => setTab('THREADS')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                tab === 'THREADS'
                  ? 'bg-[#F6F3EB] text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.tabAcademicThreads} ({threads.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('SUPPORT')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                tab === 'SUPPORT'
                  ? 'bg-[#F6F3EB] text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.tabMasterAdminDesk} ({tickets.length})
            </button>
          </div>

          {tab === 'SUPPORT' && currentUser.role !== 'MASTER_ADMIN' && (
            <button
              type="button"
              onClick={() => setShowNewTicket((v) => !v)}
              className="rounded-lg bg-[#0C1B2E] px-4 py-2 text-sm font-medium text-white hover:bg-[#1A2F4A] whitespace-nowrap shrink-0"
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
              className="rounded-lg bg-[#0C1B2E] px-4 py-2 text-sm font-medium text-white hover:bg-[#1A2F4A] whitespace-nowrap shrink-0"
            >
              {t.newMessageThread}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {showNewTicket && tab === 'SUPPORT' && (
        <form
          onSubmit={handleCreateTicket}
          className="space-y-4 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Submit Support or Compliance Ticket to Master Admin
            </h3>
            <button
              type="button"
              onClick={() => setShowNewTicket(false)}
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
              <select
                value={ticketCategory}
                onChange={(e) => setTicketCategory(e.target.value as SupportTicket['category'])}
                className="w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3 py-2 text-sm text-slate-900"
              >
                <option value="KYC_APPEAL">KYC / ID Verification Inquiry</option>
                <option value="SUBSCRIPTION">Subscription &amp; Billing</option>
                <option value="CONTENT_REPORT">Report Content / Copyright</option>
                <option value="ACADEMIC_DISPUTE">Academic Verification Dispute</option>
                <option value="GENERAL">General Platform Support</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Subject</label>
              <input
                type="text"
                required
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
                placeholder="Brief summary of your request"
                className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Message</label>
            <textarea
              required
              rows={3}
              value={ticketBody}
              onChange={(e) => setTicketBody(e.target.value)}
              placeholder="Provide details for the Master Admin support team..."
              className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-[#0C1B2E] px-4 py-2 text-sm font-medium text-white hover:bg-[#1A2F4A]"
          >
            Submit Ticket
          </button>
        </form>
      )}

      {showNewThread && tab === 'THREADS' && availableRecipients.length > 0 && (
        <form
          onSubmit={handleCreateThread}
          className="space-y-4 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Start Protected Academic Thread
            </h3>
            <button
              type="button"
              onClick={() => setShowNewThread(false)}
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Recipient</label>
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3 py-2 text-sm text-slate-900"
              >
                {availableRecipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.label})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Topic</label>
              <input
                type="text"
                required
                value={threadTitle}
                onChange={(e) => setThreadTitle(e.target.value)}
                placeholder="e.g. Prerequisite check or syllabus question"
                className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Message</label>
            <textarea
              required
              rows={3}
              value={threadBody}
              onChange={(e) => setThreadBody(e.target.value)}
              placeholder="Write your academic message (confidential contact info stays protected)..."
              className="w-full rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-[#0C1B2E] px-4 py-2 text-sm font-medium text-white hover:bg-[#1A2F4A]"
          >
            Send Message
          </button>
        </form>
      )}

      {loading ? (
        <div className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-8 text-center text-sm text-slate-500">
          Loading communication channels...
        </div>
      ) : (
        <div className="grid min-h-[420px] overflow-hidden rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] lg:grid-cols-12">
          {/* List column */}
          <div className="border-b border-[#C8BFA8] lg:col-span-4 lg:border-b-0 lg:border-r">
            {tab === 'SUPPORT' ? (
              tickets.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">
                  No support tickets yet. Open a ticket anytime to reach Master Admin support.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {tickets.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTicketId(t.id)}
                      className={`w-full px-4 py-3.5 text-left transition-colors ${
                        selectedTicket?.id === t.id ? 'bg-[#EFECE3]' : 'hover:bg-[#EFECE3]/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">
                          {t.subject}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                        <span>{t.userName}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            t.status === 'RESOLVED'
                              ? 'text-emerald-700 font-medium'
                              : t.status === 'IN_REVIEW'
                                ? 'text-amber-700 font-medium'
                                : 'text-blue-900 font-medium'
                          }
                        >
                          {t.status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : threads.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                No academic threads yet. Course enrollment inquiries and educator Q&amp;A appear here.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {threads.map((thr) => (
                  <button
                    key={thr.id}
                    type="button"
                    onClick={() => setSelectedThreadId(thr.id)}
                    className={`w-full px-4 py-3.5 text-left transition-colors ${
                      selectedThread?.id === thr.id ? 'bg-[#EFECE3]' : 'hover:bg-[#EFECE3]/70'
                    }`}
                  >
                    <p className="truncate text-sm font-medium text-slate-900">
                      {thr.contextTitle}
                    </p>
                    <p className="mt-1 truncate text-sm text-slate-500">
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
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#C8BFA8] px-5 py-3.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-blue-900" />
                      <h3 className="text-sm font-semibold text-slate-900">
                        {selectedTicket.subject}
                      </h3>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {selectedTicket.category} · Opened by {selectedTicket.userName} · Status:{' '}
                      {selectedTicket.status}
                    </p>
                  </div>
                  {currentUser.role === 'MASTER_ADMIN' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleTicketStatus(selectedTicket.id, 'IN_REVIEW')}
                        className="rounded-md border border-[#C8BFA8] px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-[#EFECE3]"
                      >
                        Mark In Review
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTicketStatus(selectedTicket.id, 'RESOLVED')}
                        className="rounded-md bg-emerald-700 px-2.5 py-1 text-sm font-medium text-white hover:bg-emerald-800"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-5 max-h-[340px]">
                  {selectedTicket.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-lg border px-4 py-3 text-sm ${
                        m.senderId === currentUser.id
                          ? 'ml-8 border-blue-200 bg-blue-50/50'
                          : 'mr-8 border-[#C8BFA8] bg-[#EFECE3]'
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between text-sm text-slate-500">
                        <span className="font-medium text-slate-800">
                          {m.senderName} · {m.senderRole.replace('_', ' ')}
                        </span>
                        <span className="tabular-nums">
                          {new Date(m.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-slate-800">{m.body}</p>
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={handleSendReply}
                  className="flex items-center gap-2 border-t border-[#C8BFA8] p-4"
                >
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write an official reply..."
                    className="flex-1 rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0C1B2E] px-4 py-2 text-sm font-medium text-white hover:bg-[#1A2F4A]"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {t.sendReply}
                  </button>
                </form>
              </>
            ) : tab === 'THREADS' && selectedThread ? (
              <>
                <div className="border-b border-[#C8BFA8] px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-blue-900" />
                    <h3 className="text-sm font-semibold text-slate-900">
                      {selectedThread.contextTitle}
                    </h3>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Participants: {Object.values(selectedThread.participantNames).join(' · ')}
                  </p>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-5 max-h-[340px]">
                  {selectedThread.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-lg border px-4 py-3 text-sm ${
                        m.senderId === currentUser.id
                          ? 'ml-8 border-blue-200 bg-blue-50/50'
                          : 'mr-8 border-[#C8BFA8] bg-[#EFECE3]'
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between text-sm text-slate-500">
                        <span className="font-medium text-slate-800">{m.senderName}</span>
                        <span className="tabular-nums">
                          {new Date(m.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-slate-800">{m.body}</p>
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={handleSendReply}
                  className="flex items-center gap-2 border-t border-[#C8BFA8] p-4"
                >
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Reply inside protected course thread..."
                    className="flex-1 rounded-lg border border-[#C8BFA8] px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0C1B2E] px-4 py-2 text-sm font-medium text-white hover:bg-[#1A2F4A]"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {t.sendReply}
                  </button>
                </form>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
                Select a conversation on the left to view messages.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
