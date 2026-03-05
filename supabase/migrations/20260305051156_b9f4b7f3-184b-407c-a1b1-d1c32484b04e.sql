ALTER TABLE public.budget_proposals ADD COLUMN IF NOT EXISTS quantity integer DEFAULT NULL;
ALTER TABLE public.quotation_request_items ADD COLUMN IF NOT EXISTS quantity integer DEFAULT NULL;