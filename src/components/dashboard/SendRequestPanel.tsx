import {
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import type { Patient } from "@/lib/workflow";
import { Button } from "@/components/ui/button";
import { useMondayFiles } from "@/hooks/useMondayFiles";
import {
  COL,
  clearStatusColumn,
  hasToken,
  writeDate,
  writeStatusIndex,
  writeStatusLabel,
  type MondayFileEntry,
} from "@/lib/mondayApi";
import { GEN_SCRIPT_STATUS } from "@/lib/mondayMapping";
import {
  loadEvalState,
  saveEvalState,
  type EvalState,
} from "@/lib/evalState";
import {
  generateMnRequestPdf,
  downloadMnRequestPdf,
  previewMnRequestPdf,
} from "@/lib/mnRequestPdf";
import { toast } from "sonner";
import {
  Check,
  X,
  Loader2,
  FileText,
  ExternalLink,
  Download,
  Send,
  Mail,
  AlertTriangle,
} from "lucide-react";

interface Props {
  patient: Patient;
  /** Bumped by parent on Reset — forces local state reload. */
  resetVersion?: number;
}

// =====================================================================
// Main panel
// =====================================================================

export function SendRequestPanel({ patient, resetVersion = 0 }: Props) {
  const [state, setState] = useState<EvalState>(() => loadEvalState(patient.id));

  useEffect(() => {
    setState(loadEvalState(patient.id));
  }, [patient.id, resetVersion]);

  useEffect(() => {
    saveEvalState(patient.id, state);
  }, [patient.id, state]);

  const update = useCallback(<K extends keyof EvalState>(key: K, value: EvalState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  const cgmIsGeneratingLocal = state.generateCgmScript === "Generate";
  const ipIsGeneratingLocal = state.generateIpScript === "Generate";

  const mondayFiles = useMondayFiles(patient.id, {
    pollingIntervalMs: cgmIsGeneratingLocal || ipIsGeneratingLocal ? 2000 : 0,
  });

  // ---- Generate triggers (write to Monday's Generate column) ----
  const triggerGenerate = useCallback(
    async (
      stateKey: "generateCgmScript" | "generateIpScript",
      columnId: string,
      v: string | undefined,
    ) => {
      update(stateKey, v);
      if (!hasToken()) return;
      try {
        if (v === "Generate") {
          await clearStatusColumn(patient.id, columnId);
          await new Promise((r) => setTimeout(r, 250));
          await writeStatusIndex(patient.id, columnId, GEN_SCRIPT_STATUS.generate);
        } else {
          await clearStatusColumn(patient.id, columnId);
        }
      } catch (e) {
        toast.error("Generate request failed", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [patient.id, update],
  );

  const handleGenerateCgm = useCallback(
    (v: string | undefined) => triggerGenerate("generateCgmScript", COL.generateCgmScript, v),
    [triggerGenerate],
  );
  const handleGenerateIp = useCallback(
    (v: string | undefined) => triggerGenerate("generateIpScript", COL.generateIpScript, v),
    [triggerGenerate],
  );

  // ---- Auto-clear local Generate state when Monday flips column away from Generate ----
  const prevCgmStatusRef = useRef<string | undefined>(undefined);
  const prevIpStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevCgmStatusRef.current;
    const curr = mondayFiles.generateCgmStatus;
    if (prev === "Generate" && curr && curr !== "Generate") {
      update("generateCgmScript", undefined);
    }
    prevCgmStatusRef.current = curr;
  }, [mondayFiles.generateCgmStatus, update]);
  useEffect(() => {
    const prev = prevIpStatusRef.current;
    const curr = mondayFiles.generateIpStatus;
    if (prev === "Generate" && curr && curr !== "Generate") {
      update("generateIpScript", undefined);
    }
    prevIpStatusRef.current = curr;
  }, [mondayFiles.generateIpStatus, update]);

  // ---- Mark Request Sent ----
  const [sending, setSending] = useState(false);
  const handleMarkSent = useCallback(async () => {
    if (!hasToken()) {
      toast.error("Monday token not configured");
      return;
    }
    setSending(true);
    const today = new Date().toISOString().slice(0, 10);
    const tasks: { label: string; run: () => Promise<unknown> }[] = [
      {
        label: "Request Sent At",
        run: () => writeDate(patient.id, COL.requestSentAt, today),
      },
      {
        label: "Advancer 2B",
        run: () => writeStatusLabel(patient.id, COL.advancer2b, "Complete"),
      },
    ];
    const results = await Promise.allSettled(tasks.map((t) => t.run()));
    const failures: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        failures.push(`${tasks[i].label}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      }
    });
    setSending(false);
    if (failures.length === 0) {
      toast.success("Request marked as sent — Monday will route to next stage");
    } else {
      toast.error(`${failures.length} write(s) failed`, {
        description: failures.slice(0, 3).join("\n"),
      });
    }
  }, [patient.id]);

  const cgmIsGenerating = cgmIsGeneratingLocal || mondayFiles.generateCgmStatus === "Generate";
  const ipIsGenerating = ipIsGeneratingLocal || mondayFiles.generateIpStatus === "Generate";

  const showCgmGenerate = patient.serving === "CGM" || patient.serving === "Insulin Pump + CGM" || patient.serving === "Supplies + CGM";
  const showIpGenerate = patient.serving !== "CGM";

  const isParachute = patient.clinicalsMethod === "Parachute";
  const [showAdvanced, setShowAdvanced] = useState(!isParachute);

  // Reset reveal state when method changes
  useEffect(() => {
    setShowAdvanced(!isParachute);
  }, [isParachute]);

  return (
    <div className="space-y-4">
      <MethodBanner patient={patient} />

      <WhatsNeededCard patient={patient} />

      {isParachute && !showAdvanced ? (
        <ParachuteCollapsedNotice onShow={() => setShowAdvanced(true)} />
      ) : (
        <>
          <GenerateScriptsCard
            showCgm={showCgmGenerate}
            showIp={showIpGenerate}
            cgmIsGenerating={cgmIsGenerating}
            ipIsGenerating={ipIsGenerating}
            cgmFiles={mondayFiles.cgmTemplate}
            ipFiles={mondayFiles.ipTemplate}
            loading={mondayFiles.loading}
            onGenerateCgm={() => handleGenerateCgm("Generate")}
            onCancelCgm={() => handleGenerateCgm(undefined)}
            onGenerateIp={() => handleGenerateIp("Generate")}
            onCancelIp={() => handleGenerateIp(undefined)}
          />

          <RequestLetterCard patient={patient} />

          {isParachute && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced(false)}
                className="text-xs text-muted-foreground"
              >
                Hide for Parachute
              </Button>
            </div>
          )}
        </>
      )}

      <SendActionCard
        patient={patient}
        sending={sending}
        onMarkSent={handleMarkSent}
      />
    </div>
  );
}

// =====================================================================
// Sub-cards
// =====================================================================

function MethodBanner({ patient }: { patient: Patient }) {
  const method = patient.clinicalsMethod ?? "—";
  const config: Record<string, { className: string; hint: string }> = {
    Fax: {
      className: "bg-sky-100 text-sky-900 border-sky-300",
      hint: patient.doctorFax ? `→ ${patient.doctorFax}` : "(no doctor fax on file)",
    },
    Parachute: {
      className: "bg-indigo-100 text-indigo-900 border-indigo-300",
      hint: "→ submit via Parachute portal — scripts and request letter handled there",
    },
    Email: {
      className: "bg-teal-100 text-teal-900 border-teal-300",
      hint: patient.doctorEmail ? `→ ${patient.doctorEmail}` : "(no doctor email on file)",
    },
  };
  const c = config[method] ?? { className: "bg-muted text-muted-foreground border-muted", hint: "" };

  return (
    <section
      className={`rounded-xl border-2 shadow-card px-5 py-4 flex items-center gap-3 flex-wrap ${c.className}`}
    >
      <Send className="h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider opacity-70">Clinicals Method</p>
        <p className="text-lg font-semibold leading-tight">{method}</p>
      </div>
      <span className="text-xs opacity-80 ml-auto truncate">{c.hint}</span>
    </section>
  );
}

function ParachuteCollapsedNotice({ onShow }: { onShow: () => void }) {
  return (
    <section className="rounded-xl bg-card border shadow-card p-5 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Generate Scripts &amp; MN Request Letter
        </p>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">
          Hidden — this patient&apos;s clinicals method is Parachute, so scripts and
          the request letter are handled inside the Parachute portal.
        </p>
      </div>
      <div>
        <Button variant="outline" size="sm" onClick={onShow} className="text-xs gap-1">
          <ExternalLink className="h-3 w-3" />
          Show anyway (for fax/email submission)
        </Button>
      </div>
    </section>
  );
}

function WhatsNeededCard({ patient }: { patient: Patient }) {
  const established = patient.medicalNecessity === "Established";
  const general = splitDropdownText(patient.generalMnInvalidReasons);
  const cgm = splitDropdownText(patient.cgmMnInvalidReasons);
  const ip = splitDropdownText(patient.ipMnInvalidReasons);
  const allClean = established && general.length === 0 && cgm.length === 0 && ip.length === 0;

  return (
    <section className="rounded-xl bg-card border shadow-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            What&apos;s Still Needed
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            Read from Monday — set on the Evaluate tab.
          </p>
        </div>
        {established ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-full px-3 py-1">
            <Check className="h-3.5 w-3.5" />
            Medical Necessity: Established
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-300 rounded-full px-3 py-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Medical Necessity: Not Established
          </span>
        )}
      </div>

      {allClean ? (
        <p className="text-xs text-muted-foreground italic">
          No outstanding reasons — patient is ready.
        </p>
      ) : (
        <div className="space-y-2">
          <ReasonRow label="General" reasons={general} />
          <ReasonRow label="CGM" reasons={cgm} />
          <ReasonRow label="Insulin Pump" reasons={ip} />
        </div>
      )}

      {patient.mnEvalNotes && (
        <div className="border-t pt-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            MN Evaluation Notes
          </p>
          <p className="text-xs text-foreground whitespace-pre-wrap">{patient.mnEvalNotes}</p>
        </div>
      )}
    </section>
  );
}

function ReasonRow({ label, reasons }: { label: string; reasons: string[] }) {
  if (reasons.length === 0) {
    return (
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground w-[80px]">
          {label}
        </span>
        <span className="text-[11px] text-muted-foreground/60 italic">none</span>
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-3 flex-wrap">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground w-[80px]">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {reasons.map((r) => (
          <span
            key={r}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5"
          >
            <X className="h-3 w-3" /> {r}
          </span>
        ))}
      </div>
    </div>
  );
}

interface GenerateScriptsCardProps {
  showCgm: boolean;
  showIp: boolean;
  cgmIsGenerating: boolean;
  ipIsGenerating: boolean;
  cgmFiles: MondayFileEntry[];
  ipFiles: MondayFileEntry[];
  loading: boolean;
  onGenerateCgm: () => void;
  onCancelCgm: () => void;
  onGenerateIp: () => void;
  onCancelIp: () => void;
}

function GenerateScriptsCard(props: GenerateScriptsCardProps) {
  if (!props.showCgm && !props.showIp) return null;
  return (
    <section className="rounded-xl bg-card border shadow-card p-5 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Generate Scripts
        </p>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">
          Trigger Monday&apos;s DocExport to produce a prescription script the doctor can sign.
        </p>
      </div>
      <div className="space-y-2">
        {props.showCgm && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 items-center">
            <ToggleRow
              label="Generate CGM Script"
              isGenerating={props.cgmIsGenerating}
              onGenerate={props.onGenerateCgm}
              onCancel={props.onCancelCgm}
            />
            <ScriptViewer label="CGM script template" files={props.cgmFiles} loading={props.loading} />
          </div>
        )}
        {props.showIp && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 items-center">
            <ToggleRow
              label="Generate Insulin Pump Script"
              isGenerating={props.ipIsGenerating}
              onGenerate={props.onGenerateIp}
              onCancel={props.onCancelIp}
            />
            <ScriptViewer label="Insulin Pump script template" files={props.ipFiles} loading={props.loading} />
          </div>
        )}
      </div>
    </section>
  );
}

function ToggleRow({
  label,
  isGenerating,
  onGenerate,
  onCancel,
}: {
  label: string;
  isGenerating: boolean;
  onGenerate: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-md hover:bg-muted/50">
      <span className="text-sm text-muted-foreground whitespace-nowrap">{label}</span>
      {isGenerating ? (
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-md border border-amber-300 bg-amber-50 text-amber-900">
            <Loader2 className="h-3 w-3 animate-spin" />
            Generating…
          </span>
          <Button variant="outline" size="sm" onClick={onCancel} className="h-8 px-2 text-xs" title="Cancel">
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          onClick={onGenerate}
          className="h-8 px-3 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <FileText className="h-3 w-3" />
          Generate
        </Button>
      )}
    </div>
  );
}

function ScriptViewer({
  label,
  files,
  loading,
}: {
  label: string;
  files: MondayFileEntry[];
  loading: boolean;
}) {
  if (loading && files.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 h-9 rounded-md border border-dashed bg-muted/20 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </span>
      </div>
    );
  }
  if (files.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 h-9 rounded-md border border-dashed bg-muted/20 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <FileText className="h-3 w-3" />
          No {label} found
        </span>
        <Button variant="ghost" size="sm" disabled className="h-7 px-2 text-[11px]">
          View
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {files.map((f) => (
        <div
          key={f.assetId}
          className="flex items-center justify-between gap-2 px-3 h-9 rounded-md border bg-emerald-50 border-emerald-200"
        >
          <span className="flex items-center gap-2 truncate text-xs text-emerald-900">
            <FileText className="h-3 w-3 shrink-0" />
            <span className="truncate font-medium">{f.name}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!f.public_url && !f.url}
            onClick={() => {
              const u = f.public_url || f.url;
              if (u) window.open(u, "_blank");
            }}
            className="h-7 px-2 text-[11px] gap-1"
          >
            <ExternalLink className="h-3 w-3" /> View
          </Button>
        </div>
      ))}
    </div>
  );
}

function RequestLetterCard({ patient }: { patient: Patient }) {
  const [busy, setBusy] = useState<"preview" | "download" | null>(null);

  const established = patient.medicalNecessity === "Established";

  // List the blocks that will appear in the generated PDF based on coverage
  // paths and outstanding reasons.
  const willInclude: string[] = [];
  if (patient.cgmCoveragePath === "Insulin") willInclude.push("CGM — Insulin");
  else if (patient.cgmCoveragePath === "Hypo") willInclude.push("CGM — Hypoglycemia");
  if (patient.ipCoveragePath === "1st Pump >6M Diagnosed") willInclude.push("First Time Pump (>6 mo)");
  else if (patient.ipCoveragePath === "1st Pump <6M Diagnosed") willInclude.push("First Time Pump (<6 mo) + LMN");
  else if (patient.ipCoveragePath === "OOW Pump") willInclude.push("OOW Pump replacement");
  else if (patient.ipCoveragePath === "Omnipod Switch") willInclude.push("Omnipod Switch");
  else if (patient.ipCoveragePath === "IW New Insurance") willInclude.push("Continuation on new insurance");
  if (willInclude.length === 0 && !established) {
    willInclude.push("Outstanding items (from MN Invalid Reasons)");
  }

  const generateAnd = async (mode: "preview" | "download") => {
    setBusy(mode);
    try {
      const bytes = await generateMnRequestPdf(patient);
      if (mode === "preview") previewMnRequestPdf(bytes);
      else downloadMnRequestPdf(patient, bytes);
    } catch (e) {
      toast.error("PDF generation failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl bg-card border shadow-card p-5 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          MN Request Letter
        </p>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">
          Generated dynamically — patient name, situation, and ✓ / ✗ marks are
          filled in from the current coverage paths and Monday MN Invalid
          Reasons.
        </p>
      </div>

      {established && willInclude.length === 0 ? (
        <div className="rounded-md border border-dashed bg-emerald-50 border-emerald-200 p-4 text-xs text-emerald-900">
          Medical Necessity is Established — no request letter needed. (You can still generate one if you want a paper trail.)
        </div>
      ) : null}

      <div className="rounded-md border bg-muted/20 px-3 py-3 space-y-2">
        <div className="text-xs">
          <p className="font-medium">Will include:</p>
          <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-0.5">
            {willInclude.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-2 justify-end pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateAnd("preview")}
            disabled={busy !== null}
            className="h-8 gap-1 text-xs"
          >
            {busy === "preview" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ExternalLink className="h-3 w-3" />
            )}
            Preview
          </Button>
          <Button
            size="sm"
            onClick={() => generateAnd("download")}
            disabled={busy !== null}
            className="h-8 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {busy === "download" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            Generate &amp; Download
          </Button>
        </div>
      </div>
    </section>
  );
}


function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function SendActionCard({
  patient,
  sending,
  onMarkSent,
}: {
  patient: Patient;
  sending: boolean;
  onMarkSent: () => void;
}) {
  const method = patient.clinicalsMethod ?? "Fax";
  const advancer = patient.advancer2b;
  const alreadySent = advancer === "Complete";
  const sentDate = formatDate(patient.requestSentAt);
  const sentDays = daysSince(patient.requestSentAt);

  return (
    <section className="rounded-xl bg-card border shadow-card p-5 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Send Request
        </p>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">
          Once you&apos;ve faxed / submitted the request, click below to advance the stage.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border bg-muted/30">
            {method === "Fax" ? (
              <Mail className="h-4 w-4" />
            ) : method === "Parachute" ? (
              <Send className="h-4 w-4" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Send via {method}
          </span>
          <span className="text-xs text-muted-foreground">
            {method === "Fax" && (patient.doctorFax ? `→ ${patient.doctorFax}` : "(no doctor fax on file)")}
            {method === "Parachute" && "→ Parachute portal"}
            {method === "Email" && (patient.doctorEmail ? `→ ${patient.doctorEmail}` : "(no doctor email on file)")}
          </span>
        </div>

        {alreadySent && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-full px-3 py-1">
            <Check className="h-3.5 w-3.5" />
            Advancer: Complete
          </span>
        )}
      </div>

      {sentDate && (
        <div className="text-xs text-muted-foreground">
          Last sent: <span className="font-medium text-foreground">{sentDate}</span>
          {sentDays !== null && sentDays >= 0 && (
            <span> · {sentDays === 0 ? "today" : `${sentDays} day${sentDays === 1 ? "" : "s"} ago`}</span>
          )}
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button
          size="lg"
          onClick={onMarkSent}
          disabled={sending}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-elevate"
        >
          {sending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Marking Sent…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Mark Request Sent
            </>
          )}
        </Button>
      </div>
    </section>
  );
}

// =====================================================================
// Helpers
// =====================================================================

function splitDropdownText(text?: string): string[] {
  if (!text) return [];
  return text
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

