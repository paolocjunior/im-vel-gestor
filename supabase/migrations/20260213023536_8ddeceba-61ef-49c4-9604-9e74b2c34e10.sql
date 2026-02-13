
-- =============================================
-- PROFILES (user metadata)
-- =============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- USER_SETTINGS
-- =============================================
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  roi_viable_threshold NUMERIC(10,4) NOT NULL DEFAULT 30.0000,
  roi_attention_threshold NUMERIC(10,4) NOT NULL DEFAULT 10.0000,
  default_down_payment_percent NUMERIC(10,4) NOT NULL DEFAULT 20.0000,
  default_monthly_interest NUMERIC(10,6) NOT NULL DEFAULT 0.990000,
  default_term_months INTEGER NOT NULL DEFAULT 360,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- FINANCIAL_INSTITUTIONS
-- =============================================
CREATE TABLE public.financial_institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  institution_type TEXT NOT NULL DEFAULT 'Banco' CHECK (institution_type IN ('Banco','Carteira','Dinheiro')),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fi_user ON public.financial_institutions(user_id);
ALTER TABLE public.financial_institutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own institutions" ON public.financial_institutions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================
-- STUDIES
-- =============================================
CREATE TABLE public.studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  cep TEXT,
  street TEXT,
  street_number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','COMPLETE')),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_studies_user ON public.studies(user_id);
CREATE INDEX idx_studies_deleted ON public.studies(is_deleted);
ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own studies" ON public.studies FOR ALL USING (auth.uid() = user_id AND is_deleted = false) WITH CHECK (auth.uid() = user_id);

-- =============================================
-- STUDY_INPUTS (Etapas A-E)
-- =============================================
CREATE TABLE public.study_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  -- Etapa A
  purchase_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  usable_area_m2 NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_area_m2 NUMERIC(12,2) NOT NULL DEFAULT 0,
  land_area_m2 NUMERIC(12,2) NOT NULL DEFAULT 0,
  purchase_price_per_m2 NUMERIC(12,2) NOT NULL DEFAULT 0,
  price_per_m2_manual BOOLEAN NOT NULL DEFAULT false,
  step_a_updated_at TIMESTAMPTZ,
  -- Etapa B
  financing_enabled BOOLEAN NOT NULL DEFAULT false,
  financing_system TEXT CHECK (financing_system IN ('PRICE','SAC')),
  down_payment_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  financing_term_months INTEGER,
  monthly_interest_rate NUMERIC(10,6) NOT NULL DEFAULT 0,
  step_b_updated_at TIMESTAMPTZ,
  -- Etapa C
  down_payment_acquisition NUMERIC(15,2) NOT NULL DEFAULT 0,
  itbi_mode TEXT NOT NULL DEFAULT 'PERCENT' CHECK (itbi_mode IN ('FIXED','PERCENT')),
  itbi_percent NUMERIC(10,4) NOT NULL DEFAULT 0,
  itbi_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  bank_appraisal NUMERIC(15,2) NOT NULL DEFAULT 0,
  registration_fee NUMERIC(15,2) NOT NULL DEFAULT 0,
  deed_fee NUMERIC(15,2) NOT NULL DEFAULT 0,
  step_c_updated_at TIMESTAMPTZ,
  -- Etapa D
  months_to_sale INTEGER,
  monthly_financing_payment NUMERIC(15,2) NOT NULL DEFAULT 0,
  has_condo_fee BOOLEAN NOT NULL DEFAULT false,
  condo_fee NUMERIC(15,2) NOT NULL DEFAULT 0,
  iptu_mode TEXT NOT NULL DEFAULT 'mensal' CHECK (iptu_mode IN ('mensal','anual')),
  iptu_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  monthly_expenses NUMERIC(15,2) NOT NULL DEFAULT 0,
  step_d_updated_at TIMESTAMPTZ,
  -- Etapa E
  sale_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  sale_price_per_m2 NUMERIC(12,2) NOT NULL DEFAULT 0,
  payoff_at_sale NUMERIC(15,2) NOT NULL DEFAULT 0,
  brokerage_mode TEXT NOT NULL DEFAULT 'PERCENT' CHECK (brokerage_mode IN ('PERCENT','FIXED')),
  brokerage_percent NUMERIC(10,4) NOT NULL DEFAULT 0,
  brokerage_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  income_tax NUMERIC(15,2) NOT NULL DEFAULT 0,
  sale_notes TEXT,
  step_e_updated_at TIMESTAMPTZ,
  --
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_si_study ON public.study_inputs(study_id);
ALTER TABLE public.study_inputs ENABLE ROW LEVEL SECURITY;

