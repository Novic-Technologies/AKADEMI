import React, { useEffect, useState } from 'react';
import { KeyRound, Lock, ShieldCheck, UserPlus, X } from 'lucide-react';
import { apiFetch, setAuthToken } from '../lib/api';
import { LanguageSelector, useI18n } from '../lib/i18n';
import { ThemeToggle } from '../lib/theme';
import type { AccountCategory, PublicGatewayInfo, UserProfile } from '../types/akademi';
import { BrandMark, DEFAULT_BRAND_LOGO } from './BrandMark';
import { PasswordInput } from './PasswordInput';

interface AuthModalProps {
  initialMode?: 'LOGIN' | 'REGISTER_LEARNER' | 'REQUEST_CONTRIBUTOR' | 'CLAIM_ADMIN';
  onClose: () => void;
  onAuthenticated: (user: UserProfile) => void;
}

const AFRICAN_COUNTRIES: { name: string; defaultSystem: string }[] = [
  { name: 'Uganda', defaultSystem: 'UNEB / UBTEB / NCHE Uganda' },
  { name: 'Kenya', defaultSystem: 'KNEC / CBC / CUE Kenya' },
  { name: 'Tanzania', defaultSystem: 'NECTA / NACTVET / TCU Tanzania' },
  { name: 'Rwanda', defaultSystem: 'NESA / RTB / HEC Rwanda' },
  { name: 'Burundi', defaultSystem: 'Ministry of National Education Burundi' },
  { name: 'South Sudan', defaultSystem: 'NEC South Sudan / Higher Education' },
  { name: 'DR Congo', defaultSystem: 'EPSP / ESU DR Congo' },
  { name: 'Nigeria', defaultSystem: 'WAEC / NECO / NUC Nigeria' },
  { name: 'Ghana', defaultSystem: 'WAEC / GES / GTEC Ghana' },
  { name: 'Senegal', defaultSystem: 'CAMES / UEMOA Francophone Africa' },
  { name: 'Ethiopia', defaultSystem: 'MoE Ethiopia / ESSLCE' },
  { name: 'South Africa', defaultSystem: 'CAPS / IEB / DHET South Africa' },
  { name: 'Egypt', defaultSystem: 'Ministry of Education / SCU Egypt' },
  { name: 'Morocco', defaultSystem: 'MEN / Baccalauréat Maroc' },
  { name: 'Namibia', defaultSystem: 'NSSCO / NQA Namibia' },
  { name: 'Other African Union State', defaultSystem: 'IUCEA / Pan-African Curriculum' },
];

