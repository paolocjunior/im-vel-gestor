
-- Create measurements table for tracking apontamentos (labor, services, etc.)
CREATE TABLE public.construction_measurements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  study_id UUID NOT NULL REFERENCES public.studies(id),
  stage_id UUID NOT NULL REFERENCES public.construction_stages(id),
  measurement_date DATE NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  provider_id UUID REFERENCES public.study_providers(id),
  contract_id UUID REFERENCES public.study_provider_contracts(id),
  notes TEXT,
  measurement_type TEXT NOT NULL DEFAULT 'inclusion', -- 'inclusion', 'rectification', 'reversal'
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.construction_measurements ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "Users manage own measurements"
  ON public.construction_measurements
  FOR ALL
  USING (owns_study(study_id))
  WITH CHECK (owns_study(study_id));

-- Index for performance
CREATE INDEX idx_measurements_stage ON public.construction_measurements(stage_id) WHERE is_deleted = false;
CREATE INDEX idx_measurements_study ON public.construction_measurements(study_id) WHERE is_deleted = false;
