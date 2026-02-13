
-- Drop the existing restrictive ALL policy
DROP POLICY IF EXISTS "Users manage own studies" ON public.studies;

-- Create separate PERMISSIVE policies
CREATE POLICY "Users select own studies"
  ON public.studies FOR SELECT
  USING (auth.uid() = user_id AND is_deleted = false);

CREATE POLICY "Users insert own studies"
  ON public.studies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own studies"
  ON public.studies FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own studies"
  ON public.studies FOR DELETE
  USING (auth.uid() = user_id AND is_deleted = false);
