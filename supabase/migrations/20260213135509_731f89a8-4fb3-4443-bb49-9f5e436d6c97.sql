
-- Fix UPDATE policy: remove separate WITH CHECK (USING will apply to both)
DROP POLICY IF EXISTS "Users update own studies" ON public.studies;

CREATE POLICY "Users update own studies"
  ON public.studies AS PERMISSIVE FOR UPDATE
  USING (auth.uid() = user_id);
