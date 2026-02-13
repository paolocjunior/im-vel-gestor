
-- Create a secure soft-delete function
CREATE OR REPLACE FUNCTION public.soft_delete_study(p_study_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE studies 
  SET is_deleted = true, updated_at = now()
  WHERE id = p_study_id 
    AND user_id = auth.uid() 
    AND is_deleted = false;
    
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Study not found or not authorized';
  END IF;
END;
$$;
