
-- Budget quotation items: one per leaf stage, tracks status and best quote
CREATE TABLE public.budget_quotation_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  study_id uuid NOT NULL REFERENCES public.studies(id),
  stage_id uuid NOT NULL REFERENCES public.construction_stages(id),
  status text NOT NULL DEFAULT 'pending',
  need_date date,
  approved_proposal_id uuid,
  notes text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(study_id, stage_id)
);

ALTER TABLE public.budget_quotation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own quotation items"
  ON public.budget_quotation_items FOR ALL
  USING (owns_study(study_id))
  WITH CHECK (owns_study(study_id));

CREATE TRIGGER update_budget_quotation_items_updated_at
  BEFORE UPDATE ON public.budget_quotation_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Budget proposals: one per vendor per quotation item
CREATE TABLE public.budget_proposals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_item_id uuid NOT NULL REFERENCES public.budget_quotation_items(id) ON DELETE CASCADE,
  study_id uuid NOT NULL REFERENCES public.studies(id),
  vendor_id uuid NOT NULL REFERENCES public.study_vendors(id),
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  delivery_days integer,
  notes text,
  proposal_date date NOT NULL DEFAULT CURRENT_DATE,
  is_winner boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own proposals"
  ON public.budget_proposals FOR ALL
  USING (owns_study(study_id))
  WITH CHECK (owns_study(study_id));

CREATE TRIGGER update_budget_proposals_updated_at
  BEFORE UPDATE ON public.budget_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Budget history log
CREATE TABLE public.budget_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_item_id uuid NOT NULL REFERENCES public.budget_quotation_items(id) ON DELETE CASCADE,
  study_id uuid NOT NULL REFERENCES public.studies(id),
  action text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own budget history"
  ON public.budget_history FOR ALL
  USING (owns_study(study_id))
  WITH CHECK (owns_study(study_id));

-- Add self-reference for approved_proposal_id
ALTER TABLE public.budget_quotation_items
  ADD CONSTRAINT budget_quotation_items_approved_proposal_id_fkey
  FOREIGN KEY (approved_proposal_id) REFERENCES public.budget_proposals(id);
