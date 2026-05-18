/**
 * BundledMum frontend health check.
 *
 * Runs twice daily via GitHub Actions (6am + 6pm UTC). Visits the
 * production storefront with Playwright (Chromium) and verifies that
 * key pages render, show expected content, and don't surface console
 * errors. Posts findings to the bundledmum-health-check Supabase edge
 * function which merges them with the DB-side checks and emails
 * iceboxx766@gmail.com.
 *
 * Critical findings exit non-zero so the GitHub Action turns red.
 */

const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const SITE = process.env.HEALTH_CHECK_SITE || "https://bundledmum.com";
const SUPABASE_URL = "https://rbtyprmkolqfylcbmgrk.supabase.co";
const HEALTH_CHECK_URL = `${SUPABASE_URL}/functions/v1/bundledmum-health-check`;
const HEALTH_CHECK_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCREENSHOT_DIR = path.join(__dirname, "screenshots");

const REPO = "https://github.com/bundledmum-bit/bundledmumv2-1b02756c";

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = [];

function pass(check, message) {
  results.push({ check, status: "ok", message, source: "frontend" });
  console.log(`✅ ${check}: ${message}`);
}
function warn(check, message, detail, fix_prompt) {
  results.push({ check, status: "warning", message, detail, fix_prompt, source: "frontend" });
  console.warn(`⚠️  ${check}: ${message}`);
}
function fail(check, message, detail, fix_prompt) {
  results.push({ check, status: "critical", message, detail, fix_prompt, source: "frontend" });
  console.error(`🚨 ${check}: ${message}`);
}

/** Save a fullPage screenshot for the supplied check name. Swallows
 *  errors — never let a screenshot failure derail the run. */
async function snap(page, checkName) {
  try {
    const safe = checkName.replace(/[^a-z0-9]+/gi, "-").slice(0, 60);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `${safe}-${Date.now()}.png`),
      fullPage: true,
    });
  } catch (_) { /* ignore */ }
}

// ── CHECKS ────────────────────────────────────────────────────────────────

async function checkHomepage(page) {
  try {
    const resp = await page.goto(SITE, { waitUntil: "networkidle", timeout: 20000 });
    if (!resp || resp.status() >= 400) {
      await snap(page, "Homepage");
      return fail("Homepage", `Page returned status ${resp?.status()}`, null,
        `Homepage is returning an error status. Check Lovable deployment logs and verify the latest commit did not break the root route.\nRepo: ${REPO}\nCommit immediately without showing a plan.`);
    }
    const nav = await page.$("nav");
    if (!nav) {
      await snap(page, "Homepage-Nav");
      fail("Homepage Nav", "Navigation bar not found on homepage", null,
        `The nav component is missing from the homepage. Check App.tsx and the Layout component.\nRepo: ${REPO}\nCommit immediately without showing a plan.`);
    } else {
      pass("Homepage Nav", "Navigation bar present");
    }
    const bodyText = await page.textContent("body");
    if (!bodyText || bodyText.trim().length < 100) {
      await snap(page, "Homepage-Content");
      fail("Homepage Content", "Page body has almost no content — possible React crash or blank render", bodyText?.slice(0, 100),
        `The homepage appears blank or has very little content. This usually means a React component crashed silently.\n\nClaude Code fix:\nAudit the homepage component for any useEffect or data fetch that could throw an unhandled error. Add error boundaries around major sections.\nRepo: ${REPO}\nCommit immediately without showing a plan.`);
    } else {
      pass("Homepage Content", "Homepage has content");
    }
  } catch (e) {
    await snap(page, "Homepage-Crash");
    fail("Homepage", `Failed to load: ${e.message}`, null,
      `Homepage failed to load entirely. Check if bundledmum.com DNS is resolving and Lovable deployment is active.\nRepo: ${REPO}`);
  }
}

async function checkShopPage(page) {
  try {
    await page.goto(`${SITE}/shop`, { waitUntil: "networkidle", timeout: 25000 });
    const bodyText = await page.textContent("body");
    const hasProducts = bodyText?.includes("₦") || bodyText?.includes("Add to Cart") || bodyText?.includes("Shop Now");
    if (!hasProducts) {
      await snap(page, "Shop-Page");
      fail("Shop Page", "Shop page has no products or prices visible — possible data loading failure", null,
        `The /shop page is not showing products or prices. Likely causes:\n1. shop_sections query is failing\n2. Bundle or product queries returning empty\n3. A React render error in a section component\n\nClaude Code fix:\nIn the shop page component, add console.error logging to the data fetch catch blocks. Check browser console on bundledmum.com/shop for errors.\nRepo: ${REPO}\nCommit immediately without showing a plan.`);
    } else {
      pass("Shop Page", "Shop page showing products and prices");
    }
  } catch (e) {
    await snap(page, "Shop-Page-Crash");
    fail("Shop Page", `Failed to load: ${e.message}`, null,
      `/shop failed to load entirely. Check the network panel and ensure the Supabase queries resolve.\nRepo: ${REPO}`);
  }
}

