import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Eye,
  FileText,
  Hand,
  Mic,
  MicOff,
  Monitor,
  Pin,
  Send,
  Shield,
  Trash2,
  UserX,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { apiFetch, createAkademiSocket, fetchAuthorizedBlob } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type {
  LiveChatMessage,
  LiveSession,
  ResourceItem,
  UserProfile,
  UserRole,
} from '../types/akademi';
import { ContentInspectorModal, type InspectedContent } from './ContentInspectorModal';

interface LiveClassroomModalProps {
  sessionId: string;
  currentUser: UserProfile;
  hostLibrary?: ResourceItem[];
  onClose: () => void;
}

export const LiveClassroomModal: React.FC<LiveClassroomModalProps> = ({
  sessionId,
  currentUser,
  hostLibrary = [],
  onClose,
}) => {
  const { t, dir } = useI18n();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [pinnedResources, setPinnedResources] = useState<ResourceItem[]>([]);
  const [participantDirectory, setParticipantDirectory] = useState<
    Record<string, { id: string; name: string; role: UserRole }>
  >({});
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [activeSideTab, setActiveSideTab] = useState<'CHAT' | 'MATERIALS' | 'PEOPLE'>('CHAT');
  const [selectedResourceToPin, setSelectedResourceToPin] = useState('');
  const [inspectedDoc, setInspectedDoc] = useState<InspectedContent | null>(null);

  // Local media controls (WebRTC camera/mic preview + Audio-First low-data mode)
  const [camEnabled, setCamEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [lowDataMode, setLowDataMode] = useState(false);
  const [mediaNotice, setMediaNotice] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const isHost = Boolean(
    session &&
      (currentUser.id === session.hostId ||
        currentUser.role === 'MASTER_ADMIN' ||
        (currentUser.institutionId && session.institutionId === currentUser.institutionId))
  );

  useEffect(() => {
    let mounted = true;
    const initRoom = async () => {
      try {
        const data = await apiFetch<{
          session: LiveSession;
          pinnedResources: ResourceItem[];
          participantDirectory: Record<string, { id: string; name: string; role: UserRole }>;
        }>(`/api/sessions/${sessionId}/room`);
        if (!mounted) return;
        setSession(data.session);
        setPinnedResources(data.pinnedResources);
        setParticipantDirectory(data.participantDirectory);

        const ws = createAkademiSocket(
          (event, payload) => {
            if (!mounted) return;
            if (event === 'session:chat_message') {
              const msg = payload.message as LiveChatMessage;
              setSession((prev) => {
                if (!prev || prev.chatMessages.some((m) => m.id === msg.id)) return prev;
                return { ...prev, chatMessages: [...prev.chatMessages, msg] };
              });
            } else if (event === 'session:message_deleted') {
              const messageId = String(payload.messageId || '');
              setSession((prev) =>
                prev
                  ? {
                      ...prev,
                      chatMessages: prev.chatMessages.filter((m) => m.id !== messageId),
                    }
                  : prev
              );
            } else if (event === 'session:controls') {
              setSession((prev) =>
                prev
                  ? {
                      ...prev,
                      chatMuted: Boolean(payload.chatMuted),
                      qaMode: Boolean(payload.qaMode),
                    }
                  : prev
              );
            } else if (event === 'session:hands') {
              setSession((prev) =>
                prev
                  ? {
                      ...prev,
                      raisedHandUserIds: (payload.raisedHandUserIds as string[]) || [],
                      micGrantedUserIds: (payload.micGrantedUserIds as string[]) || [],
                    }
                  : prev
              );
            } else if (event === 'session:pinned_resources') {
              setPinnedResources((payload.pinnedResources as ResourceItem[]) || []);
            } else if (event === 'session:presence') {
              setSession((prev) =>
                prev
                  ? {
                      ...prev,
                      activeParticipantIds: (payload.activeParticipantIds as string[]) || [],
                    }
                  : prev
              );
              if (payload.participantDirectory) {
                setParticipantDirectory(
                  payload.participantDirectory as Record<
                    string,
                    { id: string; name: string; role: UserRole }
                  >
                );
              }
            } else if (event === 'session:status') {
              setSession((prev) =>
                prev ? { ...prev, status: payload.status as LiveSession['status'] } : prev
              );
            } else if (event === 'session:kicked') {
              setError('You were removed from this classroom by the host.');
            } else if (event === 'session:error') {
              setError(String(payload.error || 'Classroom error'));
            }
          },
          (connected) => {
            if (!mounted) return;
            setWsConnected(connected);
            if (connected && wsRef.current) {
              wsRef.current.send(
                JSON.stringify({ event: 'session:join', payload: { sessionId } })
              );
            }
          }
        );
        wsRef.current = ws;
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unable to enter live session.');
        }
      }
    };

    initRoom();

    return () => {
      mounted = false;
      wsRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [sessionId]);

  const toggleCamera = async () => {
    setMediaNotice('');
    if (camEnabled) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCamEnabled(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: micEnabled });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCamEnabled(true);
    } catch {
      setMediaNotice('Camera device unavailable in browser sandbox — audio/chat stage remains active.');
    }
  };

  const toggleScreenShare = async () => {
    setMediaNotice('');
    if (screenSharing) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setScreenSharing(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setScreenSharing(true);
    } catch {
      setMediaNotice('Screen sharing cancelled or unavailable in this browser context.');
    }
  };

  const toggleLowDataMode = () => {
    setLowDataMode((prev) => {
      const next = !prev;
      if (next) {
        streamRef.current?.getVideoTracks().forEach((t) => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
        setCamEnabled(false);
        setScreenSharing(false);
        setMediaNotice('Audio-first low-data mode enabled. Video paused to conserve mobile data.');
      } else {
        setMediaNotice('');
      }
      return next;
    });
  };

  const sendWs = (event: string, payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, payload }));
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendWs('session:chat', {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: chatInput.trim(),
    });
    setChatInput('');
  };

  const handleOpenPinned = async (r: ResourceItem, download = false) => {
    try {
      const blob = await fetchAuthorizedBlob(
        `/api/files/resource/${r.id}${download ? '?download=1' : ''}`
      );
      const url = URL.createObjectURL(blob);
      if (download && r.downloadable) {
        const a = document.createElement('a');
        a.href = url;
        a.download = blob.type === 'application/pdf' && !r.fileName.toLowerCase().endsWith('.pdf')
          ? `${r.fileName.replace(/\.[^.]+$/, '')}.pdf`
          : r.fileName;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      setInspectedDoc({
        title: r.title,
        subtitle: `${r.ownerName} · ${r.subject}`,
        fileName:
          blob.type === 'application/pdf' && !r.fileName.toLowerCase().endsWith('.pdf')
            ? `${r.fileName.replace(/\.[^.]+$/, '')}.pdf`
            : r.fileName,
        mimeType: blob.type || r.mimeType || 'application/pdf',
        objectUrl: url,
        blob,
        canDownload: r.downloadable,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open classroom document.');
    }
  };

  const isHandRaised = Boolean(session?.raisedHandUserIds.includes(currentUser.id));
  const hasMicGrant = Boolean(session?.micGrantedUserIds.includes(currentUser.id));

  return (
    <>
      <div
        dir={dir}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm"
        style={{ backgroundColor: 'var(--ak-backdrop)' }}
      >
        <div className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] text-[var(--ak-ink)] shadow-2xl">
          {/* Classroom Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ak-divider)] px-5 py-3.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5 text-sm text-[var(--ak-ink-2)]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--ak-ok-fg)]">
                  {wsConnected && (
                    <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  )}
                  {session?.status || 'CONNECTING'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{session?.courseTitle}</span>
                <span aria-hidden="true">·</span>
                <span>Host: {session?.hostName}</span>
              </div>
              <h2 className="mt-0.5 truncate text-lg font-bold text-[var(--ak-ink)]">
                {session?.title || 'Loading Live Classroom...'}
              </h2>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-mono-nums text-[var(--ak-muted)]">
                {session?.activeParticipantIds.length || 0} connected
              </span>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
              >
                <X className="h-4 w-4" />
                {t.leaveRoom}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="border-b px-5 py-2.5 text-xs"
              style={{
                color: 'var(--ak-err-fg)',
                backgroundColor: 'var(--ak-err-bg)',
                borderColor: 'var(--ak-err-bd)',
              }}
            >
              {error}
            </div>
          )}

          {/* Main Classroom Grid */}
          <div className="grid flex-1 overflow-hidden lg:grid-cols-12">
            {/* Presenter Stage (kept deep studio tone for video clarity) */}
            <div className="flex flex-col justify-between bg-[#081322] p-5 text-[#F6F3EB] lg:col-span-8">
              <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-xl border border-[#22354D] bg-[#0C1B2E]">
                {camEnabled || screenSharing ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="max-w-lg px-6 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#324966] bg-[#162942] text-xl font-bold text-[#F6F3EB]">
                      {session?.hostName?.slice(0, 2).toUpperCase() || 'AK'}
                    </div>
                    <h3 className="text-xl font-bold text-[#F6F3EB]">
                      {session?.hostName || 'Instructor Stage'}
                    </h3>
                    <p className="mt-2 text-base text-[#C8D1DD]">
                      {session?.topicSummary ||
                        'Authenticated real-time classroom stream with moderated Q&A and instant resource sharing.'}
                    </p>
                    <p className="mt-4 text-sm text-[#9FB0C4]">
                      {isHost
                        ? 'Use Camera or Screen Share below to broadcast to enrolled learners.'
                        : 'Audio/video is muted on entry. Raise your hand to request speaking access.'}
                    </p>
                  </div>
                )}

                {mediaNotice && (
                  <div className="absolute bottom-3 left-3 right-3 rounded-lg border border-amber-700/60 bg-amber-950/85 px-3.5 py-2.5 text-sm text-amber-200">
                    {mediaNotice}
                  </div>
                )}
              </div>

              {/* Stage Controls Bar */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(isHost || hasMicGrant) && (
                    <>
                      <button
                        type="button"
                        onClick={() => setMicEnabled((v) => !v)}
                        className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                          micEnabled
                            ? 'bg-[#1E5631] text-[#F6F3EB]'
                            : 'border border-[#324966] bg-[#162942] text-[#F6F3EB] hover:bg-[#1E3554]'
                        }`}
                      >
                        {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                        {micEnabled ? t.micLive : t.micMuted}
                      </button>
                      <button
                        type="button"
                        onClick={toggleCamera}
                        className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                          camEnabled
                            ? 'bg-[#A44A1C] text-[#F6F3EB]'
                            : 'border border-[#324966] bg-[#162942] text-[#F6F3EB] hover:bg-[#1E3554]'
                        }`}
                      >
                        {camEnabled ? (
                          <Video className="h-4 w-4" />
                        ) : (
                          <VideoOff className="h-4 w-4" />
                        )}
                        {camEnabled ? t.cameraOn : t.startCamera}
                      </button>
                    </>
                  )}

                  {isHost && (
                    <button
                      type="button"
                      onClick={toggleScreenShare}
                      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                        screenSharing
                          ? 'bg-[#A44A1C] text-[#F6F3EB]'
                          : 'border border-[#324966] bg-[#162942] text-[#F6F3EB] hover:bg-[#1E3554]'
                      }`}
                    >
                      <Monitor className="h-4 w-4" />
                      {screenSharing ? t.stopShare : t.shareScreen}
                    </button>
                  )}

                  {!isHost && (
                    <button
                      type="button"
                      onClick={() => sendWs('session:raise_hand', { raised: !isHandRaised })}
                      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                        isHandRaised
                          ? 'bg-[#A44A1C] text-[#F6F3EB]'
                          : 'border border-[#324966] bg-[#162942] text-[#F6F3EB] hover:bg-[#1E3554]'
                      }`}
                    >
                      <Hand className="h-4 w-4" />
                      {isHandRaised ? t.handRaised : t.raiseHand}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={toggleLowDataMode}
                    className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors ${
                      lowDataMode
                        ? 'border-emerald-600 bg-emerald-950/70 text-emerald-200'
                        : 'border-[#324966] bg-[#162942] text-[#F6F3EB] hover:bg-[#1E3554]'
                    }`}
                  >
                    {lowDataMode ? t.audioFirstOn : t.audioFirstMode}
                  </button>
                </div>

                {isHost && session && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => sendWs('session:moderate', { action: 'TOGGLE_MUTE' })}
                      className={`min-h-[40px] rounded-lg border px-3.5 py-1.5 text-sm font-semibold ${
                        session.chatMuted
                          ? 'border-red-600 bg-red-950/70 text-red-200'
                          : 'border-[#324966] bg-[#162942] text-[#F6F3EB] hover:bg-[#1E3554]'
                      }`}
                    >
                      {session.chatMuted ? t.unmuteChat : t.muteChat}
                    </button>
                    <button
                      type="button"
                      onClick={() => sendWs('session:moderate', { action: 'TOGGLE_QA' })}
                      className={`min-h-[40px] rounded-lg border px-3.5 py-1.5 text-sm font-semibold ${
                        session.qaMode
                          ? 'border-amber-500 bg-amber-950/70 text-amber-200'
                          : 'border-[#324966] bg-[#162942] text-[#F6F3EB] hover:bg-[#1E3554]'
                      }`}
                    >
                      {session.qaMode ? t.qaModeActive : t.enableQaMode}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Classroom Sidebar: Chat, Pinned Materials, Participants */}
            <div className="flex flex-col border-t border-[var(--ak-divider)] bg-[var(--ak-surface)] lg:col-span-4 lg:border-t-0 lg:border-s">
              <div className="grid grid-cols-3 border-b border-[var(--ak-divider)] p-1.5">
                <button
                  type="button"
                  onClick={() => setActiveSideTab('CHAT')}
                  className={`rounded-md py-2 text-sm font-semibold transition-colors ${
                    activeSideTab === 'CHAT'
                      ? 'bg-[var(--ak-elevated)] text-[var(--ak-ink)]'
                      : 'text-[var(--ak-muted)] hover:text-[var(--ak-ink)]'
                  }`}
                >
                  {t.liveChatTab} ({session?.chatMessages.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSideTab('MATERIALS')}
                  className={`rounded-md py-2 text-sm font-semibold transition-colors ${
                    activeSideTab === 'MATERIALS'
                      ? 'bg-[var(--ak-elevated)] text-[var(--ak-ink)]'
                      : 'text-[var(--ak-muted)] hover:text-[var(--ak-ink)]'
                  }`}
                >
                  {t.liveMaterialsTab} ({pinnedResources.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSideTab('PEOPLE')}
                  className={`rounded-md py-2 text-sm font-semibold transition-colors ${
                    activeSideTab === 'PEOPLE'
                      ? 'bg-[var(--ak-elevated)] text-[var(--ak-ink)]'
                      : 'text-[var(--ak-muted)] hover:text-[var(--ak-ink)]'
                  }`}
                >
                  {t.livePeopleTab} ({session?.activeParticipantIds.length || 0})
                </button>
              </div>

              {activeSideTab === 'CHAT' && (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex-1 space-y-3 overflow-y-auto p-4">
                    {session?.chatMessages.length === 0 ? (
                      <p className="text-sm text-[var(--ak-muted)]">
                        No messages yet. Ask a question or share discussion notes below.
                      </p>
                    ) : (
                      session?.chatMessages.map((m) => (
                        <div
                          key={m.id}
                          className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-3 text-sm"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="font-semibold text-[var(--ak-ink)]">
                              {m.senderName}
                              {m.isQuestion && (
                                <span className="ml-2 text-[var(--ak-warn-fg)]">[Question]</span>
                              )}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono-nums text-[var(--ak-muted)]">
                                {new Date(m.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {isHost && (
                                <button
                                  type="button"
                                  title="Delete message"
                                  onClick={() =>
                                    sendWs('session:moderate', {
                                      action: 'DELETE_MESSAGE',
                                      messageId: m.id,
                                    })
                                  }
                                  className="text-[var(--ak-muted)] hover:text-[var(--ak-err-fg)]"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-[var(--ak-ink-2)]">{m.text}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <form
                    onSubmit={handleSendChat}
                    className="flex items-center gap-2 border-t border-[var(--ak-divider)] p-3"
                  >
                    <input
                      type="text"
                      disabled={Boolean(session?.chatMuted && !isHost)}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={
                        session?.chatMuted && !isHost
                          ? 'Chat muted by instructor'
                          : session?.qaMode
                            ? 'Submit a question...'
                            : 'Message class...'
                      }
                      className="min-h-[42px] flex-1 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3 py-2 text-sm text-[var(--ak-ink)] placeholder:text-[var(--ak-muted)] focus:border-[#C9642E] focus:outline-none disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={Boolean(session?.chatMuted && !isHost)}
                      className="min-h-[42px] rounded-lg bg-[#C9642E] px-3 text-[#F8F5EE] hover:bg-[#D8733C] disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              )}

              {activeSideTab === 'MATERIALS' && (
                <div className="flex flex-1 flex-col overflow-y-auto p-4 space-y-4">
                  {isHost && hostLibrary.length > 0 && (
                    <div className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-3 space-y-2">
                      <p className="text-sm font-semibold text-[var(--ak-ink)]">
                        Push Resource from Your Vault to Class
                      </p>
                      <div className="flex gap-2">
                        <select
                          value={selectedResourceToPin}
                          onChange={(e) => setSelectedResourceToPin(e.target.value)}
                          className="min-h-[40px] flex-1 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-surface)] px-2.5 py-1.5 text-sm text-[var(--ak-ink)]"
                        >
                          <option value="">Select file to share...</option>
                          {hostLibrary.map((r) => (
                            <option key={r.id} value={r.id}>
                              [{r.type}] {r.title}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!selectedResourceToPin}
                          onClick={() => {
                            if (!selectedResourceToPin) return;
                            sendWs('session:moderate', {
                              action: 'PIN_RESOURCE',
                              resourceId: selectedResourceToPin,
                            });
                            setSelectedResourceToPin('');
                          }}
                          className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-[#C9642E] px-3.5 py-1.5 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] disabled:opacity-40"
                        >
                          <Pin className="h-4 w-4" />
                          Push
                        </button>
                      </div>
                    </div>
                  )}

                  {pinnedResources.length === 0 ? (
                    <p className="text-xs text-[var(--ak-muted)]">
                      No resources pinned yet. Files shared by the host appear here as documents.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {pinnedResources.map((r) => (
                        <div
                          key={r.id}
                          className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-xs text-[var(--ak-muted)]">
                                <FileText className="h-3.5 w-3.5 text-[var(--ak-accent-ink)]" />
                                <span>{r.type}</span>
                                <span aria-hidden="true">·</span>
                                <span>{r.fileSizeLabel}</span>
                              </div>
                              <p className="mt-1 text-xs font-semibold text-[var(--ak-ink)]">
                                {r.title}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleOpenPinned(r, false)}
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
                              >
                                <Eye className="h-3 w-3" />
                                View
                              </button>
                              {r.downloadable && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPinned(r, true)}
                                  className="inline-flex items-center gap-1 rounded-md bg-[#C9642E] px-2.5 py-1 text-xs font-semibold text-[#F8F5EE] hover:bg-[#D8733C]"
                                >
                                  <Download className="h-3 w-3" />
                                  Save
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

              {activeSideTab === 'PEOPLE' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {session?.activeParticipantIds.map((pid) => {
                    const person = participantDirectory[pid];
                    const raised = session.raisedHandUserIds.includes(pid);
                    const micOk = session.micGrantedUserIds.includes(pid);
                    const isSelf = pid === currentUser.id;
                    return (
                      <div
                        key={pid}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] px-3 py-2.5 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--ak-ink)]">
                            {person?.name || pid} {isSelf ? '(You)' : ''}
                          </p>
                          <p className="text-[var(--ak-muted)]">
                            {person?.role.replace('_', ' ') || 'Attendee'}
                            {raised ? ' · Hand Raised' : ''}
                            {micOk ? ' · Mic Granted' : ''}
                          </p>
                        </div>
                        {isHost && !isSelf && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              title={micOk ? 'Revoke mic' : 'Grant mic'}
                              onClick={() =>
                                sendWs('session:moderate', {
                                  action: 'GRANT_MIC',
                                  targetUserId: pid,
                                })
                              }
                              className={`rounded border px-2 py-1 ${
                                micOk
                                  ? 'border-emerald-600 text-[var(--ak-ok-fg)]'
                                  : 'border-[var(--ak-border)] text-[var(--ak-ink-2)] hover:bg-[var(--ak-elevated)]'
                              }`}
                            >
                              <Shield className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              title="Remove participant"
                              onClick={() =>
                                sendWs('session:moderate', {
                                  action: 'KICK_USER',
                                  targetUserId: pid,
                                })
                              }
                              className="rounded border border-[var(--ak-border)] p-1 text-[var(--ak-err-fg)] hover:bg-[var(--ak-err-bg)]"
                            >
                              <UserX className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(!session || session.activeParticipantIds.length === 0) && (
                    <div className="flex items-center gap-2 text-xs text-[var(--ak-muted)]">
                      <Users className="h-4 w-4" />
                      Connecting room roster...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ContentInspectorModal item={inspectedDoc} onClose={() => setInspectedDoc(null)} />
    </>
  );
};