-- RLS via study ownership
CREATE OR REPLACE FUNCTION public.owns_study(p_study_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.studies
    WHERE id = p_study_id AND user_id = auth.uid() AND is_deleted = false
  );
$$;

CREATE POLICY "Users manage own study_inputs" ON public.study_inputs FOR ALL
  USING (public.owns_study(study_id)) WITH CHECK (public.owns_study(study_id));

-- =============================================
-- STUDY_COMPUTED
-- =============================================
CREATE TABLE public.study_computed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL UNIQUE REFERENCES public.studies(id) ON DELETE CASCADE,
  acquisition_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  holding_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  exit_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  construction_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_disbursed NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_invested_capital NUMERIC(15,2) NOT NULL DEFAULT 0,
  sale_net NUMERIC(15,2) NOT NULL DEFAULT 0,
  profit NUMERIC(15,2) NOT NULL DEFAULT 0,
  roi NUMERIC(12,4) NOT NULL DEFAULT 0,
  viability_indicator TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (viability_indicator IN ('VIABLE','UNVIABLE','ATTENTION','UNKNOWN')),
  missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_official BOOLEAN NOT NULL DEFAULT false,
  -- financing summary
  financed_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  first_installment NUMERIC(15,2) NOT NULL DEFAULT 0,
  last_installment NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_paid_financing NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_interest NUMERIC(15,2) NOT NULL DEFAULT 0,
  annual_interest_rate NUMERIC(10,6) NOT NULL DEFAULT 0,
  down_payment_percent NUMERIC(10,4) NOT NULL DEFAULT 0,
  --
  provider_contracts_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sc_study ON public.study_computed(study_id);
ALTER TABLE public.study_computed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own study_computed" ON public.study_computed FOR ALL
  USING (public.owns_study(study_id)) WITH CHECK (public.owns_study(study_id));

-- =============================================
-- STUDY_LINE_ITEMS (custos extras por etapa)
-- =============================================
CREATE TABLE public.study_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  line_type TEXT NOT NULL CHECK (line_type IN ('ACQUISITION_COST','MONTHLY_COST','EXIT_COST','CONSTRUCTION_COST')),
  description TEXT NOT NULL,
  category TEXT,
  value_mode TEXT NOT NULL DEFAULT 'FIXED' CHECK (value_mode IN ('FIXED','PERCENT')),
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  percent_value NUMERIC(10,4) NOT NULL DEFAULT 0,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  months INTEGER,
  single_month INTEGER,
  notes TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sli_study ON public.study_line_items(study_id);
ALTER TABLE public.study_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own line_items" ON public.study_line_items FOR ALL
  USING (public.owns_study(study_id)) WITH CHECK (public.owns_study(study_id));

-- =============================================
-- STUDY_VENDORS (Fornecedores)
-- =============================================
CREATE TABLE public.study_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  cnpj TEXT,
  razao_social TEXT,
  nome_fantasia TEXT,
  category TEXT,
  street TEXT,
  street_number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sv_study ON public.study_vendors(study_id);
ALTER TABLE public.study_vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own vendors" ON public.study_vendors FOR ALL
  USING (public.owns_study(study_id)) WITH CHECK (public.owns_study(study_id));

-- =============================================
-- STUDY_PROVIDERS (Prestadores)
-- =============================================
CREATE TABLE public.study_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  cpf_cnpj TEXT,
  person_type TEXT NOT NULL DEFAULT 'PF' CHECK (person_type IN ('PF','PJ')),
  phone TEXT,
  email TEXT,
  cep TEXT,
  street TEXT,
  street_number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  additional_info TEXT,
  -- banking
  bank_name TEXT,
  bank_agency TEXT,
  bank_account TEXT,
  bank_account_type TEXT,
  bank_pix TEXT,
  bank_holder_name TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sp_study ON public.study_providers(study_id);
ALTER TABLE public.study_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own providers" ON public.study_providers FOR ALL
  USING (public.owns_study(study_id)) WITH CHECK (public.owns_study(study_id));

-- =============================================
-- STUDY_PROVIDER_CONTRACTS
-- =============================================
CREATE TABLE public.study_provider_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.study_providers(id) ON DELETE CASCADE,
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  billing_model TEXT NOT NULL DEFAULT 'FIXED' CHECK (billing_model IN ('FIXED','DAILY','MONTHLY','PER_SQM')),
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','FINISHED')),
  details TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_spc_provider ON public.study_provider_contracts(provider_id);
