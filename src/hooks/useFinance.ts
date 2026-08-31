import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const onErr = (label: string) => (err: any) => {
  console.error(`[finance] ${label} failed:`, err);
  toast.error(`${label} failed: ${err?.message || "Unknown error"}`);
};
const onOk = (label: string) => () => toast.success(label);

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PLRow {
  year: number;
  month: number;
  period_label: string;
  order_count: number;
  avg_order_value_ngn: number;
  gross_revenue_ngn: number;
  product_revenue_ngn: number;
  delivery_revenue_ngn: number;
  service_fee_revenue_ngn: number;
  cogs_ngn: number;
  gross_profit_ngn: number;
  gross_margin_pct: number;
  fixed_opex_ngn: number;
  variable_opex_ngn: number;
  total_opex_ngn: number;
  payroll_cost_ngn: number;
  ebitda_ngn: number;
  depreciation_ngn: number;
  tax_expenses_ngn: number;
  ebit_ngn: number;
  net_profit_ngn: number;
  net_margin_pct: number;
  ebitda_margin_pct: number;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  type: "fixed" | "variable" | "cogs" | "payroll" | "tax" | "depreciation" | string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
  display_order: number;
}

export type RecurrenceUnit = "daily" | "weekly" | "monthly" | "annually" | "custom";

export interface Expense {
  id: string;
  category_id: string | null;
  description: string;
  amount: number; // kobo
  expense_date: string;
  period_month: number | null;
  period_year: number | null;
  is_recurring: boolean;
  recurrence: string | null;                  // legacy column, still on rows
  recurrence_unit: RecurrenceUnit | null;
  recurrence_interval: number | null;
  recurrence_next_date: string | null;
  recurrence_end_date: string | null;
  recurrence_parent_id: string | null;
  is_auto_generated: boolean | null;
  last_generated_at: string | null;
  vendor: string | null;
  receipt_url: string | null;
  notes: string | null;
  /** Whether this expense belongs to the MARKETPLACE rather than the
   * storefront. The marketplace finance dashboard reads it to build its
   * Marketing card; everything else ignores it. Defaults false in the
   * database, which is the right default: 39 of the 40 expenses recorded so
   * far are storefront. */
  is_marketplace: boolean;
  category?: ExpenseCategory | null;
}

export interface CogsEntry {
  id: string;
  product_id: string | null;
  product_name: string;
  supplier: string | null;
  unit_cost: number; // kobo
  quantity: number;
  total_cost: number; // kobo
  purchase_date: string;
  period_month: number | null;
  period_year: number | null;
  notes: string | null;
}

export interface PayrollEntry {
  id: string;
  employee_name: string;
  role: string | null;
  pay_month: number;
  pay_year: number;
  basic_salary: number;
  housing_allowance: number | null;
  transport_allowance: number | null;
  other_allowances: number | null;
  gross_salary: number | null;
  employee_pension: number | null;
  nhf_deduction: number | null;
  paye_tax: number | null;
  total_employee_deductions: number | null;
  net_salary: number | null;
  employer_pension: number | null;
  nsitf: number | null;
  itf: number | null;
  total_employer_cost: number | null;
  notes: string | null;
}

export interface PayeBand {
  from: number;
  to: number | null;
  rate: number; // percentage
}

export interface TaxSettings {
  id: string;
  fiscal_year: number;
  company_size: "small" | "large" | string;
  annual_turnover_threshold: number;
  cit_rate: number;
  development_levy_rate: number;
  vat_rate: number;
  vat_registered: boolean;
  wht_rate_goods: number;
  wht_rate_services: number;
  employee_pension_rate: number;
  employer_pension_rate: number;
  nhf_rate: number;
  nsitf_rate: number;
  itf_rate: number;
  paye_bands: PayeBand[];
}

export interface FinanceAsset {
  id: string;
  asset_name: string;
  asset_type: string;
  purchase_date: string;
  purchase_cost: number;
  useful_life_years: number;
  depreciation_method: string | null;
  residual_value: number | null;
  annual_depreciation: number | null;
  monthly_depreciation: number | null;
  is_active: boolean;
  notes: string | null;
}

export interface FinancePeriod {
  id: string;
  period_month: number | null;
  period_year: number;
  period_type: string;
  revenue_target: number | null;
  cogs_target: number | null;
  opex_target: number | null;
  notes: string | null;
  is_closed: boolean;
}

// -----------------------------------------------------------------------------
// Queries
// -----------------------------------------------------------------------------

