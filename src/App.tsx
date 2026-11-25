import { useEffect, useState } from 'react';
import { AuthModal, ForcePasswordChangeModal } from './components/AuthModal';
import { ContributorDashboard } from './components/ContributorDashboard';
import { LearnerDashboard } from './components/LearnerDashboard';
import { MasterAdminDashboard } from './components/MasterAdminDashboard';
import { PublicPortal } from './components/PublicPortal';
import { createAkademiSocket, setAuthToken } from './lib/api';
import { LanguageProvider } from './lib/i18n';
import type { UserProfile } from './types/akademi';

function AkademiAppContent() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [viewMode, setViewMode] = useState<'PUBLIC' | 'DASHBOARD'>('PUBLIC');
  const [authModalMode, setAuthModalMode] = useState<
    'LOGIN' | 'REGISTER_LEARNER' | 'REQUEST_CONTRIBUTOR' | 'CLAIM_ADMIN' | null
  >(null);

  // Real-time background WebSocket listener for automatic subscription & KYC state flips
  useEffect(() => {
    if (!currentUser) return;
    const ws = createAkademiSocket((event, payload) => {
      if (event === 'subscription:updated') {
        setCurrentUser((prev) =>
          prev
            ? {
                ...prev,
                subscriptionStatus: payload.subscriptionStatus as UserProfile['subscriptionStatus'],
                subscriptionPlan:
                  (payload.subscriptionPlan as UserProfile['subscriptionPlan']) ||
                  prev.subscriptionPlan,
              }
            : prev
        );
      } else if (event === 'kyc:updated') {
        setCurrentUser((prev) =>
          prev
            ? {
                ...prev,
                kycStatus: payload.kycStatus as UserProfile['kycStatus'],
                kycRejectionReason: payload.kycRejectionReason
                  ? String(payload.kycRejectionReason)
                  : undefined,
              }
            : prev
        );
      }
    });

    return () => {
      ws?.close();
    };
  }, [currentUser?.id]);

  const handleAuthenticated = (user: UserProfile) => {
    setCurrentUser(user);
    setAuthModalMode(null);
    setViewMode('DASHBOARD');
  };

  const handleLogout = () => {
    setAuthToken('');
    setCurrentUser(null);
    setViewMode('PUBLIC');
  };

  if (currentUser && currentUser.mustChangePassword) {
    return (
      <ForcePasswordChangeModal
        user={currentUser}
        onUpdated={(updated) => setCurrentUser(updated)}
        onLogout={handleLogout}
      />
    );
  }

  if (currentUser && viewMode === 'DASHBOARD') {
    if (currentUser.role === 'MASTER_ADMIN') {
      return (
        <MasterAdminDashboard
          currentUser={currentUser}
          onLogout={handleLogout}
          onGoPublic={() => setViewMode('PUBLIC')}
        />
      );
    }

    if (
      currentUser.role === 'SOLO_EDUCATOR' ||
      currentUser.role === 'INSTITUTION_ADMIN' ||
      currentUser.role === 'COURSE_ADMIN'
    ) {
      return (
        <ContributorDashboard
          currentUser={currentUser}
          onUserUpdated={(u) => setCurrentUser(u)}
          onLogout={handleLogout}
          onGoPublic={() => setViewMode('PUBLIC')}
        />
      );
    }

    return (
      <LearnerDashboard
        currentUser={currentUser}
        onUserUpdated={(u) => setCurrentUser(u)}
        onLogout={handleLogout}
        onGoPublic={() => setViewMode('PUBLIC')}
      />
    );
  }

  return (
    <>
      <PublicPortal
        currentUser={currentUser}
        onOpenAuth={(mode) => setAuthModalMode(mode)}
        onEnterDashboard={() => setViewMode('DASHBOARD')}
      />

      {authModalMode && (
        <AuthModal
          initialMode={authModalMode}
          onClose={() => setAuthModalMode(null)}
          onAuthenticated={handleAuthenticated}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AkademiAppContent />
    </LanguageProvider>
  );
}
