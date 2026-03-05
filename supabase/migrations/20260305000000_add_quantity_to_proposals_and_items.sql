
-- Add quantity column to budget_proposals (replaces delivery_days usage)
ALTER TABLE public.budget_proposals
  ADD COLUMN IF NOT EXISTS quantity integer DEFAULT NULL;

-- Add quantity column to quotation_request_items
ALTER TABLE public.quotation_request_items
  ADD COLUMN IF NOT EXISTS quantity integer DEFAULT NULL;
