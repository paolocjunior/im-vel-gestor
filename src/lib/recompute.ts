import Decimal from "decimal.js";

// Configure decimal.js for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export const D = (v: number | string | null | undefined): Decimal =>
  new Decimal(v ?? 0);

export const toMoney = (d: Decimal): number =>
  d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

export const toPercent = (d: Decimal): number =>
  d.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();

export const formatBRL = (value: number): string =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatPercent = (value: number): string =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

export interface StudyInputs {
  purchase_value: number;
  usable_area_m2: number;
  total_area_m2: number;
  land_area_m2: number;
  purchase_price_per_m2: number;
  price_per_m2_manual: boolean;
  financing_enabled: boolean;
  financing_system: string | null;
  down_payment_value: number;
  financing_term_months: number | null;
  monthly_interest_rate: number;
  down_payment_acquisition: number;
  itbi_mode: string;
  itbi_percent: number;
  itbi_value: number;
  bank_appraisal: number;
  registration_fee: number;
  deed_fee: number;
  months_to_sale: number | null;
  monthly_financing_payment: number;
  has_condo_fee: boolean;
  condo_fee: number;
  iptu_mode: string;
  iptu_value: number;
  monthly_expenses: number;
  sale_value: number;
  payoff_at_sale: number;
  brokerage_mode: string;
  brokerage_percent: number;
  brokerage_value: number;
  income_tax: number;
}

export interface LineItem {
  line_type: string;
  amount: number;
  percent_value: number;
  value_mode: string;
  is_recurring: boolean;
  months: number | null;
  is_deleted: boolean;
}

export interface UserThresholds {
  roi_viable_threshold: number;
  roi_attention_threshold: number;
}

export interface ComputedResult {
  acquisition_total: number;
  holding_total: number;
  exit_total: number;
  construction_total: number;
  total_disbursed: number;
  total_invested_capital: number;
  sale_net: number;
  profit: number;
  roi: number;
  viability_indicator: "VIABLE" | "UNVIABLE" | "ATTENTION" | "UNKNOWN";
  missing_fields: string[];
  is_official: boolean;
  financed_amount: number;
  first_installment: number;
  last_installment: number;
  total_paid_financing: number;
  total_interest: number;
  annual_interest_rate: number;
  down_payment_percent: number;
  provider_contracts_total: number;
  // derived
  monthly_financing_payment: number;
  payoff_at_sale: number;
  purchase_price_per_m2: number;
}

function getMissingFields(inputs: StudyInputs): string[] {
  const missing: string[] = [];
  if (D(inputs.purchase_value).lte(0)) missing.push("Valor de compra");
  const hasArea = D(inputs.usable_area_m2).gt(0) || D(inputs.total_area_m2).gt(0) || D(inputs.land_area_m2).gt(0);
  if (!hasArea) missing.push("Ao menos uma área válida");
  if (!inputs.months_to_sale || inputs.months_to_sale < 1) missing.push("Meses até a venda");
  if (D(inputs.sale_value).lt(0.01)) missing.push("Valor de venda");
  if (inputs.financing_enabled) {
    if (!inputs.financing_system) missing.push("Sistema de financiamento");
    if (!inputs.financing_term_months || inputs.financing_term_months < 1) missing.push("Prazo do financiamento");
    if (D(inputs.monthly_interest_rate).lte(0)) missing.push("Taxa de juros mensal");
  }
  return missing;
}

function calcPricePerM2(inputs: StudyInputs): number {
  if (inputs.price_per_m2_manual && D(inputs.purchase_price_per_m2).gt(0)) {
    return inputs.purchase_price_per_m2;
  }
  const pv = D(inputs.purchase_value);
  if (pv.lte(0)) return 0;
  if (D(inputs.usable_area_m2).gt(0)) return toMoney(pv.div(D(inputs.usable_area_m2)));
  if (D(inputs.total_area_m2).gt(0)) return toMoney(pv.div(D(inputs.total_area_m2)));
  if (D(inputs.land_area_m2).gt(0)) return toMoney(pv.div(D(inputs.land_area_m2)));
  return 0;
}

function calcFinancing(inputs: StudyInputs): {
  financed_amount: number; first_installment: number; last_installment: number;
  total_paid: number; total_interest: number; annual_rate: number;
  down_payment_percent: number; monthly_payment: number; payoff: number;
} {
  const zero = { financed_amount: 0, first_installment: 0, last_installment: 0, total_paid: 0, total_interest: 0, annual_rate: 0, down_payment_percent: 0, monthly_payment: 0, payoff: 0 };
  if (!inputs.financing_enabled) return zero;

  const pv = D(inputs.purchase_value);
  const dp = D(inputs.down_payment_value);
  const financed = pv.minus(dp);
  if (financed.lte(0)) return zero;

  const rate = D(inputs.monthly_interest_rate).div(100);
  const n = inputs.financing_term_months || 1;
  const dpPercent = pv.gt(0) ? dp.div(pv).times(100) : D(0);
  const annualRate = D(1).plus(rate).pow(12).minus(1).times(100);

  if (inputs.financing_system === "PRICE") {
    // PMT = PV * r / (1 - (1+r)^-n)
    if (rate.lte(0)) return zero;
    const onePlusR = D(1).plus(rate);
    const pmt = financed.times(rate).div(D(1).minus(onePlusR.pow(-n)));
    const totalPaid = pmt.times(n);
    return {
      financed_amount: toMoney(financed),
      first_installment: toMoney(pmt),
      last_installment: toMoney(pmt),
      total_paid: toMoney(totalPaid),
      total_interest: toMoney(totalPaid.minus(financed)),
      annual_rate: toPercent(annualRate),
      down_payment_percent: toPercent(dpPercent),
      monthly_payment: toMoney(pmt),
      payoff: toMoney(financed), // simplified: full balance as payoff
    };
  } else {
    // SAC
    const amort = financed.div(n);
    const firstInterest = financed.times(rate);
    const first = amort.plus(firstInterest);
    const lastBalance = amort; // last month balance = amort
    const lastInterest = amort.times(rate);
    const last = amort.plus(lastInterest);
    // total = sum of payments
    // Total interest SAC = rate * financed * (n+1) / 2
    const totalInterest = rate.times(financed).times(D(n + 1).div(2));
    const totalPaid = financed.plus(totalInterest);
    return {
      financed_amount: toMoney(financed),
      first_installment: toMoney(first),
      last_installment: toMoney(last),
      total_paid: toMoney(totalPaid),
      total_interest: toMoney(totalInterest),
      annual_rate: toPercent(annualRate),
      down_payment_percent: toPercent(dpPercent),
      monthly_payment: toMoney(first),
      payoff: toMoney(financed),
    };
  }
}