/**
 * finance_pl_summary columns (all money values already in NAIRA — do NOT divide by 100):
 *   month_start (timestamptz) · year (int) · month (int)
 *   total_orders · gross_revenue · total_delivery_charged · total_delivery_cost
 *   total_paystack_fees · total_packaging_cost · total_gift_wrap_revenue
 *   total_cogs · gross_profit · total_expenses · total_payroll · net_profit · net_margin_pct
 *
 * Consumers still reference the legacy `_ngn` field names, so we map the raw
 * view rows onto the PLRow shape here. Missing fields (e.g. depreciation,
 * tax_expenses, fixed_opex) default to 0 since the new view doesn't split
 * them out.
 */
interface RawPL {
  month_start: string;
  year: number;
  month: number;
  total_orders: number | string;
  gross_revenue: number | string;
  total_delivery_charged: number | string;
  total_delivery_cost: number | string;
  total_paystack_fees: number | string;
  total_packaging_cost: number | string;
  total_gift_wrap_revenue: number | string;
  total_cogs: number | string;
  gross_profit: number | string;
  total_expenses: number | string;
  total_payroll: number | string;
  net_profit: number | string;
  net_margin_pct: number | string;
}

function mapPL(raw: RawPL): PLRow {
  const n = (v: number | string | null | undefined) => Number(v) || 0;
  const revenue        = n(raw.gross_revenue);
  const deliveryCharged = n(raw.total_delivery_charged);
  const giftWrap       = n(raw.total_gift_wrap_revenue);
  const cogs           = n(raw.total_cogs);
  const grossProfit    = n(raw.gross_profit);
  const expenses       = n(raw.total_expenses);
  const payroll        = n(raw.total_payroll);
  const netProfit      = n(raw.net_profit);
  const orderCount     = n(raw.total_orders);
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const ebitda         = grossProfit - expenses - payroll;
  const ebitdaPct      = revenue > 0 ? (ebitda / revenue) * 100 : 0;

  return {
    year: raw.year,
    month: raw.month,
    period_label: `${raw.year}-${String(raw.month).padStart(2, "0")}`,
    order_count: orderCount,
    avg_order_value_ngn: orderCount > 0 ? revenue / orderCount : 0,
    gross_revenue_ngn: revenue,
    product_revenue_ngn: Math.max(0, revenue - deliveryCharged - giftWrap),
    delivery_revenue_ngn: deliveryCharged,
    service_fee_revenue_ngn: giftWrap,
    cogs_ngn: cogs,
    gross_profit_ngn: grossProfit,
    gross_margin_pct: grossMarginPct,
    fixed_opex_ngn: 0,
    variable_opex_ngn: expenses,
    total_opex_ngn: expenses,
    payroll_cost_ngn: payroll,
    ebitda_ngn: ebitda,
    ebitda_margin_pct: ebitdaPct,
    depreciation_ngn: 0,
    tax_expenses_ngn: 0,
    ebit_ngn: netProfit,
    net_profit_ngn: netProfit,
    net_margin_pct: n(raw.net_margin_pct),
  };
}

