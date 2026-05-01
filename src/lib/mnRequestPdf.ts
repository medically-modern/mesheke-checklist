// Dynamic Medical Necessity Request PDF generator.
// Replaces the static manually-edited templates with one that fills in patient
// info + ✓/✗ marks based on the patient's current Monday MN Invalid Reasons.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Patient } from "./workflow";

interface Requirement {
  name: string;
  example: string;
  /** Reason strings (any match → ✗). */
  reasonKeys: string[];
  /** If true, always render as ✗ (we always need it from the doctor). */
  alwaysMissing?: boolean;
}

interface Block {
  title: string;
  situation: string;
  requirements: Requirement[];
}

const TEAL = rgb(0.36, 0.66, 0.66);
const RED = rgb(0.85, 0.18, 0.29);
const GREEN = rgb(0.0, 0.6, 0.3);
const TEXT = rgb(0.15, 0.15, 0.15);
const LIGHT = rgb(0.55, 0.55, 0.55);
const BORDER = rgb(0.8, 0.8, 0.8);

// =====================================================================
// Coverage-path → Block mapping
// =====================================================================

function cgmBlock(coveragePath: string | undefined): Block | null {
  if (coveragePath === "Insulin") {
    return {
      title: "CGM Documentation",
      situation: "CGM for insulin-treated patient",
      requirements: [
        {
          name: "CGM script",
          example: "Signed",
          reasonKeys: ["CGM Script invalid", "CGM Script missing"],
        },
        {
          name: "Insulin-treated",
          example: "Insulin listed in medications section of medical records",
          reasonKeys: [],
          alwaysMissing: true,
        },
      ],
    };
  }
  if (coveragePath === "Hypo") {
    return {
      title: "CGM Documentation",
      situation: "CGM for patient with hypoglycemia history",
      requirements: [
        {
          name: "CGM script",
          example: "Signed",
          reasonKeys: ["CGM Script invalid", "CGM Script missing"],
        },
        {
          name: "Hypoglycemic events documented",
          example: "Documented hypoglycemia within the last 6 months",
          reasonKeys: [],
          alwaysMissing: true,
        },
      ],
    };
  }
  return null;
}

const SCRIPT_REASONS = ["Insulin Pump Script invalid", "Insulin Pump Script missing"];
const SCRIPT_REQ: Requirement = {
  name: "Insulin Pump script",
  example: "Signed",
  reasonKeys: SCRIPT_REASONS,
};
const EDU_REQ: Requirement = {
  name: "Diabetes education",
  example: "Patient has been educated on diabetes self-management",
  reasonKeys: ["Diabetes Education invalid"],
};
const INJ_REQ: Requirement = {
  name: "3+ injections per day",
  example: "Patient is on multiple daily injections of insulin",
  reasonKeys: ["3+ Injections invalid"],
};
const CGM_USE_REQ: Requirement = {
  name: "Currently using a CGM",
  example: "Patient is using a CGM device",
  reasonKeys: ["CGM Use invalid"],
};
const BS_REQ: Requirement = {
  name: "Blood sugar issues documented",
  example: "Hypoglycemic or hyperglycemic events recorded",
  reasonKeys: ["Blood Sugar Issues invalid"],
};
const LMN_REQ: Requirement = {
  name: "Letter of Medical Necessity",
  example: "Signed LMN on file",
  reasonKeys: ["Letter of MN missing", "Letter of MN invalid"],
};
const MALFUNCTION_REQ: Requirement = {
  name: "Pump malfunction documented",
  example: "Documented malfunction of current pump",
  reasonKeys: ["Malfunction missing"],
};
const OOW_REQ: Requirement = {
  name: "Pump out of warranty",
  example: "Original purchase date >4 years ago (>5 years for Medicare A&B)",
  reasonKeys: ["OOW Date missing"],
  // The "OOW Date invalid (<X years)" string contains a number; we match by prefix
  // in the reason check below.
};

