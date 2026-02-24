-- Add default quotation message to user profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS quotation_default_message text;
