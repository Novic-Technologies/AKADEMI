import type { UserProfile } from '../types/akademi';

// Keep auth token strictly in JS memory (never localStorage/sessionStorage)
let memoryToken = '';

export function setAuthToken(token: string) {
  memoryToken = token;
}

export function getAuthToken(): string {
  return memoryToken;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (memoryToken) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }

  if (!res.ok) {
    throw new ApiError(
      String(data.error || `Request failed (${res.status})`),
      res.status,
      data.code ? String(data.code) : undefined
    );
  }

  return data as T;
}

export async function fetchAuthorizedBlob(url: string): Promise<Blob> {
  const headers = new Headers();
  if (memoryToken) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errText = await res.text();
    throw new ApiError(errText || 'Unable to fetch document', res.status);
  }
  return res.blob();
}

export function createAkademiSocket(
  onMessage: (event: string, payload: Record<string, unknown>) => void,
  onStatusChange?: (connected: boolean) => void
): WebSocket | null {
  if (!memoryToken) return null;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(memoryToken)}`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    onStatusChange?.(true);
  };
  ws.onclose = () => {
    onStatusChange?.(false);
  };
  ws.onmessage = (evt) => {
    try {
      const parsed = JSON.parse(evt.data);
      if (parsed?.event) {
        onMessage(parsed.event, parsed.payload || {});
      }
    } catch {
      // Ignore malformed frame
    }
  };

  return ws;
}

export function formatRoleLabel(user: Pick<UserProfile, 'role' | 'accountCategory'>): string {
  if (user.role === 'MASTER_ADMIN') return 'Master Admin';
  if (user.role === 'INSTITUTION_ADMIN') return 'Institution Admin';
  if (user.role === 'COURSE_ADMIN') return 'Course Admin';
  if (user.role === 'SOLO_EDUCATOR') {
    return user.accountCategory === 'FREELANCER' ? 'Freelancer Educator' : 'Solo Educator';
  }
  return 'Learner';
}
