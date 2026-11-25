import React, { useState } from 'react';
import {
  Lock,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LanguageSelector, useI18n } from '../lib/i18n';
import { BrandMark } from './BrandMark';

export interface DashboardNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  locked?: boolean;
}

interface DashboardShellProps {
  brandName?: string;
  logoUrl?: string;
  breadcrumbLeft: string;
  breadcrumbRight: string;
  userName: string;
  userMeta: string;
  navItems: DashboardNavItem[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onGoPublic: () => void;
  onLogout: () => void;
  sidebarFooterAddon?: React.ReactNode;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  brandName = 'Akademi',
  logoUrl,
  breadcrumbLeft,
  breadcrumbRight,
  userName,
  userMeta,
  navItems,
  activeTab,
  onSelectTab,
  onGoPublic,
  onLogout,
  sidebarFooterAddon,
  headerRight,
  children,
}) => {
  const { t, dir } = useI18n();
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  return (
    <div dir={dir} className="flex min-h-screen w-full max-w-full overflow-x-hidden bg-[#EFECE3] text-[#0C1B2E]">
      {/* Desktop Sidebar (Minimizable between full rail & compact icon rail) */}
      <aside
        className={`hidden shrink-0 flex-col justify-between border-e border-[#C8BFA8] bg-[#F6F3EB] transition-all duration-200 lg:flex ${
          sidebarMinimized ? 'w-20 p-3' : 'w-72 p-5'
        }`}
      >
        <div>
          <div className="mb-7 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onGoPublic}
              title={t.publicView}
              className="text-start focus-visible:outline-2 focus-visible:outline-[#0C1B2E]"
            >
              <BrandMark brandName={brandName} logoUrl={logoUrl} compact={sidebarMinimized} />
            </button>
            <button
              type="button"
              onClick={() => setSidebarMinimized((v) => !v)}
              aria-label={sidebarMinimized ? t.expandSidebar : t.minimizeSidebar}
              title={sidebarMinimized ? t.expandSidebar : t.minimizeSidebar}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#C8BFA8] bg-[#EFECE3] text-[#0C1B2E] hover:bg-[#E6E0D3]"
            >
              {sidebarMinimized ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>

          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.locked}
                  title={item.label}
                  onClick={() => onSelectTab(item.id)}
                  className={`flex min-h-[44px] w-full items-center rounded-lg px-3 py-2.5 text-start text-sm font-semibold transition-colors ${
                    sidebarMinimized ? 'justify-center' : 'justify-between gap-2.5'
                  } ${
                    active
                      ? 'bg-[#0C1B2E] text-[#F6F3EB]'
                      : item.locked
                        ? 'cursor-not-allowed text-[#7A756B] opacity-70'
                        : 'text-[#2D3D50] hover:bg-[#E6E0D3] hover:text-[#0C1B2E]'
                  }`}
                >
                  <span className="flex items-center gap-3 truncate">
                    <Icon className="h-5 w-5 shrink-0" />
                    {!sidebarMinimized && <span className="truncate">{item.label}</span>}
                  </span>
                  {!sidebarMinimized && item.locked && <Lock className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </nav>

          {!sidebarMinimized && sidebarFooterAddon}
        </div>

        <div className="border-t border-[#D4CCB9] pt-4">
          {!sidebarMinimized && (
            <div className="mb-3">
              <p className="truncate text-sm font-bold text-[#0C1B2E]">{userName}</p>
              <p className="truncate text-sm text-[#4A463F]">{userMeta}</p>
            </div>
          )}
          <div className={`flex items-center gap-2 ${sidebarMinimized ? 'flex-col' : ''}`}>
            {!sidebarMinimized && (
              <button
                type="button"
                onClick={onGoPublic}
                className="min-h-[40px] flex-1 rounded-lg border border-[#C8BFA8] bg-[#EFECE3] px-3 py-2 text-sm font-semibold text-[#0C1B2E] hover:bg-[#E6E0D3]"
              >
                {t.publicView}
              </button>
            )}
            <button
              type="button"
              onClick={onLogout}
              title={t.signOut}
              aria-label={t.signOut}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#C8BFA8] bg-[#EFECE3] text-[#0C1B2E] hover:bg-[#E6E0D3]"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#0C1B2E]/65 backdrop-blur-xs"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <aside className="relative z-10 flex w-80 max-w-[88vw] flex-col justify-between border-e border-[#C8BFA8] bg-[#F6F3EB] p-5 shadow-2xl">
            <div className="overflow-y-auto">
              <div className="mb-5 flex items-center justify-between gap-2">
                <button type="button" onClick={onGoPublic}>
                  <BrandMark brandName={brandName} logoUrl={logoUrl} />
                </button>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  aria-label="Close menu"
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#C8BFA8] bg-[#EFECE3] text-[#0C1B2E]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-4">
                <LanguageSelector className="w-full justify-between" />
              </div>

              <nav className="space-y-1.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={item.locked}
                      onClick={() => {
                        onSelectTab(item.id);
                        setMobileDrawerOpen(false);
                      }}
                      className={`flex min-h-[44px] w-full items-center justify-between gap-2.5 rounded-lg px-3.5 py-2.5 text-start text-sm font-semibold ${
                        active
                          ? 'bg-[#0C1B2E] text-[#F6F3EB]'
                          : item.locked
                            ? 'cursor-not-allowed text-[#7A756B] opacity-70'
                            : 'text-[#2D3D50] hover:bg-[#E6E0D3]'
                      }`}
                    >
                      <span className="flex items-center gap-3 truncate">
                        <Icon className="h-5 w-5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.locked && <Lock className="h-4 w-4 shrink-0" />}
                    </button>
                  );
                })}
              </nav>
              {sidebarFooterAddon}
            </div>

            <div className="border-t border-[#D4CCB9] pt-4">
              <p className="truncate text-sm font-bold text-[#0C1B2E]">{userName}</p>
              <p className="truncate text-sm text-[#4A463F]">{userMeta}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onGoPublic}
                  className="min-h-[42px] rounded-lg border border-[#C8BFA8] bg-[#EFECE3] px-3 py-2 text-sm font-semibold text-[#0C1B2E]"
                >
                  {t.publicView}
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  className="min-h-[42px] rounded-lg bg-[#0C1B2E] px-3 py-2 text-sm font-semibold text-[#F6F3EB]"
                >
                  {t.signOut}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="african-weave-rule" />
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D4CCB9] bg-[#F6F3EB] px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#C8BFA8] bg-[#EFECE3] text-[#0C1B2E] lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="truncate text-base text-[#2D3D50]">
              <span className="font-bold text-[#0C1B2E]">{breadcrumbLeft}</span>
              <span className="mx-2 text-[#A49B87]">/</span>
              <span className="font-medium">{breadcrumbRight}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <LanguageSelector compact />
            {headerRight}
          </div>
        </header>

        {/* Quick Scrollable Mobile Strip */}
        <div className="flex gap-2 overflow-x-auto border-b border-[#D4CCB9] bg-[#E6E0D3] px-4 py-2 lg:hidden">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={item.locked}
              onClick={() => onSelectTab(item.id)}
              className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap shrink-0 ${
                activeTab === item.id
                  ? 'bg-[#0C1B2E] text-[#F6F3EB]'
                  : 'bg-[#F6F3EB] text-[#2D3D50] disabled:opacity-45'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <main className="min-w-0 w-full flex-1 space-y-6 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
};
