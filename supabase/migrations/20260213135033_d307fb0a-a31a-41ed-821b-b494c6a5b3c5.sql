
-- Drop current policies
DROP POLICY IF EXISTS "Users select own studies" ON public.studies;
DROP POLICY IF EXISTS "Users insert own studies" ON public.studies;
DROP POLICY IF EXISTS "Users update own studies" ON public.studies;
DROP POLICY IF EXISTS "Users delete own studies" ON public.studies;

-- Recreate explicitly as PERMISSIVE
CREATE POLICY "Users select own studies"
  ON public.studies AS PERMISSIVE FOR SELECT
  USING (auth.uid() = user_id AND is_deleted = false);

CREATE POLICY "Users insert own studies"
  ON public.studies AS PERMISSIVE FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own studies"
  ON public.studies AS PERMISSIVE FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own studies"
  ON public.studies AS PERMISSIVE FOR DELETE
  USING (auth.uid() = user_id AND is_deleted = false);
