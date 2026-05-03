import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
// order_picking_* tables aren't in generated types yet; cast to any.
const supabase = supabaseTyped as any;

const STALE_30 = 30 * 1000;

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || null;
  } catch {
    return null;
  }
}

/**
 * Paid orders without a picking session — the queue. Two-step:
 *  1. Fetch all session order_ids (regardless of status — once a picking
 *     session has been opened, the order is no longer in the queue).
 *  2. Fetch paid orders excluded from that set.
 */
export function usePickingQueue(range?: { from?: Date | string; to?: Date | string }) {
  const fromIso = range?.from ? (typeof range.from === "string" ? range.from : range.from.toISOString()) : null;
  const toIso = range?.to ? (typeof range.to === "string" ? range.to : range.to.toISOString()) : null;
  return useQuery({
    queryKey: ["picking-queue", fromIso, toIso],
    queryFn: async () => {
      const { data: sessions, error: sErr } = await supabase
        .from("order_picking_sessions")
        .select("order_id");
      if (sErr) throw sErr;
      const sessionOrderIds = (sessions || []).map((s: any) => s.order_id).filter(Boolean);

      let q = supabase
        .from("orders")
        .select(
          "id, order_number, customer_name, customer_email, total, created_at, payment_status, order_status, order_items(id, product_name, brand_name, quantity, unit_price, brands(brand_name, sku, vendor_id, vendors(id, name, phone)))"
        )
        .eq("payment_status", "paid")
        .in("order_status", ["paid", "confirmed", "processing"])
        .order("created_at", { ascending: false });

      if (fromIso) q = q.gte("created_at", fromIso);
      if (toIso) q = q.lte("created_at", toIso);

      if (sessionOrderIds.length > 0) {
        // PostgREST `not.in.(...)` syntax
        q = q.not("id", "in", `(${sessionOrderIds.join(",")})`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    staleTime: STALE_30,
  });
}

export function useStartPickingSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId }: { orderId: string }) => {
      const userId = await getCurrentUserId();

      // 1. Pull order_items with brand → vendor lookup.
      const { data: items, error: iErr } = await supabase
        .from("order_items")
        .select("id, brand_id, brands(vendor_id)")
        .eq("order_id", orderId);
      if (iErr) throw iErr;

      // Guard: refuse to create a session for an order that has no items.
      // Surfaced as a friendly toast at the call site; do NOT navigate.
      if (!items || items.length === 0) {
        const err = new Error(
          "This order has no items. It may have been placed with an empty cart. Contact support to investigate.",
        );
        (err as any).code = "NO_ORDER_ITEMS";
        throw err;
      }

      // 2. Insert session row.
      const { data: session, error: sErr } = await supabase
        .from("order_picking_sessions")
        .insert({
          order_id: orderId,
          started_by: userId,
          status: "in_progress",
        })
        .select()
        .single();
      if (sErr) throw sErr;

      // 3. Insert one picking item per order_item.
      if (items && items.length > 0) {
        const rows = items.map((it: any) => ({
          session_id: session.id,
          order_item_id: it.id,
          vendor_id: it.brands?.vendor_id || null,
          is_picked: false,
        }));
        const { error: pErr } = await supabase.from("order_picking_items").insert(rows);
        if (pErr) throw pErr;
      }

      return session as { id: string; order_id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["picking-queue"] });
      qc.invalidateQueries({ queryKey: ["picking-session"] });
      qc.invalidateQueries({ queryKey: ["picking-history"] });
    },
  });
}

/**
 * Active picking session for an order, with full item join. Subscribes to
 * realtime updates on order_picking_items filtered by the session id.
 */
export function usePickingSession(orderId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["picking-session", orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from("order_picking_sessions")
        .select(
          "*, order_picking_items(*, order_items(product_name, brand_name, quantity, brands(brand_name, sku, vendor_id, vendors(name, phone))))"
        )
        .eq("order_id", orderId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
    staleTime: STALE_30,
  });

  const sessionId = (query.data as any)?.id || null;

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`picking-session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_picking_items",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["picking-session", orderId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_picking_sessions", filter: `id=eq.${sessionId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["picking-session", orderId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, orderId, qc]);

  return query;
}

/**
 * Fetch a picking session directly by its id, with full item join. Used by
 * the picking detail view when the URL carries `?session=<id>`. Subscribes
 * to realtime updates on its picking items + session row.
 */
