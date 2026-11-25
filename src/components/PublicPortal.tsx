import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  GraduationCap,
  Lock,
  Menu,
  Radio,
  Search,
  ShieldCheck,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { LanguageSelector, useI18n } from '../lib/i18n';
import type {
  AccountCategory,
  PublicGatewayInfo,
  ResourceType,
  UserProfile,
} from '../types/akademi';
import { BrandMark, DEFAULT_BRAND_LOGO } from './BrandMark';

interface PublicPortalProps {
  currentUser: UserProfile | null;
  onOpenAuth: (mode: 'LOGIN' | 'REGISTER_LEARNER' | 'REQUEST_CONTRIBUTOR') => void;
  onEnterDashboard: () => void;
}

type LevelFilter =
  | 'All Levels'
  | 'Primary'
  | 'O-Level'
  | 'A-Level'
  | 'Vocational'
  | 'University'
  | 'Professional';

type PolicyModalKey =
  | 'TERMS'
  | 'PRIVACY'
  | 'CONTRIBUTOR_AGREEMENT'
  | 'REFUND'
  | 'COPYRIGHT'
  | 'CHILD_SAFETY'
  | 'REPORT'
  | null;

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

export const PublicPortal: React.FC<PublicPortalProps> = ({
  currentUser,
  onOpenAuth,
  onEnterDashboard,
}) => {
  const { t, dir } = useI18n();
  const [gateway, setGateway] = useState<PublicGatewayInfo | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Audience & Resource filters
  const [howTab, setHowTab] = useState<'LEARNER' | 'EDUCATOR'>('LEARNER');
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('All Levels');
  const [formatFilter, setFormatFilter] = useState<'ALL' | ResourceType>('ALL');
  const [freeOnly, setFreeOnly] = useState(false);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [policyModal, setPolicyModal] = useState<PolicyModalKey>(null);

  // Public Abuse / Support Report state
  const [reportEmail, setReportEmail] = useState('');
  const [reportSubject, setReportSubject] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSent, setReportSent] = useState('');
  const [reportErr, setReportErr] = useState('');

  // Short Public Contributor Account Request Form
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [accountCategory, setAccountCategory] = useState<AccountCategory>('SOLO_TEACHER');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('Uganda');
  const [district, setDistrict] = useState('');
  const [educationSystem, setEducationSystem] = useState('UNEB / UBTEB / NCHE Uganda');
  const [specialization, setSpecialization] = useState('');
  const [plannedLevels, setPlannedLevels] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [statement, setStatement] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqError, setReqError] = useState('');
  const [reqSuccess, setReqSuccess] = useState('');

  useEffect(() => {
    apiFetch<PublicGatewayInfo>('/api/public/overview')
      .then(setGateway)
      .catch(() => {});
  }, []);

  const brandName = gateway?.platformName || 'Akademi';
  const logoUrl = gateway?.brandConfig.logoUrl || DEFAULT_BRAND_LOGO;

  const handleCountryChange = (nextCountry: string) => {
    setCountry(nextCountry);
    const found = AFRICAN_COUNTRIES.find((c) => c.name === nextCountry);
    setEducationSystem(found ? found.defaultSystem : 'IUCEA / Pan-African Curriculum');
  };

  const filteredResources = useMemo(() => {
    const list = gateway?.featuredResources || [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((item) => {
      if (freeOnly && !item.isFree) return false;
      if (levelFilter !== 'All Levels' && item.levelBucket !== levelFilter) return false;
      if (formatFilter !== 'ALL' && item.type !== formatFilter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.subject.toLowerCase().includes(q) ||
        item.educationLevel.toLowerCase().includes(q) ||
        item.contributorName.toLowerCase().includes(q)
      );
    });
  }, [gateway?.featuredResources, freeOnly, levelFilter, formatFilter, searchQuery]);

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    document.getElementById('resources')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setReqError('');
    setReqSuccess('');
    if (!agreedToTerms) {
      setReqError('Please agree to the Platform Terms and Data Privacy Policy to continue.');
      return;
    }
    setReqSubmitting(true);
    try {
      await apiFetch('/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          organizationName,
          accountCategory,
          email,
          phone,
          country,
          district,
          educationSystem,
          specialization,
          plannedLevels,
          portfolioUrl,
          statement,
        }),
      });
      setReqSuccess(
        `Application submitted. We review applications and email your onboarding credentials within ${
          gateway?.brandConfig.approvalTimelineLabel || '2 business days'
        }.`
      );
      setFullName('');
      setOrganizationName('');
      setEmail('');
      setPhone('');
      setDistrict('');
      setSpecialization('');
      setPlannedLevels('');
      setPortfolioUrl('');
      setStatement('');
      setAgreedToTerms(false);
    } catch (err) {
      setReqError(err instanceof Error ? err.message : 'Unable to submit request.');
    } finally {
      setReqSubmitting(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportErr('');
    setReportSent('');
    try {
      await apiFetch('/api/public/report', {
        method: 'POST',
        body: JSON.stringify({
          email: reportEmail,
          subject: reportSubject,
          details: reportDetails,
        }),
      });
      setReportSent('Report submitted to the Compliance & Moderation Team.');
      setReportEmail('');
      setReportSubject('');
      setReportDetails('');
    } catch (err) {
      setReportErr(err instanceof Error ? err.message : 'Unable to submit report.');
    }
  };

  const contributorPlans =
    gateway?.subscriptionPlans.filter(
      (p) => p.id === 'SOLO_PRO' || p.id === 'INSTITUTION_CAMPUS'
    ) || [];

  const institutions = gateway?.featuredCreators.filter((c) => c.isInstitution) || [];

  const fieldCls =
    'min-h-[46px] w-full rounded-lg border border-[#C8BFA8] bg-[#EFECE3] px-3.5 py-2.5 text-base text-[#0C1B2E] placeholder:text-[#6B665D] focus:border-[#0C1B2E] focus:outline-none';

  return (
    <div dir={dir} className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#EFECE3] text-[#0C1B2E]">
      {/* 1. Top Navigation Bar — clean, structured, persistent language selector across all sizes */}
      <header className="sticky top-0 z-40 border-b border-[#D4CCB9] bg-[#F6F3EB]/95 backdrop-blur-xs">
        <div className="african-weave-rule" />
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2.5 px-3 py-3 sm:gap-4 sm:px-6">
          {/* Zone 1: Software Brand Logo + Wordmark */}
          <a href="#top" className="min-w-0 shrink-0">
            <BrandMark brandName={brandName} logoUrl={logoUrl} />
          </a>

          {/* Zone 2: Clean single-line links (Desktop) */}
          <nav className="hidden items-center gap-6 text-base font-medium text-[#2D3D50] lg:flex">
            <a
              href="#resources"
              className="hover:text-[#0C1B2E] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {t.navResources}
            </a>
            <a
              href="#how-it-works"
              className="hover:text-[#0C1B2E] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {t.navHowItWorks}
            </a>
            <a
              href="#pricing"
              className="hover:text-[#0C1B2E] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {t.navPricing}
            </a>
            <a
              href="#live"
              className="hover:text-[#0C1B2E] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {t.navLive}
            </a>
            <a
              href="#help"
              className="hover:text-[#0C1B2E] hover:underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {t.navHelp}
            </a>
          </nav>

          {/* Zone 3: Persistent Language Selector + Auth Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <LanguageSelector compact />

            {currentUser ? (
              <button
                type="button"
                onClick={onEnterDashboard}
                className="hidden min-h-[42px] rounded-lg bg-[#0C1B2E] px-4 py-2 text-sm font-semibold text-[#F6F3EB] hover:bg-[#1A2F4A] sm:inline-flex sm:items-center whitespace-nowrap"
              >
                {t.openDashboard}
              </button>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => onOpenAuth('LOGIN')}
                  className="min-h-[42px] rounded-lg border border-[#C8BFA8] bg-[#EFECE3] px-3.5 py-2 text-sm font-semibold text-[#0C1B2E] hover:bg-[#E6E0D3] whitespace-nowrap"
                >
                  {t.signIn}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('REGISTER_LEARNER')}
                  className="min-h-[42px] rounded-lg bg-[#A44A1C] px-3.5 py-2 text-sm font-semibold text-[#F6F3EB] hover:bg-[#8A3B14] whitespace-nowrap"
                >
                  {t.signUpFree}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation drawer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#C8BFA8] bg-[#EFECE3] text-[#0C1B2E] lg:hidden"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Responsive Drawer for Tablet & Mobile */}
        {mobileMenuOpen && (
          <div className="border-t border-[#D4CCB9] bg-[#F6F3EB] px-4 py-4 lg:hidden">
            <div className="space-y-3">
              <div className="grid gap-1.5 text-base font-medium text-[#0C1B2E] sm:grid-cols-2">
                {[
                  ['#resources', t.navResources],
                  ['#how-it-works', t.navHowItWorks],
                  ['#for-educators', t.navEducators],
                  ['#pricing', t.navPricing],
                  ['#live', t.navLive],
                  ['#about', t.navAbout],
                  ['#help', t.navHelp],
                ].map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg px-3 py-2.5 hover:bg-[#E6E0D3]"
                  >
                    {label}
                  </a>
                ))}
              </div>

              <div className="border-t border-[#D4CCB9] pt-3 space-y-3">
                {currentUser ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onEnterDashboard();
                    }}
                    className="min-h-[44px] w-full rounded-lg bg-[#0C1B2E] px-4 py-2.5 text-sm font-semibold text-[#F6F3EB]"
                  >
                    {t.openDashboard}
                  </button>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenAuth('LOGIN');
                      }}
                      className="min-h-[44px] rounded-lg border border-[#C8BFA8] bg-[#EFECE3] px-4 py-2.5 text-sm font-semibold text-[#0C1B2E]"
                    >
                      {t.signIn}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenAuth('REGISTER_LEARNER');
                      }}
                      className="min-h-[44px] rounded-lg bg-[#A44A1C] px-4 py-2.5 text-sm font-semibold text-[#F6F3EB]"
                    >
                      {t.signUpFree}
                    </button>
                    <a
                      href="#apply"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex min-h-[44px] items-center justify-center rounded-lg bg-[#0C1B2E] px-4 py-2.5 text-sm font-semibold text-[#F6F3EB]"
                    >
                      {t.contributorLabel}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* 2. Hero Section */}
      <section id="top" className="mx-auto max-w-7xl px-4 pt-10 pb-12 sm:px-6 lg:pt-14">
        <div className="grid items-stretch gap-8 lg:grid-cols-12">
          <div className="min-w-0 flex flex-col justify-between space-y-6 lg:col-span-7">
            <div className="space-y-5">
              <p className="text-sm font-semibold text-[#A44A1C]">
                {gateway?.regionFocus || t.regionEyebrow}
              </p>
              <h1 className="text-balance font-display text-[clamp(2.25rem,4.2vw,3.55rem)] font-bold leading-[1.08] tracking-tight text-[#0C1B2E]">
                {t.heroHeadline}
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-[#2D3D50]">{t.heroSub}</p>
            </div>

            <div className="space-y-5">
              {/* Immediate Search Bar */}
              <form onSubmit={handleHeroSearch} className="flex max-w-2xl flex-col gap-2.5 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute top-3.5 left-4 h-5 w-5 text-[#55514A]" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t.searchPlaceholder}
                    className="min-h-[48px] w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] py-3 pr-4 pl-11 text-base text-[#0C1B2E] placeholder:text-[#6B665D] focus:border-[#0C1B2E] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="min-h-[48px] rounded-lg bg-[#0C1B2E] px-6 py-3 text-base font-semibold text-[#F6F3EB] hover:bg-[#1A2F4A] whitespace-nowrap"
                >
                  {t.search}
                </button>
              </form>

              {/* Two Clear CTAs — cleanly spaced, full-width on phone, inline on larger screens */}
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {currentUser ? (
                  <button
                    type="button"
                    onClick={onEnterDashboard}
                    className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#A44A1C] px-6 py-3 text-base font-semibold text-[#F6F3EB] hover:bg-[#8A3B14] whitespace-nowrap"
                  >
                    {t.openDashboard}
                    <ArrowRight className="h-5 w-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenAuth('REGISTER_LEARNER')}
                    className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#A44A1C] px-6 py-3 text-base font-semibold text-[#F6F3EB] hover:bg-[#8A3B14] whitespace-nowrap"
                  >
                    {t.ctaLearner}
                    <ArrowRight className="h-5 w-5" />
                  </button>
                )}
                <a
                  href="#apply"
                  className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-[#0C1B2E] bg-[#F6F3EB] px-6 py-3 text-base font-semibold text-[#0C1B2E] hover:bg-[#E6E0D3] whitespace-nowrap"
                >
                  {t.ctaContributor}
                </a>
              </div>

              <p className="text-sm font-medium text-[#4A463F]">{t.trustLine}</p>
            </div>
          </div>

          {/* 100% African Academic Atlas Card (logo kept strictly in navbar above) */}
          <div className="min-w-0 lg:col-span-5">
            <div className="flex h-full flex-col justify-between overflow-hidden rounded-xl border border-[#C8BFA8] bg-[#0C1B2E] text-[#F6F3EB]">
              <div className="african-weave-rule" />
              <div className="flex flex-1 flex-col justify-between p-6 sm:p-7">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[#243952] bg-[#13263E] text-[#E8B288]">
                    <GraduationCap className="h-8 w-8" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#E8B288]">{t.atlasEyebrow}</p>
                    <h2 className="font-display text-2xl font-bold text-[#F6F3EB]">
                      {brandName} · {t.atlasTitle}
                    </h2>
                    <p className="mt-0.5 text-sm text-[#CBD5E1]">
                      Kampala · Nairobi · Kigali · Dar es Salaam · Accra · Dakar
                    </p>
                  </div>
                </div>

                <div className="my-6 space-y-3 border-y border-[#243952] py-5 text-sm">
                  <p className="font-semibold text-[#E8B288]">{t.atlasBoardsTitle}</p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {[
                      'Uganda · UNEB, UBTEB, NCHE',
                      'Kenya · KNEC, CBC, TVETA, CUE',
                      'Tanzania · NECTA, NACTVET, TCU',
                      'Rwanda · NESA, RTB, HEC',
                      'West Africa · WAEC, NECO, CAMES',
                      'North & South · Arabic, CAPS, IEB',
                    ].map((board) => (
                      <div
                        key={board}
                        className="rounded-lg border border-[#243952] bg-[#13263E] px-3.5 py-2.5 text-sm font-medium text-[#F6F3EB]"
                      >
                        {board}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#CBD5E1]">
                  <span>{t.atlasFooterLeft}</span>
                  <span className="font-mono-nums font-semibold text-[#E8B288]">
                    Mobile Money · M-Pesa
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Trust Strip (live system counts + qualitative signals) */}
        <div className="mt-10 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] px-6 py-6">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-sm font-medium text-[#4A463F]">{t.trustEducators}</p>
              <p className="mt-1 text-2xl font-bold text-[#0C1B2E] font-mono-nums">
                {gateway?.stats.verifiedEducatorsCount ?? 0} {t.statUnitActive}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-[#4A463F]">{t.trustResources}</p>
              <p className="mt-1 text-2xl font-bold text-[#0C1B2E] font-mono-nums">
                {gateway?.stats.availableResourcesCount ?? 0} {t.statUnitFiles}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-[#4A463F]">{t.trustLearners}</p>
              <p className="mt-1 text-2xl font-bold text-[#0C1B2E] font-mono-nums">
                {gateway?.stats.registeredLearnersCount ?? 0} {t.statUnitEnrolled}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-[#4A463F]">{t.trustSubjects}</p>
              <p className="mt-1 text-2xl font-bold text-[#0C1B2E] font-mono-nums">
                {gateway?.stats.subjectsCount ?? 0} {t.statUnitSubjects} ·{' '}
                {gateway?.educationLevels.length ?? 0} {t.statUnitLevels}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-2.5 border-t border-[#D4CCB9] pt-4 text-sm font-medium text-[#2D3D50]">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#1E5631]" />
              {t.trustSignal1}
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#1E5631]" />
              {t.trustSignal2}
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#1E5631]" />
              {t.trustSignal3}
            </span>
          </div>
        </div>
      </section>

      {/* 4. How It Works (Audience Tabs) */}
      <section id="how-it-works" className="border-t border-[#D4CCB9] bg-[#E6E0D3] py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-[#0C1B2E]">
                {t.howItWorksTitle}
              </h2>
              <p className="mt-1.5 text-base text-[#2D3D50]">{t.howItWorksSub}</p>
            </div>

            <div className="grid w-full grid-cols-2 rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] p-1 sm:inline-flex sm:w-auto">
              <button
                type="button"
                onClick={() => setHowTab('LEARNER')}
                className={`rounded-md px-5 py-2.5 text-sm font-semibold transition-colors ${
                  howTab === 'LEARNER'
                    ? 'bg-[#0C1B2E] text-[#F6F3EB]'
                    : 'text-[#2D3D50] hover:text-[#0C1B2E]'
                }`}
              >
                {t.imLearner}
              </button>
              <button
                type="button"
                onClick={() => setHowTab('EDUCATOR')}
                className={`rounded-md px-5 py-2.5 text-sm font-semibold transition-colors ${
                  howTab === 'EDUCATOR'
                    ? 'bg-[#0C1B2E] text-[#F6F3EB]'
                    : 'text-[#2D3D50] hover:text-[#0C1B2E]'
                }`}
              >
                {t.imEducator}
              </button>
            </div>
          </div>

          {howTab === 'LEARNER' ? (
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {[
                {
                  step: '01',
                  title: t.learnerStep1Title,
                  desc: t.learnerStep1Desc,
                },
                {
                  step: '02',
                  title: t.learnerStep2Title,
                  desc: t.learnerStep2Desc,
                },
                {
                  step: '03',
                  title: t.learnerStep3Title,
                  desc: t.learnerStep3Desc,
                },
              ].map((s) => (
                <div
                  key={s.step}
                  className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6"
                >
                  <p className="font-mono text-sm font-bold text-[#A44A1C]">
                    {t.stepLabel} {s.step}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-bold text-[#0C1B2E]">{s.title}</h3>
                  <p className="mt-2 text-base leading-relaxed text-[#2D3D50]">{s.desc}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {(gateway?.onboardingSteps || []).map((s) => (
                <div
                  key={s.step}
                  className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6"
                >
                  <p className="font-mono text-sm font-bold text-[#A44A1C]">
                    {t.stepLabel} {s.step} · {s.actor}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-bold text-[#0C1B2E]">{s.title}</h3>
                  <p className="mt-2 text-base leading-relaxed text-[#2D3D50]">{s.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 5. Featured Public Resources & Categories */}
      <section id="resources" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#0C1B2E]">
              {t.resourcesTitle}
            </h2>
            <p className="mt-1.5 text-base text-[#2D3D50]">{t.resourcesSub}</p>
          </div>
          <button
            type="button"
            onClick={() => setFreeOnly((v) => !v)}
            className={`min-h-[44px] w-full sm:w-auto rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
              freeOnly
                ? 'border-[#1E5631] bg-[#1E5631] text-[#F6F3EB]'
                : 'border-[#C8BFA8] bg-[#F6F3EB] text-[#0C1B2E] hover:bg-[#E6E0D3]'
            }`}
          >
            {freeOnly ? t.showingFreeOnly : t.filterFreeOnly}
          </button>
        </div>

        {/* Clean Responsive Level & Format Controls (dropdown on small screens, segmented bar on desktop) */}
        <div className="mt-6 grid gap-3 sm:hidden">
          <select
            aria-label="Filter by Education Level"
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as LevelFilter)}
            className="min-h-[44px] w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3.5 py-2 text-sm font-semibold text-[#0C1B2E]"
          >
            {(['All Levels', 'Primary', 'O-Level', 'A-Level', 'Vocational', 'University', 'Professional'] as LevelFilter[]).map(
              (lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl === 'All Levels' ? t.allLevels : lvl}
                </option>
              )
            )}
          </select>
          <select
            aria-label="Filter by File Format"
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value as 'ALL' | ResourceType)}
            className="min-h-[44px] w-full rounded-lg border border-[#C8BFA8] bg-[#F6F3EB] px-3.5 py-2 text-sm font-semibold text-[#0C1B2E]"
          >
            {(['ALL', 'PDF', 'DOCX', 'VIDEO', 'BOOK', 'IMAGE'] as const).map((fmt) => (
              <option key={fmt} value={fmt}>
                Format: {fmt}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6 hidden flex-wrap items-center justify-between gap-4 sm:flex">
          <div className="flex flex-wrap gap-2">
            {(
              [
                'All Levels',
                'Primary',
                'O-Level',
                'A-Level',
                'Vocational',
                'University',
                'Professional',
              ] as LevelFilter[]
            ).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevelFilter(lvl)}
                className={`min-h-[40px] rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  levelFilter === lvl
                    ? 'bg-[#0C1B2E] text-[#F6F3EB]'
                    : 'border border-[#C8BFA8] bg-[#F6F3EB] text-[#2D3D50] hover:bg-[#E6E0D3]'
                }`}
              >
                {lvl === 'All Levels' ? t.allLevels : lvl}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-[#C8BFA8] bg-[#E6E0D3] p-1">
            {(['ALL', 'PDF', 'DOCX', 'VIDEO', 'BOOK', 'IMAGE'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setFormatFilter(fmt)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  formatFilter === fmt
                    ? 'bg-[#0C1B2E] text-[#F6F3EB]'
                    : 'text-[#2D3D50] hover:text-[#0C1B2E]'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>

        {filteredResources.length === 0 ? (
          <div className="mt-6 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-8 text-center text-base text-[#4A463F]">
            {t.noOpenResources}
          </div>
        ) : (
          <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredResources.map((r) => (
              <article
                key={r.id}
                className="flex flex-col justify-between rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-sm text-[#4A463F]">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#0C1B2E]">
                      <FileText className="h-4 w-4 text-[#A44A1C]" />
                      {r.type} · {r.levelBucket}
                    </span>
                    <span className="font-mono-nums font-bold text-[#1E5631]">{r.priceLabel}</span>
                  </div>
                  <h3 className="mt-3 font-display text-lg font-bold text-[#0C1B2E]">{r.title}</h3>
                  <p className="mt-2 text-base leading-relaxed text-[#2D3D50]">{r.description}</p>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#D4CCB9] pt-4 text-sm">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#2D3D50] truncate">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1E5631]" />
                    <span className="truncate">{r.contributorName}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => (currentUser ? onEnterDashboard() : onOpenAuth('LOGIN'))}
                    className="font-semibold text-[#A44A1C] hover:underline whitespace-nowrap shrink-0"
                  >
                    {currentUser ? t.openInLibrary : t.signInToAccess}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 6. Live Sessions Highlight */}
      <section id="live" className="border-y border-[#D4CCB9] bg-[#E6E0D3] py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-5">
              <p className="text-sm font-semibold text-[#A44A1C]">{t.liveEyebrow}</p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-[#0C1B2E]">
                {t.liveTitle}
              </h2>
              <p className="text-base leading-relaxed text-[#2D3D50]">{t.liveSub}</p>
              <div className="flex items-start gap-3 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5 text-sm text-[#2D3D50]">
                <Wifi className="mt-0.5 h-5 w-5 shrink-0 text-[#A44A1C]" />
                <div>
                  <p className="text-base font-bold text-[#0C1B2E]">
                    {gateway?.brandConfig.lowDataNote || t.lowDataTitle}
                  </p>
                  <p className="mt-1 leading-relaxed text-[#2D3D50]">{t.lowDataDesc}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 lg:col-span-7">
              {gateway && gateway.upcomingSeminars.length > 0 ? (
                gateway.upcomingSeminars.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm text-[#4A463F]">
                        <Radio className="h-4 w-4 text-[#A44A1C]" />
                        <span className="font-bold text-[#0C1B2E]">{s.status}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium">{s.hostName}</span>
                      </div>
                      <h3 className="mt-1.5 font-display text-lg font-bold text-[#0C1B2E]">
                        {s.title}
                      </h3>
                      <p className="mt-1 text-base text-[#2D3D50]">{s.topicSummary}</p>
                      <p className="mt-2 font-mono text-sm text-[#4A463F]">
                        {t.localTimeLabel}:{' '}
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(s.scheduledAt))}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => (currentUser ? onEnterDashboard() : onOpenAuth('LOGIN'))}
                      className="min-h-[44px] w-full sm:w-auto rounded-lg bg-[#0C1B2E] px-5 py-2.5 text-sm font-semibold text-[#F6F3EB] hover:bg-[#1A2F4A] whitespace-nowrap"
                    >
                      {currentUser ? t.enterLiveSchedule : t.signInToJoin}
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6 text-base text-[#2D3D50]">
                  {t.noLivePublic}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 7. Featured Educators & Partner Institutions */}
      <section id="educators" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="max-w-3xl">
          <h2 className="font-display text-3xl font-bold tracking-tight text-[#0C1B2E]">
            {t.educatorsTitle}
          </h2>
          <p className="mt-1.5 text-base text-[#2D3D50]">{t.educatorsSub}</p>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {gateway?.featuredCreators.map((cr) => (
            <div
              key={cr.publicKey}
              className="flex flex-col justify-between rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-5"
            >
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#C8BFA8] bg-[#0C1B2E] font-display text-base font-bold text-[#F6F3EB]">
                    {cr.displayName
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate font-display text-base font-bold text-[#0C1B2E]">
                        {cr.displayName}
                      </h3>
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1E5631]" />
                    </div>
                    <p className="truncate text-sm text-[#4A463F]">{cr.specialization}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#2D3D50]">{cr.bio}</p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-[#D4CCB9] pt-3.5 text-sm">
                <span className="font-mono-nums font-medium text-[#4A463F]">
                  {cr.followersCount} {t.followersWord}
                </span>
                <button
                  type="button"
                  onClick={() => (currentUser ? onEnterDashboard() : onOpenAuth('REGISTER_LEARNER'))}
                  className="rounded-lg border border-[#C8BFA8] bg-[#EFECE3] px-3.5 py-1.5 font-semibold text-[#0C1B2E] hover:bg-[#E6E0D3]"
                >
                  {t.follow}
                </button>
              </div>
            </div>
          ))}
        </div>

        {institutions.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] px-6 py-4">
            <span className="text-sm font-semibold text-[#4A463F]">
              {t.partnerInsts} · {brandName}
            </span>
            <div className="flex flex-wrap items-center gap-6">
              {institutions.map((inst) => (
                <span
                  key={inst.publicKey}
                  className="inline-flex items-center gap-2 text-base font-semibold text-[#0C1B2E]"
                >
                  <GraduationCap className="h-5 w-5 text-[#A44A1C]" />
                  {inst.displayName}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 8. Verification, Safety & Youth Protection */}
      <section id="safety" className="border-y border-[#D4CCB9] bg-[#E6E0D3] py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-[#A44A1C]">{t.trustEyebrow}</p>
            <h2 className="mt-1 font-display text-3xl font-bold tracking-tight text-[#0C1B2E]">
              {t.trustTitle}
            </h2>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[
              { title: t.safety1Title, body: t.safety1Body },
              { title: t.safety2Title, body: t.safety2Body },
              { title: t.safety3Title, body: t.safety3Body },
              { title: t.safety4Title, body: t.safety4Body },
              { title: t.safety5Title, body: t.safety5Body },
              { title: t.safety6Title, body: t.safety6Body },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6"
              >
                <div className="flex items-center gap-2.5 text-base font-bold text-[#0C1B2E]">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-[#A44A1C]" />
                  <span>{card.title}</span>
                </div>
                <p className="mt-2.5 text-base leading-relaxed text-[#2D3D50]">{card.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm text-[#2D3D50]">
            <span>
              {t.privacyLinePrefix}{' '}
              <button
                type="button"
                onClick={() => setPolicyModal('PRIVACY')}
                className="font-semibold text-[#0C1B2E] underline"
              >
                {t.readPrivacyPolicy}
              </button>
            </span>
            <button
              type="button"
              onClick={() => setPolicyModal('REPORT')}
              className="inline-flex items-center gap-1.5 font-semibold text-red-800 hover:underline"
            >
              <AlertTriangle className="h-4 w-4" />
              {t.reportConcern}
            </button>
          </div>
        </div>
      </section>

      {/* 9. Transparent Pricing & African Payment Rails */}
      <section id="pricing" className="mx-auto max-w-7xl space-y-10 px-4 py-14 sm:px-6">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight text-[#0C1B2E]">
            {t.pricingTitle}
          </h2>
          <p className="mt-1.5 text-base text-[#2D3D50]">{t.pricingSub}</p>
        </div>

        {/* Learner Pricing */}
        <div>
          <h3 className="mb-4 font-display text-xl font-bold text-[#0C1B2E]">{t.forLearners}</h3>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { name: t.tier1Name, price: t.tier1Price, desc: t.tier1Desc },
              { name: t.tier2Name, price: t.tier2Price, desc: t.tier2Desc },
              { name: t.tier3Name, price: t.tier3Price, desc: t.tier3Desc },
              { name: t.tier4Name, price: t.tier4Price, desc: t.tier4Desc },
            ].map((tier) => (
              <div
                key={tier.name}
                className="rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6"
              >
                <p className="text-sm font-semibold text-[#4A463F]">{tier.name}</p>
                <p className="mt-1.5 font-mono-nums text-2xl font-bold text-[#0C1B2E]">
                  {tier.price}
                </p>
                <p className="mt-2.5 text-base leading-relaxed text-[#2D3D50]">{tier.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Contributor Plan Comparison (Cards on mobile, fixed table on desktop) */}
        <div className="overflow-hidden rounded-xl border border-[#C8BFA8] bg-[#F6F3EB]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D4CCB9] px-6 py-5">
            <div>
              <h3 className="font-display text-xl font-bold text-[#0C1B2E]">
                {t.forContributors}
              </h3>
              <p className="text-sm text-[#4A463F]">{t.appsReviewedNote}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0C1B2E]">
              {gateway?.brandConfig.paymentMethods.map((pm) => (
                <span
                  key={pm}
                  className="rounded-md border border-[#C8BFA8] bg-[#EFECE3] px-3 py-1"
                >
                  {pm}
                </span>
              ))}
            </div>
          </div>

          <div className="divide-y divide-[#D4CCB9] md:hidden">
            {contributorPlans.map((p) => (
              <div key={p.id} className="p-5 space-y-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-[#0C1B2E]">{p.name}</p>
                    <p className="text-[#4A463F]">{p.audience}</p>
                  </div>
                  <span className="font-mono-nums text-base font-bold text-[#A44A1C] shrink-0">
                    ${p.monthlyUsd} / mo
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 text-[#2D3D50]">
                  <div>
                    <span className="font-semibold text-[#0C1B2E]">{t.colStorage}: </span>
                    {p.storageLabel}
                  </div>
                  <div>
                    <span className="font-semibold text-[#0C1B2E]">{t.colLiveCap}: </span>
                    {p.liveCapacityLabel}
                  </div>
                  <div>
                    <span className="font-semibold text-[#0C1B2E]">{t.colCommission}: </span>
                    {p.commissionLabel}
                  </div>
                  <div>
                    <span className="font-semibold text-[#0C1B2E]">{t.colStaffVerify}: </span>
                    {p.id === 'INSTITUTION_CAMPUS'
                      ? 'Multi-staff Course Admins'
                      : 'Single educator'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="border-b border-[#D4CCB9] bg-[#E6E0D3] text-[#0C1B2E]">
                <tr>
                  <th className="w-[22%] px-5 py-3.5 font-bold">{t.colPlan}</th>
                  <th className="w-[14%] px-4 py-3.5 font-bold">{t.colMonthly}</th>
                  <th className="w-[14%] px-4 py-3.5 font-bold">{t.colStorage}</th>
                  <th className="w-[14%] px-4 py-3.5 font-bold">{t.colLiveCap}</th>
                  <th className="w-[14%] px-4 py-3.5 font-bold">{t.colCommission}</th>
                  <th className="w-[22%] px-5 py-3.5 font-bold">{t.colStaffVerify}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D4CCB9]">
                {contributorPlans.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-4 align-top">
                      <p className="text-base font-bold text-[#0C1B2E] break-words">{p.name}</p>
                      <p className="text-sm text-[#4A463F] break-words">{p.audience}</p>
                    </td>
                    <td className="px-4 py-4 align-top font-mono-nums text-base font-bold text-[#A44A1C]">
                      ${p.monthlyUsd} / mo
                    </td>
                    <td className="px-4 py-4 align-top text-[#2D3D50]">{p.storageLabel}</td>
                    <td className="px-4 py-4 align-top text-[#2D3D50]">{p.liveCapacityLabel}</td>
                    <td className="px-4 py-4 align-top text-[#2D3D50]">{p.commissionLabel}</td>
                    <td className="px-5 py-4 align-top text-[#2D3D50] break-words">
                      {p.id === 'INSTITUTION_CAMPUS'
                        ? 'Multi-staff Course Admins + Registrar clearance'
                        : 'Single educator · direct prerequisite verification'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 10. For Educators & Institutions Conversion Section */}
      <section id="for-educators" className="border-t border-[#243952] bg-[#0C1B2E] py-14 text-[#F6F3EB]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-8 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-6">
              <p className="text-sm font-semibold text-[#E8B288]">{t.forEducatorsEyebrow}</p>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {t.forEducatorsTitle}
              </h2>
              <p className="text-base leading-relaxed text-[#CBD5E1]">{t.forEducatorsSub}</p>
              <a
                href="#apply"
                className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#A44A1C] px-6 py-3 text-base font-semibold text-[#F6F3EB] hover:bg-[#8A3B14]"
              >
                {t.ctaContributor}
                <ArrowRight className="h-5 w-5" />
              </a>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2 lg:col-span-6">
              {[
                t.edBenefit1,
                t.edBenefit2,
                t.edBenefit3,
                t.edBenefit4,
                t.edBenefit5,
                t.edBenefit6,
              ].map((benefit) => (
                <div
                  key={benefit}
                  className="flex items-start gap-2.5 rounded-xl border border-[#243952] bg-[#13263E] p-4 text-sm font-medium text-[#F6F3EB]"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#6EE7B7]" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 11. Short Public Contributor Request Form */}
      <section id="apply" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-6 sm:p-8 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5">
            <h2 className="font-display text-3xl font-bold tracking-tight text-[#0C1B2E]">
              {t.applyTitle}
            </h2>
            <p className="text-base leading-relaxed text-[#2D3D50]">{t.applySub}</p>
            <div className="space-y-3 border-t border-[#D4CCB9] pt-4 text-sm text-[#2D3D50]">
              <p className="flex items-start gap-2.5">
                <Lock className="mt-0.5 h-5 w-5 shrink-0 text-[#A44A1C]" />
                <span>
                  {t.applyTimelinePrefix}{' '}
                  <strong>{gateway?.brandConfig.approvalTimelineLabel || '2 business days'}</strong>.
                </span>
              </p>
              <p className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1E5631]" />
                <span>{t.applyPrivacyNote}</span>
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmitApplication} className="space-y-4 lg:col-span-7">
            {reqError && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
                {reqError}
              </div>
            )}
            {reqSuccess && (
              <div className="rounded-lg border border-[#1E5631]/40 bg-[#E8F0EA] px-4 py-3 text-sm font-medium text-[#1E5631]">
                {reqSuccess}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0C1B2E]">
                  {t.fullName}
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Sarah Namukasa"
                  className={fieldCls}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0C1B2E]">
                  {t.applyAccountType}
                </label>
                <select
                  value={accountCategory}
                  onChange={(e) => setAccountCategory(e.target.value as AccountCategory)}
                  className={fieldCls}
                >
                  <option value="SOLO_TEACHER">{t.applyCatSolo}</option>
                  <option value="SCHOOL_INSTITUTION">{t.applyCatInst}</option>
                  <option value="FREELANCER">{t.applyCatFree}</option>
                  <option value="OTHER">{t.applyCatOther}</option>
                </select>
              </div>
            </div>

            {accountCategory === 'SCHOOL_INSTITUTION' && (
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0C1B2E]">
                  {t.applySchoolName}
                </label>
                <input
                  type="text"
                  required
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Official registered school or college name"
                  className={fieldCls}
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0C1B2E]">
                  {t.emailAddress}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@school.ac.ug"
                  className={fieldCls}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0C1B2E]">
                  {t.applyPhone}
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+256 772 ..."
                  className={fieldCls}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0C1B2E]">
                  {t.countryLabel}
                </label>
                <select
                  value={country}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className={fieldCls}
                >
                  {AFRICAN_COUNTRIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0C1B2E]">
                  {t.applyDistrict}
                </label>
                <input
                  type="text"
                  required
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="e.g. Kampala, Nairobi, Kigali"
                  className={fieldCls}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0C1B2E]">
                  {t.applySystem}
                </label>
                <input
                  type="text"
                  required
                  value={educationSystem}
                  onChange={(e) => setEducationSystem(e.target.value)}
                  className={fieldCls}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0C1B2E]">
                  {t.applySubjects}
                </label>
                <input
                  type="text"
                  required
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  placeholder="e.g. Biology, Mathematics, Solar PV"
                  className={fieldCls}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0C1B2E]">
                  {t.applyLevels}
                </label>
                <input
                  type="text"
                  required
                  value={plannedLevels}
                  onChange={(e) => setPlannedLevels(e.target.value)}
                  placeholder="e.g. O-Level UCE & A-Level UACE"
                  className={fieldCls}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#0C1B2E]">
                {t.applyPortfolio}
              </label>
              <input
                type="url"
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
                placeholder="https://..."
                className={fieldCls}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#0C1B2E]">
                {t.applyStatement}
              </label>
              <textarea
                required
                rows={3}
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                placeholder="Describe your PDFs, books, courses, or live revision sessions..."
                className={fieldCls}
              />
            </div>

            <label className="flex items-start gap-2.5 text-sm text-[#2D3D50]">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-1 h-4 w-4 accent-[#0C1B2E]"
              />
              <span>
                {t.applyAgreePrefix}{' '}
                <button
                  type="button"
                  onClick={() => setPolicyModal('TERMS')}
                  className="font-semibold text-[#0C1B2E] underline"
                >
                  {t.applyTermsLink}
                </button>{' '}
                {t.applyAnd}{' '}
                <button
                  type="button"
                  onClick={() => setPolicyModal('PRIVACY')}
                  className="font-semibold text-[#0C1B2E] underline"
                >
                  {t.applyPrivacyLink}
                </button>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={reqSubmitting}
              className="min-h-[48px] rounded-lg bg-[#0C1B2E] px-6 py-3 text-base font-semibold text-[#F6F3EB] hover:bg-[#1A2F4A] disabled:opacity-50"
            >
              {reqSubmitting ? t.submittingApplication : t.submitApplication}
            </button>
          </form>
        </div>
      </section>

      {/* 12. Founding Educators & Mission Story */}
      <section id="about" className="border-t border-[#D4CCB9] bg-[#E6E0D3] py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-8 rounded-xl border border-[#C8BFA8] bg-[#F6F3EB] p-8 lg:grid-cols-12">
            <div className="space-y-3 lg:col-span-7">
              <p className="text-sm font-semibold text-[#A44A1C]">{t.aboutEyebrow}</p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-[#0C1B2E]">
                {t.aboutTitle}
              </h2>
              <p className="text-base leading-relaxed text-[#2D3D50]">{t.aboutBody}</p>
            </div>
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-[#C8BFA8] bg-[#EFECE3] p-6 lg:col-span-5">
              <div>
                <h3 className="font-display text-lg font-bold text-[#0C1B2E]">
                  {t.aboutFrameworkTitle}
                </h3>
                <p className="mt-1.5 text-base leading-relaxed text-[#2D3D50]">
                  {t.aboutFrameworkBody}
                </p>
              </div>
              <a
                href="#apply"
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg bg-[#A44A1C] px-5 py-2.5 text-sm font-semibold text-[#F6F3EB] hover:bg-[#8A3B14]"
              >
                <Users className="h-4 w-4" />
                {t.ctaContributor}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 13. FAQ Accordion */}
      <section id="help" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-bold tracking-tight text-[#0C1B2E]">
            {t.faqTitle}
          </h2>
          <p className="mt-1.5 text-base text-[#2D3D50]">{t.faqSub}</p>
        </div>

        <div className="mt-6 divide-y divide-[#D4CCB9] rounded-xl border border-[#C8BFA8] bg-[#F6F3EB]">
          {(gateway?.faqs || []).map((faq, idx) => {
            const isOpen = openFaqIdx === idx;
            return (
              <div key={faq.question}>
                <button
                  type="button"
                  onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-4 text-start text-base font-semibold text-[#0C1B2E] hover:bg-[#E6E0D3]/60"
                >
                  <span>{faq.question}</span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-[#4A463F] transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 text-base leading-relaxed text-[#2D3D50]">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 14. Final Call-to-Action Banner */}
      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6">
        <div className="overflow-hidden rounded-xl border border-[#243952] bg-[#0C1B2E] text-[#F6F3EB]">
          <div className="african-weave-rule" />
          <div className="flex flex-wrap items-center justify-between gap-6 px-6 py-9 sm:px-8">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight">{t.finalCtaTitle}</h2>
              <p className="mt-1.5 text-base text-[#CBD5E1]">{t.finalCtaSub}</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() =>
                  currentUser ? onEnterDashboard() : onOpenAuth('REGISTER_LEARNER')
                }
                className="min-h-[46px] rounded-lg bg-[#A44A1C] px-6 py-3 text-base font-semibold text-[#F6F3EB] hover:bg-[#8A3B14] whitespace-nowrap"
              >
                {currentUser ? t.openDashboard : t.ctaLearner}
              </button>
              <a
                href="#apply"
                className="flex min-h-[46px] items-center justify-center rounded-lg border border-[#D4CCB9] px-6 py-3 text-base font-semibold text-[#F6F3EB] hover:bg-[#13263E] whitespace-nowrap"
              >
                {t.ctaContributor}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 15. Clean Footer (logo kept strictly in software top navbar, subtle credit only) */}
      <footer className="border-t border-[#C8BFA8] bg-[#E6E0D3]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <div className="grid gap-8 md:grid-cols-4 text-sm text-[#2D3D50]">
            <div className="space-y-2.5">
              <BrandMark brandName={brandName} showLogo={false} />
              <p>{gateway?.brandConfig.physicalAddress}</p>
              <p>Support: {gateway?.brandConfig.supportEmail}</p>
              <p>WhatsApp / Helpdesk: {gateway?.brandConfig.supportWhatsApp}</p>
              <p className="pt-1 text-xs text-[#55514A]">Software by Novic Technologies</p>
            </div>

            <div className="space-y-2.5">
              <p className="text-base font-bold text-[#0C1B2E]">{t.footerPlatform}</p>
              <ul className="space-y-2">
                <li>
                  <a href="#about" className="hover:text-[#0C1B2E] hover:underline">
                    {t.navAbout}
                  </a>
                </li>
                <li>
                  <a href="#resources" className="hover:text-[#0C1B2E] hover:underline">
                    {t.navResources}
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-[#0C1B2E] hover:underline">
                    {t.navPricing}
                  </a>
                </li>
                <li>
                  <a href="#help" className="hover:text-[#0C1B2E] hover:underline">
                    {t.navHelp}
                  </a>
                </li>
              </ul>
            </div>

            <div className="space-y-2.5">
              <p className="text-base font-bold text-[#0C1B2E]">{t.footerPolicies}</p>
              <ul className="space-y-2">
                <li>
                  <button
                    type="button"
                    onClick={() => setPolicyModal('TERMS')}
                    className="hover:text-[#0C1B2E] hover:underline"
                  >
                    {t.policyTerms}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setPolicyModal('PRIVACY')}
                    className="hover:text-[#0C1B2E] hover:underline"
                  >
                    {t.policyPrivacy}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setPolicyModal('CONTRIBUTOR_AGREEMENT')}
                    className="hover:text-[#0C1B2E] hover:underline"
                  >
                    {t.policyContributor}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setPolicyModal('REFUND')}
                    className="hover:text-[#0C1B2E] hover:underline"
                  >
                    {t.policyRefund}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setPolicyModal('COPYRIGHT')}
                    className="hover:text-[#0C1B2E] hover:underline"
                  >
                    {t.policyCopyright}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setPolicyModal('CHILD_SAFETY')}
                    className="hover:text-[#0C1B2E] hover:underline"
                  >
                    {t.policyChildSafety}
                  </button>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <p className="text-base font-bold text-[#0C1B2E]">{t.footerPayments}</p>
              <div className="flex flex-wrap gap-1.5">
                {gateway?.brandConfig.paymentMethods.map((pm) => (
                  <span
                    key={pm}
                    className="rounded-md border border-[#C8BFA8] bg-[#F6F3EB] px-2.5 py-1 text-sm font-medium text-[#0C1B2E]"
                  >
                    {pm}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <LanguageSelector compact />
                <button
                  type="button"
                  onClick={() => setPolicyModal('REPORT')}
                  className="font-semibold text-red-800 hover:underline"
                >
                  {t.reportAbuse}
                </button>
              </div>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="inline-flex items-center gap-1 text-sm font-semibold text-[#0C1B2E] hover:underline"
              >
                <ChevronUp className="h-4 w-4" />
                {t.backToTop}
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Policy & Report Abuse Modal */}
      {policyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0C1B2E]/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-[#C8BFA8] bg-[#EFECE3] shadow-2xl">
            <div className="african-weave-rule" />
            <div className="p-6">
              <div className="flex items-center justify-between border-b border-[#D4CCB9] pb-3">
                <h3 className="font-display text-lg font-bold text-[#0C1B2E]">
                  {policyModal === 'REPORT'
                    ? t.reportAbuse
                    : policyModal === 'PRIVACY'
                      ? t.policyPrivacy
                      : policyModal === 'TERMS'
                        ? t.policyTerms
                        : policyModal === 'CONTRIBUTOR_AGREEMENT'
                          ? t.policyContributor
                          : policyModal === 'REFUND'
                            ? t.policyRefund
                            : policyModal === 'COPYRIGHT'
                              ? t.policyCopyright
                              : t.policyChildSafety}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setPolicyModal(null);
                    setReportSent('');
                    setReportErr('');
                  }}
                  aria-label="Close modal"
                  className="rounded-lg p-1.5 text-[#2D3D50] hover:bg-[#E6E0D3]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {policyModal === 'REPORT' ? (
                <form onSubmit={handleSubmitReport} className="mt-4 space-y-3 text-sm">
                  {reportErr && (
                    <div className="rounded-lg bg-red-50 p-3 text-red-900">{reportErr}</div>
                  )}
                  {reportSent && (
                    <div className="rounded-lg bg-[#E8F0EA] p-3 text-[#1E5631]">{reportSent}</div>
                  )}
                  <div>
                    <label className="mb-1 block font-semibold text-[#0C1B2E]">Your Email</label>
                    <input
                      type="email"
                      required
                      value={reportEmail}
                      onChange={(e) => setReportEmail(e.target.value)}
                      placeholder="you@example.com"
                      className={fieldCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-[#0C1B2E]">Issue Summary</label>
                    <input
                      type="text"
                      required
                      value={reportSubject}
                      onChange={(e) => setReportSubject(e.target.value)}
                      placeholder="e.g. Copyright concern or safety report"
                      className={fieldCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-[#0C1B2E]">Details</label>
                    <textarea
                      required
                      rows={3}
                      value={reportDetails}
                      onChange={(e) => setReportDetails(e.target.value)}
                      className={fieldCls}
                    />
                  </div>
                  <button
                    type="submit"
                    className="min-h-[44px] rounded-lg bg-red-800 px-5 py-2.5 text-sm font-semibold text-[#F6F3EB] hover:bg-red-900"
                  >
                    Submit to Moderation Team
                  </button>
                </form>
              ) : (
                <div className="mt-4 space-y-3 text-base leading-relaxed text-[#2D3D50]">
                  {policyModal === 'PRIVACY' && (
                    <p>
                      {brandName} collects only necessary academic and identity verification records.
                      National IDs, passports, phone numbers, and residential addresses are strictly
                      isolated and never shared with educators, institutions, or public visitors.
                    </p>
                  )}
                  {policyModal === 'TERMS' && (
                    <p>
                      Use of {brandName} is governed by verified account conduct. Learners must
                      submit authentic academic transcripts for prerequisite-gated courses, and
                      contributors remain responsible for accurate educational content.
                    </p>
                  )}
                  {policyModal === 'CONTRIBUTOR_AGREEMENT' && (
                    <p>
                      Approved contributors must maintain valid National ID/Passport KYC and an
                      active subscription. Platform sales incur a{' '}
                      {gateway?.brandConfig.commissionRatePercent ?? 15}% service commission.
                    </p>
                  )}
                  {policyModal === 'REFUND' && (
                    <p>
                      If a paid live course or session is cancelled before completion, learners may
                      request a full refund through the Support desk within 7 days of cancellation.
                    </p>
                  )}
                  {policyModal === 'COPYRIGHT' && (
                    <p>
                      Contributors warrant they hold publishing rights for uploaded PDFs, DOCX
                      guides, videos, images, and digital books. Valid takedown notices are
                      actioned promptly by Master Admin moderation.
                    </p>
                  )}
                  {policyModal === 'CHILD_SAFETY' && (
                    <p>
                      Primary and Secondary learners participate in host-moderated classrooms where
                      chat muting, Q&amp;A queues, and participant removal protect young students.
                      Zero confidential student contact data is ever exposed.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
