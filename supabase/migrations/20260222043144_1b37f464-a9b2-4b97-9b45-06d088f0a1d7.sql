
-- 1. Add unit_price to construction_measurements to preserve historical unit price
ALTER TABLE public.construction_measurements
ADD COLUMN unit_price numeric NOT NULL DEFAULT 0;

-- 2. Add value_type to construction_stage_monthly_values to differentiate PV from AC
ALTER TABLE public.construction_stage_monthly_values
ADD COLUMN value_type text NOT NULL DEFAULT 'actual';

-- 3. Add unique constraint on (stage_id, month_key, value_type)
ALTER TABLE public.construction_stage_monthly_values
ADD CONSTRAINT uq_stage_month_type UNIQUE (stage_id, month_key, value_type);
