import type { Patient } from "@/lib/workflow";
import { CalendarDays, IdCard, User, Stethoscope, ShieldCheck, Clock, UserRound } from "lucide-react";

interface Props {
  patient: Patient;
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <p className="text-sm font-medium truncate" title={value || "—"}>{value || "—"}</p>
      </div>
    </div>
  );
}

export function PatientProfileCard({ patient }: Props) {
  return (
    <div className="rounded-xl bg-card border shadow-card p-4 space-y-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Patient Profile</p>

      {/* Row 1: Identity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field icon={<User className="h-4 w-4" />} label="Name" value={patient.name} />
        <Field icon={<CalendarDays className="h-4 w-4" />} label="DOB" value={patient.dob} />
        <Field icon={<ShieldCheck className="h-4 w-4" />} label="Primary Insurance" value={patient.primaryInsurance ?? ""} />
        <Field icon={<IdCard className="h-4 w-4" />} label="Member ID" value={patient.memberId1 ?? ""} />
      </div>

      <div className="h-px bg-border" />

      {/* Row 2: Referral + Serving */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field icon={<Stethoscope className="h-4 w-4" />} label="Serving" value={patient.serving ?? ""} />
        <Field icon={<Stethoscope className="h-4 w-4" />} label="Pump Type" value={patient.pumpType ?? ""} />
        <Field icon={<Stethoscope className="h-4 w-4" />} label="CGM Type" value={patient.cgmType ?? ""} />
        <Field icon={<UserRound className="h-4 w-4" />} label="Doctor" value={patient.doctorName ?? ""} />
      </div>

      <div className="h-px bg-border" />

      {/* Row 3: Coverage paths + pipeline */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field icon={<Stethoscope className="h-4 w-4" />} label="IP Coverage Path" value={patient.ipCoveragePath ?? ""} />
        <Field icon={<Stethoscope className="h-4 w-4" />} label="CGM Coverage Path" value={patient.cgmCoveragePath ?? ""} />
        <Field icon={<Clock className="h-4 w-4" />} label="Days in Pipeline" value={patient.daysSinceIntake ?? ""} />
        <Field icon={<Clock className="h-4 w-4" />} label="Days in Stage" value={patient.daysSinceStageStart ?? ""} />
      </div>
    </div>
  );
}
