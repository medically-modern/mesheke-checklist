import type { Patient } from "@/lib/workflow";
import { StatusSelect } from "./StatusSelect";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Phone, FileText } from "lucide-react";
import { GEN_SCRIPT_OPTS, CLINICALS_METHOD_OPTS } from "@/lib/fieldOptions";

interface Props {
  patient: Patient;
  onUpdate: (patch: Partial<Patient>) => void;
}

function InfoField({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value || "—"}</p>
      </div>
    </div>
  );
}

export function SendRequestPanel({ patient, onUpdate }: Props) {
  return (
    <div className="space-y-4">
      {/* Script Generation */}
      <div className="rounded-xl bg-card border shadow-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Script Generation
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <StatusSelect label="Generate CGM Script" value={patient.generateCgmScript} options={GEN_SCRIPT_OPTS} onChange={(v) => onUpdate({ generateCgmScript: v })} />
          <StatusSelect label="Generate IP Script" value={patient.generateIpScript} options={GEN_SCRIPT_OPTS} onChange={(v) => onUpdate({ generateIpScript: v })} />
        </div>
      </div>

      {/* Doctor / Send Info */}
      <div className="rounded-xl bg-card border shadow-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Send To
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 mb-4">
          <StatusSelect label="Clinicals Method" value={patient.clinicalsMethod} options={CLINICALS_METHOD_OPTS} onChange={(v) => onUpdate({ clinicalsMethod: v })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoField icon={<Mail className="h-3.5 w-3.5" />} label="Doctor Fax" value={patient.doctorFax} />
          <InfoField icon={<Mail className="h-3.5 w-3.5" />} label="Doctor Email" value={patient.doctorEmail} />
          <InfoField icon={<Phone className="h-3.5 w-3.5" />} label="Doctor NPI" value={patient.doctorNpi} />
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-xl bg-card border shadow-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Confirming & Chasing Clinicals Notes
        </p>
        <Textarea
          value={patient.confirmChaseNotes ?? ""}
          onChange={(e) => onUpdate({ confirmChaseNotes: e.target.value })}
          placeholder="Add notes about the request..."
          className="min-h-[100px] text-sm"
        />
      </div>
    </div>
  );
}
