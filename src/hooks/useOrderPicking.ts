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
        .order("created_at", { ascending: true });

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

async function maybeFireCompletedEmail(sessionId: string) {
  // Re-read items to determine completion + gather context for the email.
  try {
    const { data: session } = await supabase
      .from("order_picking_sessions")
      .select(
        "id, order_id, started_by, order_picking_items(is_picked), orders(order_number, customer_name)"
      )
      .eq("id", sessionId)
      .maybeSingle();
    if (!session) return;
    const items = session.order_picking_items || [];
    const allPicked = items.length > 0 && items.every((i: any) => i.is_picked);
    if (!allPicked) return;
    const itemCount = items.length;
    const order = session.orders || {};
    await supabase.functions.invoke("send-transactional-email", {
      body: {
        slug: "order_picked_internal",
        to: "hello@bundledmum.com",
        subject: `Order #${order.order_number} is Ready to Pack`,
        data: {
          order_number: order.order_number,
          customer_name: order.customer_name,
          item_count: itemCount,
          picked_by: session.started_by,
        },
      },
    });
  } catch (err) {
    // Spec says: don't block on missing template.
    console.warn("[picking] order_picked_internal email skipped:", err);
  }
}

export function useMarkPickingItemPicked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, sessionId }: { itemId: string; sessionId: string }) => {
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
      // fire-and-forget completion email if this was the last item.
      maybeFireCompletedEmail(sessionId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["picking-session"] });
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
      maybeFireCompletedEmail(sessionId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["picking-session"] });
      qc.invalidateQueries({ queryKey: ["picking-queue"] });
      qc.invalidateQueries({ queryKey: ["picking-history"] });
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
