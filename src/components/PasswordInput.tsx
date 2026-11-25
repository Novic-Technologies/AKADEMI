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
        className={`min-h-[44px] w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] py-2.5 text-base text-[#0C1B2E] placeholder:text-[#6B665D] focus:border-[#0C1B2E] focus:outline-none ${
          isRtl ? 'pr-3.5 pl-12' : 'pr-12 pl-3.5'
        } ${inputClassName}`}
      />
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? t.hidePassword : t.showPassword}
        title={visible ? t.hidePassword : t.showPassword}
        className={`absolute flex h-10 w-10 items-center justify-center rounded-md text-[#2D3D50] transition-colors hover:bg-[#E6E0D3] hover:text-[#0C1B2E] focus-visible:outline-2 focus-visible:outline-[#0C1B2E] ${
          isRtl ? 'left-1.5' : 'right-1.5'
        }`}
      >
        {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
};