function ipBlock(coveragePath: string | undefined): Block | null {
  if (!coveragePath) return null;
  switch (coveragePath) {
    case "Supplies Only":
      return {
        title: "Insulin Pump Supplies",
        situation: "Refill of insulin pump supplies",
        requirements: [SCRIPT_REQ],
      };
    case "1st Pump >6M Diagnosed":
      return {
        title: "First Time Pump (>6 months since diagnosis)",
        situation: "First time insulin pump user, diagnosed >6 months ago",
        requirements: [SCRIPT_REQ, EDU_REQ, INJ_REQ, CGM_USE_REQ, BS_REQ],
      };
    case "1st Pump <6M Diagnosed":
      return {
        title: "First Time Pump (<6 months since diagnosis)",
        situation: "First time insulin pump user, diagnosed <6 months ago",
        requirements: [SCRIPT_REQ, EDU_REQ, INJ_REQ, CGM_USE_REQ, BS_REQ, LMN_REQ],
      };
    case "OOW Pump":
      return {
        title: "Out of Warranty Pump Replacement",
        situation: "Replacement insulin pump (current pump out of warranty)",
        requirements: [SCRIPT_REQ, OOW_REQ, MALFUNCTION_REQ],
      };
    case "Omnipod Switch":
      return {
        title: "Omnipod Switch",
        situation: "Switching to / from Omnipod insulin pump",
        requirements: [SCRIPT_REQ, EDU_REQ, INJ_REQ, CGM_USE_REQ, BS_REQ, MALFUNCTION_REQ],
      };
    case "IW New Insurance":
      return {
        title: "Continuation on New Insurance",
        situation: "Existing insulin pump user, new insurance plan",
        requirements: [SCRIPT_REQ, EDU_REQ, INJ_REQ, CGM_USE_REQ, BS_REQ],
      };
    default:
      return null;
  }
}

// =====================================================================
// Reason matching
// =====================================================================

function splitReasons(text?: string): string[] {
  if (!text) return [];
  return text
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isReceived(req: Requirement, allReasons: string[]): boolean {
  if (req.alwaysMissing) return false;
  // Any reason match (exact or "OOW Date invalid (<X years)" startsWith) → not received
  for (const reason of allReasons) {
    if (req.reasonKeys.includes(reason)) return false;
    if (req.name === "Pump out of warranty" && reason.startsWith("OOW Date invalid")) {
      return false;
    }
  }
  return true;
}

// =====================================================================
// PDF renderer
// =====================================================================

interface DrawCtx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  width: number;
  height: number;
  y: number;
}

function newPage(pdfDoc: PDFDocument, font: PDFFont, bold: PDFFont): DrawCtx {
  const page = pdfDoc.addPage([612, 792]); // letter
  const { width, height } = page.getSize();
  return { page, font, bold, width, height, y: height - 50 };
}

function drawHeader(ctx: DrawCtx) {
  const { page, font, bold, width } = ctx;
  // Logo placeholder (text-only)
  page.drawText("MEDICALLY MODERN", {
    x: 50,
    y: ctx.y - 8,
    size: 22,
    font: bold,
    color: TEAL,
  });
  // Right-side contact
  page.drawText("Fax: (347) 503 - 7148", {
    x: width - 230,
    y: ctx.y,
    size: 10,
    font: bold,
    color: TEXT,
  });
  page.drawText("Email: records@medicallymodern.com", {
    x: width - 230,
    y: ctx.y - 14,
    size: 10,
    font: bold,
    color: TEXT,
  });
  ctx.y -= 30;
  // Horizontal rule
  page.drawLine({
    start: { x: 50, y: ctx.y },
    end: { x: width - 50, y: ctx.y },
    thickness: 1,
    color: TEAL,
  });
  ctx.y -= 30;
  // Title
  page.drawText("Medical Necessity Request", {
    x: 50,
    y: ctx.y,
    size: 28,
    font: bold,
    color: TEAL,
  });
  ctx.y -= 40;
}

function drawPatientInfo(ctx: DrawCtx, patient: Patient) {
  const { page, font, bold } = ctx;
  page.drawText("Patient Information", {
    x: 50,
    y: ctx.y,
    size: 16,
    font: bold,
    color: TEXT,
  });
  ctx.y -= 22;
  page.drawText(`Name:`, { x: 50, y: ctx.y, size: 11, font: bold, color: TEXT });
  page.drawText(patient.name, { x: 100, y: ctx.y, size: 11, font, color: TEXT });
  page.drawText(`Date of Birth:`, { x: 290, y: ctx.y, size: 11, font: bold, color: TEXT });
  page.drawText(patient.dob || "—", { x: 380, y: ctx.y, size: 11, font, color: TEXT });
  ctx.y -= 30;
}

