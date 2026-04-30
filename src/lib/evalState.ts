// EvalState — local-only state for the Medical Necessity Evaluate tab.
// Lives in localStorage, keyed by patient ID. Never written to Monday.
// On Send (when reconnected), we'll derive Monday-bound values from this.

import type { IpPath } from "./ipPaths";
import { IP_PATH_FIELDS } from "./ipPaths";
import type { Patient } from "./workflow";

export type ValidInvalid = "Valid" | "Invalid" | "Missing";
export type YesNo = "Yes" | "No";
export type CgmCoveragePath = "Insulin" | "Hypo" | "Invalid";
export type LmnStatus = "Yes & Valid" | "Yes, but Invalid" | "No";

export interface LocalFile {
  name: string;
  size: number;
  addedAt: string; // ISO
}

export interface EvalState {
  // CGM block
  cgmScriptValid?: ValidInvalid;
  cgmCoveragePath?: CgmCoveragePath;
  generateCgmScript?: string; // "Generate" (or blank)

  // IP block
  ipCoveragePath?: IpPath;
  ipScriptValid?: ValidInvalid;
  generateIpScript?: string; // "Generate" (or blank)
  diabetesEducation?: YesNo;
  threeInjections?: YesNo;
  cgmUse?: YesNo;
  bloodSugarIssues?: YesNo;
  lmn?: LmnStatus;
  oowDate?: string; // ISO date YYYY-MM-DD
  malfunction?: YesNo;

  // Diagnosis & Clinicals
  diagnosis?: string;
  lastVisitDate?: string; // ISO date
  clinicalFiles?: LocalFile[];
  finalClinicalFiles?: LocalFile[];
  mrReceived?: YesNo;

  // Notes
  notes?: string;
}

const STORAGE_PREFIX = "mn-eval:";

export function loadEvalState(patientId: string): EvalState {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + patientId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as EvalState;
    // Strip any stale "Generate" trigger values that may have been persisted
    // before we made these fields ephemeral.
    delete parsed.generateCgmScript;
    delete parsed.generateIpScript;
    return parsed;
  } catch {
    return {};
  }
}

export function saveEvalState(patientId: string, state: EvalState): void {
  if (typeof localStorage === "undefined") return;
  try {
    // Strip transient "Generate" trigger fields — they are tied to a single
    // in-flight DocExport run and should not survive a reload. Otherwise the
    // toggle stays stuck on "Generating…" forever.
    const {
      generateCgmScript: _gcgm,
      generateIpScript: _gip,
      ...persistable
    } = state;
    void _gcgm;
    void _gip;
    localStorage.setItem(STORAGE_PREFIX + patientId, JSON.stringify(persistable));
  } catch {
    // Storage may be full or disabled — fail silently.
  }
}

export function clearEvalState(patientId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_PREFIX + patientId);
}

// ---- OOW Date validity ----

const FOUR_YEARS_DAYS = 4 * 365.25;
const FIVE_YEARS_DAYS = 5 * 365.25;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * OOW Date is valid (i.e., the pump is sufficiently out of warranty) when
 * (today - oowDate) > 4 years, or > 5 years if Primary Insurance = Medicare A&B.
 */
export function isOowDateValid(
  oowDate: string | undefined,
  primaryInsurance: string | undefined,
): { valid: boolean; ageDays: number; thresholdDays: number } | null {
  if (!oowDate) return null;
  const d = new Date(oowDate);
  if (Number.isNaN(d.getTime())) return null;
  const ageDays = (Date.now() - d.getTime()) / MS_PER_DAY;
  const isMedicareAB = primaryInsurance === "Medicare A&B";
  const thresholdDays = isMedicareAB ? FIVE_YEARS_DAYS : FOUR_YEARS_DAYS;
  return { valid: ageDays > thresholdDays, ageDays, thresholdDays };
}

// ---- Validity rollup ----

export interface ValidityResult {
  established: boolean;
  reasons: string[]; // combined human-readable list (all reasons)
  cgmReasons: string[]; // CGM-block-specific only
  ipReasons: string[]; // IP-block-specific only
  generalReasons: string[]; // shared (diagnosis, MR received, last visit, expiry)
  sections: {
    cgm: { shown: boolean; valid: boolean };
    ip: { shown: boolean; valid: boolean };
    diagnosis: { valid: boolean };
    mr: { valid: boolean }; // mr received + last visit set + not expired
  };
}

/** Compute MR Expiry Date (Last Visit + 6 months) and whether it's still valid (after today). */
export function getMrExpiry(lastVisit?: string): { expiry: Date | null; expired: boolean } {
  if (!lastVisit) return { expiry: null, expired: false };
  const d = new Date(lastVisit);
  if (Number.isNaN(d.getTime())) return { expiry: null, expired: false };
  const expiry = new Date(d);
  expiry.setMonth(expiry.getMonth() + 6);
  return { expiry, expired: expiry.getTime() <= Date.now() };
}

