import type { Patient } from "@/lib/workflow";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Mail, Phone } from "lucide-react";

interface Props {
  patient: Patient;
  onNotesChange: (notes: string) => void;
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

function statusColor(val?: string): string {
  if (!val) return "bg-muted text-muted-foreground";
  const v = val.toLowerCase();
  if (v === "generate") return "bg-blue-100 text-blue-800";
  if (v === "ready") return "bg-emerald-100 text-emerald-800";
  if (v === "not needed") return "bg-gray-100 text-gray-500";
  return "bg-muted text-muted-foreground";
}

export function SendRequestPanel({ patient, onNotesChange }: Props) {
  return (
    <div className="space-y-4">
      {/* Script Generation */}
      <div className="rounded-xl bg-card border shadow-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Script Generation
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50">
            <span className="text-sm text-muted-foreground">Generate CGM Script</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(patient.generateCgmScript)}`}>
              {patient.generateCgmScript || "—"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50">
            <span className="text-sm text-muted-foreground">Generate IP Script</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(patient.generateIpScript)}`}>
              {patient.generateIpScript || "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Doctor / Send Info */}
      <div className="rounded-xl bg-card border shadow-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Send To
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoField icon={<FileText className="h-3.5 w-3.5" />} label="Clinicals Method" value={patient.clinicalsMethod} />
          <InfoField icon={<Mail className="h-3.5 w-3.5" />} label="Doctor Fax" value={patient.doctorFax} />
          <InfoField icon={<Phone className="h-3.5 w-3.5" />} label="Doctor Email" value={patient.doctorEmail} />
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-xl bg-card border shadow-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Confirming & Chasing Clinicals Notes
        </p>
        <Textarea
          value={patient.confirmChaseNotes ?? ""}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Add notes about the request..."
          className="min-h-[100px] text-sm"
        />
      </div>
    </div>
  );
}
