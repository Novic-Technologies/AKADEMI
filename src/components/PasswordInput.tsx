import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useI18n } from '../lib/i18n';

interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  inputClassName?: string;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  inputClassName = '',
  className = '',
  ...props
}) => {
  const [visible, setVisible] = useState(false);
  const { t, dir } = useI18n();
  const isRtl = dir === 'rtl';

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`min-h-[44px] w-full rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] py-2.5 text-base text-[var(--ak-ink)] placeholder:text-[var(--ak-muted)] focus:border-[#C9642E] focus:outline-none ${
          isRtl ? 'pr-3.5 pl-12' : 'pr-12 pl-3.5'
        } ${inputClassName}`}
      />
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? t.hidePassword : t.showPassword}
        title={visible ? t.hidePassword : t.showPassword}
        className={`absolute flex h-10 w-10 items-center justify-center rounded-md text-[var(--ak-muted)] transition-colors hover:bg-[var(--ak-elevated)] hover:text-[var(--ak-ink)] focus-visible:outline-2 focus-visible:outline-[#C9642E] ${
          isRtl ? 'left-1.5' : 'right-1.5'
        }`}
      >
        {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
};
