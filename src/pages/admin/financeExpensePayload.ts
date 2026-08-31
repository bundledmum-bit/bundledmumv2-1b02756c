/**
 * What actually gets written when an expense is saved.
 *
 * Pulled out of the two forms so the wiring can be RUN rather than read. The
 * bug this guards against is specific and already happened once: the
 * is_marketplace column existed, the marketplace dashboard read it correctly,
 * and every expense logged through the form arrived false because the value
 * never reached the payload. A field that exists in the form but not in the
 * payload looks completely correct on screen.
 *
 * Both the create form and the edit modal build the same shape through here,
 * so they cannot drift apart.
 */

export interface ExpenseFormValues {
  expense_date: string;
  category_id: string;
  description: string;
  amount: string | number;
  vendor?: string | null;
  notes?: string | null;
  is_marketplace?: boolean;
  is_recurring?: boolean;
  recurrence_unit?: string;
  recurrence_interval?: string | number;
  recurrence_end_date?: string | null;
}

export function toKoboAmount(v: string | number): number {
  return Math.round(Number(v || 0) * 100);
}

export function buildExpensePayload(
  form: ExpenseFormValues,
  nextDate: (date: string, unit: string, interval: number) => string | null,
): Record<string, unknown> {
  const isRec = !!form.is_recurring;
  const unit = form.recurrence_unit || "monthly";
  const interval = isRec ? Math.max(1, Number(form.recurrence_interval) || 1) : null;
  return {
    expense_date: form.expense_date,
    category_id: form.category_id || null,
    description: (form.description || "").trim(),
    amount: toKoboAmount(form.amount),
    vendor: form.vendor?.trim() || null,
    notes: form.notes?.trim() || null,
    // Coerced, never passed through raw: an undefined here would leave the
    // column to its default rather than saying what the operator chose, and
    // on the edit form that would silently refuse to turn a tag OFF.
    is_marketplace: !!form.is_marketplace,
    is_recurring: isRec,
    // Mirror to the legacy `recurrence` column for any downstream readers
    // that have not migrated yet.
    recurrence: isRec ? unit : null,
    recurrence_unit: isRec ? unit : null,
    recurrence_interval: interval,
    recurrence_next_date: isRec ? nextDate(form.expense_date, unit, interval || 1) : null,
    recurrence_end_date: isRec ? (form.recurrence_end_date || null) : null,
  };
}

/** What the create form resets to after a successful save. is_marketplace is
 * cleared with the rest: carrying it over would silently tag the next
 * expense, and the next one is far more likely storefront. */
export function clearedAfterSave<T extends ExpenseFormValues>(form: T): T {
  return { ...form, description: "", amount: "", vendor: "", notes: "", is_marketplace: false };
}