export const AuthModal: React.FC<AuthModalProps> = ({
  initialMode = 'LOGIN',
  onClose,
  onAuthenticated,
}) => {
  const { t, dir } = useI18n();
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER_LEARNER' | 'REQUEST_CONTRIBUTOR' | 'CLAIM_ADMIN'>(
    initialMode
  );
  const [needsAdminClaim, setNeedsAdminClaim] = useState(false);
  const [masterEmail, setMasterEmail] = useState('admin@akademi.novic.tech');
  const [brandName, setBrandName] = useState('Akademi');
  const [logoUrl, setLogoUrl] = useState(DEFAULT_BRAND_LOGO);
  const [educationLevels, setEducationLevels] = useState<string[]>([
    'UNEB PLE (Primary Leaving)',
    'UNEB UCE (Uganda O-Level)',
    'UNEB UACE (Uganda A-Level)',
    'UBTEB / DIT Technical & TVET',
    'NCHE Undergraduate (Year 1–4)',
    'BSc / BA Graduate',
    'Postgraduate / Masters / PhD',
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Claim admin state
  const [adminName, setAdminName] = useState('Akademi Master Admin');
  const [adminPassword, setAdminPassword] = useState('');

  // Learner registration state
  const [learnerName, setLearnerName] = useState('');
  const [learnerEmail, setLearnerEmail] = useState('');
  const [learnerPassword, setLearnerPassword] = useState('');
  const [learnerCountry, setLearnerCountry] = useState('Uganda');
  const [learnerSystem, setLearnerSystem] = useState('UNEB / UBTEB / NCHE Uganda');
  const [educationLevel, setEducationLevel] = useState('UNEB UACE (Uganda A-Level)');
  const [specialization, setSpecialization] = useState('');

  // Contributor request form state
  const [reqName, setReqName] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqCategory, setReqCategory] = useState<AccountCategory>('SOLO_TEACHER');
  const [reqOrg, setReqOrg] = useState('');
  const [reqCountry, setReqCountry] = useState('Uganda');
  const [reqSystem, setReqSystem] = useState('UNEB / UBTEB / NCHE Uganda');
  const [reqSpec, setReqSpec] = useState('');
  const [reqStatement, setReqStatement] = useState('');

  useEffect(() => {
    apiFetch<{ needsAdminClaim: boolean; masterEmail: string }>('/api/auth/bootstrap-status')
      .then((res) => {
        setNeedsAdminClaim(res.needsAdminClaim);
        setMasterEmail(res.masterEmail);
      })
      .catch(() => {});

    apiFetch<PublicGatewayInfo>('/api/public/overview')
      .then((info) => {
        if (info.platformName) setBrandName(info.platformName);
        if (info.brandConfig?.logoUrl) setLogoUrl(info.brandConfig.logoUrl);
        if (info.educationLevels && info.educationLevels.length > 0) {
          setEducationLevels(info.educationLevels);
        }
      })
      .catch(() => {});
  }, []);

  const lookupSystemForCountry = (countryName: string) =>
    AFRICAN_COUNTRIES.find((c) => c.name === countryName)?.defaultSystem ||
    'IUCEA / Pan-African Curriculum';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/claim-admin', {
        method: 'POST',
        body: JSON.stringify({ name: adminName, password: adminPassword }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to claim Master Admin.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterLearner = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: UserProfile }>(
        '/api/auth/register-learner',
        {
          method: 'POST',
          body: JSON.stringify({
            name: learnerName,
            email: learnerEmail,
            password: learnerPassword,
            country: learnerCountry,
            educationSystem: learnerSystem,
            educationLevel,
            specialization: specialization || 'General Studies',
          }),
        }
      );
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      await apiFetch('/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          fullName: reqName,
          email: reqEmail,
          accountCategory: reqCategory,
          organizationName: reqOrg,
          country: reqCountry,
          educationSystem: reqSystem,
          specialization: reqSpec,
          statement: reqStatement,
        }),
      });
      setSuccessMsg(
        'Your contributor request has been routed to the Compliance Admin queue. Once approved, temporary credentials will be issued to your email.'
      );
      setReqName('');
      setReqEmail('');
      setReqOrg('');
      setReqSpec('');
      setReqStatement('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit request.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'min-h-[44px] w-full rounded-lg border border-[var(--ak-border)] bg-[var(--ak-recessed)] px-3.5 py-2.5 text-base text-[var(--ak-ink)] placeholder:text-[var(--ak-muted)] focus:border-[#C9642E] focus:outline-none';
  const labelCls = 'mb-1.5 block text-sm font-semibold text-[var(--ak-ink-2)]';

  return (
    <div
      dir={dir}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
      style={{ backgroundColor: 'var(--ak-backdrop)' }}
    >
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] text-[var(--ak-ink)] shadow-2xl">
        <div className="african-weave-rule" />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ak-divider)] bg-[var(--ak-recessed)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark brandName={brandName} logoUrl={logoUrl} compact />
            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold text-[var(--ak-ink)]">
                {brandName} {t.accessPortalTitle}
              </h2>
              <p className="truncate text-sm text-[var(--ak-muted)]">{t.accessPortalSub}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle compact />
            <LanguageSelector compact />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close portal dialog"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 gap-2 border-b border-[var(--ak-divider)] bg-[var(--ak-recessed)] px-5 py-3 sm:flex sm:flex-wrap sm:px-6">
          <button
            type="button"
            onClick={() => {
              setMode('LOGIN');
              setError('');
            }}
            className={`min-h-[40px] rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
              mode === 'LOGIN'
                ? 'bg-[#C9642E] text-[#F8F5EE]'
                : 'border border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink-2)] hover:text-[var(--ak-ink)]'
            }`}
          >
            {t.tabSignIn}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('REGISTER_LEARNER');
              setError('');
            }}
            className={`min-h-[40px] rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
              mode === 'REGISTER_LEARNER'
                ? 'bg-[#C9642E] text-[#F8F5EE]'
                : 'border border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink-2)] hover:text-[var(--ak-ink)]'
            }`}
          >
            {t.tabLearnerSignUp}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('REQUEST_CONTRIBUTOR');
              setError('');
            }}
            className={`min-h-[40px] rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
              mode === 'REQUEST_CONTRIBUTOR'
                ? 'bg-[#C9642E] text-[#F8F5EE]'
                : 'border border-[var(--ak-border)] bg-[var(--ak-elevated)] text-[var(--ak-ink-2)] hover:text-[var(--ak-ink)]'
            }`}
          >
            {t.tabApplyContributor}
          </button>
          {needsAdminClaim && (
            <button
              type="button"
              onClick={() => {
                setMode('CLAIM_ADMIN');
                setError('');
              }}
              className={`min-h-[40px] rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
                mode === 'CLAIM_ADMIN'
                  ? 'bg-[#C9642E] text-[#F8F5EE]'
                  : 'border border-[#C9642E]/50 bg-[var(--ak-elevated)] text-[var(--ak-accent-ink)] hover:bg-[var(--ak-elevated-hover)]'
              }`}
            >
              {t.tabClaimAdmin}
            </button>
          )}
        </div>

        <div className="p-6">
          {error && (
            <div
              className="mb-4 rounded-lg border px-4 py-3 text-sm font-medium"
              style={{
                color: 'var(--ak-err-fg)',
                backgroundColor: 'var(--ak-err-bg)',
                borderColor: 'var(--ak-err-bd)',
              }}
            >
              {error}
            </div>
          )}
          {successMsg && (
            <div
              className="mb-4 rounded-lg border px-4 py-3 text-sm font-medium"
              style={{
                color: 'var(--ak-ok-fg)',
                backgroundColor: 'var(--ak-ok-bg)',
                borderColor: 'var(--ak-ok-bd)',
              }}
            >
              {successMsg}
            </div>
          )}

          {needsAdminClaim && mode === 'LOGIN' && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-4 py-3.5">
              <div className="text-sm text-[var(--ak-ink)]">
                <p className="font-semibold">Initial Setup: Master Admin Password Unclaimed</p>
                <p className="mt-0.5 text-[var(--ak-ink-2)]">
                  Configure the Master Admin passphrase for{' '}
                  <span className="font-mono font-medium text-[var(--ak-accent-ink)]">
                    {masterEmail}
                  </span>{' '}
                  to activate governance.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMode('CLAIM_ADMIN')}
                className="rounded-lg bg-[#C9642E] px-4 py-2.5 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] whitespace-nowrap"
              >
                Claim Admin Account
              </button>
            </div>
          )}

          {mode === 'LOGIN' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className={labelCls}>{t.emailAddress}</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t.passwordLabel}</label>
                <PasswordInput
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg bg-[#C9642E] px-5 py-3 text-base font-semibold text-[#F8F5EE] hover:bg-[#D8733C] disabled:opacity-50"
              >
                <Lock className="h-4 w-4" />
                {loading ? t.signingIn : `${t.tabSignIn} · ${brandName}`}
              </button>
            </form>
          )}

          {mode === 'CLAIM_ADMIN' && (
            <form onSubmit={handleClaimAdmin} className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--ak-accent-ink)]" />
                <div className="text-sm text-[var(--ak-ink-2)]">
                  <p className="font-semibold text-[var(--ak-ink)]">
                    One-Time Master Admin &amp; Compliance Setup
                  </p>
                  <p className="mt-1">
                    Claim <span className="font-mono text-[var(--ak-accent-ink)]">{masterEmail}</span>{' '}
                    by setting a strong passphrase. Once claimed, this setup locks permanently.
                  </p>
                </div>
              </div>
              <div>
                <label className={labelCls}>Master Admin Display Name</label>
                <input
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Master Admin Password (minimum 8 characters)</label>
                <PasswordInput
                  required
                  minLength={8}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Choose a strong Master Admin password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg bg-[#C9642E] px-5 py-3 text-base font-semibold text-[#F8F5EE] hover:bg-[#D8733C] disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                {loading ? t.signingIn : t.tabClaimAdmin}
              </button>
            </form>
          )}

          {mode === 'REGISTER_LEARNER' && (
            <form onSubmit={handleRegisterLearner} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>{t.fullName}</label>
                  <input
                    type="text"
                    required
                    value={learnerName}
                    onChange={(e) => setLearnerName(e.target.value)}
                    placeholder="e.g. Sarah Namukasa"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t.emailAddress}</label>
                  <input
                    type="email"
                    required
                    value={learnerEmail}
                    onChange={(e) => setLearnerEmail(e.target.value)}
                    placeholder="sarah@university.ac.ug"
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>{t.countryLabel}</label>
                  <select
                    value={learnerCountry}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLearnerCountry(val);
                      setLearnerSystem(lookupSystemForCountry(val));
                    }}
                    className={inputCls}
                  >
                    {AFRICAN_COUNTRIES.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t.declaredLevel}</label>
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
              </div>
              <div>
                <label className={labelCls}>{t.primaryTrack}</label>
                <input
                  type="text"
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  placeholder="e.g. UNEB UACE Sciences, Data Science, Nursing"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t.passwordLabel}</label>
                <PasswordInput
                  required
                  minLength={8}
                  value={learnerPassword}
                  onChange={(e) => setLearnerPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg bg-[#C9642E] px-5 py-3 text-base font-semibold text-[#F8F5EE] hover:bg-[#D8733C] disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                {loading ? t.creatingAccount : t.createLearnerAccount}
              </button>
            </form>
          )}

          {mode === 'REQUEST_CONTRIBUTOR' && (
            <form onSubmit={handleSubmitRequest} className="space-y-4">
              <p className="text-sm leading-relaxed text-[var(--ak-ink-2)]">
                Teachers, Schools, Institutions, and Freelancers request access here. Upon Master
                Admin approval, temporary credentials are sent so you can complete identity
                verification and activate your publishing plan.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>{t.fullName}</label>
                  <input
                    type="text"
                    required
                    value={reqName}
                    onChange={(e) => setReqName(e.target.value)}
                    placeholder="Dr. Grace Achieng"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t.emailAddress}</label>
                  <input
                    type="email"
                    required
                    value={reqEmail}
                    onChange={(e) => setReqEmail(e.target.value)}
                    placeholder="grace@school.ac.ug"
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Contributor Type</label>
                  <select
                    value={reqCategory}
                    onChange={(e) => setReqCategory(e.target.value as AccountCategory)}
                    className={inputCls}
                  >
                    <option value="SOLO_TEACHER">Solo Teacher</option>
                    <option value="SCHOOL_INSTITUTION">School / Institution</option>
                    <option value="FREELANCER">Freelancer / Specialist</option>
                    <option value="OTHER">Other Contributor</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t.countryLabel}</label>
                  <select
                    value={reqCountry}
                    onChange={(e) => {
                      const val = e.target.value;
                      setReqCountry(val);
                      setReqSystem(lookupSystemForCountry(val));
                    }}
                    className={inputCls}
                  >
                    {AFRICAN_COUNTRIES.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Discipline</label>
                  <input
                    type="text"
                    required
                    value={reqSpec}
                    onChange={(e) => setReqSpec(e.target.value)}
                    placeholder="e.g. UACE Chemistry"
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Education Board / Accreditation System</label>
                <input
                  type="text"
                  required
                  value={reqSystem}
                  onChange={(e) => setReqSystem(e.target.value)}
                  className={inputCls}
                />
              </div>
              {reqCategory === 'SCHOOL_INSTITUTION' && (
                <div>
                  <label className={labelCls}>Registered School / Institution Name</label>
                  <input
                    type="text"
                    required
                    value={reqOrg}
                    onChange={(e) => setReqOrg(e.target.value)}
                    placeholder="Official accredited institution name"
                    className={inputCls}
                  />
                </div>
              )}
              <div>
                <label className={labelCls}>Educational Materials &amp; Credentials Summary</label>
                <textarea
                  required
                  rows={3}
                  value={reqStatement}
                  onChange={(e) => setReqStatement(e.target.value)}
                  placeholder="Describe the PDFs, textbooks, courses, or live classes you intend to share..."
                  className={inputCls}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="min-h-[46px] w-full rounded-lg bg-[#C9642E] px-5 py-3 text-base font-semibold text-[#F8F5EE] hover:bg-[#D8733C] disabled:opacity-50"
              >
                {loading ? t.submittingApplication : t.submitApplication}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

interface ForcePasswordChangeModalProps {
  user: UserProfile;
  onUpdated: (user: UserProfile) => void;
  onLogout: () => void;
}

export const ForcePasswordChangeModal: React.FC<ForcePasswordChangeModalProps> = ({
  user,
  onUpdated,
  onLogout,
}) => {
  const { t, dir } = useI18n();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      });
      onUpdated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      dir={dir}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
      style={{ backgroundColor: 'var(--ak-backdrop)' }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--ak-border)] bg-[var(--ak-surface)] text-[var(--ak-ink)] shadow-2xl">
        <div className="african-weave-rule" />
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <BrandMark brandName="Security Setup" compact />
              <h2 className="font-display text-xl font-bold text-[var(--ak-ink)]">
                {t.setPermanentPassword}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle compact />
              <LanguageSelector compact />
            </div>
          </div>
          <p className="text-sm leading-relaxed text-[var(--ak-ink-2)]">
            Signed in as <span className="font-semibold text-[var(--ak-ink)]">{user.email}</span>{' '}
            using temporary credentials. Choose a permanent password before proceeding to
            verification.
          </p>

          {error && (
            <div
              className="mt-4 rounded-lg border px-3.5 py-2.5 text-sm"
              style={{
                color: 'var(--ak-err-fg)',
                backgroundColor: 'var(--ak-err-bg)',
                borderColor: 'var(--ak-err-bd)',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[var(--ak-ink-2)]">
                {t.newPassword}
              </label>
              <PasswordInput
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[var(--ak-ink-2)]">
                {t.confirmPassword}
              </label>
              <PasswordInput
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={onLogout}
                className="min-h-[44px] rounded-lg border border-[var(--ak-border)] bg-[var(--ak-elevated)] px-4 py-2 text-sm font-semibold text-[var(--ak-ink)] hover:bg-[var(--ak-elevated-hover)]"
              >
                {t.signOut}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] rounded-lg bg-[#C9642E] px-5 py-2 text-sm font-semibold text-[#F8F5EE] hover:bg-[#D8733C] disabled:opacity-50"
              >
                {saving ? '...' : t.savePasswordContinue}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