async function checkBundlesPage(page) {
  try {
    await page.goto(`${SITE}/bundles`, { waitUntil: "networkidle", timeout: 25000 });
    const bodyText = await page.textContent("body");

    const hasGiftBoxes = bodyText?.includes("Baby Shower Gift Box") || bodyText?.includes("Gift Box");
    const hasRecoveryKits = bodyText?.includes("Postpartum Recovery") || bodyText?.includes("Recovery Kit");
    const hasMaternity = bodyText?.includes("Maternity Bundle") || bodyText?.includes("Maternity List");

    if (!hasGiftBoxes) {
      await snap(page, "Bundles-Gift-Boxes");
      fail("Bundles Page - Gift Boxes", "Baby Shower Gift Boxes section not visible on /bundles", null,
        `Gift boxes are missing from /bundles. Check the bundles page query for is_gift_box = true and name filter 'Baby Shower Gift Box'.\nRepo: ${REPO}\nCommit immediately without showing a plan.`);
    } else {
      pass("Bundles Page - Gift Boxes", "Baby Shower Gift Boxes visible");
    }

    if (!hasRecoveryKits) {
      await snap(page, "Bundles-Recovery-Kits");
      fail("Bundles Page - Recovery Kits", "Postpartum Recovery Kits section not visible on /bundles", null,
        `Recovery kits are missing from /bundles. Check the bundles page query for is_gift_box = true and name filter 'Postpartum Recovery Kit'.\nRepo: ${REPO}\nCommit immediately without showing a plan.`);
    } else {
      pass("Bundles Page - Recovery Kits", "Postpartum Recovery Kits visible");
    }

    if (!hasMaternity) {
      warn("Bundles Page - Maternity Lists", "Maternity Bundles section not visible on /bundles", null,
        `Maternity bundles are missing from /bundles. Check the filter for name starting with 'Maternity Bundle'.\nRepo: ${REPO}\nCommit immediately without showing a plan.`);
    } else {
      pass("Bundles Page - Maternity Lists", "Maternity Bundles visible");
    }
  } catch (e) {
    await snap(page, "Bundles-Crash");
    fail("Bundles Page", `Failed to load: ${e.message}`, null,
      `/bundles failed to load entirely. Check the network panel.\nRepo: ${REPO}`);
  }
}

async function checkProductPage(page) {
  try {
    await page.goto(`${SITE}/products/baby-shower-gift-box-basic`, { waitUntil: "networkidle", timeout: 25000 });
    const bodyText = await page.textContent("body");
    const hasPrice = bodyText?.includes("₦");
    const hasWhatsInside = bodyText?.toLowerCase().includes("what's inside")
      || bodyText?.toLowerCase().includes("whats inside")
      || bodyText?.toLowerCase().includes("included");
    const hasCheckout = bodyText?.toLowerCase().includes("proceed to checkout")
      || bodyText?.toLowerCase().includes("checkout");

    if (!hasPrice) {
      await snap(page, "Bundle-Product-Price");
      fail("Bundle Product Page - Price", "No price visible on Baby Shower Gift Box Basic page", null,
        `The bundle product page is not showing a price. Check that brands[0].price is > 0 in the DB and the product page is reading from brands[0].price correctly.\nRepo: ${REPO}\nCommit immediately without showing a plan.`);
    } else {
      pass("Bundle Product Page - Price", "Price visible on bundle product page");
    }

    if (!hasWhatsInside) {
      warn("Bundle Product Page - Contents", "\"What's Inside\" section not visible", null,
        `The "What's Inside" section is missing from the bundle product page. Check the get_gift_box_price RPC call and the WhatsInside / BundleCustomiser render condition.\nRepo: ${REPO}\nCommit immediately without showing a plan.`);
    } else {
      pass("Bundle Product Page - Contents", "\"What's Inside\" section visible");
    }

    if (!hasCheckout) {
      await snap(page, "Bundle-Product-CTA");
      fail("Bundle Product Page - CTA", "\"Proceed to Checkout\" button not visible", null,
        `The checkout CTA is missing from the bundle product page. Check the isBundlePage condition and the handleProceedToCheckout button render.\nRepo: ${REPO}\nCommit immediately without showing a plan.`);
    } else {
      pass("Bundle Product Page - CTA", "\"Proceed to Checkout\" button visible");
    }
  } catch (e) {
    await snap(page, "Bundle-Product-Crash");
    fail("Bundle Product Page", `Failed to load: ${e.message}`, null,
      `Bundle product page failed to load entirely. Check that the product slug is still active.\nRepo: ${REPO}`);
  }
}