function drawIntro(ctx: DrawCtx) {
  const { page, font, bold } = ctx;
  page.drawText("Medical Necessity Requirements", {
    x: 50,
    y: ctx.y,
    size: 16,
    font: bold,
    color: TEXT,
  });
  ctx.y -= 22;
  page.drawText(
    "After reviewing the initial documentation, we still need a few items for insurance",
    { x: 50, y: ctx.y, size: 10, font, color: TEXT },
  );
  ctx.y -= 13;
  page.drawText(
    "approval. We're happy to help make this process as easy as possible.",
    { x: 50, y: ctx.y, size: 10, font, color: TEXT },
  );
  ctx.y -= 22;
  page.drawText("A ", { x: 50, y: ctx.y, size: 11, font: bold, color: TEXT });
  page.drawText("✗", { x: 63, y: ctx.y, size: 12, font: bold, color: RED });
  page.drawText(" means documentation is still needed.", { x: 73, y: ctx.y, size: 11, font: bold, color: TEXT });
  ctx.y -= 14;
  page.drawText("A ", { x: 50, y: ctx.y, size: 11, font: bold, color: TEXT });
  page.drawText("✓", { x: 63, y: ctx.y, size: 12, font: bold, color: GREEN });
  page.drawText(" means already received.", { x: 73, y: ctx.y, size: 11, font: bold, color: TEXT });
  ctx.y -= 18;
}

function drawBlock(
  ctx: DrawCtx,
  block: Block,
  allReasons: string[],
) {
  const { page, font, bold, width } = ctx;
  // Section title
  page.drawText(block.title, { x: 50, y: ctx.y, size: 13, font: bold, color: TEAL });
  ctx.y -= 18;
  // Situation line
  page.drawText("Situation: ", { x: 50, y: ctx.y, size: 11, font: bold, color: TEXT });
  page.drawText(block.situation, { x: 110, y: ctx.y, size: 11, font, color: TEXT });
  ctx.y -= 22;

  // Table header
  const tableX = 50;
  const tableW = width - 100;
  page.drawRectangle({
    x: tableX,
    y: ctx.y - 4,
    width: tableW,
    height: 22,
    color: rgb(0.94, 0.94, 0.94),
  });
  page.drawText("Status", { x: tableX + 8, y: ctx.y + 4, size: 10, font: bold, color: TEXT });
  page.drawText("Requirement", { x: tableX + 70, y: ctx.y + 4, size: 10, font: bold, color: TEXT });
  page.drawText("Examples of simple language for each requirement", { x: tableX + 230, y: ctx.y + 4, size: 10, font: bold, color: TEXT });
  ctx.y -= 22;

  // Rows
  for (const req of block.requirements) {
    const received = isReceived(req, allReasons);
    page.drawRectangle({
      x: tableX,
      y: ctx.y - 4,
      width: tableW,
      height: 24,
      borderColor: BORDER,
      borderWidth: 0.5,
    });
    page.drawText(received ? "✓" : "✗", {
      x: tableX + 14,
      y: ctx.y + 4,
      size: 14,
      font: bold,
      color: received ? GREEN : RED,
    });
    page.drawText(req.name, {
      x: tableX + 70,
      y: ctx.y + 6,
      size: 10,
      font,
      color: TEXT,
    });
    page.drawText(req.example, {
      x: tableX + 230,
      y: ctx.y + 6,
      size: 9,
      font,
      color: LIGHT,
    });
    ctx.y -= 24;
  }
  ctx.y -= 16;
}

function drawFooter(ctx: DrawCtx) {
  const { page, font } = ctx;
  page.drawText(
    "For any questions, you can call Medically Modern at: (347) 503 - 7148",
    { x: 50, y: 40, size: 9, font, color: LIGHT },
  );
}

// =====================================================================
// Public API
// =====================================================================

export async function generateMnRequestPdf(patient: Patient): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const ctx = newPage(pdfDoc, font, bold);

  drawHeader(ctx);
  drawPatientInfo(ctx, patient);
  drawIntro(ctx);

  const cgm = cgmBlock(patient.cgmCoveragePath);
  const ip = ipBlock(patient.ipCoveragePath);

  const allReasons = [
    ...splitReasons(patient.generalMnInvalidReasons),
    ...splitReasons(patient.cgmMnInvalidReasons),
    ...splitReasons(patient.ipMnInvalidReasons),
  ];

  if (cgm) drawBlock(ctx, cgm, allReasons);
  if (ip) drawBlock(ctx, ip, allReasons);
  if (!cgm && !ip) {
    ctx.page.drawText(
      "(No coverage paths require an MN request — patient is on Supplies Only or Not Serving.)",
      { x: 50, y: ctx.y, size: 11, font, color: LIGHT },
    );
  }

  drawFooter(ctx);

  return pdfDoc.save();
}

export function downloadMnRequestPdf(patient: Patient, bytes: Uint8Array) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = patient.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  a.download = `MN_Request_${safeName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function previewMnRequestPdf(bytes: Uint8Array) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // URL revocation handled when the new tab closes
}