export function usePickingSessionById(sessionId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["picking-session-by-id", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const { data, error } = await supabase
        .from("order_picking_sessions")
        .select(
          "*, orders(order_number, customer_name, total), " +
          "order_picking_items(*, order_items(product_name, brand_name, quantity, brands(brand_name, sku, vendor_id, vendors(name, phone))))"
        )
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!sessionId,
    staleTime: STALE_30,
  });

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`picking-session-by-id-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_picking_items", filter: `session_id=eq.${sessionId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["picking-session-by-id", sessionId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_picking_sessions", filter: `id=eq.${sessionId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["picking-session-by-id", sessionId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, qc]);

  return query;
}

export function useMarkPickingItemPicked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId }: { itemId: string; sessionId: string }) => {
      const userId = await getCurrentUserId();
      const { error } = await supabase
        .from("order_picking_items")
        .update({
          is_picked: true,
          picked_at: new Date().toISOString(),
          picked_by: userId,
        })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["picking-session"] });
      qc.invalidateQueries({ queryKey: ["picking-session-by-id"] });
      qc.invalidateQueries({ queryKey: ["picking-queue"] });
      qc.invalidateQueries({ queryKey: ["picking-history"] });
    },
  });
}

export function useMarkAllItemsPicked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string }) => {
      const userId = await getCurrentUserId();
      const { error } = await supabase
        .from("order_picking_items")
        .update({
          is_picked: true,
          picked_at: new Date().toISOString(),
          picked_by: userId,
        })
        .eq("session_id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["picking-session"] });
      qc.invalidateQueries({ queryKey: ["picking-session-by-id"] });
      qc.invalidateQueries({ queryKey: ["picking-queue"] });
      qc.invalidateQueries({ queryKey: ["picking-history"] });
    },
  });
}

/**
 * Finish the picking session: mark any unpicked items as picked, mark
 * the session completed, and advance the order to 'picked' (only if it's
 * currently 'processing' — older statuses we leave alone). Returns the
 * order_number so the caller can toast it. The DB trigger handles the
 * internal email — the frontend does NOT invoke any edge function.
 */
export function useCompletePickingSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, orderId }: { sessionId: string; orderId: string }) => {
      const userId = await getCurrentUserId();
      const nowIso = new Date().toISOString();

      // 1. Mark every still-unpicked item as picked.
      {
        const { error } = await supabase
          .from("order_picking_items")
          .update({ is_picked: true, picked_at: nowIso, picked_by: userId })
          .eq("session_id", sessionId)
          .eq("is_picked", false);
        if (error) throw error;
      }

      // 2. Mark the session as completed.
      {
        const { error } = await supabase
          .from("order_picking_sessions")
          .update({ status: "completed", completed_at: nowIso })
          .eq("id", sessionId);
        if (error) throw error;
      }

      // 3. Advance the order to 'picked' — only if it's still in
      // 'processing'. If 0 rows update (already 'shipped'/'delivered'/etc),
      // log a warning and continue: this is not a fatal error.
      {
        const { data, error } = await supabase
          .from("orders")
          .update({ order_status: "picked" })
          .eq("id", orderId)
          .eq("order_status", "processing")
          .select("id, order_number");
        if (error) throw error;
        if (!data || data.length === 0) {
          console.warn(
            `[picking] Order ${orderId} was not in 'processing' status; skipped order_status='picked' update.`,
          );
          // Look up order_number anyway so the caller can render a friendly toast.
          const { data: ord } = await supabase
            .from("orders")
            .select("order_number")
            .eq("id", orderId)
            .maybeSingle();
          return { orderNumber: ord?.order_number || null, advanced: false };
        }
        return { orderNumber: data[0].order_number || null, advanced: true };
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["picking-session"] });
      qc.invalidateQueries({ queryKey: ["picking-session-by-id"] });
      qc.invalidateQueries({ queryKey: ["picking-queue"] });
      qc.invalidateQueries({ queryKey: ["picking-history"] });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
  });
}

export function usePickingHistory() {
  return useQuery({
    queryKey: ["picking-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_picking_sessions")
        .select(
          "*, orders(order_number, customer_name), order_picking_items(id, is_picked, order_items(product_name, brand_name, quantity))"
        )
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    staleTime: STALE_30,
  });
}