export function useFinancePL(year?: number, month?: number) {
  return useQuery({
    queryKey: ["finance-pl", year ?? "all", month ?? "all"],
    queryFn: async () => {
      let q = (supabase as any).from("finance_pl_summary").select("*");
      if (year) q = q.eq("year", year);
      if (month) q = q.eq("month", month);
      const { data, error } = await q.order("year").order("month");
      if (error) throw error;
      return ((data || []) as RawPL[]).map(mapPL);
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useFinanceExpenses(year?: number, month?: number) {
  return useQuery({
    queryKey: ["finance-expenses", year ?? "all", month ?? "all"],
    queryFn: async () => {
      let q = (supabase as any)
        .from("finance_expenses")
        .select("*, category:finance_expense_categories(*)");
      if (year) q = q.eq("period_year", year);
      if (month) q = q.eq("period_month", month);
      const { data, error } = await q.order("expense_date", { ascending: false });
      if (error) throw error;
      return (data || []) as Expense[];
    },
    staleTime: 15_000,
  });
}

export function useFinanceCogs(year?: number, month?: number) {
  return useQuery({
    queryKey: ["finance-cogs", year ?? "all", month ?? "all"],
    queryFn: async () => {
      let q = (supabase as any).from("finance_cogs").select("*");
      if (year) q = q.eq("period_year", year);
      if (month) q = q.eq("period_month", month);
      const { data, error } = await q.order("purchase_date", { ascending: false });
      if (error) throw error;
      return (data || []) as CogsEntry[];
    },
    staleTime: 15_000,
  });
}

export function useFinancePayroll(year?: number, month?: number) {
  return useQuery({
    queryKey: ["finance-payroll", year ?? "all", month ?? "all"],
    queryFn: async () => {
      let q = (supabase as any).from("finance_payroll").select("*");
      if (year) q = q.eq("pay_year", year);
      if (month) q = q.eq("pay_month", month);
      const { data, error } = await q.order("pay_year", { ascending: false }).order("pay_month", { ascending: false });
      if (error) throw error;
      return (data || []) as PayrollEntry[];
    },
    staleTime: 15_000,
  });
}

export function useFinanceTaxPosition(year?: number, month?: number) {
  return useQuery({
    queryKey: ["finance-tax-position", year ?? "all", month ?? "all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("calculate_tax_position", {
        p_year: year ?? null,
        p_month: month ?? null,
      });
      if (error) throw error;
      return data as Record<string, any>;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useFinanceCategories() {
  return useQuery({
    queryKey: ["finance-categories"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("finance_expense_categories")
        .select("*")
        .eq("is_active", true)
        .order("type")
        .order("display_order");
      if (error) throw error;
      return (data || []) as ExpenseCategory[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useFinanceTaxSettings() {
  return useQuery({
    queryKey: ["finance-tax-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("finance_tax_settings")
        .select("*")
        .order("fiscal_year", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as TaxSettings | null;
    },
    staleTime: 5 * 60_000,
  });
}

export function useFinanceAssets() {
  return useQuery({
    queryKey: ["finance-assets"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("finance_assets")
        .select("*")
        .order("purchase_date", { ascending: false });
      if (error) throw error;
      return (data || []) as FinanceAsset[];
    },
    staleTime: 60_000,
  });
}

export function useFinancePeriods() {
  return useQuery({
    queryKey: ["finance-periods"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("finance_periods")
        .select("*")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false });
      if (error) throw error;
      return (data || []) as FinancePeriod[];
    },
    staleTime: 60_000,
  });
}

export function useFinanceProducts() {
  return useQuery({
    queryKey: ["finance-products"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id,name,slug")
        .order("name");
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string; slug: string }>;
    },
    staleTime: 5 * 60_000,
  });
}

// -----------------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------------

function invalidateFinance(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["finance-pl"] });
  qc.invalidateQueries({ queryKey: ["finance-expenses"] });
  qc.invalidateQueries({ queryKey: ["finance-cogs"] });
  qc.invalidateQueries({ queryKey: ["finance-payroll"] });
  qc.invalidateQueries({ queryKey: ["finance-tax-position"] });
  qc.invalidateQueries({ queryKey: ["finance-assets"] });
  qc.invalidateQueries({ queryKey: ["finance-tax-settings"] });
}

export function useAddExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: Partial<Expense> & { amount: number; expense_date: string; description: string }) => {
      const payload: any = { ...e };
      delete payload.period_month;
      delete payload.period_year;
      const { error } = await (supabase as any).from("finance_expenses").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { invalidateFinance(qc); onOk("Expense saved")(); },
    onError: onErr("Save expense"),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: Partial<Expense> & { id: string }) => {
      const payload: any = { ...e, updated_at: new Date().toISOString() };
      delete payload.period_month;
      delete payload.period_year;
      const { error } = await (supabase as any).from("finance_expenses").update(payload).eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateFinance(qc); onOk("Expense updated")(); },
    onError: onErr("Update expense"),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("finance_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateFinance(qc); onOk("Expense deleted")(); },
    onError: onErr("Delete expense"),
  });
}

export function useAddCogs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<CogsEntry> & { product_name: string; unit_cost: number; quantity: number; purchase_date: string }) => {
      const d = new Date(c.purchase_date);
      const payload = {
        ...c,
        total_cost: c.unit_cost * c.quantity,
        period_month: d.getMonth() + 1,
        period_year: d.getFullYear(),
      };
      const { error } = await (supabase as any).from("finance_cogs").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { invalidateFinance(qc); onOk("COGS entry saved")(); },
    onError: onErr("Save COGS"),
  });
}

export function useDeleteCogs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("finance_cogs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateFinance(qc); onOk("COGS entry deleted")(); },
    onError: onErr("Delete COGS"),
  });
}

