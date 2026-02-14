import { supabase } from "@/integrations/supabase/client";
import { recomputeStudy, type StudyInputs, type LineItem, type UserThresholds } from "@/lib/recompute";

export async function recomputeAndSave(studyId: string, userId: string) {
  // Load inputs, line items, settings, and paid provider payments in parallel
  const [inputsRes, lineItemsRes, settingsRes, paidPaymentsRes] = await Promise.all([
    supabase.from("study_inputs").select("*").eq("study_id", studyId).single(),
    supabase.from("study_line_items").select("*").eq("study_id", studyId).eq("is_deleted", false),
    supabase.from("user_settings").select("*").eq("user_id", userId).single(),
    supabase.from("study_provider_payments").select("amount").eq("study_id", studyId).eq("is_deleted", false).eq("status", "PAID"),
  ]);

  if (!inputsRes.data || !settingsRes.data) return;

  const inputs = inputsRes.data as unknown as StudyInputs;
  const lineItems = (lineItemsRes.data || []) as unknown as LineItem[];
  const thresholds: UserThresholds = {
    roi_viable_threshold: Number(settingsRes.data.roi_viable_threshold),
    roi_attention_threshold: Number(settingsRes.data.roi_attention_threshold),
  };

  const providerTotal = (paidPaymentsRes.data || []).reduce((sum, p) => sum + Number(p.amount), 0);

  const result = recomputeStudy(inputs, lineItems, thresholds, providerTotal);

  // Update computed
  await supabase.from("study_computed").update({
    acquisition_total: result.acquisition_total,
    holding_total: result.holding_total,
    exit_total: result.exit_total,
    construction_total: result.construction_total,
    total_disbursed: result.total_disbursed,
    total_invested_capital: result.total_invested_capital,
    sale_net: result.sale_net,
    profit: result.profit,
    roi: result.roi,
    viability_indicator: result.viability_indicator,
    missing_fields: result.missing_fields,
    is_official: result.is_official,
    financed_amount: result.financed_amount,
    first_installment: result.first_installment,
    last_installment: result.last_installment,
    total_paid_financing: result.total_paid_financing,
    total_interest: result.total_interest,
    annual_interest_rate: result.annual_interest_rate,
    down_payment_percent: result.down_payment_percent,
    provider_contracts_total: result.provider_contracts_total,
  }).eq("study_id", studyId);

  // Update study status
  const newStatus = result.missing_fields.length === 0 ? "COMPLETE" : "DRAFT";
  await supabase.from("studies").update({ status: newStatus }).eq("id", studyId);

  // Update derived fields on inputs
  await supabase.from("study_inputs").update({
    monthly_financing_payment: result.monthly_financing_payment,
    payoff_at_sale: result.payoff_at_sale,
    purchase_price_per_m2: result.purchase_price_per_m2,
  }).eq("study_id", studyId);
}