CREATE INDEX idx_spc_study ON public.study_provider_contracts(study_id);
ALTER TABLE public.study_provider_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own contracts" ON public.study_provider_contracts FOR ALL
  USING (public.owns_study(study_id)) WITH CHECK (public.owns_study(study_id));

-- =============================================
-- STUDY_PROVIDER_PAYMENTS
-- =============================================
CREATE TABLE public.study_provider_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.study_providers(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.study_provider_contracts(id) ON DELETE SET NULL,
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','CANCELLED')),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_spp_provider ON public.study_provider_payments(provider_id);
CREATE INDEX idx_spp_study ON public.study_provider_payments(study_id);
ALTER TABLE public.study_provider_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own payments" ON public.study_provider_payments FOR ALL
  USING (public.owns_study(study_id)) WITH CHECK (public.owns_study(study_id));

-- =============================================
-- PURCHASE_ORDERS
-- =============================================
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES public.study_vendors(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','PARTIAL','RECEIVED','CANCELED')),
  sent_date DATE,
  notes TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_po_study ON public.purchase_orders(study_id);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own orders" ON public.purchase_orders FOR ALL
  USING (public.owns_study(study_id)) WITH CHECK (public.owns_study(study_id));

-- =============================================
-- PURCHASE_ORDER_ITEMS
-- =============================================
CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  unit TEXT,
  quantity_ordered NUMERIC(12,3) NOT NULL DEFAULT 0,
  quantity_received NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_poi_order ON public.purchase_order_items(order_id);
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- RLS via order -> study ownership
CREATE OR REPLACE FUNCTION public.owns_order(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_orders po
    JOIN public.studies s ON s.id = po.study_id
    WHERE po.id = p_order_id AND s.user_id = auth.uid() AND s.is_deleted = false
  );
$$;

CREATE POLICY "Users manage own order_items" ON public.purchase_order_items FOR ALL
  USING (public.owns_order(order_id)) WITH CHECK (public.owns_order(order_id));

-- =============================================
-- BILLS (Despesas)
-- =============================================
CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES public.study_vendors(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  cost_center TEXT,
  category TEXT,
  account_id UUID REFERENCES public.financial_institutions(id) ON DELETE SET NULL,
  payment_method TEXT,
  installment_plan TEXT NOT NULL DEFAULT 'AVISTA',
  first_due_date DATE,
  interval_days INTEGER NOT NULL DEFAULT 30,
  notes TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bills_study ON public.bills(study_id);
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bills" ON public.bills FOR ALL
  USING (public.owns_study(study_id)) WITH CHECK (public.owns_study(study_id));

-- =============================================
-- BILL_INSTALLMENTS (Parcelas)
-- =============================================
CREATE TABLE public.bill_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL DEFAULT 1,
  due_date DATE NOT NULL,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  account_id UUID REFERENCES public.financial_institutions(id) ON DELETE SET NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','CANCELLED')),
  paid_at DATE,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bi_bill ON public.bill_installments(bill_id);
CREATE INDEX idx_bi_study ON public.bill_installments(study_id);
CREATE INDEX idx_bi_due ON public.bill_installments(due_date);
ALTER TABLE public.bill_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own installments" ON public.bill_installments FOR ALL
  USING (public.owns_study(study_id)) WITH CHECK (public.owns_study(study_id));

-- =============================================
-- DOCUMENTS (Anexos)
-- =============================================
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  entity_id TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_docs_study ON public.documents(study_id);
CREATE INDEX idx_docs_entity ON public.documents(entity, entity_id);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own documents" ON public.documents FOR ALL
  USING (public.owns_study(study_id)) WITH CHECK (public.owns_study(study_id));

-- =============================================
-- TRIGGER: auto-create profile + settings on signup
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- TRIGGER: update updated_at
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fi_updated BEFORE UPDATE ON public.financial_institutions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_studies_updated BEFORE UPDATE ON public.studies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_si_updated BEFORE UPDATE ON public.study_inputs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sc_updated BEFORE UPDATE ON public.study_computed FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sli_updated BEFORE UPDATE ON public.study_line_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sv_updated BEFORE UPDATE ON public.study_vendors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sp_updated BEFORE UPDATE ON public.study_providers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_spc_updated BEFORE UPDATE ON public.study_provider_contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_spp_updated BEFORE UPDATE ON public.study_provider_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_poi_updated BEFORE UPDATE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bills_updated BEFORE UPDATE ON public.bills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bi_updated BEFORE UPDATE ON public.bill_installments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
