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
    const { data } = await supabase
      .from("profiles")
      .select("full_name, cpf_cnpj, person_type")
      .eq("user_id", user.id)
      .single();
    if (!data) { setComplete(false); setLoading(false); return; }
    const isComplete = REQUIRED_FIELDS.every(f => {
      const v = (data as any)[f];
      return v && String(v).trim().length > 0;
    });
    setComplete(isComplete);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading) check();
  }, [authLoading, check]);

  return { complete, loading: loading || authLoading, recheck: check };
}
