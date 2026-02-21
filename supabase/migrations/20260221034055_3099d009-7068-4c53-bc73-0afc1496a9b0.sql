
-- Add stage_type column to construction_stages
-- Values: 'servico', 'mao_de_obra', 'material', 'taxas'
ALTER TABLE public.construction_stages 
ADD COLUMN stage_type text DEFAULT NULL;
