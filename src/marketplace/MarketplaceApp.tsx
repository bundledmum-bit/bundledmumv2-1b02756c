import { BrowserRouter, Route, Routes } from "react-router-dom";

/**
 * MARKETPLACE experience — the secondhand classifieds marketplace, mounted at
 * bundledmum.com/marketplace. This is a SEPARATE surface from the main
 * storefront; the two share one repo, one build, and one origin but are
 * different products. See handoff-marketplace.md.
 *
 * The router uses basename="/marketplace" so internal routes are written
 * relative to that base (the placeholder "/" resolves to /marketplace; a future
 * "/listings" resolves to /marketplace/listings) without hardcoding the prefix
 * into every route.
 *
 * PLUMBING ONLY for now: a single placeholder route confirming the path split
 * works. All real marketplace screens come in later prompts, replacing this
 * placeholder.
 */

const MARKETPLACE_BASENAME = "/marketplace";

function MarketplaceComingSoon() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        textAlign: "center",
        padding: "1.5rem",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>
        BundledMum Marketplace
      </h1>
      <p style={{ color: "#6b7280" }}>Coming soon</p>
    </div>
  );
}

export default function MarketplaceApp() {
  return (
    <BrowserRouter basename={MARKETPLACE_BASENAME}>
      <Routes>
        <Route path="/" element={<MarketplaceComingSoon />} />
      </Routes>
    </BrowserRouter>
  );
}
