/**
 * Placeholder for marketplace admin surfaces that are in the nav for structure
 * but not yet built (payout queue, disputes, sellers, listings, orders, money
 * owed). They render this simple coming soon panel in the admin shell.
 */
export default function MarketplaceComingSoon({ title }: { title: string }) {
  return (
    <div>
      <h1 className="font-heading font-black text-2xl tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-text-med mt-1">Marketplace</p>
      <div
        className="mt-6 rounded-2xl border border-dashed p-10 text-center"
        style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}
      >
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-heading font-extrabold"
          style={{ background: "#FDE8DF", color: "#D4613C" }}
        >
          Coming soon
        </div>
        <p className="mt-3 text-sm text-text-med max-w-md mx-auto">
          This surface is part of the marketplace operations set and will be built in a later phase.
          It is shown here so the full structure is visible.
        </p>
      </div>
    </div>
  );
}
