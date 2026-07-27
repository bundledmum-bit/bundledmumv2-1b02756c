import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Client-side PDF for a shared quiz list.
 *
 * Exists because link previews do not work on this site yet: WhatsApp fetches
 * the SPA shell and shows homepage tags for every URL, so a bare link looks
 * like nothing. The attachment carries the list itself.
 *
 * Reuses the conventions already established in quotePdf.ts — same palette,
 * same jsPDF + autotable stack, same "NGN " prefix (Helvetica in jsPDF does
 * not embed the naira glyph reliably and several viewers render a tofu box).
 */

const FOREST = "#2D6A4F";
const CORAL = "#E76F51";
const BODY = "#1A1A1A";
const MUTED = "#6B6B6B";

const fmtN = (n: number | null | undefined) =>
  typeof n === "number" && isFinite(n) ? `NGN ${Math.round(n).toLocaleString()}` : "NGN 0";

export interface QuizListPdfItem {
  name: string;
  brand_name?: string | null;
  size?: string | null;
  color?: string | null;
  quantity: number;
  unit_price: number | null;
  available: boolean;
}

export interface QuizListPdfInput {
  items: QuizListPdfItem[];
  listTotal: number;
  shareUrl: string;
  ownerLabel?: string | null;
  /** When prices were read. The PDF freezes them; the live page does not. */
  pricedAt?: string | Date | null;
}

const CORAL_LOGO_URL = "/images/BM-LOGO-CORAL.png";

/**
 * Load the wordmark and downscale it to roughly the size it is drawn at.
 * The source is a 341KB PNG; embedding it at full resolution is the single
 * biggest contributor to file size, and none of that detail survives at
 * 104x26pt anyway.
 */
async function loadLogo(url: string, targetW = 208): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, targetW / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL("image/png");
  } catch {
    return null; // fall back to a text wordmark rather than failing the export
  }
}

export async function generateQuizListPdf(input: QuizListPdfInput): Promise<jsPDF> {
  // compress: the logo is a 341KB PNG that jsPDF would otherwise embed as a
  // raw bitmap, pushing the file past 4MB — far too heavy to send over
  // Nigerian mobile data for something shared once.
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 40;

  const logo = await loadLogo(CORAL_LOGO_URL);
  if (logo) {
    try { doc.addImage(logo, "PNG", M, 34, 104, 26); } catch { /* wordmark below */ }
  }
  if (!logo) {
    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(CORAL);
    doc.text("BundledMum", M, 54);
  }

  const title = input.ownerLabel ? `${input.ownerLabel}'s list` : "A BundledMum list";
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(BODY);
  doc.text(title, M, 92);

  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(MUTED);
  doc.text(
    `${input.items.length} item${input.items.length === 1 ? "" : "s"}`,
    M,
    110,
  );

  autoTable(doc, {
    startY: 126,
    head: [["Item", "Qty", "Price", "Total"]],
    body: input.items.map((it) => {
      const detail = [it.brand_name, it.size ? `Size: ${it.size}` : null, it.color ? `Colour: ${it.color}` : null]
        .filter(Boolean)
        .join("  ·  ");
      const nameCell = [it.name, detail || null, it.available ? null : "Currently unavailable"]
        .filter(Boolean)
        .join("\n");
      const unit = it.available ? it.unit_price ?? 0 : null;
      return [
        nameCell,
        String(it.quantity),
        unit == null ? "—" : fmtN(unit),
        unit == null ? "—" : fmtN(unit * it.quantity),
      ];
    }),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6, textColor: BODY, valign: "middle" },
    headStyles: { fillColor: FOREST, textColor: "#FFFFFF", fontStyle: "bold", fontSize: 9 },
    columnStyles: {
      0: { cellWidth: pageW - M * 2 - 60 - 90 - 90 },
      1: { cellWidth: 60, halign: "center" },
      2: { cellWidth: 90, halign: "right" },
      3: { cellWidth: 90, halign: "right" },
    },
    alternateRowStyles: { fillColor: "#FAF7F2" },
    margin: { left: M, right: M },
  });

  let y = (doc as any).lastAutoTable?.finalY ?? 200;

  y += 18;
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(BODY);
  doc.text("Total", M, y);
  doc.text(fmtN(input.listTotal), pageW - M, y, { align: "right" });

  // The date is load-bearing: this file freezes prices at the moment it was
  // made, while the live link re-prices on every open. Without it someone
  // quotes a three-week-old number back at you.
  const priced = input.pricedAt ? new Date(input.pricedAt) : new Date();
  const pricedText = `Prices correct as of ${priced.toLocaleDateString("en-NG", {
    day: "numeric", month: "long", year: "numeric",
  })}`;
  y += 22;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(MUTED);
  doc.text(pricedText, M, y);

  y += 26;
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(FOREST);
  doc.text("See the live list and prices:", M, y);
  y += 14;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(CORAL);
  doc.textWithLink(input.shareUrl, M, y, { url: input.shareUrl });

  y += 22;
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(MUTED);
  doc.text(
    "Prices on the link above are always current. bundledmum.com",
    M,
    y,
  );

  return doc;
}

export function quizListPdfFilename(ownerLabel?: string | null): string {
  const who = (ownerLabel || "BundledMum")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "bundledmum";
  const d = new Date().toISOString().slice(0, 10);
  return `${who}-list-${d}.pdf`;
}

/**
 * Hand the PDF to the OS share sheet so WhatsApp appears in it. Falls back to
 * a download when the browser cannot share files (every desktop browser
 * today), because a bare link previews as nothing.
 *
 * Returns how it was delivered so the caller can word the toast honestly.
 */
export async function shareQuizListPdf(
  input: QuizListPdfInput,
): Promise<"shared" | "downloaded" | "cancelled"> {
  const doc = await generateQuizListPdf(input);
  const blob = doc.output("blob") as Blob;
  const filename = quizListPdfFilename(input.ownerLabel);
  const file = new File([blob], filename, { type: "application/pdf" });

  const canShareFile =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] }) &&
    typeof navigator.share === "function";

  if (canShareFile) {
    try {
      await navigator.share({
        files: [file],
        title: input.ownerLabel ? `${input.ownerLabel}'s list` : "A BundledMum list",
        text: `Here is the list — live prices here: ${input.shareUrl}`,
      });
      return "shared";
    } catch (err: any) {
      // AbortError is her dismissing the sheet, not a failure to report.
      if (err?.name === "AbortError") return "cancelled";
      console.warn("[quizListPdf] share failed, falling back to download:", err);
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
