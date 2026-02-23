import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const REQUIRED_FIELDS = ["full_name", "cpf_cnpj", "person_type"] as const;

export function useProfileComplete() {
  const { user, loading: authLoading } = useAuth();
  const [complete, setComplete] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    if (!user) { setComplete(null); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, cpf_cnpj, person_type")
        .eq("user_id", user.id)
        .single();
      if (error) {
        console.error("Profile check error:", error);
        // On transient error, keep previous state instead of forcing incomplete
        setLoading(false);
        return;
      }
      if (!data) { setComplete(false); setLoading(false); return; }
      const isComplete = REQUIRED_FIELDS.every(f => {
        const v = (data as any)[f];
        return v && String(v).trim().length > 0;
      });
      setComplete(isComplete);
    } catch (err) {
      console.error("Unexpected profile check error:", err);
      // On unexpected error, keep previous state
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) check();
  }, [authLoading, check]);

  return { complete, loading: loading || authLoading, recheck: check };
}
