import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  // Профиль грузим отдельно и помним, для какого пользователя он загружен.
  const [loaded, setLoaded] = useState<{ uid: string; profile: Profile | null; error: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setInitialized(true);
    });
    // В обработчике только запоминаем сессию: вызывать из него другие методы Supabase нельзя.
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const uid = session?.user.id ?? null;
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (alive) setLoaded({ uid, profile: (data as Profile | null) ?? null, error: error?.message ?? null });
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  const value = useMemo<AuthState>(() => {
    const profileReady = uid !== null && loaded?.uid === uid;
    return {
      loading: !initialized || (uid !== null && !profileReady),
      session,
      profile: profileReady ? loaded.profile : null,
      profileError: profileReady ? loaded.error : null,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          throw new Error(
            error.message === 'Invalid login credentials' ? 'Неверный email или пароль' : error.message,
          );
        }
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    };
  }, [initialized, session, uid, loaded]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вызван вне AuthProvider');
  return ctx;
}

// Для экранов внутри RequireAuth профиль гарантированно есть.
export function useProfile(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error('Профиль не загружен');
  return profile;
}
