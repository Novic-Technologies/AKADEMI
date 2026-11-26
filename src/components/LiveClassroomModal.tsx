import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart2,
  Check,
  Crosshair,
  Download,
  Eraser,
  Eye,
  FileText,
  Hand,
  Highlighter,
  Mic,
  MicOff,
  Monitor,
  PenTool,
  Pin,
  Plus,
  Send,
  Shield,
  Trash2,
  Type,
  Undo2,
  UserX,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { apiFetch, createAkademiSocket, fetchAuthorizedBlob } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type {
  BoardPointerState,
  LiveChatMessage,
  LivePoll,
  LiveSession,
  ResourceItem,
  UserProfile,
  UserRole,
  WhiteboardPoint,
  WhiteboardStroke,
} from '../types/akademi';
import { ContentInspectorModal, type InspectedContent } from './ContentInspectorModal';

interface LiveClassroomModalProps {
  sessionId: string;
  currentUser: UserProfile;
  hostLibrary?: ResourceItem[];
  onClose: () => void;
}

interface RtcConfigResponse {
  mode: 'LIVEKIT_SFU' | 'WEBRTC_MESH';
  livekitUrl?: string;
  roomName: string;
  token?: string;
  iceServers: RTCIceServer[];
}

interface PeerMediaFlags {
  micEnabled: boolean;
  camEnabled: boolean;
  screenSharing: boolean;
}

