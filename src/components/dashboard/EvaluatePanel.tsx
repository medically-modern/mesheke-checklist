import type { Patient } from "@/lib/workflow";
import { StatusSelect } from "./StatusSelect";
import {
  STANDARD_EVAL,
  LANGUAGE_OPTS,
  BLOOD_SUGAR_OPTS,
  DIAGNOSIS_OPTS,
  MR_OPTS,
  MED_NEC_OPTS,
} from "@/lib/fieldOptions";

interface Props {
  patient: Patient;
  onUpdate: (patch: Partial<Patient>) => void;
}

export function EvaluatePanel({ patient, onUpdate }: Props) {
  return (
    <div className="space-y-4">
      {/* Clinical Eval Checklist */}
      <div className="rounded-xl bg-card border shadow-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Clinical Evaluation Checklist
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <div className="space-y-0.5">
            <StatusSelect label="CGM Script" value={patient.cgmScript} options={STANDARD_EVAL} onChange={(v) => onUpdate({ cgmScript: v })} />
            <StatusSelect label="Hypo Language" value={patient.hypoLanguage} options={LANGUAGE_OPTS} onChange={(v) => onUpdate({ hypoLanguage: v })} />
            <StatusSelect label="Insulin Language" value={patient.insulinLanguage} options={LANGUAGE_OPTS} onChange={(v) => onUpdate({ insulinLanguage: v })} />
            <StatusSelect label="IP Script" value={patient.ipScript} options={STANDARD_EVAL} onChange={(v) => onUpdate({ ipScript: v })} />
            <StatusSelect label="Diabetes Education" value={patient.diabetesEducation} options={STANDARD_EVAL} onChange={(v) => onUpdate({ diabetesEducation: v })} />
            <StatusSelect label="3+ Injections" value={patient.threeInjections} options={STANDARD_EVAL} onChange={(v) => onUpdate({ threeInjections: v })} />
          </div>
          <div className="space-y-0.5">
            <StatusSelect label="CGM Use" value={patient.cgmUse} options={STANDARD_EVAL} onChange={(v) => onUpdate({ cgmUse: v })} />
            <StatusSelect label="Blood Sugar Issues" value={patient.bloodSugarIssues} options={BLOOD_SUGAR_OPTS} onChange={(v) => onUpdate({ bloodSugarIssues: v })} />
            <StatusSelect label="LMN" value={patient.lmn} options={STANDARD_EVAL} onChange={(v) => onUpdate({ lmn: v })} />
            <StatusSelect label="OOW Date" value={patient.oowDate} options={STANDARD_EVAL} onChange={(v) => onUpdate({ oowDate: v })} />
            <StatusSelect label="Malfunction" value={patient.malfunction} options={STANDARD_EVAL} onChange={(v) => onUpdate({ malfunction: v })} />
            <StatusSelect label="Diagnosis" value={patient.diagnosis} options={DIAGNOSIS_OPTS} onChange={(v) => onUpdate({ diagnosis: v })} />
          </div>
        </div>
      </div>

      {/* MRs / Clinicals */}
      <div className="rounded-xl bg-card border shadow-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Medical Records & Clinicals
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <StatusSelect label="MRs / Clinicals" value={patient.mrsClinicals} options={MR_OPTS} onChange={(v) => onUpdate({ mrsClinicals: v })} />
          <StatusSelect label="Medical Necessity" value={patient.medicalNecessity} options={MED_NEC_OPTS} onChange={(v) => onUpdate({ medicalNecessity: v })} />
        </div>
      </div>
    </div>
  );
}
