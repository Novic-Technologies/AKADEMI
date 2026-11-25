import React, { useEffect } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';

export interface InspectedContent {
  title: string;
  subtitle?: string;
  fileName: string;
  mimeType: string;
  objectUrl?: string;
  textContent?: string;
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

  useEffect(() => {
    const url = item?.objectUrl;
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [item?.objectUrl]);

  if (!item) return null;

  const isImage = item.mimeType.startsWith('image/');
  const isPdf = item.mimeType === 'application/pdf';
  const isVideo = item.mimeType.startsWith('video/');
  const isAudio = item.mimeType.startsWith('audio/');
  const isText = Boolean(item.textContent !== undefined);

  const handleDownload = () => {
    if (item.objectUrl) {
      const a = document.createElement('a');
      a.href = item.objectUrl;
      a.download = item.fileName || 'document';
      a.click();
    } else if (item.textContent) {
      const blob = new Blob([item.textContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.fileName || 'record'}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div
      dir={dir}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0C1B2E]/75 p-3 sm:p-5 backdrop-blur-xs"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] shadow-2xl">
        <div className="african-weave-rule shrink-0" />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D4CCB9] px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-[#A44A1C]" />
              <h3 className="truncate font-display text-lg font-bold text-[#0C1B2E]">
                {item.title}
              </h3>
            </div>
            {item.subtitle && (
              <p className="mt-0.5 truncate text-sm text-[#4A463F]">{item.subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(item.objectUrl || item.textContent) && (
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#0C1B2E] px-3.5 py-1.5 text-sm font-semibold text-[#F6F3EB] hover:bg-[#1A2F4A]"
              >
                <Download className="h-4 w-4" />
                {t.download}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t.dismiss}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#C8BFA8] bg-[#EFECE3] text-[#0C1B2E] hover:bg-[#E6E0D3]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {item.metadata && item.metadata.length > 0 && (
            <div className="grid gap-2.5 rounded-lg border border-[#D4CCB9] bg-[#EFECE3] p-4 sm:grid-cols-2">
              {item.metadata.map((m) => (
                <div key={m.label} className="min-w-0 text-sm">
                  <span className="font-semibold text-[#4A463F]">{m.label}: </span>
                  <span className="break-words font-medium text-[#0C1B2E]">{m.value}</span>
                </div>
              ))}
            </div>
          )}

          {isText ? (
            <pre className="whitespace-pre-wrap break-words rounded-lg border border-[#D4CCB9] bg-[#EFECE3] p-4 font-sans text-sm leading-relaxed text-[#0C1B2E]">
              {item.textContent}
            </pre>
          ) : isImage && item.objectUrl ? (
            <div className="flex justify-center rounded-lg border border-[#D4CCB9] bg-[#EFECE3] p-3">
              <img
                src={item.objectUrl}
                alt={item.title}
                className="max-h-[62vh] max-w-full rounded object-contain"
              />
            </div>
          ) : isPdf && item.objectUrl ? (
            <iframe
              src={item.objectUrl}
              title={item.title}
              className="h-[62vh] w-full rounded-lg border border-[#D4CCB9] bg-white"
            />
          ) : isVideo && item.objectUrl ? (
            <video
              src={item.objectUrl}
              controls
              className="max-h-[62vh] w-full rounded-lg border border-[#D4CCB9] bg-black"
            />
          ) : isAudio && item.objectUrl ? (
            <div className="rounded-lg border border-[#D4CCB9] bg-[#EFECE3] p-4">
              <audio src={item.objectUrl} controls className="w-full" />
            </div>
          ) : (
            <div className="rounded-lg border border-[#D4CCB9] bg-[#EFECE3] p-6 text-center text-sm text-[#2D3D50]">
              <p className="font-semibold text-[#0C1B2E]">{item.fileName}</p>
              <p className="mt-1">
                {item.mimeType || 'Binary document'} — use the {t.download} button above to open
                this file on your device.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
