
-- Add actual start/end dates to construction_stages
ALTER TABLE public.construction_stages
  ADD COLUMN IF NOT EXISTS actual_start_date date,
  ADD COLUMN IF NOT EXISTS actual_end_date date;

-- Create table for user-entered monthly values
CREATE TABLE public.construction_stage_monthly_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_id UUID NOT NULL REFERENCES public.construction_stages(id) ON DELETE CASCADE,
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL, -- 'YYYY-MM'
  value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stage_id, month_key)
);

-- Enable RLS
ALTER TABLE public.construction_stage_monthly_values ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "Users manage own monthly values"
  ON public.construction_stage_monthly_values
  FOR ALL
  USING (owns_study(study_id))
  WITH CHECK (owns_study(study_id));

-- Index for performance
CREATE INDEX idx_stage_monthly_values_stage ON public.construction_stage_monthly_values(stage_id);
CREATE INDEX idx_stage_monthly_values_study ON public.construction_stage_monthly_values(study_id);
