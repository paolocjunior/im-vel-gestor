import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const RATE_LIMIT_KEY = "login_attempts";
const MAX_ATTEMPTS = 7;
const BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 min

function getRateLimitState(): { count: number; blockedUntil: number | null } {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (!raw) return { count: 0, blockedUntil: null };
    return JSON.parse(raw);
  } catch {
    return { count: 0, blockedUntil: null };
  }
}

function setRateLimitState(state: { count: number; blockedUntil: number | null }) {
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(state));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const rl = getRateLimitState();
    if (rl.blockedUntil && Date.now() < rl.blockedUntil) {
      return { error: "Muitas tentativas. Aguarde alguns minutos." };
    }
    if (rl.blockedUntil && Date.now() >= rl.blockedUntil) {
      setRateLimitState({ count: 0, blockedUntil: null });
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const newCount = (getRateLimitState().count || 0) + 1;
      if (newCount >= MAX_ATTEMPTS) {
        setRateLimitState({ count: newCount, blockedUntil: Date.now() + BLOCK_DURATION_MS });
      } else {
        setRateLimitState({ count: newCount, blockedUntil: null });
      }
      return { error: "E-mail ou senha inválidos." };
    }
    setRateLimitState({ count: 0, blockedUntil: null });
    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName?: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName || "" },
      },
    });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
