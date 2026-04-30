import { useState } from "react";
import type { Patient } from "@/lib/workflow";
import {
  CalendarDays,
  IdCard,
  User,
  Stethoscope,
  ShieldCheck,
  UserRound,
  ChevronDown,
  ChevronRight,
  Phone,
  Mail,
  Hash,
  Building2,
  Send,
} from "lucide-react";
import { ClinicalsDownloadButton } from "./ClinicalsDownloadButton";

interface Props {
  patient: Patient;
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </p>
        <p className="text-sm font-medium truncate" title={value || "—"}>
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

export function PatientProfileCard({ patient }: Props) {
  const [doctorOpen, setDoctorOpen] = useState(false);

  return (
    <div className="rounded-xl bg-card border shadow-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Patient Profile</p>
        <ClinicalsDownloadButton itemId={patient.id} patientName={patient.name} />
      </div>

      {/* Row 1: identity + insurance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field icon={<User className="h-4 w-4" />} label="Name" value={patient.name} />
        <Field icon={<CalendarDays className="h-4 w-4" />} label="DOB" value={patient.dob} />
        <Field
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Primary Insurance"
          value={patient.primaryInsurance ?? ""}
        />
        <Field
          icon={<IdCard className="h-4 w-4" />}
          label="Member ID"
          value={patient.memberId1 ?? ""}
        />
      </div>

      <div className="h-px bg-border" />

      {/* Row 2: Workflow context */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field
          icon={<Stethoscope className="h-4 w-4" />}
          label="Referral Type"
          value={patient.referralType ?? ""}
        />
        <Field
          icon={<Send className="h-4 w-4" />}
          label="Request Type"
          value={patient.requestType ?? ""}
        />
        <Field
          icon={<Stethoscope className="h-4 w-4" />}
          label="Serving"
          value={patient.serving ?? ""}
        />
      </div>

      {/* Doctor info — collapsible */}
      <div className="border-t pt-3">
        <button
          onClick={() => setDoctorOpen((o) => !o)}
          className="w-full flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-2">
            {doctorOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Doctor Info
          </span>
          {!doctorOpen && (
            <span className="text-[11px] normal-case text-foreground/70">
              {patient.doctorName ?? "—"}
            </span>
          )}
        </button>

        {doctorOpen && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field
              icon={<UserRound className="h-4 w-4" />}
              label="Doctor Name"
              value={patient.doctorName ?? ""}
            />
            <Field
              icon={<Hash className="h-4 w-4" />}
              label="NPI"
              value={patient.doctorNpi ?? ""}
            />
            <Field
              icon={<Phone className="h-4 w-4" />}
              label="Phone"
              value={patient.doctorPhone ?? ""}
            />
            <Field
              icon={<Mail className="h-4 w-4" />}
              label="Fax"
              value={patient.doctorFax ?? ""}
            />
            <Field
              icon={<Mail className="h-4 w-4" />}
              label="Email"
              value={patient.doctorEmail ?? ""}
            />
            <Field
              icon={<Building2 className="h-4 w-4" />}
              label="Clinic"
              value={patient.clinicName ?? ""}
            />
            <Field
              icon={<Send className="h-4 w-4" />}
              label="Clinicals Method"
              value={patient.clinicalsMethod ?? ""}
            />
          </div>
        )}
      </div>
    </div>
  );
}
