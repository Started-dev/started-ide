/**
 * Privy Provider wrapper
 * Configures Privy authentication for the app
 */
// @ts-nocheck
import React from 'react';
import { PrivyProvider as BasePrivyProvider } from '@privy-io/react-auth';

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

interface PrivyProviderProps {
  children: React.ReactNode;
}

export function PrivyProvider({ children }: PrivyProviderProps) {
  if (!PRIVY_APP_ID) {
    console.warn('VITE_PRIVY_APP_ID not configured');
    return <>{children}</>;
  }

  return (
    <BasePrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        // Login methods - GitHub OAuth + Email + Wallet
        loginMethods: ['github', 'email', 'wallet'],
        
        // Appearance
        appearance: {
          theme: 'dark',
          accentColor: '#6366f1', // Indigo
          logo: 'https://started.dev/logo.svg',
          showWalletLoginFirst: false,
        },

        // Embedded wallets (optional)
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },

        // Legal links
        legal: {
          termsAndConditionsUrl: 'https://started.dev/terms',
          privacyPolicyUrl: 'https://started.dev/privacy',
        },
      }}
    >
      {children}
    </BasePrivyProvider>
  );
}

export default PrivyProvider;