const RemoteMediaTile: React.FC<{
  name: string;
  stream: MediaStream;
  lowDataMode: boolean;
  mediaFlags?: PeerMediaFlags;
}> = ({ name, stream, lowDataMode, mediaFlags }) => {
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const hasVideo = stream.getVideoTracks().some((tr) => tr.readyState === 'live') && !lowDataMode;

  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-[#2C425E] bg-[#102136]">
      <video
        ref={mediaRef}
        autoPlay
        playsInline
        className={hasVideo ? 'h-28 w-full object-cover' : 'h-0 w-0 opacity-0'}
      />
      {!hasVideo && (
        <div className="flex h-28 flex-col items-center justify-center px-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#3B577A] bg-[#182E49] text-xs font-bold text-[#F6F3EB]">
            {name.slice(0, 2).toUpperCase()}
          </div>
          <p className="mt-1.5 truncate text-xs font-semibold text-[#F6F3EB]">{name}</p>
          <p className="text-[11px] text-[#9FB0C4]">
            {lowDataMode ? 'Audio-only active' : mediaFlags?.micEnabled ? 'Microphone live' : 'Connected'}
          </p>
        </div>
      )}
      <div className="flex items-center justify-between bg-[#081322]/90 px-2.5 py-1 text-[11px] text-[#E5E9F0]">
        <span className="truncate font-medium">{name}</span>
        <span className="shrink-0 text-[#9FB0C4]">
          {mediaFlags?.micEnabled ? 'Mic On' : 'Muted'}
        </span>
      </div>
    </div>
  );
};

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
  const [activeSideTab, setActiveSideTab] = useState<'CHAT' | 'POLLS' | 'MATERIALS' | 'PEOPLE'>('CHAT');
  const [stageView, setStageView] = useState<'STAGE' | 'BOARD'>('STAGE');
  const [selectedResourceToPin, setSelectedResourceToPin] = useState('');
  const [inspectedDoc, setInspectedDoc] = useState<InspectedContent | null>(null);

  // WebRTC multi-participant state
  const [rtcMode, setRtcMode] = useState<'WEBRTC_MESH' | 'LIVEKIT_SFU'>('WEBRTC_MESH');
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([
    { urls: 'stun:stun.l.google.com:19302' },
  ]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [peerMedia, setPeerMedia] = useState<Record<string, PeerMediaFlags>>({});
  const [camEnabled, setCamEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [lowDataMode, setLowDataMode] = useState(false);
  const [mediaNotice, setMediaNotice] = useState('');

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Collaborative Whiteboard & Laser Pointer state
  const [boardTool, setBoardTool] = useState<'PEN' | 'HIGHLIGHTER' | 'TEXT' | 'POINTER'>('PEN');
  const [boardColor, setBoardColor] = useState('#F6F3EB');
  const [boardWidth, setBoardWidth] = useState(3);
  const [boardTextDraft, setBoardTextDraft] = useState('');
  const [boardPointer, setBoardPointer] = useState<BoardPointerState | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingStrokeRef = useRef<WhiteboardPoint[] | null>(null);
  const lastPointerSentRef = useRef<number>(0);

  // Polls Builder state
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['Yes, clear', 'Need another example', 'Slow down slightly']);

  const isHost = Boolean(
    session &&
      (currentUser.id === session.hostId ||
        currentUser.role === 'MASTER_ADMIN' ||
        (currentUser.institutionId && session.institutionId === currentUser.institutionId))
  );

  const sendWs = useCallback((event: string, payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, payload }));
    }
  }, []);

  const closePeerConnection = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.close();
      peerConnectionsRef.current.delete(peerId);
    }
    pendingIceRef.current.delete(peerId);
    setRemoteStreams((prev) => {
      if (!prev[peerId]) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const getOrCreatePeerConnection = useCallback(
    (peerId: string): RTCPeerConnection => {
      const existing = peerConnectionsRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers });
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      pc.onicecandidate = (evt) => {
        if (evt.candidate) {
          sendWs('webrtc:signal', {
            targetUserId: peerId,
            signalType: 'ice',
            candidate: evt.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (evt) => {
        const [stream] = evt.streams;
        if (stream) {
          setRemoteStreams((prev) => ({ ...prev, [peerId]: stream }));
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          closePeerConnection(peerId);
        }
      };

      peerConnectionsRef.current.set(peerId, pc);
      return pc;
    },
    [iceServers, sendWs, closePeerConnection]
  );

  const sendOfferToPeer = useCallback(
    async (peerId: string) => {
      try {
        const pc = getOrCreatePeerConnection(peerId);
        // Ensure local tracks are attached cleanly before offer
        const existingSenders = pc.getSenders();
        if (localStreamRef.current) {
          for (const track of localStreamRef.current.getTracks()) {
            const matchedSender = existingSenders.find((s) => s.track?.kind === track.kind);
            if (matchedSender) {
              await matchedSender.replaceTrack(track);
            } else {
              pc.addTrack(track, localStreamRef.current);
            }
          }
        }
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        sendWs('webrtc:signal', {
          targetUserId: peerId,
          signalType: 'offer',
          sdp: pc.localDescription,
        });
      } catch {
        // Ignore transient signaling race in headless/sandbox environments
      }
    },
    [getOrCreatePeerConnection, sendWs]
  );

  const handleIncomingWebRtcSignal = useCallback(
    async (payload: Record<string, unknown>) => {
      const fromUserId = String(payload.fromUserId || '');
      const signalType = String(payload.signalType || '');
      if (!fromUserId || fromUserId === currentUser.id) return;

      const pc = getOrCreatePeerConnection(fromUserId);
      try {
        if (signalType === 'offer' && payload.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp as RTCSessionDescriptionInit));
          if (localStreamRef.current) {
            const existingSenders = pc.getSenders();
            for (const track of localStreamRef.current.getTracks()) {
              const matched = existingSenders.find((s) => s.track?.kind === track.kind);
              if (!matched) {
                pc.addTrack(track, localStreamRef.current);
              }
            }
          }
          const queued = pendingIceRef.current.get(fromUserId) || [];
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
          pendingIceRef.current.delete(fromUserId);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendWs('webrtc:signal', {
            targetUserId: fromUserId,
            signalType: 'answer',
            sdp: pc.localDescription,
          });
        } else if (signalType === 'answer' && payload.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp as RTCSessionDescriptionInit));
          const queued = pendingIceRef.current.get(fromUserId) || [];
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
          pendingIceRef.current.delete(fromUserId);
        } else if (signalType === 'ice' && payload.candidate) {
          const cand = payload.candidate as RTCIceCandidateInit;
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } else {
            const arr = pendingIceRef.current.get(fromUserId) || [];
            arr.push(cand);
            pendingIceRef.current.set(fromUserId, arr);
          }
        }
      } catch {
        // Ignore stale ICE/SDP mismatch
      }
    },
    [currentUser.id, getOrCreatePeerConnection, sendWs]
  );

  useEffect(() => {
    let mounted = true;
    const initRoom = async () => {
      try {
        const [data, rtc] = await Promise.all([
          apiFetch<{
            session: LiveSession;
            pinnedResources: ResourceItem[];
            participantDirectory: Record<string, { id: string; name: string; role: UserRole }>;
          }>(`/api/sessions/${sessionId}/room`),
          apiFetch<RtcConfigResponse>(`/api/sessions/${sessionId}/rtc-config`).catch(() => ({
            mode: 'WEBRTC_MESH' as const,
            roomName: sessionId,
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          })),
        ]);
        if (!mounted) return;
        setSession(data.session);
        setPinnedResources(data.pinnedResources);
        setParticipantDirectory(data.participantDirectory);
        setBoardPointer(data.session.boardPointer || null);
        setRtcMode(rtc.mode);
        if (rtc.iceServers && rtc.iceServers.length > 0) {
          setIceServers(rtc.iceServers);
        }

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
              const activeIds = (payload.activeParticipantIds as string[]) || [];
              setSession((prev) =>
                prev ? { ...prev, activeParticipantIds: activeIds } : prev
              );
              if (payload.participantDirectory) {
                setParticipantDirectory(
                  payload.participantDirectory as Record<
                    string,
                    { id: string; name: string; role: UserRole }
                  >
                );
              }
              // Clean up departed peers
              for (const pid of Array.from(peerConnectionsRef.current.keys())) {
                if (!activeIds.includes(pid)) {
                  closePeerConnection(pid);
                }
              }
              // Deterministic handshake initiation
              for (const pid of activeIds) {
                if (pid !== currentUser.id && currentUser.id < pid && !peerConnectionsRef.current.has(pid)) {
                  sendOfferToPeer(pid);
                }
              }
            } else if (event === 'session:status') {
              setSession((prev) =>
                prev ? { ...prev, status: payload.status as LiveSession['status'] } : prev
              );
            } else if (event === 'session:board_stroke') {
              const stroke = payload.stroke as WhiteboardStroke;
              setSession((prev) => {
                if (!prev) return prev;
                const existing = prev.whiteboardStrokes || [];
                if (existing.some((s) => s.id === stroke.id)) return prev;
                return { ...prev, whiteboardStrokes: [...existing, stroke] };
              });
            } else if (event === 'session:board_sync') {
              const strokes = (payload.strokes as WhiteboardStroke[]) || [];
              setSession((prev) => (prev ? { ...prev, whiteboardStrokes: strokes } : prev));
            } else if (event === 'session:board_pointer') {
              setBoardPointer((payload.pointer as BoardPointerState | null) || null);
            } else if (event === 'session:polls_sync') {
              const polls = (payload.polls as LivePoll[]) || [];
              setSession((prev) => (prev ? { ...prev, polls } : prev));
            } else if (event === 'webrtc:signal') {
              handleIncomingWebRtcSignal(payload);
            } else if (event === 'webrtc:peer_media') {
              const uid = String(payload.userId || '');
              if (uid) {
                setPeerMedia((prev) => ({
                  ...prev,
                  [uid]: {
                    micEnabled: Boolean(payload.micEnabled),
                    camEnabled: Boolean(payload.camEnabled),
                    screenSharing: Boolean(payload.screenSharing),
                  },
                }));
              }
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
      localStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      for (const pc of peerConnectionsRef.current.values()) {
        pc.close();
      }
      peerConnectionsRef.current.clear();
    };
  }, [sessionId]);

  // Broadcast media track updates to peers
  const syncLocalTracksToPeers = useCallback(
    async (nextMic: boolean, nextCam: boolean, nextScreen: boolean) => {
      sendWs('webrtc:media_state', {
        micEnabled: nextMic,
        camEnabled: nextCam,
        screenSharing: nextScreen,
      });
      if (!session) return;
      for (const pid of session.activeParticipantIds) {
        if (pid !== currentUser.id) {
          await sendOfferToPeer(pid);
        }
      }
    },
    [session, currentUser.id, sendWs, sendOfferToPeer]
  );

  const toggleMic = async () => {
    setMediaNotice('');
    if (micEnabled) {
      localStreamRef.current?.getAudioTracks().forEach((tr) => {
        tr.enabled = false;
      });
      setMicEnabled(false);
      await syncLocalTracksToPeers(false, camEnabled, screenSharing);
      return;
    }
    try {
      if (!localStreamRef.current || localStreamRef.current.getAudioTracks().length === 0) {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!localStreamRef.current) {
          localStreamRef.current = audioStream;
        } else {
          for (const tr of audioStream.getAudioTracks()) {
            localStreamRef.current.addTrack(tr);
          }
        }
      } else {
        localStreamRef.current.getAudioTracks().forEach((tr) => {
          tr.enabled = true;
        });
      }
      setMicEnabled(true);
      await syncLocalTracksToPeers(true, camEnabled, screenSharing);
    } catch {
      setMediaNotice('Microphone unavailable in browser sandbox — text chat and whiteboard remain live.');
    }
  };

  const toggleCamera = async () => {
    setMediaNotice('');
    if (camEnabled) {
      localStreamRef.current?.getVideoTracks().forEach((tr) => tr.stop());
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      setCamEnabled(false);
      await syncLocalTracksToPeers(micEnabled, false, false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: micEnabled,
      });
      localStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setCamEnabled(true);
      setScreenSharing(false);
      await syncLocalTracksToPeers(micEnabled, true, false);
    } catch {
      setMediaNotice('Camera device unavailable in browser sandbox — audio/whiteboard stage remains active.');
    }
  };

  const toggleScreenShare = async () => {
    setMediaNotice('');
    if (screenSharing) {
      localStreamRef.current?.getVideoTracks().forEach((tr) => tr.stop());
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      setScreenSharing(false);
      await syncLocalTracksToPeers(micEnabled, false, false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      localStreamRef.current?.getVideoTracks().forEach((tr) => tr.stop());
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setScreenSharing(true);
      setCamEnabled(false);
      await syncLocalTracksToPeers(micEnabled, false, true);
    } catch {
      setMediaNotice('Screen sharing cancelled or unavailable in this browser context.');
    }
  };

  const toggleLowDataMode = () => {
    setLowDataMode((prev) => {
      const next = !prev;
      if (next) {
        localStreamRef.current?.getVideoTracks().forEach((tr) => tr.stop());
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        setCamEnabled(false);
        setScreenSharing(false);
        setMediaNotice('Audio-first low-data mode enabled. Video paused to conserve mobile data.');
        syncLocalTracksToPeers(micEnabled, false, false);
      } else {
        setMediaNotice('');
      }
      return next;
    });
  };

  // Redraw Shared Whiteboard Canvas whenever strokes or stageView changes
  useEffect(() => {
    if (stageView !== 'BOARD') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const strokes = session?.whiteboardStrokes || [];
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle blueprint grid on dark studio board
    ctx.strokeStyle = 'rgba(246, 243, 235, 0.06)';
    ctx.lineWidth = 1;
    for (let x = 40; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 40; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    for (const s of strokes) {
      if (!s.points || s.points.length === 0) continue;
      ctx.save();
      if (s.tool === 'TEXT' && s.text) {
        ctx.fillStyle = s.color || '#F6F3EB';
        ctx.font = '600 16px Plus Jakarta Sans, sans-serif';
        ctx.fillText(s.text, s.points[0].x * w, s.points[0].y * h);
        ctx.restore();
        continue;
      }

      ctx.globalAlpha = s.tool === 'HIGHLIGHTER' ? 0.35 : 1;
      ctx.strokeStyle = s.color || '#F6F3EB';
      ctx.lineWidth = s.tool === 'HIGHLIGHTER' ? (s.width || 3) * 3 : s.width || 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(s.points[0].x * w, s.points[0].y * h);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i].x * w, s.points[i].y * h);
      }
      if (s.points.length === 1) {
        ctx.lineTo(s.points[0].x * w + 0.5, s.points[0].y * h + 0.5);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, [stageView, session?.whiteboardStrokes]);

  const getNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>): WhiteboardPoint => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height))),
    };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getNormalizedPoint(e);
    if (boardTool === 'POINTER') {
      sendWs('session:board_pointer', { x: pt.x, y: pt.y, active: true });
      return;
    }
    if (boardTool === 'TEXT') {
      if (!boardTextDraft.trim()) return;
      const stroke: WhiteboardStroke = {
        id: `stk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userId: currentUser.id,
        userName: currentUser.name,
        tool: 'TEXT',
        color: boardColor,
        width: boardWidth,
        points: [pt],
        text: boardTextDraft.trim(),
        createdAt: new Date().toISOString(),
      };
      setSession((prev) =>
        prev ? { ...prev, whiteboardStrokes: [...(prev.whiteboardStrokes || []), stroke] } : prev
      );
      sendWs('session:board_stroke', { stroke });
      setBoardTextDraft('');
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    drawingStrokeRef.current = [pt];
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getNormalizedPoint(e);
    if (boardTool === 'POINTER') {
      const now = Date.now();
      if (now - lastPointerSentRef.current > 45) {
        lastPointerSentRef.current = now;
        sendWs('session:board_pointer', { x: pt.x, y: pt.y, active: true });
      }
      return;
    }

    if (!drawingStrokeRef.current) return;
    drawingStrokeRef.current.push(pt);

    // Local preview stroke immediately
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx && drawingStrokeRef.current.length >= 2) {
      const pts = drawingStrokeRef.current;
      const prevPt = pts[pts.length - 2];
      ctx.save();
      ctx.globalAlpha = boardTool === 'HIGHLIGHTER' ? 0.35 : 1;
      ctx.strokeStyle = boardColor;
      ctx.lineWidth = boardTool === 'HIGHLIGHTER' ? boardWidth * 3 : boardWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(prevPt.x * canvas.width, prevPt.y * canvas.height);
      ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
      ctx.stroke();
      ctx.restore();
    }
  };

  const handleCanvasPointerUp = () => {
    if (boardTool === 'POINTER') {
      sendWs('session:board_pointer', { active: false });
      return;
    }
    if (!drawingStrokeRef.current || drawingStrokeRef.current.length === 0) return;
    const points = drawingStrokeRef.current;
    drawingStrokeRef.current = null;
    const stroke: WhiteboardStroke = {
      id: `stk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: currentUser.id,
      userName: currentUser.name,
      tool: boardTool === 'HIGHLIGHTER' ? 'HIGHLIGHTER' : 'PEN',
      color: boardColor,
      width: boardWidth,
      points,
      createdAt: new Date().toISOString(),
    };
    setSession((prev) =>
      prev ? { ...prev, whiteboardStrokes: [...(prev.whiteboardStrokes || []), stroke] } : prev
    );
    sendWs('session:board_stroke', { stroke });
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

  const handleCreatePoll = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedOpts = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!pollQuestion.trim() || cleanedOpts.length < 2) return;
    sendWs('session:poll_create', {
      question: pollQuestion.trim(),
      options: cleanedOpts,
    });
    setPollQuestion('');
    setPollOptions(['Yes, clear', 'Need another example']);
    setShowPollForm(false);
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
        a.download =
          blob.type === 'application/pdf' && !r.fileName.toLowerCase().endsWith('.pdf')
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
  const polls = session?.polls || [];
  const openPollsCount = polls.filter((p) => p.isOpen).length;
  const handQueueIds = session?.raisedHandUserIds || [];
  const remoteEntries = Object.entries(remoteStreams);

  return (
    <>
      <div
        dir={dir}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm"
        style={{ backgroundColor: 'var(--ak-backdrop)' }}
      >
        <div className="flex h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] text-[var(--ak-ink)] shadow-2xl">
          {/* Classroom Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ak-divider)] px-5 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ak-ink-2)]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--ak-ok-fg)]">
                  {wsConnected && (
                    <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  )}
                  {session?.status || 'CONNECTING'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{rtcMode === 'LIVEKIT_SFU' ? 'LiveKit SFU' : 'WebRTC Mesh'}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{session?.courseTitle}</span>
                <span aria-hidden="true">·</span>
                <span>Host: {session?.hostName}</span>
              </div>
              <h2 className="mt-0.5 truncate text-lg font-bold text-[var(--ak-ink)]">
                {session?.title || 'Loading Live Classroom...'}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="inline-flex rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setStageView('STAGE')}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
                    stageView === 'STAGE'
                      ? 'bg-[#C9642E] text-[#F8F5EE]'
                      : 'text-[var(--ak-ink-2)] hover:text-[var(--ak-ink)]'
                  }`}
                >
                  Video Stage
                </button>
                <button
                  type="button"
                  onClick={() => setStageView('BOARD')}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
                    stageView === 'BOARD'
                      ? 'bg-[#C9642E] text-[#F8F5EE]'
                      : 'text-[var(--ak-ink-2)] hover:text-[var(--ak-ink)]'
                  }`}
                >
                  Shared Whiteboard ({session?.whiteboardStrokes?.length || 0})
                </button>
              </div>

              <span className="px-2 text-sm font-mono-nums text-[var(--ak-muted)]">
                {session?.activeParticipantIds.length || 0} in room
              </span>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
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
            {/* Presenter & Whiteboard Stage */}
            <div className="flex flex-col justify-between bg-[#081322] p-4 sm:p-5 text-[#F6F3EB] lg:col-span-8 overflow-hidden">
              {stageView === 'BOARD' ? (
                <div className="flex flex-1 flex-col gap-3 overflow-hidden">
                  {/* Whiteboard Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#22354D] bg-[#0C1B2E] px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          ['PEN', PenTool, 'Pen'],
                          ['HIGHLIGHTER', Highlighter, 'Highlight'],
                          ['TEXT', Type, 'Text'],
                          ['POINTER', Crosshair, 'Laser Pointer'],
                        ] as const
                      ).map(([toolKey, Icon, label]) => (
                        <button
                          key={toolKey}
                          type="button"
                          onClick={() => setBoardTool(toolKey)}
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-semibold transition-colors ${
                            boardTool === toolKey
                              ? 'bg-[#C9642E] text-[#F8F5EE]'
                              : 'border border-[#2C425E] bg-[#162942] text-[#D8E0EB] hover:bg-[#1E3554]'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </button>
                      ))}

                      <div className="ml-2 flex items-center gap-1">
                        {['#F6F3EB', '#F97316', '#34D399', '#FBBF24', '#60A5FA'].map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setBoardColor(c)}
                            aria-label={`Select color ${c}`}
                            className={`h-5 w-5 rounded-full border-2 ${
                              boardColor === c ? 'border-white scale-110' : 'border-transparent'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>

                      <select
                        aria-label="Stroke width"
                        value={boardWidth}
                        onChange={(e) => setBoardWidth(Number(e.target.value))}
                        className="ml-1 rounded border border-[#2C425E] bg-[#162942] px-2 py-1 text-xs text-[#F6F3EB]"
                      >
                        <option value={2}>Thin</option>
                        <option value={4}>Medium</option>
                        <option value={7}>Bold</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => sendWs('session:board_undo', {})}
                        className="inline-flex items-center gap-1 rounded-md border border-[#2C425E] bg-[#162942] px-2.5 py-1.5 font-semibold text-[#F6F3EB] hover:bg-[#1E3554]"
                      >
                        <Undo2 className="h-3.5 w-3.5" /> Undo
                      </button>
                      {isHost && (
                        <button
                          type="button"
                          onClick={() => sendWs('session:board_clear', {})}
                          className="inline-flex items-center gap-1 rounded-md border border-red-700/70 bg-red-950/60 px-2.5 py-1.5 font-semibold text-red-200 hover:bg-red-900/70"
                        >
                          <Eraser className="h-3.5 w-3.5" /> Clear Board
                        </button>
                      )}
                    </div>
                  </div>

                  {boardTool === 'TEXT' && (
                    <div className="flex items-center gap-2 rounded-lg border border-[#22354D] bg-[#0C1B2E] px-3 py-2 text-xs">
                      <span className="text-[#9FB0C4] shrink-0">Label text, then click board:</span>
                      <input
                        type="text"
                        value={boardTextDraft}
                        onChange={(e) => setBoardTextDraft(e.target.value)}
                        placeholder="Type equation or note label (e.g. P(A|B) = P(B|A)P(A)/P(B))..."
                        className="flex-1 rounded border border-[#2C425E] bg-[#081322] px-2.5 py-1 text-xs text-[#F6F3EB] focus:border-[#C9642E] focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Interactive Canvas */}
                  <div className="relative flex-1 overflow-hidden rounded-xl border border-[#22354D] bg-[#0C1B2E]">
                    <canvas
                      ref={canvasRef}
                      width={960}
                      height={540}
                      onPointerDown={handleCanvasPointerDown}
                      onPointerMove={handleCanvasPointerMove}
                      onPointerUp={handleCanvasPointerUp}
                      onPointerLeave={handleCanvasPointerUp}
                      className="h-full w-full cursor-crosshair touch-none"
                    />
                    {boardPointer?.active && (
                      <div
                        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: `${boardPointer.x * 100}%`,
                          top: `${boardPointer.y * 100}%`,
                        }}
                      >
                        <div className="h-4 w-4 rounded-full bg-rose-500 shadow-[0_0_12px_4px_rgba(244,63,94,0.85)]" />
                        <span className="mt-1 block whitespace-nowrap rounded bg-[#081322]/90 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200">
                          {boardPointer.userName}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col gap-3 overflow-hidden">
                  <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-xl border border-[#22354D] bg-[#0C1B2E]">
                    {camEnabled || screenSharing ? (
                      <video
                        ref={localVideoRef}
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
                            'Authenticated real-time classroom stream with collaborative whiteboard, live polls, and WebRTC A/V.'}
                        </p>
                        <p className="mt-4 text-sm text-[#9FB0C4]">
                          {isHost
                            ? 'Use Mic, Camera, Screen Share, or Shared Whiteboard to teach enrolled learners.'
                            : 'Raise your hand for speaking mic access, vote in live comprehension polls, or annotate the shared board.'}
                        </p>
                      </div>
                    )}

                    {boardPointer?.active && (
                      <div
                        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: `${boardPointer.x * 100}%`,
                          top: `${boardPointer.y * 100}%`,
                        }}
                      >
                        <div className="h-4 w-4 rounded-full bg-rose-500 shadow-[0_0_12px_4px_rgba(244,63,94,0.85)]" />
                      </div>
                    )}

                    {mediaNotice && (
                      <div className="absolute bottom-3 left-3 right-3 rounded-lg border border-amber-700/60 bg-amber-950/85 px-3.5 py-2.5 text-sm text-amber-200">
                        {mediaNotice}
                      </div>
                    )}
                  </div>

                  {/* Multi-Participant Remote WebRTC Streams Strip */}
                  {remoteEntries.length > 0 && (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      {remoteEntries.map(([peerId, stream]) => (
                        <RemoteMediaTile
                          key={peerId}
                          name={participantDirectory[peerId]?.name || peerId}
                          stream={stream}
                          lowDataMode={lowDataMode}
                          mediaFlags={peerMedia[peerId]}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Stage Controls Bar */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(isHost || hasMicGrant) && (
                    <>
                      <button
                        type="button"
                        onClick={toggleMic}
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
                        {camEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
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

            {/* Right Classroom Sidebar: Chat, Polls, Pinned Materials, People & Queue */}
            <div className="flex flex-col border-t border-[var(--ak-divider)] bg-[var(--ak-surface)] lg:col-span-4 lg:border-t-0 lg:border-s overflow-hidden">
              <div className="grid grid-cols-4 border-b border-[var(--ak-divider)] p-1.5 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveSideTab('CHAT')}
                  className={`rounded-md py-2 text-xs font-semibold transition-colors ${
                    activeSideTab === 'CHAT'
                      ? 'bg-[var(--ak-elevated)] text-[var(--ak-ink)]'
                      : 'text-[var(--ak-muted)] hover:text-[var(--ak-ink)]'
                  }`}
                >
                  Chat ({session?.chatMessages.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSideTab('POLLS')}
                  className={`rounded-md py-2 text-xs font-semibold transition-colors ${
                    activeSideTab === 'POLLS'
                      ? 'bg-[var(--ak-elevated)] text-[var(--ak-ink)]'
                      : 'text-[var(--ak-muted)] hover:text-[var(--ak-ink)]'
                  }`}
                >
                  Polls ({openPollsCount || polls.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSideTab('MATERIALS')}
                  className={`rounded-md py-2 text-xs font-semibold transition-colors ${
                    activeSideTab === 'MATERIALS'
                      ? 'bg-[var(--ak-elevated)] text-[var(--ak-ink)]'
                      : 'text-[var(--ak-muted)] hover:text-[var(--ak-ink)]'
                  }`}
                >
                  Docs ({pinnedResources.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSideTab('PEOPLE')}
                  className={`rounded-md py-2 text-xs font-semibold transition-colors ${
                    activeSideTab === 'PEOPLE'
                      ? 'bg-[var(--ak-elevated)] text-[var(--ak-ink)]'
                      : 'text-[var(--ak-muted)] hover:text-[var(--ak-ink)]'
                  }`}
                >
                  Queue ({handQueueIds.length}/{session?.activeParticipantIds.length || 0})
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

              {activeSideTab === 'POLLS' && (
                <div className="flex flex-1 flex-col overflow-y-auto p-4 space-y-4">
                  {isHost && (
                    <div className="space-y-3 rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-3">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--ak-ink)]">
                          <BarChart2 className="h-3.5 w-3.5 text-[var(--ak-accent-ink)]" />
                          In-Session Comprehension Polls
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowPollForm((v) => !v)}
                          className="inline-flex items-center gap-1 rounded-md bg-[#C9642E] px-2.5 py-1 text-xs font-semibold text-[#F8F5EE]"
                        >
                          <Plus className="h-3 w-3" />
                          {showPollForm ? 'Close' : 'New Poll'}
                        </button>
                      </div>

                      {showPollForm && (
                        <form onSubmit={handleCreatePoll} className="space-y-2 pt-2 border-t border-[var(--ak-divider)]">
                          <input
                            required
                            value={pollQuestion}
                            onChange={(e) => setPollQuestion(e.target.value)}
                            placeholder="Comprehension check question..."
                            className="w-full rounded-md border border-[var(--ak-border)] bg-[var(--ak-surface)] px-2.5 py-1.5 text-xs text-[var(--ak-ink)]"
                          />
                          {pollOptions.map((opt, idx) => (
                            <input
                              key={idx}
                              required={idx < 2}
                              value={opt}
                              onChange={(e) =>
                                setPollOptions((prev) =>
                                  prev.map((o, i) => (i === idx ? e.target.value : o))
                                )
                              }
                              placeholder={`Option ${idx + 1}`}
                              className="w-full rounded-md border border-[var(--ak-border)] bg-[var(--ak-surface)] px-2.5 py-1.5 text-xs text-[var(--ak-ink)]"
                            />
                          ))}
                          <div className="flex items-center justify-between pt-1">
                            {pollOptions.length < 5 && (
                              <button
                                type="button"
                                onClick={() => setPollOptions((prev) => [...prev, ''])}
                                className="text-xs font-semibold text-[var(--ak-accent-ink)] hover:underline"
                              >
                                + Add Option
                              </button>
                            )}
                            <button
                              type="submit"
                              className="ml-auto rounded-md bg-[#C9642E] px-3 py-1.5 text-xs font-semibold text-[#F8F5EE]"
                            >
                              Launch Live Poll
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}

                  {polls.length === 0 ? (
                    <p className="text-xs text-[var(--ak-muted)]">
                      No comprehension polls launched yet. Live polls from your instructor appear here.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {polls.map((poll) => {
                        const totalVotes = poll.options.reduce(
                          (acc, opt) => acc + opt.voterIds.length,
                          0
                        );
                        return (
                          <div
                            key={poll.id}
                            className="rounded-xl border border-[var(--ak-border)] bg-[var(--ak-recessed)] p-3.5 space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-[11px] font-semibold text-[var(--ak-muted)]">
                                  <span className={poll.isOpen ? 'text-[var(--ak-ok-fg)]' : ''}>
                                    {poll.isOpen ? 'OPEN POLL' : 'CLOSED'}
                                  </span>{' '}
                                  · {totalVotes} vote(s)
                                </p>
                                <p className="mt-0.5 text-xs font-bold text-[var(--ak-ink)]">
                                  {poll.question}
                                </p>
                              </div>
                              {isHost && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      sendWs('session:poll_toggle', { pollId: poll.id })
                                    }
                                    className="rounded border border-[var(--ak-border)] bg-[var(--ak-surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ak-ink)]"
                                  >
                                    {poll.isOpen ? 'Close' : 'Reopen'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      sendWs('session:poll_toggle', {
                                        pollId: poll.id,
                                        delete: true,
                                      })
                                    }
                                    className="rounded border border-[var(--ak-border)] bg-[var(--ak-surface)] p-1 text-[var(--ak-err-fg)]"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              {poll.options.map((opt) => {
                                const voted = opt.voterIds.includes(currentUser.id);
                                const pct =
                                  totalVotes > 0
                                    ? Math.round((opt.voterIds.length / totalVotes) * 100)
                                    : 0;
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    disabled={!poll.isOpen}
                                    onClick={() =>
                                      sendWs('session:poll_vote', {
                                        pollId: poll.id,
                                        optionId: opt.id,
                                      })
                                    }
                                    className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                                      voted
                                        ? 'border-[#C9642E] bg-[var(--ak-surface)] font-semibold text-[var(--ak-ink)]'
                                        : 'border-[var(--ak-border)] bg-[var(--ak-surface)]/70 text-[var(--ak-ink-2)] hover:bg-[var(--ak-surface)]'
                                    }`}
                                  >
                                    <div
                                      className="pointer-events-none absolute inset-y-0 left-0 bg-[#C9642E]/15 transition-all"
                                      style={{ width: `${pct}%` }}
                                    />
                                    <div className="relative flex items-center justify-between gap-2">
                                      <span className="inline-flex items-center gap-1.5">
                                        {voted && <Check className="h-3 w-3 text-[#C9642E]" />}
                                        {opt.text}
                                      </span>
                                      <span className="font-mono-nums text-[11px] text-[var(--ak-muted)]">
                                        {pct}% ({opt.voterIds.length})
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Ordered Hand-Raise Queue */}
                  <div className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-3 space-y-2">
                    <p className="text-xs font-bold text-[var(--ak-ink)]">
                      Ordered Hand-Raise Queue ({handQueueIds.length})
                    </p>
                    {handQueueIds.length === 0 ? (
                      <p className="text-xs text-[var(--ak-muted)]">
                        No raised hands in the speaker queue right now.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {handQueueIds.map((uid, idx) => {
                          const person = participantDirectory[uid];
                          return (
                            <div
                              key={uid}
                              className="flex items-center justify-between gap-2 rounded-md border border-[var(--ak-border)] bg-[var(--ak-surface)] px-2.5 py-1.5 text-xs"
                            >
                              <span className="truncate font-semibold text-[var(--ak-ink)]">
                                #{idx + 1} · {person?.name || uid}
                              </span>
                              {isHost && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      sendWs('session:moderate', {
                                        action: 'GRANT_MIC',
                                        targetUserId: uid,
                                      })
                                    }
                                    className="rounded bg-[#1E5631] px-2 py-0.5 text-[11px] font-semibold text-white"
                                  >
                                    Grant Mic
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      sendWs('session:moderate', {
                                        action: 'DISMISS_HAND',
                                        targetUserId: uid,
                                      })
                                    }
                                    className="rounded border border-[var(--ak-border)] px-2 py-0.5 text-[11px] text-[var(--ak-muted)]"
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Active Roster */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-[var(--ak-muted)]">
                      Active Participants ({session?.activeParticipantIds.length || 0})
                    </p>
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