export function useAddPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Partial<PayrollEntry> & { employee_name: string; pay_month: number; pay_year: number; basic_salary: number }) => {
      const { error } = await (supabase as any).from("finance_payroll").insert(p);
      if (error) throw error;
    },
    onSuccess: () => { invalidateFinance(qc); onOk("Payroll saved")(); },
    onError: onErr("Save payroll"),
  });
}

export function useDeletePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("finance_payroll").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateFinance(qc); onOk("Payroll deleted")(); },
    onError: onErr("Delete payroll"),
  });
}

export function useUpdateTaxSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Partial<TaxSettings> & { id: string }) => {
      const { error } = await (supabase as any)
        .from("finance_tax_settings")
        .update({ ...s, updated_at: new Date().toISOString() })
        .eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateFinance(qc); onOk("Tax settings updated")(); },
    onError: onErr("Update tax settings"),
  });
}

export function useAddAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: Partial<FinanceAsset> & { asset_name: string; asset_type: string; purchase_date: string; purchase_cost: number; useful_life_years: number }) => {
      const residual = a.residual_value ?? 0;
      const annual = Math.max(0, Math.round((a.purchase_cost - residual) / Math.max(1, a.useful_life_years)));
      const monthly = Math.round(annual / 12);
      const payload = {
        ...a,
        annual_depreciation: annual,
        monthly_depreciation: monthly,
        depreciation_method: a.depreciation_method || "straight_line",
        is_active: a.is_active ?? true,
      };
      const { error } = await (supabase as any).from("finance_assets").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { invalidateFinance(qc); onOk("Asset saved")(); },
    onError: onErr("Save asset"),
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("finance_assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateFinance(qc); onOk("Asset deleted")(); },
    onError: onErr("Delete asset"),
  });
}

// -----------------------------------------------------------------------------
// Helpers — PAYE + money formatting + depreciation
// -----------------------------------------------------------------------------

export const NTA_2025_PAYE_BANDS: PayeBand[] = [
  { from: 0, to: 800_000, rate: 0 },
  { from: 800_000, to: 3_000_000, rate: 7 },
  { from: 3_000_000, to: 12_000_000, rate: 11 },
  { from: 12_000_000, to: 25_000_000, rate: 15 },
  { from: 25_000_000, to: 50_000_000, rate: 19 },
  { from: 50_000_000, to: null, rate: 25 },
];

/** Compute annual PAYE tax on a taxable income (in NGN, not kobo) using progressive bands. */
export function computeAnnualPaye(annualTaxable: number, bands: PayeBand[] = NTA_2025_PAYE_BANDS): number {
  let tax = 0;
  for (const b of bands) {
    const hi = b.to ?? Infinity;
    if (annualTaxable > b.from) {
      const slice = Math.min(annualTaxable, hi) - b.from;
      if (slice > 0) tax += (slice * b.rate) / 100;
    }
  }
  return Math.round(tax);
}

/** NGN -> kobo */
export const toKobo = (n: number) => Math.round((n || 0) * 100);
/** kobo -> NGN */
export const fromKobo = (k: number | null | undefined) => (k || 0) / 100;

/** Format as ₦NNN,NNN. Negative shown in brackets. */
export function fmtNaira(kobo: number | null | undefined, opts: { brackets?: boolean } = {}): string {
  const n = Math.round(fromKobo(kobo));
  if (n < 0 && opts.brackets) return `(₦${Math.abs(n).toLocaleString()})`;
  const sign = n < 0 ? "-" : "";
  return `${sign}₦${Math.abs(n).toLocaleString()}`;
}

/** Format a percentage to 2 decimals. */
export function fmtPct(pct: number | null | undefined): string {
  if (pct == null || !isFinite(pct)) return "—";
  return `${pct.toFixed(2)}%`;
}

/** DD/MM/YYYY */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

/** Months elapsed since purchase_date — minimum 0, maximum useful_life_years*12 */
export function monthsSince(dateStr: string, capMonths?: number): number {
  const d = new Date(dateStr);
  const now = new Date();
  const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  const m = Math.max(0, months);
  if (capMonths != null) return Math.min(m, capMonths);
  return m;
}

/** Book value of an asset in kobo */
export function bookValue(asset: FinanceAsset): number {
  const monthly = asset.monthly_depreciation || 0;
  const cap = asset.useful_life_years * 12;
  const m = monthsSince(asset.purchase_date, cap);
  const depTotal = monthly * m;
  const residual = asset.residual_value || 0;
  const bv = asset.purchase_cost - depTotal;
  return Math.max(residual, bv);
}
