
-- Add stage_id column to bills table to link taxas bills to construction stages
ALTER TABLE public.bills ADD COLUMN stage_id uuid REFERENCES public.construction_stages(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_bills_stage_id ON public.bills(stage_id) WHERE stage_id IS NOT NULL;
