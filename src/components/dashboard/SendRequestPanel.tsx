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
  uploadFileToColumn,
  writeDateTime,
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
  ChevronDown,
  ChevronRight,
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

  // ---- Send (dispatch only — no stage advancement). Used by:
  //      • Fax / Email primary button
  //      • Parachute optional "also fax" button (rep wants belt-and-suspenders).
  const [sending, setSending] = useState(false);
  const handleSend = useCallback(async () => {
    if (!hasToken()) {
      toast.error("Monday token not configured");
      return;
    }
    const method = patient.clinicalsMethod ?? "Fax";
    setSending(true);
    try {
      let bytes: Uint8Array;
      try {
        bytes = await generateMnRequestPdf(patient);
      } catch (e) {
        throw new Error(`[1/4 generate PDF] ${e instanceof Error ? e.message : String(e)}`);
      }
      try {
        const safeName = patient.name.replace(/[^a-zA-Z0-9_-]/g, "_");
        await uploadFileToColumn(
          patient.id,
          COL.mnRequestLetter,
          bytes,
          `MN_Request_${safeName}.pdf`,
        );
      } catch (e) {
        throw new Error(`[2/4 upload PDF] ${e instanceof Error ? e.message : String(e)}`);
      }
      try {
        await writeStatusLabel(patient.id, COL.sendRequestTrigger, "Send");
      } catch (e) {
        throw new Error(`[3/4 trigger Send Request] ${e instanceof Error ? e.message : String(e)}`);
      }
      try {
        await writeDateTime(patient.id, COL.requestSentAt);
      } catch (e) {
        throw new Error(`[4/4 Request Sent At] ${e instanceof Error ? e.message : String(e)}`);
      }
      toast.success(
        method === "Email"
          ? "Request sent — email dispatched via Supermail"
          : "Request sent — fax dispatched via Supermail",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Send] failed", msg);
      toast.error("Send failed", { description: msg });
    } finally {
      setSending(false);
    }
  }, [patient]);

  // ---- Mark as Complete: advance stage. ----
  const [completing, setCompleting] = useState(false);
  const handleMarkComplete = useCallback(async () => {
    if (!hasToken()) {
      toast.error("Monday token not configured");
      return;
    }
    setCompleting(true);
    const isParachute = patient.clinicalsMethod === "Parachute";
    // Parachute skips Confirm Receipt (rep handles receipt-confirmation in the
    // Parachute portal directly), so we route straight to Chase Clinicals.
    const nextStage = isParachute ? "Chase Clinicals" : "Confirm Receipt";
    const tasks: { label: string; run: () => Promise<unknown> }[] = [
      {
        label: "Request Sent At",
        run: () => writeDateTime(patient.id, COL.requestSentAt),
      },
      {
        label: `Stage Advancer → ${nextStage}`,
        run: () => writeStatusLabel(patient.id, COL.subStage, nextStage),
      },
    ];
    const results = await Promise.allSettled(tasks.map((t) => t.run()));
    const failures: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        failures.push(
          `${tasks[i].label}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
        );
      }
    });
    setCompleting(false);
    if (failures.length === 0) {
      toast.success(`Marked complete — moved to ${nextStage}`);
    } else {
      toast.error(`${failures.length} write(s) failed`, {
        description: failures.slice(0, 3).join("\n"),
      });
    }
  }, [patient]);

  const cgmIsGenerating = cgmIsGeneratingLocal || mondayFiles.generateCgmStatus === "Generate";
  const ipIsGenerating = ipIsGeneratingLocal || mondayFiles.generateIpStatus === "Generate";

  const showCgmGenerate = patient.serving === "CGM" || patient.serving === "Insulin Pump + CGM" || patient.serving === "Supplies + CGM";
  const showIpGenerate = patient.serving !== "CGM";

  // Required fields before triggering DocExport.
  function missingForScript(kind: "cgm" | "ip"): string[] {
    const out: string[] = [];
    if (!patient.name) out.push("Name");
    if (!patient.dob) out.push("DOB");
    if (kind === "cgm" && !patient.cgmType) out.push("CGM Type");
    if (kind === "ip" && !patient.pumpType) out.push("Pump Type");
    if (!patient.doctorName) out.push("Doctor Name");
    if (!patient.doctorNpi) out.push("Doctor NPI");
    return out;
  }
  const cgmMissing = missingForScript("cgm");
  const ipMissing = missingForScript("ip");

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

      <ClinicalFilesCard
        files={mondayFiles.clinicalFiles}
        loading={mondayFiles.loading}
      />

      {/* Parachute: collapsed by default, chevron to expand.
         Fax / Email: always visible, no collapsible. */}
      {isParachute && (
        <CollapsibleHeader
          title="Generate Scripts & MN Request Letter"
          open={showAdvanced}
          onToggle={() => setShowAdvanced((o) => !o)}
          hint="Not needed for Parachute requests. Open to view if sending request by fax as well."
        />
      )}
      {(!isParachute || showAdvanced) && (
        <>
          <GenerateScriptsCard
            showCgm={showCgmGenerate}
            showIp={showIpGenerate}
            cgmIsGenerating={cgmIsGenerating}
            ipIsGenerating={ipIsGenerating}
            cgmFiles={mondayFiles.cgmTemplate}
            ipFiles={mondayFiles.ipTemplate}
            loading={mondayFiles.loading}
            cgmMissing={cgmMissing}
            ipMissing={ipMissing}
            onGenerateCgm={() => handleGenerateCgm("Generate")}
            onCancelCgm={() => handleGenerateCgm(undefined)}
            onGenerateIp={() => handleGenerateIp("Generate")}
            onCancelIp={() => handleGenerateIp(undefined)}
          />

          <RequestLetterCard patient={patient} />

          {isParachute && (
            <OptionalFaxCard sending={sending} onSend={handleSend} />
          )}
        </>
      )}

      <SendActionCard
        patient={patient}
        sending={sending}
        completing={completing}
        onSend={handleSend}
        onMarkComplete={handleMarkComplete}
      />
    </div>
  );
}

// =====================================================================
// Sub-cards
// =====================================================================

function MethodBanner({ patient }: { patient: Patient }) {
  const method = patient.clinicalsMethod ?? "—";
  let className = "bg-muted text-muted-foreground border-muted";
  let hint = "";
  if (method === "Fax") {
    className = "bg-sky-100 text-sky-900 border-sky-300";
    hint = patient.doctorFax ? `→ ${patient.doctorFax}` : "(no doctor fax on file)";
  } else if (method === "Parachute") {
    className = "bg-indigo-100 text-indigo-900 border-indigo-300";
  } else if (method === "Email") {
    className = "bg-teal-100 text-teal-900 border-teal-300";
    hint = patient.doctorEmail ? `→ ${patient.doctorEmail}` : "(no doctor email on file)";
  }

  return (
    <section
      className={`rounded-xl border-2 shadow-card px-5 py-4 flex items-center gap-3 flex-wrap ${className}`}
    >
      <Send className="h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider opacity-70">Clinicals Method</p>
        <p className="text-lg font-semibold leading-tight">{method}</p>
      </div>
      {hint && <span className="text-xs opacity-80 ml-auto truncate">{hint}</span>}
    </section>
  );
}

function ClinicalFilesCard({
  files,
  loading,
}: {
  files: MondayFileEntry[];
  loading: boolean;
}) {
  const downloadAll = () => {
    for (const f of files) {
      const url = f.public_url || f.url;
      if (url) window.open(url, "_blank");
    }
  };

  return (
    <section className="rounded-xl bg-card border shadow-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Clinical Files
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            Files attached on Monday — download to send alongside the request.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadAll}
          disabled={files.length === 0 || loading}
          className="h-8 px-2 text-xs gap-1"
          title={
            files.length === 0
              ? "No Monday files to download"
              : `Download all ${files.length} file(s) from Monday`
          }
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          Download all
          {files.length > 0 && ` (${files.length})`}
        </Button>
      </div>

      {files.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No clinical files attached on Monday.
        </p>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => (
            <li
              key={f.assetId}
              className="flex items-center gap-2 text-xs bg-emerald-50 border border-emerald-200 rounded px-2 py-1 text-emerald-900"
            >
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate font-medium">{f.name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OptionalFaxCard({
  sending,
  onSend,
}: {
  sending: boolean;
  onSend: () => void;
}) {
  return (
    <section className="rounded-xl border border-dashed bg-muted/20 p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Optional — Also send by Fax
        </p>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">
          Generates the MN Request PDF and dispatches via Supermail to the
          doctor&apos;s @rcfax address — in addition to Parachute.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onSend}
        disabled={sending}
        className="gap-2"
      >
        {sending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <Mail className="h-4 w-4" />
            Send via Fax
          </>
        )}
      </Button>
    </section>
  );
}

function CollapsibleHeader({
  title,
  open,
  onToggle,
  hint,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  hint?: string;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full rounded-xl bg-card border shadow-card px-5 py-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors text-left"
    >
      <span className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {title}
      </span>
      {hint && !open && (
        <span className="text-[11px] text-muted-foreground/70 normal-case truncate">
          {hint}
        </span>
      )}
    </button>
  );
}

function WhatsNeededCard({ patient }: { patient: Patient }) {
  const established = patient.medicalNecessity === "Established";
  const general = splitDropdownText(patient.generalMnInvalidReasons);
  const cgm = splitDropdownText(patient.cgmMnInvalidReasons);
  const ip = splitDropdownText(patient.ipMnInvalidReasons);
  const allClean = established && general.length === 0 && cgm.length === 0 && ip.length === 0;

  const serving = patient.serving;
  const showCgm = serving === "CGM" || serving === "Insulin Pump + CGM" || serving === "Supplies + CGM";
  const showIp = serving !== "CGM";

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
          {showCgm && <ReasonRow label="CGM" reasons={cgm} />}
          {showIp && <ReasonRow label="Insulin Pump" reasons={ip} />}
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
  const labelClass =
    "text-[11px] uppercase tracking-wider text-muted-foreground w-[110px] shrink-0 whitespace-nowrap";
  if (reasons.length === 0) {
    return (
      <div className="flex items-center gap-3 min-h-[24px]">
        <span className={labelClass}>{label}</span>
        <span className="text-[11px] text-muted-foreground/60 italic">none</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 flex-wrap min-h-[24px]">
      <span className={labelClass}>{label}</span>
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
  cgmMissing: string[];
  ipMissing: string[];
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
              missing={props.cgmMissing}
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
              missing={props.ipMissing}
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
  missing,
  onGenerate,
  onCancel,
}: {
  label: string;
  isGenerating: boolean;
  missing: string[];
  onGenerate: () => void;
  onCancel: () => void;
}) {
  const disabled = missing.length > 0;
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 px-2 rounded-md hover:bg-muted/50">
      <span className="text-sm text-muted-foreground whitespace-nowrap pt-1.5">
        {label}
      </span>
      {isGenerating ? (
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-md border border-amber-300 bg-amber-50 text-amber-900">
            <Loader2 className="h-3 w-3 animate-spin" />
            Generating…
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="h-8 px-2 text-xs"
            title="Cancel"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-end gap-1">
          <Button
            size="sm"
            onClick={onGenerate}
            disabled={disabled}
            className="h-8 px-3 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-muted disabled:text-muted-foreground"
          >
            <FileText className="h-3 w-3" />
            Generate
          </Button>
          {disabled && (
            <span className="inline-flex items-center gap-1 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 max-w-[260px] text-right">
              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
              Missing: {missing.join(", ")}
            </span>
          )}
        </div>
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            MN Request Letter
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            Generated from the data above — patient name, situation, and check marks
            are filled in automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
  // Monday's text for a date+time column comes back like "2026-05-01 14:30:00 UTC"
  // — strip a trailing " UTC" so Date can parse the ISO-ish string.
  const cleaned = iso.replace(/\s+UTC$/, "Z").replace(" ", "T");
  const d = new Date(cleaned);
  if (Number.isNaN(d.getTime())) return iso;
  // Always render in Eastern Time and tag the suffix so the rep sees the tz.
  const formatted = d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatted} ET`;
}

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

const PARACHUTE_URL = "https://dme.parachutehealth.com/u/r/BGP3-YIEG1-Z8-SL/dashboard";

function SendActionCard({
  patient,
  sending,
  completing,
  onSend,
  onMarkComplete,
}: {
  patient: Patient;
  sending: boolean;
  completing: boolean;
  onSend: () => void;
  onMarkComplete: () => void;
}) {
  const method = patient.clinicalsMethod ?? "Fax";
  const alreadySent = !!patient.requestSentAt;
  const sentDate = formatDate(patient.requestSentAt);
  const sentDays = daysSince(patient.requestSentAt);
  const isParachute = method === "Parachute";
  const isFaxOrEmail = method === "Fax" || method === "Email";

  const recipient =
    method === "Fax" && patient.doctorFax
      ? patient.doctorFax
      : method === "Email" && patient.doctorEmail
        ? patient.doctorEmail
        : null;

  return (
    <section className="rounded-xl bg-card border shadow-card overflow-hidden">
      {/* Header — title + sent status grouped together */}
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 py-4 border-b bg-muted/30">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Send Request</h3>
          {sentDate ? (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Last sent <span className="font-medium text-foreground">{sentDate}</span>
              {sentDays !== null && sentDays >= 0 && (
                <span className="text-muted-foreground/70">
                  {" · "}
                  {sentDays === 0 ? "today" : `${sentDays} day${sentDays === 1 ? "" : "s"} ago`}
                </span>
              )}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Two-step flow — send the request, then advance the stage.
            </p>
          )}
        </div>
        {alreadySent ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-full px-3 py-1 shrink-0">
            <Check className="h-3.5 w-3.5" />
            Request Sent
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-background border rounded-full px-3 py-1 shrink-0">
            Not sent yet
          </span>
        )}
      </div>

      {/* Two numbered step subsections — same visual pattern as the
         Insurance Panel Step 1/2/3 layout, so the eye reads top→bottom. */}
      <div className="p-5 space-y-3">
        <StepBlock
          number={1}
          title="Send the request"
          subtitle={
            isParachute
              ? "Open the Parachute portal in a new tab and submit the request there."
              : recipient
                ? `Dispatches the MN Request PDF to ${recipient} via Supermail.`
                : method === "Fax"
                  ? "(no doctor fax on file)"
                  : method === "Email"
                    ? "(no doctor email on file)"
                    : ""
          }
        >
          {isFaxOrEmail ? (
            <Button
              onClick={onSend}
              disabled={sending}
              className="gap-2 bg-slate-900 hover:bg-slate-800 text-white"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4" />
                  Send via {method}
                </>
              )}
            </Button>
          ) : isParachute ? (
            <a
              href={PARACHUTE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Open Parachute Portal
            </a>
          ) : null}
        </StepBlock>

        <StepBlock
          number={2}
          title="Advance the stage"
          subtitle="Click after the request has been sent — moves the patient to the next stage on Monday."
        >
          <Button
            size="lg"
            onClick={onMarkComplete}
            disabled={completing}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-elevate"
          >
            {completing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Marking…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Mark as Complete
              </>
            )}
          </Button>
        </StepBlock>
      </div>
    </section>
  );
}

function StepBlock({
  number,
  title,
  subtitle,
  children,
}: {
  number: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <div className="flex items-start gap-3">
        <div className="h-7 w-7 rounded-full border-2 border-border bg-background flex items-center justify-center text-xs font-bold shrink-0">
          {number}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
          )}
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
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

