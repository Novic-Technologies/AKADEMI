import React, { useState } from 'react';

export const DEFAULT_BRAND_LOGO =
  '/assets/aistudio/39335058-2667-43d2-ac1d-3ecb2e744e84_a6ce7bf2.jpg';

interface BrandMarkProps {
  brandName: string;
  logoUrl?: string;
  compact?: boolean;
  darkSurface?: boolean;
  showLogo?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  brandName,
  logoUrl = DEFAULT_BRAND_LOGO,
  compact = false,
  darkSurface = false,
  showLogo = true,
}) => {
  const [imgError, setImgError] = useState(false);

  return (
    <span className="inline-flex items-center gap-3 whitespace-nowrap shrink-0">
      {showLogo && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#D4CCB9] bg-[#F6F3EB] p-1">
          {!imgError ? (
            <img
              src={logoUrl}
              alt={`${brandName} emblem`}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="font-display text-base font-bold text-[#0C1B2E]">
              {brandName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>
      )}
      {!compact && (
        <span
          className={`font-display text-xl font-bold tracking-tight ${
            darkSurface ? 'text-[#F6F3EB]' : 'text-[#0C1B2E]'
          }`}
        >
          {brandName}
        </span>
      )}
    </span>
  );
};
