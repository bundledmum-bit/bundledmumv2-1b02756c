/**
 * Shared primitives for the BundledMum mobile redesign (prototype v1).
 *
 * These components reproduce the imported Claude Design prototype
 * "BundledMum - Prototype.dc.html" inside the existing React/Vite app.
 * They are mounted only at the isolated /redesign preview route, so no
 * production page/component is touched on this branch.
 *
 * Palette is taken verbatim from the imported prototype. The official
 * BundledMum brand tokens (forest green #2D6A4F, warm cream #FFF8F4,
 * coral #F4845F) live in site_settings (brand_primary_color etc.); the
 * prototype uses its own slightly warmer greens/creams, kept here for
 * visual fidelity to the design under review.
 */
import React from "react";
import logoGreenUrl from "@/assets/logos/BM-LOGO-GREEN.svg";

export type Screen =
  | "home"
  | "shop"
  | "product"
  | "cart"
  | "checkout"
  | "confirm"
  | "quiz"
  | "account";

export interface NavProps {
  go: (s: Screen) => void;
}

export const C = {
  green: "#586B47",
  greenDark: "#46552F",
  greenDeep: "#33402C",
  ink: "#20251A",
  body: "#6E6B5F",
  muted: "#9A9384",
  coral: "#ED7A52",
  coralInk: "#C2552F",
  cream: "#FBF8F2",
  line: "#E7E1D5",
  cardLine: "#EFE7D9",
  tileBg: "#DDE6D2",
  greenWash: "#EDF1E7",
  greenBar: "#DEE7D6",
  coralWash: "#FBEEE7",
} as const;

export const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

export const serif = "'Playfair Display', Georgia, serif";

export function Logo({ height = 25 }: { height?: number }) {
  return <img src={logoGreenUrl} alt="BundledMum" style={{ height, width: "auto" }} />;
}

// ─── Icons (inline, stroke = currentColor unless overridden) ───
type IconProps = { size?: number; color?: string; strokeWidth?: number };

const svg = (children: React.ReactNode, { size = 22, color = "currentColor", strokeWidth = 1.8 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
    {children}
  </svg>
);

export const IconCart = (p: IconProps) =>
  svg(<><path d="M6 7h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7z" /><path d="M9 7V5.5A3 3 0 0 1 12 2.5 3 3 0 0 1 15 5.5V7" /></>, p);
export const IconMenu = (p: IconProps) => svg(<path d="M3 6h18M3 12h18M3 18h18" />, p);
export const IconSearch = (p: IconProps) => svg(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>, p);
export const IconBack = (p: IconProps) => svg(<path d="M15 5l-7 7 7 7" />, p);
export const IconClose = (p: IconProps) => svg(<path d="M6 6l12 12M18 6L6 18" />, p);
export const IconCheck = (p: IconProps) => svg(<path d="M20 6L9 17l-5-5" />, p);
export const IconHeart = (p: IconProps) => svg(<path d="M12 20s-7-4.6-9.3-8.6C1 8.5 2.5 5 6 5c2 0 3.2 1.2 4 2.3C10.8 6.2 12 5 14 5c3.5 0 5 3.5 3.3 6.4C19 15.4 12 20 12 20z" />, p);
export const IconChevron = (p: IconProps) => svg(<path d="M9 18l6-6-6-6" />, p);
export const IconChevronDown = (p: IconProps) => svg(<path d="M6 9l6 6 6-6" />, p);
export const IconArrow = (p: IconProps) => svg(<path d="M5 12h14M13 6l6 6-6 6" />, p);
export const IconStar = ({ size = 10, color = "#ED7A52" }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2l2.9 6.3 6.9.7-5.1 4.7 1.4 6.8L12 17.8 5.9 21.3l1.4-6.8L2.2 9.8l6.9-.7z" />
  </svg>
);
export const IconTruck = (p: IconProps) =>
  svg(<><path d="M3 6h11v9H3z" /><path d="M14 9h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></>, p);
export const IconHome = (p: IconProps) => svg(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>, p);
export const IconBundle = (p: IconProps) => svg(<><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M4 9h16M12 9v11" /></>, p);
export const IconUser = (p: IconProps) => svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>, p);

// ─── Bottom tab bar (shared by Home / Shop / Account) ───
export function BottomNav({ current, go }: { current: Screen; go: (s: Screen) => void }) {
  const tabs: { key: Screen; label: string; icon: (p: IconProps) => JSX.Element; target: Screen }[] = [
    { key: "home", label: "Home", icon: IconHome, target: "home" },
    { key: "shop", label: "Shop", icon: IconCart, target: "shop" },
    { key: "bundles" as Screen, label: "Bundles", icon: IconBundle, target: "shop" },
    { key: "cart", label: "Cart", icon: IconCart, target: "cart" },
    { key: "account", label: "Account", icon: IconUser, target: "account" },
  ];
  return (
    <nav
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 60,
        background: "rgba(255,255,255,0.97)",
        backdropFilter: "blur(10px)",
        borderTop: `1px solid ${C.line}`,
        display: "flex",
        height: 62,
        paddingBottom: 5,
      }}
    >
      {tabs.map((t, i) => {
        const active = t.target === current || (t.key === "home" && current === "home");
        const isActive = t.key === current;
        const Icon = t.icon;
        return (
          <button
            key={i}
            onClick={() => go(t.target)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              border: "none",
              background: "none",
              cursor: "pointer",
              color: isActive ? C.green : "#A8A496",
            }}
          >
            <Icon size={21} strokeWidth={1.9} />
            <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 600 }}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ─── Placeholder image tile (matches prototype's hatched swatch) ───
export function PhotoTile({
  label,
  height,
  src,
  radius = 14,
  style,
}: {
  label?: string;
  height: number | string;
  src?: string | null;
  radius?: number;
  style?: React.CSSProperties;
}) {
  if (src) {
    return (
      <div style={{ height, borderRadius: radius, overflow: "hidden", ...style }}>
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }
  return (
    <div
      style={{
        height,
        borderRadius: radius,
        background: "#EDE5D6",
        backgroundImage:
          "repeating-linear-gradient(45deg,rgba(88,107,71,0.07) 0,rgba(88,107,71,0.07) 1px,transparent 1px,transparent 12px)",
        display: "flex",
        alignItems: "flex-end",
        ...style,
      }}
    >
      {label && (
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#A99A85",
            padding: 9,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