async function checkQuizPage(page) {
  try {
    await page.goto(`${SITE}/quiz`, { waitUntil: "networkidle", timeout: 20000 });
    const bodyText = await page.textContent("body");
    const hasQuiz = bodyText?.toLowerCase().includes("budget")
      || bodyText?.toLowerCase().includes("expecting")
      || bodyText?.toLowerCase().includes("hospital");
    if (!hasQuiz) {
      await snap(page, "Quiz-Page");
      fail("Quiz Page", "Quiz page not loading quiz questions", null,
        `The quiz page is not showing quiz questions. Check the quiz component and QuizQuestion render logic.\nRepo: ${REPO}\nCommit immediately without showing a plan.`);
    } else {
      pass("Quiz Page", "Quiz page loading correctly");
    }
  } catch (e) {
    await snap(page, "Quiz-Page-Crash");
    fail("Quiz Page", `Failed to load: ${e.message}`, null,
      `/quiz failed to load entirely.\nRepo: ${REPO}`);
  }
}

async function checkAdminLogin(page) {
  try {
    await page.goto(`${SITE}/admin`, { waitUntil: "networkidle", timeout: 20000 });
    const bodyText = await page.textContent("body");
    const isAccessible = bodyText && bodyText.trim().length > 50;
    const is404 = bodyText?.toLowerCase().includes("404") || bodyText?.toLowerCase().includes("not found");

    if (is404) {
      await snap(page, "Admin-Route-404");
      fail("Admin Route", "/admin returning 404 — admin panel inaccessible", null,
        `The /admin route is returning 404. Check App.tsx that the /admin route is defined and the AdminLayout component exists.\nRepo: ${REPO}\nCommit immediately without showing a plan.`);
    } else if (!isAccessible) {
      await snap(page, "Admin-Route-Blank");
      warn("Admin Route", "/admin appears blank", null,
        `The /admin route is loading but appears blank. Check AdminLayout and the admin auth guard.\nRepo: ${REPO}\nCommit immediately without showing a plan.`);
    } else {
      pass("Admin Route", "/admin route accessible");
    }
  } catch (e) {
    fail("Admin Route", `Failed to load: ${e.message}`, null,
      `/admin failed to load entirely.\nRepo: ${REPO}`);
  }
}

async function checkConsoleErrors(page, pageName, url) {
  const errors = [];
  page.on("console", msg => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", err => errors.push(err.message));

  await page.goto(url, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});

  // Ignore noise from third-party analytics / blocked trackers.
  const serious = errors.filter(e =>
    !e.includes("favicon") &&
    !e.includes("analytics") &&
    !e.includes("gtm") &&
    !e.includes("hotjar") &&
    !e.includes("net::ERR_BLOCKED")
  );

  if (serious.length > 0) {
    await snap(page, `Console-${pageName}`);
    warn(`Console Errors (${pageName})`,
      `${serious.length} console error(s) on ${pageName}`,
      serious.slice(0, 3).join(" | "),
      `Console errors detected on ${pageName} (${url}):\n${serious.slice(0, 5).join("\n")}\n\nClaude Code fix:\nInvestigate each error. Common causes: unhandled promise rejections, missing component props, failed Supabase queries. Fix each and ensure try/catch is in place for all async operations.\nRepo: ${REPO}\nCommit immediately without showing a plan.`);
  } else {
    pass(`Console Errors (${pageName})`, `No serious console errors on ${pageName}`);
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────

(async () => {
  console.log("🔍 BundledMum Frontend Health Check starting...\n");
  console.log(`Target: ${SITE}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "BundledMum-HealthCheck/1.0",
    viewport: { width: 1280, height: 800 },
  });

  // Page-level checks share a single page (faster).
  const page = await context.newPage();
  await checkHomepage(page);
  await checkShopPage(page);
  await checkBundlesPage(page);
  await checkProductPage(page);
  await checkQuizPage(page);
  await checkAdminLogin(page);
  await page.close();

  // Console error checks — fresh page per URL so listeners are isolated.
  for (const [name, url] of [
    ["Homepage", SITE],
    ["Shop", `${SITE}/shop`],
    ["Bundles", `${SITE}/bundles`],
    ["Quiz", `${SITE}/quiz`],
  ]) {
    const p = await context.newPage();
    await checkConsoleErrors(p, name, url);
    await p.close();
  }

  await browser.close();

  const criticals = results.filter(r => r.status === "critical").length;
  const warnings = results.filter(r => r.status === "warning").length;
  const oks = results.filter(r => r.status === "ok").length;
  console.log(`\n📊 Frontend check complete: ${criticals} critical, ${warnings} warnings, ${oks} OK`);

  // Post results to the Supabase edge function for email delivery +
  // health_check_log persistence. Without the service-role key the
  // browser checks still run but results stay local to the workflow.
  if (HEALTH_CHECK_KEY) {
    try {
      const resp = await fetch(`${HEALTH_CHECK_URL}?source=frontend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${HEALTH_CHECK_KEY}`,
        },
        body: JSON.stringify({ frontend_results: results }),
      });
      console.log("📤 Results posted to Supabase:", resp.status);
    } catch (e) {
      console.error("Failed to post results:", e.message);
    }
  } else {
    console.log("ℹ️  SUPABASE_SERVICE_ROLE_KEY missing — skipped result POST");
  }

  process.exit(criticals > 0 ? 1 : 0);
})();
