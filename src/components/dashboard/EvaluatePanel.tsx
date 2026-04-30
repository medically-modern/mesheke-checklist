import type { Patient } from "@/lib/workflow";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  patient: Patient;
  onNotesChange: (notes: string) => void;
}

// Status badge colors
function statusColor(val?: string): string {
  if (!val) return "bg-muted text-muted-foreground";
  const v = val.toLowerCase();
  if (v === "valid" || v === "mr received" || v === "established") return "bg-emerald-100 text-emerald-800";
  if (v === "collect") return "bg-amber-100 text-amber-800";
  if (v === "evaluate") return "bg-blue-100 text-blue-800";
  if (v === "not serving" || v === "not needed") return "bg-gray-100 text-gray-500";
  if (v === "not established") return "bg-red-100 text-red-800";
  return "bg-muted text-muted-foreground";
}

function StatusBadge({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(value)}`}>
        {value || "—"}
      </span>
    </div>
  );
}

export function EvaluatePanel({ patient, onNotesChange }: Props) {
  return (
    <div className="space-y-4">
      {/* Clinical Eval Checklist */}
      <div className="rounded-xl bg-card border shadow-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Clinical Evaluation Checklist
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <div className="space-y-0.5">
            <StatusBadge label="CGM Script" value={patient.cgmScript} />
            <StatusBadge label="Hypo Language" value={patient.hypoLanguage} />
            <StatusBadge label="Insulin Language" value={patient.insulinLanguage} />
            <StatusBadge label="IP Script" value={patient.ipScript} />
            <StatusBadge label="Diabetes Education" value={patient.diabetesEducation} />
            <StatusBadge label="3+ Injections" value={patient.threeInjections} />
          </div>
          <div className="space-y-0.5">
            <StatusBadge label="CGM Use" value={patient.cgmUse} />
            <StatusBadge label="Blood Sugar Issues" value={patient.bloodSugarIssues} />
            <StatusBadge label="LMN" value={patient.lmn} />
            <StatusBadge label="OOW Date" value={patient.oowDate} />
            <StatusBadge label="Malfunction" value={patient.malfunction} />
            <StatusBadge label="Diagnosis" value={patient.diagnosis} />
          </div>
        </div>
      </div>

      {/* MRs / Clinicals */}
      <div className="rounded-xl bg-card border shadow-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Medical Records & Clinicals
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <StatusBadge label="MRs / Clinicals" value={patient.mrsClinicals} />
          <StatusBadge label="Medical Necessity" value={patient.medicalNecessity} />
        </div>
      </div>

      {/* MN Evaluation Notes */}
      <div className="rounded-xl bg-card border shadow-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          MN Evaluation Notes
        </p>
        <Textarea
          value={patient.mnEvalNotes ?? ""}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Add evaluation notes..."
          className="min-h-[100px] text-sm"
        />
      </div>
    </div>
  );
}
