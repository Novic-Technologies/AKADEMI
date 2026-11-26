import React, { useState } from 'react';
import { KeyRound, Save, UserCheck, X } from 'lucide-react';
import { apiFetch, formatRoleLabel } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type { UserProfile } from '../types/akademi';
import { PasswordInput } from './PasswordInput';

interface AccountSettingsModalProps {
  user: UserProfile;
  educationLevels?: string[];
  onUserUpdated: (user: UserProfile) => void;
  onClose: () => void;
}

export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({
  user,
  educationLevels = [
    'UNEB PLE (Primary Leaving)',
    'UNEB UCE (Uganda O-Level)',
    'UNEB UACE (Uganda A-Level)',
    'UBTEB / DIT Technical & TVET',
    'NCHE Undergraduate (Year 1–4)',
    'BSc / BA Graduate',
    'Postgraduate / Masters / PhD',
  ],
  onUserUpdated,
  onClose,
}) => {
  const { dir } = useI18n();
  const isContributor =
    user.role === 'SOLO_EDUCATOR' ||
    user.role === 'INSTITUTION_ADMIN' ||
    user.role === 'COURSE_ADMIN';

  const [name, setName] = useState(user.name);
  const [institutionName, setInstitutionName] = useState(user.institutionName || '');
  const [specialization, setSpecialization] = useState(user.specialization || '');
  const [bio, setBio] = useState(user.bio || '');
  const [country, setCountry] = useState(user.country || 'Uganda');
  const [educationSystem, setEducationSystem] = useState(
    user.educationSystem || 'UNEB / UBTEB / NCHE Uganda'
  );
  const [educationLevel, setEducationLevel] = useState(
    user.educationLevel || 'NCHE Undergraduate (Year 1–4)'
  );
  const [phone, setPhone] = useState(user.phone || '');
  const [homeAddress, setHomeAddress] = useState(user.homeAddress || '');
  const [followPriceUsd, setFollowPriceUsd] = useState(String(user.followPriceUsd ?? 0));

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const inputCls =
    'min-h-[42px] w-full rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3.5 py-2 text-sm text-[var(--ak-ink)] placeholder:text-[var(--ak-muted)] focus:border-[#C9642E] focus:outline-none';
  const labelCls = 'mb-1 block text-xs font-semibold text-[var(--ak-ink-2)]';

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSavingProfile(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        specialization,
        bio,
        country,
        educationSystem,
        phone,
        homeAddress,
      };
      if (user.role === 'LEARNER') {
        payload.educationLevel = educationLevel;
      }
      if (user.role === 'INSTITUTION_ADMIN') {
        payload.institutionName = institutionName;
      }
      if (isContributor && user.role !== 'COURSE_ADMIN') {
        payload.followPriceUsd = Number(followPriceUsd) || 0;
      }
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      onUserUpdated(res.user);
      setNotice('Profile and account details updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      });
      onUserUpdated(res.user);
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Password updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div
      dir={dir}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
      style={{ backgroundColor: 'var(--ak-backdrop)' }}
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] text-[var(--ak-ink)] shadow-2xl">
        <div className="african-weave-rule" />
        <div className="flex items-center justify-between gap-3 border-b border-[var(--ak-divider)] px-6 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-[var(--ak-ink)]">
              Account Profile &amp; Security
            </h2>
            <p className="truncate text-sm text-[var(--ak-muted)]">
              {user.email} · {formatRoleLabel(user)} · Member since{' '}
              {new Date(user.createdAt).toLocaleDateString()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account settings"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {error && (
            <div
              className="rounded-lg border px-4 py-3 text-sm"
              style={{
                color: 'var(--ak-err-fg)',
                backgroundColor: 'var(--ak-err-bg)',
                borderColor: 'var(--ak-err-bd)',
              }}
            >
              {error}
            </div>
          )}
          {notice && (
            <div
              className="rounded-lg border px-4 py-3 text-sm"
              style={{
                color: 'var(--ak-ok-fg)',
                backgroundColor: 'var(--ak-ok-bg)',
                borderColor: 'var(--ak-ok-bd)',
              }}
            >
              {notice}
            </div>
          )}

          {/* Account Status Summary Strip */}
          <div className="grid gap-3 rounded-lg border border-[var(--ak-divider)] bg-[var(--ak-recessed)] p-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-[var(--ak-muted)]">Role</p>
              <p className="font-semibold text-[var(--ak-ink)]">{formatRoleLabel(user)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--ak-muted)]">KYC Status</p>
              <p className="font-semibold text-[var(--ak-accent-ink)]">{user.kycStatus}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--ak-muted)]">Plan / Pass</p>
              <p className="font-semibold text-[var(--ak-ok-fg)]">
                {user.role === 'LEARNER'
                  ? user.platformPassActive
                    ? 'Akademi Pass Active'
                    : 'Free Learner Tier'
                  : user.subscriptionStatus}
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="flex items-center gap-2 border-b border-[var(--ak-divider)] pb-2">
              <UserCheck className="h-4 w-4 text-[var(--ak-accent-ink)]" />
              <h3 className="text-sm font-semibold text-[var(--ak-ink)]">Profile &amp; Contact Details</h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                />
              </div>
              {user.role === 'INSTITUTION_ADMIN' ? (
                <div>
                  <label className={labelCls}>Registered Institution Name</label>
                  <input
                    type="text"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    className={inputCls}
                  />
                </div>
              ) : user.role === 'LEARNER' ? (
                <div>
                  <label className={labelCls}>Education Level</label>
                  <select
                    value={educationLevel}
                    onChange={(e) => setEducationLevel(e.target.value)}
                    className={inputCls}
                  >
                    {educationLevels.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className={labelCls}>Specialization / Department</label>
                  <input
                    type="text"
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Country</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Curriculum / Accreditation System</label>
                <input
                  type="text"
                  value={educationSystem}
                  onChange={(e) => setEducationSystem(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            {(user.role === 'LEARNER' || user.role === 'INSTITUTION_ADMIN') && (
              <div>
                <label className={labelCls}>Academic Specialization / Track</label>
                <input
                  type="text"
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}

            <div>
              <label className={labelCls}>Bio / Academic Summary</label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Private Phone / WhatsApp (Confidential)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+256 ..."
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Residential / Campus Address (Confidential)</label>
                <input
                  type="text"
                  value={homeAddress}
                  onChange={(e) => setHomeAddress(e.target.value)}
                  placeholder="District, City"
                  className={inputCls}
                />
              </div>
            </div>

            {isContributor && user.role !== 'COURSE_ADMIN' && (
              <div className="max-w-xs">
                <label className={labelCls}>Paid Follow Membership Rate (USD)</label>
                <input
                  type="number"
                  min={0}
                  value={followPriceUsd}
                  onChange={(e) => setFollowPriceUsd(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#C9642E] px-5 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {savingProfile ? 'Saving Profile...' : 'Save Profile Changes'}
            </button>
          </form>

          <form
            onSubmit={handleChangePassword}
            className="space-y-4 border-t border-[var(--ak-divider)] pt-5"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[var(--ak-accent-ink)]" />
              <h3 className="text-sm font-semibold text-[var(--ak-ink)]">Update Account Password</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>New Password (min 8 chars)</label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className={labelCls}>Confirm New Password</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={savingPassword}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-5 py-2 text-sm font-semibold text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)] disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              {savingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