function sumLineItems(items: LineItem[], type: string, monthsToSale: number): number {
  let total = D(0);
  for (const item of items) {
    if (item.is_deleted || item.line_type !== type) continue;
    const amt = D(item.amount);
    if (item.is_recurring) {
      const m = item.months ?? monthsToSale;
      total = total.plus(amt.times(m > 0 ? m : 1));
    } else {
      total = total.plus(amt);
    }
  }
  return toMoney(total);
}

export function recomputeStudy(
  inputs: StudyInputs,
  lineItems: LineItem[],
  thresholds: UserThresholds,
  providerContractsTotal: number = 0,
  constructionTotal: number = 0,
  billsPaidTotal: number = 0,
): ComputedResult {
  const missing = getMissingFields(inputs);
  const pricePerM2 = calcPricePerM2(inputs);
  const fin = calcFinancing(inputs);
  const monthsToSale = inputs.months_to_sale || 0;

  // Acquisition total
  const acqBase = D(inputs.down_payment_acquisition)
    .plus(D(inputs.itbi_value))
    .plus(D(inputs.bank_appraisal))
    .plus(D(inputs.registration_fee))
    .plus(D(inputs.deed_fee));
  const acqExtras = D(sumLineItems(lineItems, "ACQUISITION_COST", monthsToSale));
  const acquisitionTotal = toMoney(acqBase.plus(acqExtras));

  // Holding total
  const monthlyFinPayment = inputs.financing_enabled ? D(fin.monthly_payment) : D(0);
  const condoMonthly = inputs.has_condo_fee ? D(inputs.condo_fee) : D(0);
  const iptuMonthly = inputs.iptu_mode === "anual" ? D(inputs.iptu_value).div(12) : D(inputs.iptu_value);
  const fixedMonthly = monthlyFinPayment.plus(condoMonthly).plus(iptuMonthly).plus(D(inputs.monthly_expenses));
  const holdingBase = fixedMonthly.times(monthsToSale);
  const holdingExtras = D(sumLineItems(lineItems, "MONTHLY_COST", monthsToSale));
  const holdingTotal = toMoney(holdingBase.plus(holdingExtras).plus(D(providerContractsTotal)));

  // Exit total
  const brokerageVal = inputs.brokerage_mode === "PERCENT"
    ? D(inputs.sale_value).times(D(inputs.brokerage_percent).div(100))
    : D(inputs.brokerage_value);
  const payoff = inputs.financing_enabled ? D(fin.payoff) : D(0);
  const exitBase = brokerageVal.plus(D(inputs.income_tax)).plus(payoff);
  const exitExtras = D(sumLineItems(lineItems, "EXIT_COST", monthsToSale));
  const exitTotal = toMoney(exitBase.plus(exitExtras));

  const constTotal = D(constructionTotal).plus(D(sumLineItems(lineItems, "CONSTRUCTION_COST", monthsToSale)));

  const totalDisbursed = toMoney(D(acquisitionTotal).plus(D(holdingTotal)).plus(constTotal).plus(D(billsPaidTotal)));
  const totalInvestedCapital = toMoney(D(inputs.purchase_value).plus(D(totalDisbursed)));
  const saleNet = toMoney(D(inputs.sale_value).minus(D(exitTotal)));
  const profit = toMoney(D(inputs.sale_value).minus(D(totalDisbursed)).minus(D(exitTotal)));
  const roi = D(totalInvestedCapital).gt(0)
    ? toPercent(D(profit).div(D(totalInvestedCapital)).times(100))
    : 0;

  let viability: ComputedResult["viability_indicator"] = "UNKNOWN";
  if (missing.length === 0) {
    if (roi >= thresholds.roi_viable_threshold) viability = "VIABLE";
    else if (roi < thresholds.roi_attention_threshold) viability = "ATTENTION";
    else viability = "UNVIABLE";
  }

  return {
    acquisition_total: acquisitionTotal,
    holding_total: holdingTotal,
    exit_total: exitTotal,
    construction_total: toMoney(constTotal),
    total_disbursed: totalDisbursed,
    total_invested_capital: totalInvestedCapital,
    sale_net: saleNet,
    profit,
    roi,
    viability_indicator: viability,
    missing_fields: missing,
    is_official: missing.length === 0,
    financed_amount: fin.financed_amount,
    first_installment: fin.first_installment,
    last_installment: fin.last_installment,
    total_paid_financing: fin.total_paid,
    total_interest: fin.total_interest,
    annual_interest_rate: fin.annual_rate,
    down_payment_percent: fin.down_payment_percent,
    provider_contracts_total: providerContractsTotal,
    monthly_financing_payment: fin.monthly_payment,
    payoff_at_sale: fin.payoff,
    purchase_price_per_m2: pricePerM2,
  };
}
