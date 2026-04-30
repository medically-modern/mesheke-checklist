import type { Patient } from "@/lib/workflow";

interface Props {
  patient: Patient;
}

export function Tab2Panel({ patient }: Props) {
  return (
    <div className="rounded-xl bg-card border shadow-card p-5 space-y-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        Tab2Panel — Placeholder
      </p>
      <p className="text-sm text-muted-foreground">
        Build your UI for <strong>{patient.name}</strong> here.
        Add form fields, status selectors, date pickers, etc.
      </p>
    </div>
  );
}
