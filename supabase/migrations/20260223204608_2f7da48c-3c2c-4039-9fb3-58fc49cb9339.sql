
-- Add inscricao_estadual to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS inscricao_estadual text DEFAULT NULL;

-- Quotation requests (solicitações de cotação)
CREATE TABLE public.quotation_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  study_id uuid NOT NULL REFERENCES public.studies(id),
  quotation_number integer NOT NULL DEFAULT 1,
  vendor_id uuid REFERENCES public.study_vendors(id),
  vendor_email text,
  request_type text NOT NULL DEFAULT 'email' CHECK (request_type IN ('email', 'manual')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'responded', 'cancelled')),
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE(study_id, quotation_number)
);

-- Quotation request items
CREATE TABLE public.quotation_request_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.quotation_requests(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.construction_stages(id),
  observation text,
  position integer NOT NULL DEFAULT 0,
  -- For manual entry: vendor fills these
  unit_price numeric DEFAULT NULL,
  total_price numeric DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quotation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_request_items FORCE ROW LEVEL SECURITY;

-- RLS policies for quotation_requests
CREATE POLICY "Users manage own quotation requests"
  ON public.quotation_requests FOR ALL
  USING (owns_study(study_id))
  WITH CHECK (owns_study(study_id));

-- RLS policies for quotation_request_items (via request -> study)
CREATE POLICY "Users manage own quotation request items"
  ON public.quotation_request_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.quotation_requests qr
    WHERE qr.id = request_id AND owns_study(qr.study_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quotation_requests qr
    WHERE qr.id = request_id AND owns_study(qr.study_id)
  ));

-- Auto-increment quotation_number per study
CREATE OR REPLACE FUNCTION public.set_quotation_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.quotation_number IS NULL OR NEW.quotation_number = 1 THEN
    SELECT COALESCE(MAX(quotation_number), 0) + 1
    INTO NEW.quotation_number
    FROM public.quotation_requests
    WHERE study_id = NEW.study_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_quotation_number
  BEFORE INSERT ON public.quotation_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_quotation_number();

-- Updated_at triggers
CREATE TRIGGER update_quotation_requests_updated_at
  BEFORE UPDATE ON public.quotation_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_quotation_request_items_updated_at
  BEFORE UPDATE ON public.quotation_request_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
