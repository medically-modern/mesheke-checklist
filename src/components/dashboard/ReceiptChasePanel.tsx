import type { Patient } from "@/lib/workflow";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  patient: Patient;
  mode: "confirmReceipt" | "chase";
  onUpdate: (patch: Partial<Patient>) => void;
}

function statusColor(val?: string): string {
  if (!val) return "bg-muted text-muted-foreground";
  const v = val.toLowerCase();
  if (v.includes("attempt")) return "bg-blue-100 text-blue-800";
  if (v === "escalate") return "bg-red-100 text-red-800";
  return "bg-muted text-muted-foreground";
}

export function ReceiptChasePanel({ patient, mode, onUpdate }: Props) {
  const isChase = mode === "chase";
  const title = isChase ? "Chase Clinicals" : "Confirm Receipt";

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="rounded-xl bg-card border shadow-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{title}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50">
            <span className="text-sm text-muted-foreground">MRs / Clinicals</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              patient.mrsClinicals?.toLowerCase() === "mr received"
                ? "bg-emerald-100 text-emerald-800"
                : patient.mrsClinicals?.toLowerCase() === "collect"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-muted text-muted-foreground"
            }`}>
              {patient.mrsClinicals || "—"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50">
            <span className="text-sm text-muted-foreground">MN Attempts</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(patient.mnAttempts)}`}>
              {patient.mnAttempts || "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Form fields */}
      <div className="rounded-xl bg-card border shadow-card p-5 space-y-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Details</p>

        {!isChase && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Receipt Confirmed Date</Label>
                <Input
                  type="date"
                  value={patient.receiptConfirmedDate ?? ""}
                  onChange={(e) => onUpdate({ receiptConfirmedDate: e.target.value })}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Receipt Confirmed Name / Title</Label>
                <Input
                  value={patient.receiptConfirmedName ?? ""}
                  onChange={(e) => onUpdate({ receiptConfirmedName: e.target.value })}
                  placeholder="Name and title..."
                  className="text-sm"
                />
              </div>
            </div>
          </>
        )}

        {isChase && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Next Action Date</Label>
              <Input
                type="date"
                value={patient.nextActionDate ?? ""}
                onChange={(e) => onUpdate({ nextActionDate: e.target.value })}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Chase Recipient Name</Label>
              <Input
                value={patient.chaseRecipientName ?? ""}
                onChange={(e) => onUpdate({ chaseRecipientName: e.target.value })}
                placeholder="Recipient name..."
                className="text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="rounded-xl bg-card border shadow-card p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          {isChase ? "Chase Notes" : "Confirm / Chase Notes"}
        </p>
        <Textarea
          value={patient.confirmChaseNotes ?? ""}
          onChange={(e) => onUpdate({ confirmChaseNotes: e.target.value })}
          placeholder="Add notes..."
          className="min-h-[100px] text-sm"
        />
      </div>
    </div>
  );
}
