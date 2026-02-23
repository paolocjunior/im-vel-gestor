
-- 1. CHECK constraint for person_type domain
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_person_type_check
CHECK (person_type IN ('PF', 'PJ'));

-- 2. Validation trigger for cpf_cnpj format/length based on person_type
CREATE OR REPLACE FUNCTION public.validate_profile_cpf_cnpj()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  clean text;
BEGIN
  -- Only validate when cpf_cnpj is not null/empty
  IF NEW.cpf_cnpj IS NOT NULL AND NEW.cpf_cnpj <> '' THEN
    clean := regexp_replace(NEW.cpf_cnpj, '\D', '', 'g');
    IF NEW.person_type = 'PF' AND length(clean) <> 11 THEN
      RAISE EXCEPTION 'CPF deve conter exatamente 11 dígitos numéricos.';
    END IF;
    IF NEW.person_type = 'PJ' AND length(clean) <> 14 THEN
      RAISE EXCEPTION 'CNPJ deve conter exatamente 14 dígitos numéricos.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_profile_cpf_cnpj
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.validate_profile_cpf_cnpj();

-- 3. Server-side function to check if user profile is complete
CREATE OR REPLACE FUNCTION public.is_profile_complete()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND full_name IS NOT NULL AND full_name <> ''
      AND cpf_cnpj IS NOT NULL AND cpf_cnpj <> ''
      AND person_type IS NOT NULL AND person_type <> ''
  );
$$;

-- Revoke execute from anon/public for security
REVOKE EXECUTE ON FUNCTION public.is_profile_complete() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_profile_complete() FROM public;
