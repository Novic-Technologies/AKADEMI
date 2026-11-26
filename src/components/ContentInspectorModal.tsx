import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileText,
  Maximize2,
  Minimize2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import mammoth from 'mammoth';
import { useI18n } from '../lib/i18n';

export interface InspectedContent {
  title: string;
  subtitle?: string;
  fileName: string;
  mimeType: string;
  objectUrl: string;
  blob?: Blob;
  canDownload?: boolean;
  metadata?: { label: string; value: string }[];
}

interface ContentInspectorModalProps {
  item: InspectedContent | null;
  onClose: () => void;
}

export const ContentInspectorModal: React.FC<ContentInspectorModalProps> = ({
  item,
  onClose,
}) => {
  const { t, dir } = useI18n();
  const [fullscreen, setFullscreen] = useState(false);
  const [imageZoom, setImageZoom] = useState(100);
  const [docxHtml, setDocxHtml] = useState<string>('');
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState('');

  useEffect(() => {
    const url = item?.objectUrl;
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [item?.objectUrl]);

  const lowerName = (item?.fileName || '').toLowerCase();
  const mime = (item?.mimeType || '').toLowerCase();

  const isSvg = mime === 'image/svg+xml' || lowerName.endsWith('.svg');
  const isImage =
    !isSvg &&
    (mime.startsWith('image/') ||
      /\.(png|jpe?g|webp|gif)$/i.test(lowerName));
  const isPdf = mime === 'application/pdf' || lowerName.endsWith('.pdf');
  const isDocx =
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx');
  const isVideo =
    mime.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(lowerName);
  const isAudio =
    mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(lowerName);

  useEffect(() => {
    setImageZoom(100);
    setDocxHtml('');
    setDocxError('');

    if (!item || !isDocx) return;

    let cancelled = false;
    setDocxLoading(true);
    const loadDocx = async () => {
      try {
        const buffer = item.blob
          ? await item.blob.arrayBuffer()
          : await (await fetch(item.objectUrl)).arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
        if (!cancelled) {
          setDocxHtml(
            result.value || '<p>No formatted body elements detected in this document.</p>'
          );
        }
      } catch {
        if (!cancelled) {
          setDocxError('Unable to render Word document preview inline. Use Download to open.');
        }
      } finally {
        if (!cancelled) {
          setDocxLoading(false);
        }
      }
    };

    loadDocx();
    return () => {
      cancelled = true;
    };
  }, [item?.objectUrl, isDocx]);

  const docxSrcDoc = useMemo(() => {
    if (!docxHtml) return '';
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        margin: 0;
        padding: 36px 44px;
        background: #ffffff;
        color: #111827;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 15px;
        line-height: 1.65;
      }
      h1, h2, h3, h4 { color: #0C1B2E; margin-top: 1.25em; margin-bottom: 0.45em; }
      p { margin: 0.65em 0; }
      table { width: 100%; border-collapse: collapse; margin: 1em 0; }
      th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; }
      th { background: #f3f4f6; }
      img { max-width: 100%; height: auto; }
      ul, ol { padding-left: 1.4em; }
    </style>
  </head>
  <body>${docxHtml}</body>
</html>`;
  }, [docxHtml]);

  if (!item) return null;

  const canDownload = item.canDownload !== false;

  const handleDownload = () => {
    if (!canDownload || !item.objectUrl) return;
    const a = document.createElement('a');
    a.href = item.objectUrl;
    a.download = item.fileName || 'document.pdf';
    a.click();
  };

  return (
    <div
      dir={dir}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-xs"
      style={{ backgroundColor: 'var(--ak-backdrop)' }}
    >
      <div
        className={`flex flex-col overflow-hidden rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] text-[var(--ak-ink)] shadow-2xl transition-all ${
          fullscreen
            ? 'h-[96vh] w-[96vw] max-w-none'
            : 'max-h-[92vh] w-full max-w-4xl'
        }`}
      >
        <div className="african-weave-rule shrink-0" />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ak-divider)] px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-[var(--ak-accent-ink)]" />
              <h3 className="truncate font-display text-lg font-bold text-[var(--ak-ink)]">
                {item.title}
              </h3>
            </div>
            {item.subtitle && (
              <p className="mt-0.5 truncate text-sm text-[var(--ak-muted)]">
                {item.subtitle} · {item.fileName}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isImage && (
              <>
                <button
                  type="button"
                  onClick={() => setImageZoom((z) => Math.max(50, z - 25))}
                  aria-label="Zoom out"
                  title="Zoom out"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="font-mono-nums text-xs font-semibold text-[var(--ak-muted)]">
                  {imageZoom}%
                </span>
                <button
                  type="button"
                  onClick={() => setImageZoom((z) => Math.min(200, z + 25))}
                  aria-label="Zoom in"
                  title="Zoom in"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setFullscreen((f) => !f)}
              aria-label={fullscreen ? 'Exit expanded viewer' : 'Expand document viewer'}
              title={fullscreen ? 'Restore viewer size' : 'Expand document viewer'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
            >
              {fullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>

            {canDownload && item.objectUrl && (
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#C9642E] px-3.5 py-1.5 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] whitespace-nowrap"
              >
                <Download className="h-4 w-4" />
                {t.download}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label={t.dismiss}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto p-4 sm:p-5 space-y-4">
          {item.metadata && item.metadata.length > 0 && (
            <div className="grid gap-2.5 rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-3.5 sm:grid-cols-2">
              {item.metadata.map((m) => (
                <div key={m.label} className="min-w-0 text-sm">
                  <span className="font-semibold text-[var(--ak-muted)]">{m.label}: </span>
                  <span className="break-words font-medium text-[var(--ak-ink)]">{m.value}</span>
                </div>
              ))}
            </div>
          )}

          {isPdf && item.objectUrl ? (
            <iframe
              src={item.objectUrl}
              title={item.title}
              className={`w-full flex-1 rounded-lg border border-[var(--ak-border)] bg-white ${
                fullscreen ? 'min-h-[74vh]' : 'min-h-[64vh]'
              }`}
            />
          ) : isDocx ? (
            docxLoading ? (
              <div className="flex min-h-[54vh] items-center justify-center rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-8 text-sm text-[var(--ak-muted)]">
                Rendering Word document inside Akademi viewer...
              </div>
            ) : docxError ? (
              <div className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-6 text-center text-sm text-[var(--ak-ink-2)]">
                <p className="font-semibold text-[var(--ak-ink)]">{item.fileName}</p>
                <p className="mt-1">{docxError}</p>
              </div>
            ) : (
              <iframe
                srcDoc={docxSrcDoc}
                title={item.title}
                sandbox=""
                className={`w-full flex-1 rounded-lg border border-[var(--ak-border)] bg-white ${
                  fullscreen ? 'min-h-[74vh]' : 'min-h-[64vh]'
                }`}
              />
            )
          ) : isImage && item.objectUrl ? (
            <div className="flex flex-1 items-center justify-center overflow-auto rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-4">
              <img
                src={item.objectUrl}
                alt={item.title}
                referrerPolicy="no-referrer"
                style={{ width: `${imageZoom}%`, maxWidth: imageZoom > 100 ? 'none' : '100%' }}
                className="max-h-[68vh] rounded object-contain shadow"
              />
            </div>
          ) : isVideo && item.objectUrl ? (
            <video
              src={item.objectUrl}
              controls
              className="max-h-[66vh] w-full rounded-lg border border-[var(--ak-border)] bg-black"
            />
          ) : isAudio && item.objectUrl ? (
            <div className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-5">
              <audio src={item.objectUrl} controls className="w-full" />
            </div>
          ) : (
            <div className="rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-8 text-center text-sm text-[var(--ak-ink-2)]">
              <FileText className="mx-auto mb-3 h-10 w-10 text-[var(--ak-accent-ink)]" />
              <p className="font-semibold text-[var(--ak-ink)]">{item.fileName}</p>
              <p className="mt-1 text-[var(--ak-muted)]">
                Document package ({item.mimeType || 'Binary document'}). Use the {t.download} button
                above to open this document locally.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
