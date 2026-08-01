import { BrowserRouter, Route, Routes } from "react-router-dom";

/**
 * MARKETPLACE experience (marketplace.bundledmum.com) — the secondhand
 * classifieds marketplace. This is a SEPARATE surface from the main storefront
 * (bundledmum.com); the two share one repo and one build but are different
 * products. See handoff-marketplace.md.
 *
 * PLUMBING ONLY for now: a single placeholder route confirming the hostname
 * split works. All real marketplace screens come in later prompts, replacing
 * this placeholder.
 */

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
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MarketplaceComingSoon />} />
      </Routes>
    </BrowserRouter>
  );
}
