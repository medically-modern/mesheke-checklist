// EvalState — local-only state for the Medical Necessity Evaluate tab.
// Lives in localStorage, keyed by patient ID. Never written to Monday.
// On Send (when reconnected), we'll derive Monday-bound values from this.

import type { IpPath } from "./ipPaths";
import { IP_PATH_FIELDS } from "./ipPaths";
import type { Patient } from "./workflow";

export type ValidInvalid = "Valid" | "Invalid";
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

  // IP block
  ipCoveragePath?: IpPath;
  ipScriptValid?: ValidInvalid;
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
    return JSON.parse(raw) as EvalState;
  } catch {
    return {};
  }
}

export function saveEvalState(patientId: string, state: EvalState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + patientId, JSON.stringify(state));
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
  reasons: string[]; // human-readable list of what's blocking
  sections: {
    cgm: { shown: boolean; valid: boolean };
    ip: { shown: boolean; valid: boolean };
    diagnosis: { valid: boolean };
    mr: { valid: boolean };
  };
}

export function deriveValidity(
  state: EvalState,
  patient: Patient,
  showCgm: boolean,
  showIp: boolean,
): ValidityResult {
  const reasons: string[] = [];

  // ---- CGM section ----
  let cgmValid = true;
  if (showCgm) {
    if (state.cgmScriptValid !== "Valid") {
      cgmValid = false;
      reasons.push(
        state.cgmScriptValid === "Invalid"
          ? "CGM Script invalid"
          : "CGM Script not validated",
      );
    }
    if (!state.cgmCoveragePath) {
      cgmValid = false;
      reasons.push("CGM Coverage Path not selected");
    } else if (state.cgmCoveragePath === "Invalid") {
      cgmValid = false;
      reasons.push("CGM Coverage Path invalid");
    }
  }

  // ---- IP section ----
  let ipValid = true;
  if (showIp) {
    if (!state.ipCoveragePath) {
      ipValid = false;
      reasons.push("IP Coverage Path not selected");
    } else {
      const cfg = IP_PATH_FIELDS[state.ipCoveragePath];
      if (state.ipScriptValid !== "Valid") {
        ipValid = false;
        reasons.push(
          state.ipScriptValid === "Invalid"
            ? "IP Script invalid"
            : "IP Script not validated",
        );
      }
      if (cfg.showEducation && state.diabetesEducation !== "Yes") {
        ipValid = false;
        reasons.push("Diabetes Education not documented");
      }
      if (cfg.show3Injections && state.threeInjections !== "Yes") {
        ipValid = false;
        reasons.push("3+ Injections per day not documented");
      }
      if (cfg.showCgmUse && state.cgmUse !== "Yes") {
        ipValid = false;
        reasons.push("CGM Use not documented");
      }
      if (cfg.showBsIssues && state.bloodSugarIssues !== "Yes") {
        ipValid = false;
        reasons.push("Blood Sugar Issues not documented");
      }
      if (cfg.showLmn) {
        if (state.lmn === "No" || state.lmn === undefined) {
          ipValid = false;
          reasons.push("Letter of MN not on file");
        } else if (state.lmn === "Yes, but Invalid") {
          ipValid = false;
          reasons.push("Letter of MN invalid");
        }
      }
      if (cfg.showOow) {
        const oow = isOowDateValid(state.oowDate, patient.primaryInsurance);
        if (!oow) {
          ipValid = false;
          reasons.push("OOW Date not entered");
        } else if (!oow.valid) {
          const yrs = (oow.thresholdDays / 365.25).toFixed(0);
          ipValid = false;
          reasons.push(`OOW Date too recent (must be > ${yrs} years old)`);
        }
      }
      if (cfg.showMalfunction && state.malfunction !== "Yes") {
        ipValid = false;
        reasons.push("Malfunction not documented");
      }
    }
  }

  // ---- Diagnosis ----
  const diagnosisValid = !!state.diagnosis && state.diagnosis !== "Evaluate";
  if (!diagnosisValid) reasons.push("Diagnosis not selected");

  // ---- MR Received ----
  const mrValid = state.mrReceived === "Yes";
  if (!mrValid) reasons.push("MR not received");

  const established = cgmValid && ipValid && diagnosisValid && mrValid;

  return {
    established,
    reasons,
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
  medicalNecessity: "Established" | "Not Established";
  reasonsNotEstablished: string[];
}

export function buildMondayPreview(
  state: EvalState,
  validity: ValidityResult,
): MondayPreview {
  return {
    ipCoveragePath: state.ipCoveragePath,
    cgmCoveragePath: state.cgmCoveragePath,
    diagnosis: state.diagnosis,
    mrsClinicals: state.mrReceived === "Yes" ? "MR Received" : "Collect",
    medicalNecessity: validity.established ? "Established" : "Not Established",
    reasonsNotEstablished: validity.established ? [] : validity.reasons,
  };
}