export function deriveValidity(
  state: EvalState,
  patient: Patient,
  showCgm: boolean,
  showIp: boolean,
): ValidityResult {
  const cgmReasons: string[] = [];
  const ipReasons: string[] = [];
  const generalReasons: string[] = [];

  // ---- CGM section ----
  let cgmValid = true;
  if (showCgm) {
    if (state.cgmScriptValid !== "Valid") {
      cgmValid = false;
      // "Missing" stays its own bucket; everything else (Invalid + unset) → invalid.
      if (state.cgmScriptValid === "Missing") cgmReasons.push("CGM Script missing");
      else cgmReasons.push("CGM Script invalid");
    }
    if (!state.cgmCoveragePath) {
      cgmValid = false;
      cgmReasons.push("CGM Coverage Path missing");
    } else if (state.cgmCoveragePath === "Invalid") {
      cgmValid = false;
      cgmReasons.push("CGM Coverage Path invalid");
    }
  }

  // ---- IP section ----
  let ipValid = true;
  if (showIp) {
    if (!state.ipCoveragePath) {
      ipValid = false;
      ipReasons.push("Insulin Pump Coverage Path missing");
    } else {
      const cfg = IP_PATH_FIELDS[state.ipCoveragePath];
      if (state.ipScriptValid !== "Valid") {
        ipValid = false;
        if (state.ipScriptValid === "Missing") ipReasons.push("Insulin Pump Script missing");
        else ipReasons.push("Insulin Pump Script invalid");
      }
      if (cfg.showEducation && state.diabetesEducation !== "Yes") {
        ipValid = false;
        ipReasons.push("Diabetes Education invalid");
      }
      if (cfg.show3Injections && state.threeInjections !== "Yes") {
        ipValid = false;
        ipReasons.push("3+ Injections invalid");
      }
      if (cfg.showCgmUse && state.cgmUse !== "Yes") {
        ipValid = false;
        ipReasons.push("CGM Use invalid");
      }
      if (cfg.showBsIssues && state.bloodSugarIssues !== "Yes") {
        ipValid = false;
        ipReasons.push("Blood Sugar Issues invalid");
      }
      if (cfg.showLmn) {
        if (state.lmn === "No" || state.lmn === undefined) {
          ipValid = false;
          ipReasons.push("Letter of MN missing");
        } else if (state.lmn === "Yes, but Invalid") {
          ipValid = false;
          ipReasons.push("Letter of MN invalid");
        }
      }
      if (cfg.showOow) {
        const oow = isOowDateValid(state.oowDate, patient.primaryInsurance);
        if (!oow) {
          ipValid = false;
          ipReasons.push("OOW Date missing");
        } else if (!oow.valid) {
          const yrs = (oow.thresholdDays / 365.25).toFixed(0);
          ipValid = false;
          ipReasons.push(`OOW Date invalid (<${yrs} years)`);
        }
      }
      if (cfg.showMalfunction && state.malfunction !== "Yes") {
        ipValid = false;
        ipReasons.push("Malfunction missing");
      }
    }
  }

  // ---- Diagnosis ----
  const diagnosisValid = !!state.diagnosis && state.diagnosis !== "Evaluate";
  if (!diagnosisValid) generalReasons.push("Diagnosis missing");

  // ---- MR Received + Last Visit + Expiry ----
  const mrReceived = state.mrReceived === "Yes";
  const lastVisitSet = !!state.lastVisitDate;
  const { expired } = getMrExpiry(state.lastVisitDate);
  const mrValid = mrReceived && lastVisitSet && !expired;
  if (!mrReceived) generalReasons.push("MR Missing");
  if (mrReceived && !lastVisitSet) generalReasons.push("Last Visit Date missing");
  if (mrReceived && lastVisitSet && expired) generalReasons.push("MR Expired (>6 months)");

  const established = cgmValid && ipValid && diagnosisValid && mrValid;

  return {
    established,
    reasons: [...cgmReasons, ...ipReasons, ...generalReasons],
    cgmReasons,
    ipReasons,
    generalReasons,
    sections: {
      cgm: { shown: showCgm, valid: cgmValid },
      ip: { shown: showIp, valid: ipValid },
      diagnosis: { valid: diagnosisValid },
      mr: { valid: mrValid },
    },
  };
}

// ---- Preview payload (what would be written to Monday) ----

export interface MondayPreview {
  ipCoveragePath?: string;
  cgmCoveragePath?: string;
  diagnosis?: string;
  mrsClinicals: "MR Received" | "Collect";
  lastVisitDate?: string;
  mrExpiryDate?: string;
  medicalNecessity: "Established" | "Not Established";
  generalMnInvalidReasons: string[];
  cgmMnInvalidReasons: string[];
  ipMnInvalidReasons: string[];
  generateCgmScript?: string;
  generateIpScript?: string;
}

export function buildMondayPreview(
  state: EvalState,
  validity: ValidityResult,
): MondayPreview {
  const { expiry } = getMrExpiry(state.lastVisitDate);
  return {
    ipCoveragePath: state.ipCoveragePath,
    cgmCoveragePath: state.cgmCoveragePath,
    diagnosis: state.diagnosis,
    mrsClinicals: state.mrReceived === "Yes" ? "MR Received" : "Collect",
    lastVisitDate: state.lastVisitDate,
    mrExpiryDate: expiry ? expiry.toISOString().slice(0, 10) : undefined,
    medicalNecessity: validity.established ? "Established" : "Not Established",
    generalMnInvalidReasons: validity.generalReasons,
    cgmMnInvalidReasons: validity.sections.cgm.shown ? validity.cgmReasons : [],
    ipMnInvalidReasons: validity.sections.ip.shown ? validity.ipReasons : [],
    generateCgmScript: state.generateCgmScript,
    generateIpScript: state.generateIpScript,
  };
}
