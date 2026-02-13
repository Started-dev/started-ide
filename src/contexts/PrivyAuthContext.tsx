/**
 * Privy Authentication Context
 * Replaces Supabase Auth
 */
// @ts-nocheck
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePrivy, useLogin, useLogout, User as PrivyUser } from '@privy-io/react-auth';
import { setAccessTokenGetter } from '@/lib/api-client';
import { setDbAccessTokenGetter } from '@/integrations/supabase/client';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email?: string;
  wallet?: string;
  github?: {
    username: string;
    email?: string;
  };
}

interface AuthContextType {
  user: User | null;
  privyUser: PrivyUser | null;
  profile: Profile | null;
  loading: boolean;
  ready: boolean;
  authenticated: boolean;
  accessToken: string | null;
  login: () => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Convert Privy user to our User type
function privyToUser(privyUser: PrivyUser | null): User | null {
  if (!privyUser) return null;

  const email = privyUser.email?.address;
  const wallet = privyUser.wallet?.address;
  const github = privyUser.github;

  return {
    id: privyUser.id,
    email,
    wallet,
    github: github ? {
      username: github.username || '',
      email: github.email,
    } : undefined,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    ready,
    authenticated,
    user: privyUser,
    getAccessToken: privyGetAccessToken,
  } = usePrivy();

  const { login } = useLogin();
  const { logout: privyLogout } = useLogout();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const user = privyToUser(privyUser);

  // Fetch profile from our API
  const fetchProfile = useCallback(async (userId: string, token: string) => {
    try {
      const response = await fetch('/api/profiles/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      } else if (response.status === 404) {
        // Create profile if it doesn't exist
        const createResponse = await fetch('/api/profiles', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: userId }),
        });

        if (createResponse.ok) {
          const newProfile = await createResponse.json();
          setProfile(newProfile);
        }
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user && accessToken) {
      await fetchProfile(user.id, accessToken);
    }
  }, [user, accessToken, fetchProfile]);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const token = await privyGetAccessToken();
      setAccessToken(token);
      return token;
    } catch {
      return null;
    }
  }, [privyGetAccessToken]);

  // Set the access token getter for api-client and db-client
  useEffect(() => {
    setAccessTokenGetter(getAccessToken);
    setDbAccessTokenGetter(getAccessToken);
  }, [getAccessToken]);

  // Update access token and fetch profile when user changes
  useEffect(() => {
    if (ready) {
      setLoading(false);

      if (authenticated && privyUser) {
        getAccessToken().then(token => {
          if (token && privyUser) {
            fetchProfile(privyUser.id, token);
          }
        });
      } else {
        setProfile(null);
        setAccessToken(null);
      }
    }
  }, [ready, authenticated, privyUser, getAccessToken, fetchProfile]);

  const logout = useCallback(async () => {
    await privyLogout();
    setProfile(null);
    setAccessToken(null);
  }, [privyLogout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        privyUser,
        profile,
        loading,
        ready,
        authenticated,
        accessToken,
        login,
        logout,
        refreshProfile,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

// Re-export for compatibility
export type { PrivyUser };
