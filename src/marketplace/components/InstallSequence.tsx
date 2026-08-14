import { useState } from "react";

export type SeqBrowser = "safari" | "chrome";

/**
 * The animated "how to install" sequence for iOS. A real screen recording
 * needs a physical iPhone, which this environment doesn't have, so this is a
 * looping CSS animation instead: sharper than a GIF, far smaller, and fixable
 * in code the day Apple or Google move something.
 *
 * Two browsers, two different controls (researched, not guessed):
 * - Safari's Share icon (square, arrow pointing up) lives in Safari's own
 *   toolbar, which since iOS 15's redesign defaults to a single bar across
 *   the BOTTOM of the screen (Settings > Safari > Tabs can move it to a
 *   single top bar instead, so this varies by device).
 * - Chrome's Share icon is the same square-and-arrow glyph, not a three-dot
 *   menu, sitting to the right of Chrome's own address bar — which on iOS
 *   defaults to the TOP (Chrome added a bottom option in 2023, user-chosen).
 *   This only works on iOS 16.4+ with an up to date Chrome; Apple didn't let
 *   any non-Safari browser add to the home screen before that.
 * Both trigger the same iOS system share sheet, where "Add to Home Screen"
 * is the exact, confirmed wording — sometimes after a scroll.
 *
 * Every other row in the sheet is drawn as an unlabelled bar rather than a
 * guess at Messages/Mail/AirDrop, since their order wasn't verified and a
 * wrong guess here is worse than a plain one (see the file this ships with).
 */
export default function InstallSequence({ initial }: { initial: SeqBrowser }) {
  const [browser, setBrowser] = useState<SeqBrowser>(initial);

  return (
    <div className="mkt-seq">
      <div className="mkt-seq-switch" role="group" aria-label="Which browser are you using">
        <button type="button" className={browser === "safari" ? "mkt-seq-swbtn on" : "mkt-seq-swbtn"} onClick={() => setBrowser("safari")}>
          Safari
        </button>
        <button type="button" className={browser === "chrome" ? "mkt-seq-swbtn on" : "mkt-seq-swbtn"} onClick={() => setBrowser("chrome")}>
          Chrome
        </button>
      </div>

      <div className={`mkt-seq-phone mkt-seq-${browser}`} role="img" aria-label={
        browser === "safari"
          ? "Animation: in Safari, tap the Share icon in the bottom toolbar, scroll the sheet that rises up, tap Add to Home Screen, then the app icon appears on the home screen."
          : "Animation: in Chrome, tap the Share icon next to the address bar at the top, scroll the sheet that rises up, tap Add to Home Screen, then the app icon appears on the home screen."
      }>
        <div className="mkt-seq-frame mkt-seq-f1">
          <PhoneChrome browser={browser} tapShare />
        </div>
        <div className="mkt-seq-frame mkt-seq-f2">
          <PhoneChrome browser={browser} sheetOpen />
        </div>
        <div className="mkt-seq-frame mkt-seq-f3">
          <PhoneHome />
        </div>
      </div>

      <p className="mkt-seq-caption">
        {browser === "safari"
          ? "Safari keeps Share in the toolbar at the bottom of the screen (some phones have it at the top instead, under Settings)."
          : "Chrome keeps Share next to the address bar at the top of the screen."}
      </p>
    </div>
  );
}

function MiniMarketplace() {
  return (
    <div className="mkt-seq-app">
      <div className="mkt-seq-app-top">
        <span>BundledMum Marketplace</span>
      </div>
      <div className="mkt-seq-app-search">Search baby &amp; kids items</div>
      <div className="mkt-seq-app-grid">
        <span /><span /><span /><span />
      </div>
    </div>
  );
}

function PhoneChrome({ browser, tapShare, sheetOpen }: { browser: SeqBrowser; tapShare?: boolean; sheetOpen?: boolean }) {
  return (
    <div className="mkt-seq-screen">
      {browser === "chrome" && (
        <div className="mkt-seq-chrometop">
          <span className="mkt-seq-chromelabel">Chrome</span>
          <div className="mkt-seq-chrometop-row">
            <span className="mkt-seq-addr">bundledmum.com/marketplace</span>
            <ShareIcon tap={tapShare} />
          </div>
        </div>
      )}

      <MiniMarketplace />

      {browser === "safari" && (
        <div className="mkt-seq-safaribar">
          <span className="mkt-seq-safarilabel">Safari</span>
          <span className="mkt-seq-tbicon" />
          <span className="mkt-seq-tbicon" />
          <ShareIcon tap={tapShare} />
          <span className="mkt-seq-tbicon" />
          <span className="mkt-seq-tbicon" />
        </div>
      )}

      {sheetOpen && (
        <div className="mkt-seq-sheet">
          <div className="mkt-seq-sheet-grab" />
          <div className="mkt-seq-sheet-row mkt-seq-sheet-row-blank" />
          <div className="mkt-seq-sheet-row mkt-seq-sheet-row-blank" />
          <div className="mkt-seq-sheet-row mkt-seq-sheet-row-blank" />
          <div className="mkt-seq-sheet-row mkt-seq-sheet-row-hit">
            <span className="mkt-seq-a2hs-ic" />
            Add to Home Screen
            <span className="mkt-seq-tapdot mkt-seq-tapdot-row" />
          </div>
        </div>
      )}
    </div>
  );
}

function ShareIcon({ tap }: { tap?: boolean }) {
  return (
    <span className="mkt-seq-shareic">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12" />
        <path d="M7 8l5-5 5 5" />
        <rect x="4" y="13" width="16" height="8" rx="2" />
      </svg>
      {tap && <span className="mkt-seq-tapdot mkt-seq-tapdot-icon" />}
    </span>
  );
}

function PhoneHome() {
  return (
    <div className="mkt-seq-screen mkt-seq-homescreen">
      <div className="mkt-seq-homegrid">
        <span className="mkt-seq-homeapp" />
        <span className="mkt-seq-homeapp" />
        <span className="mkt-seq-homeapp" />
        <span className="mkt-seq-homeapp mkt-seq-homeapp-new">
          <img src="/bm-mkt-apple-touch-icon.png" alt="" width={40} height={40} />
          <span className="mkt-seq-homebadge">&#10003;</span>
        </span>
        <span className="mkt-seq-homeapp" />
        <span className="mkt-seq-homeapp" />
      </div>
      <p className="mkt-seq-homecaption">Added to your home screen</p>
    </div>
  );
}
