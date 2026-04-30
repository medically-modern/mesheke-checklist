import { useEffect, useMemo, useState, useCallback, type DragEvent } from "react";
import type { Patient } from "@/lib/workflow";
import { StatusSelect } from "./StatusSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  VALID_INVALID_OPTS,
  YES_NO_OPTS,
  CGM_COVERAGE_OPTS,
  LMN_OPTS,
  IP_PATH_OPTS,
  DIAGNOSIS_LIST,
  GEN_SCRIPT_OPTS,
} from "@/lib/fieldOptions";
import {
  IP_PATH_FIELDS,
  shouldShowCgmBlock,
  shouldShowIpBlock,
  defaultIpPath,
  type IpPath,
} from "@/lib/ipPaths";
import {
  loadEvalState,
  saveEvalState,
  clearEvalState,
  isOowDateValid,
  getMrExpiry,
  deriveValidity,
  buildMondayPreview,
  type EvalState,
  type LocalFile,
  type CgmCoveragePath,
  type LmnStatus,
  type ValidInvalid,
  type YesNo,
} from "@/lib/evalState";
import {
  Check,
  X,
  CircleDashed,
  Upload,
  FileText,
  Trash2,
  RotateCcw,
  ChevronsUpDown,
  AlertTriangle,
} from "lucide-react";

interface Props {
  patient: Patient;
}

// Compute "today + N months" — used for MR Expiry Date
function plusMonths(iso: string, months: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function EvaluatePanel({ patient }: Props) {
  const [state, setState] = useState<EvalState>(() => loadEvalState(patient.id));

  // Reload state when patient changes
  useEffect(() => {
    setState(loadEvalState(patient.id));
  }, [patient.id]);

  // Persist on every change
  useEffect(() => {
    saveEvalState(patient.id, state);
  }, [patient.id, state]);

  const showCgm = shouldShowCgmBlock(patient.serving);
  const showIp = shouldShowIpBlock(patient.serving);

  // Pre-fill IP coverage path from Serving (Supplies Only locks it)
  useEffect(() => {
    const def = defaultIpPath(patient.serving);
    if (def && state.ipCoveragePath !== def) {
      setState((s) => ({ ...s, ipCoveragePath: def }));
    }
  }, [patient.serving, state.ipCoveragePath]);

  const update = useCallback(<K extends keyof EvalState>(key: K, value: EvalState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  const clearLocalState = () => {
    clearEvalState(patient.id);
    setState({});
  };

  const validity = useMemo(
    () => deriveValidity(state, patient, showCgm, showIp),
    [state, patient, showCgm, showIp],
  );

  const preview = useMemo(() => buildMondayPreview(state, validity), [state, validity]);

  return (
    <div className="space-y-4 pb-32">
      {/* Banner: Serving forces a path */}
      {!showCgm && !showIp && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Serving is set to <strong>{patient.serving ?? "—"}</strong>. Neither CGM nor IP applies — add a Diagnosis & MR below.
        </div>
      )}

      {/* Diagnosis & Clinicals — top section */}
      <SectionCard
        title="Diagnosis & Clinicals"
        status={validity.sections.diagnosis.valid && validity.sections.mr.valid}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          <DiagnosisField
            value={state.diagnosis}
            onChange={(v) => update("diagnosis", v)}
          />
          <StatusSelect
            label="MRs Received"
            value={state.mrReceived}
            options={YES_NO_OPTS}
            onChange={(v) => update("mrReceived", v as YesNo)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-4">
          <DateField
            label="Last Visit Date"
            value={state.lastVisitDate}
            onChange={(v) => update("lastVisitDate", v)}
          />
          <MrExpiryField lastVisit={state.lastVisitDate} />
        </div>
      </SectionCard>

      {/* CGM block */}
      {showCgm && (
        <SectionCard
          title="CGM"
          status={validity.sections.cgm.shown ? validity.sections.cgm.valid : null}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
            <StatusSelect
              label="Valid CGM Script"
              value={state.cgmScriptValid}
              options={VALID_INVALID_OPTS}
              onChange={(v) => update("cgmScriptValid", v as ValidInvalid)}
            />
            <StatusSelect
              label="Coverage Path"
              value={state.cgmCoveragePath}
              options={CGM_COVERAGE_OPTS}
              onChange={(v) => update("cgmCoveragePath", v as CgmCoveragePath)}
            />
            <StatusSelect
              label="Generate CGM Script"
              value={state.generateCgmScript}
              options={GEN_SCRIPT_OPTS}
              onChange={(v) => update("generateCgmScript", v)}
            />
          </div>
        </SectionCard>
      )}

      {/* IP block */}
      {showIp && (
        <SectionCard
          title="Insulin Pump"
          status={validity.sections.ip.shown ? validity.sections.ip.valid : null}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 mb-2">
            <StatusSelect
              label="IP Coverage Path"
              value={state.ipCoveragePath}
              options={IP_PATH_OPTS}
              onChange={(v) => update("ipCoveragePath", v as IpPath)}
            />
            <StatusSelect
              label="Valid IP Script"
              value={state.ipScriptValid}
              options={VALID_INVALID_OPTS}
              onChange={(v) => update("ipScriptValid", v as ValidInvalid)}
            />
            <StatusSelect
              label="Generate IP Script"
              value={state.generateIpScript}
              options={GEN_SCRIPT_OPTS}
              onChange={(v) => update("generateIpScript", v)}
            />
          </div>

          {state.ipCoveragePath && (
            <IpCriteria state={state} patient={patient} update={update} />
          )}
        </SectionCard>
      )}

      {/* Clinical files (uploads) */}
      <SectionCard title="Clinical Files">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FileUploadCard
            label="Clinical Files"
            files={state.clinicalFiles ?? []}
            onAdd={(files) => update("clinicalFiles", [...(state.clinicalFiles ?? []), ...files])}
            onRemove={(idx) => {
              const next = [...(state.clinicalFiles ?? [])];
              next.splice(idx, 1);
              update("clinicalFiles", next);
            }}
          />
          <FileUploadCard
            label="Final Clinical Files"
            files={state.finalClinicalFiles ?? []}
            onAdd={(files) =>
              update("finalClinicalFiles", [...(state.finalClinicalFiles ?? []), ...files])
            }
            onRemove={(idx) => {
              const next = [...(state.finalClinicalFiles ?? [])];
              next.splice(idx, 1);
              update("finalClinicalFiles", next);
            }}
          />
        </div>
      </SectionCard>

      {/* Notes */}
      <SectionCard title="MN Evaluation Notes">
        <Textarea
          value={state.notes ?? ""}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Add evaluator notes..."
          className="min-h-[100px] text-sm"
        />
      </SectionCard>

      {/* Sticky validity / preview footer */}
      <ValiditySummary
        validity={validity}
        preview={preview}
        onClearLocal={clearLocalState}
      />
    </div>
  );
}

// =====================================================================
// Sub-components
// =====================================================================

interface SectionCardProps {
  title: string;
  status?: boolean | null; // true=valid, false=invalid, null=N/A, undefined=no badge
  children: React.ReactNode;
}

function SectionCard({ title, status, children }: SectionCardProps) {
  return (
    <div className="rounded-xl bg-card border shadow-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{title}</p>
        {status === true && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            <Check className="h-3 w-3" /> Complete
          </span>
        )}
        {status === false && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
            <X className="h-3 w-3" /> Incomplete
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

interface IpCriteriaProps {
  state: EvalState;
  patient: Patient;
  update: <K extends keyof EvalState>(key: K, value: EvalState[K]) => void;
}

function IpCriteria({ state, patient, update }: IpCriteriaProps) {
  if (!state.ipCoveragePath) return null;
  const cfg = IP_PATH_FIELDS[state.ipCoveragePath];

  // Nothing else to show for Supplies Only
  const anyFieldShown =
    cfg.showEducation ||
    cfg.show3Injections ||
    cfg.showCgmUse ||
    cfg.showBsIssues ||
    cfg.showLmn ||
    cfg.showOow ||
    cfg.showMalfunction;

  if (!anyFieldShown) return null;

  const oowCheck = isOowDateValid(state.oowDate, patient.primaryInsurance);
  const isMedicareAB = patient.primaryInsurance === "Medicare A&B";
  const oowYears = isMedicareAB ? 5 : 4;

  return (
    <div className="mt-3 pt-3 border-t border-dashed">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        Criteria for {state.ipCoveragePath}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        {cfg.showEducation && (
          <StatusSelect
            label="Diabetes Education"
            value={state.diabetesEducation}
            options={YES_NO_OPTS}
            onChange={(v) => update("diabetesEducation", v as YesNo)}
          />
        )}
        {cfg.show3Injections && (
          <StatusSelect
            label="3+ Injections / day"
            value={state.threeInjections}
            options={YES_NO_OPTS}
            onChange={(v) => update("threeInjections", v as YesNo)}
          />
        )}
        {cfg.showCgmUse && (
          <StatusSelect
            label="CGM Use"
            value={state.cgmUse}
            options={YES_NO_OPTS}
            onChange={(v) => update("cgmUse", v as YesNo)}
          />
        )}
        {cfg.showBsIssues && (
          <StatusSelect
            label="Blood Sugar Issues"
            value={state.bloodSugarIssues}
            options={YES_NO_OPTS}
            onChange={(v) => update("bloodSugarIssues", v as YesNo)}
          />
        )}
        {cfg.showLmn && (
          <StatusSelect
            label="Letter of MN on file"
            value={state.lmn}
            options={LMN_OPTS}
            onChange={(v) => update("lmn", v as LmnStatus)}
          />
        )}
        {cfg.showMalfunction && (
          <StatusSelect
            label="Malfunction"
            value={state.malfunction}
            options={YES_NO_OPTS}
            onChange={(v) => update("malfunction", v as YesNo)}
          />
        )}
      </div>

      {cfg.showOow && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 items-end">
          <div className="space-y-1.5 px-2">
            <Label className="text-xs text-muted-foreground">OOW Date</Label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={state.oowDate ?? ""}
                onChange={(e) => update("oowDate", e.target.value)}
                className="text-sm h-9"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => update("oowDate", undefined)}
                disabled={!state.oowDate}
                className="h-9 px-2 text-xs gap-1"
                title="Mark as not provided"
              >
                <X className="h-3 w-3" /> Clear
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 pb-1">
            {oowCheck === null ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                <X className="h-3 w-3" />
                Not provided — invalid
              </span>
            ) : oowCheck.valid ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <Check className="h-3 w-3" />
                {(oowCheck.ageDays / 365.25).toFixed(1)} yrs OOW — valid
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                <X className="h-3 w-3" />
                {(oowCheck.ageDays / 365.25).toFixed(1)} yrs — needs {oowYears}+ years
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">
              ({oowYears}+ yrs required{isMedicareAB && " · Medicare A&B"})
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface DateFieldProps {
  label: string;
  value?: string;
  onChange: (v: string) => void;
}

function DateField({ label, value, onChange }: DateFieldProps) {
  return (
    <div className="space-y-1.5 px-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm h-9"
      />
    </div>
  );
}

function MrExpiryField({ lastVisit }: { lastVisit?: string }) {
  const { expiry, expired } = getMrExpiry(lastVisit);
  return (
    <div className="space-y-1.5 px-2">
      <Label className="text-xs text-muted-foreground">MR Expiry Date</Label>
      <div
        className={cn(
          "text-sm h-9 flex items-center justify-between px-3 rounded-md border",
          !expiry && "bg-muted/30 text-muted-foreground",
          expiry && !expired && "bg-emerald-50 border-emerald-200 text-emerald-900",
          expired && "bg-red-50 border-red-200 text-red-900",
        )}
      >
        <span>{expiry ? formatDate(expiry.toISOString().slice(0, 10)) : "—"}</span>
        {expiry && expired && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
            <AlertTriangle className="h-3 w-3" /> Expired
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {lastVisit
          ? expired
            ? "Re-collect MR — last visit was over 6 months ago"
            : "auto: Last Visit + 6 months"
          : "set Last Visit first"}
      </p>
    </div>
  );
}

interface DiagnosisFieldProps {
  value?: string;
  onChange: (v: string) => void;
}

function DiagnosisField({ value, onChange }: DiagnosisFieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-md hover:bg-muted/50">
      <span className="text-sm text-muted-foreground whitespace-nowrap">Diagnosis</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-[160px] h-8 px-3 text-xs font-medium justify-between",
              value
                ? "border-violet-200 bg-violet-50 hover:bg-violet-50/80"
                : "border-muted",
            )}
          >
            {value || "—"}
            <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="end">
          <Command>
            <CommandInput placeholder="Search ICD-10..." className="h-9" />
            <CommandList>
              <CommandEmpty>No code found.</CommandEmpty>
              <CommandGroup>
                {DIAGNOSIS_LIST.map((code) => (
                  <CommandItem
                    key={code}
                    value={code}
                    onSelect={() => {
                      onChange(code === value ? "" : code);
                      setOpen(false);
                    }}
                    className="text-xs cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3 w-3",
                        value === code ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {code}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface FileUploadCardProps {
  label: string;
  files: LocalFile[];
  onAdd: (files: LocalFile[]) => void;
  onRemove: (idx: number) => void;
}

function FileUploadCard({ label, files, onAdd, onRemove }: FileUploadCardProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const next: LocalFile[] = Array.from(fileList).map((f) => ({
      name: f.name,
      size: f.size,
      addedAt: new Date().toISOString(),
    }));
    onAdd(next);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed py-6 cursor-pointer transition-colors ${
          isDragOver ? "border-emerald-400 bg-emerald-50" : "border-muted bg-background hover:bg-muted/30"
        }`}
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Drop files here or <span className="underline">browse</span>
        </p>
        <p className="text-[10px] text-muted-foreground">(local preview only — not synced)</p>
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between gap-2 text-xs bg-background border rounded px-2 py-1"
            >
              <span className="flex items-center gap-2 truncate">
                <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate">{f.name}</span>
                <span className="text-muted-foreground shrink-0">
                  {(f.size / 1024).toFixed(1)} KB
                </span>
              </span>
              <button
                onClick={() => onRemove(i)}
                className="text-muted-foreground hover:text-red-600"
                aria-label="Remove file"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ValiditySummaryProps {
  validity: ReturnType<typeof deriveValidity>;
  preview: ReturnType<typeof buildMondayPreview>;
  onClearLocal: () => void;
}

function ValiditySummary({ validity, preview, onClearLocal }: ValiditySummaryProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="fixed bottom-0 left-0 right-0 sm:left-[var(--sidebar-width,16rem)] z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="max-w-5xl mx-auto px-6 py-3 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <SectionPill label="CGM" status={validity.sections.cgm} />
            <SectionPill label="IP" status={validity.sections.ip} />
            <SectionPill
              label="Diagnosis"
              status={{ shown: true, valid: validity.sections.diagnosis.valid }}
            />
            <SectionPill
              label="MR"
              status={{ shown: true, valid: validity.sections.mr.valid }}
            />
            <span className="text-sm">
              →{" "}
              {validity.established ? (
                <strong className="text-emerald-700">Medical Necessity: Established</strong>
              ) : (
                <strong className="text-red-700">Not Established</strong>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClearLocal}
              className="gap-1 text-xs"
            >
              <RotateCcw className="h-3 w-3" /> Clear local
            </Button>
            <Button
              size="sm"
              onClick={() => setShowPreview((s) => !s)}
              className="gap-1 text-xs"
              variant={showPreview ? "secondary" : "default"}
            >
              {showPreview ? "Hide preview" : "Preview Monday payload"}
            </Button>
          </div>
        </div>

        {!validity.established && validity.reasons.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Reasons:</span>{" "}
            {validity.reasons.join(" · ")}
          </div>
        )}

        {showPreview && (
          <pre className="mt-1 p-3 rounded-md border bg-muted/30 text-[11px] leading-relaxed overflow-auto max-h-[40vh]">
            {JSON.stringify(preview, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function SectionPill({
  label,
  status,
}: {
  label: string;
  status: { shown: boolean; valid: boolean };
}) {
  if (!status.shown) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/40 border rounded-full px-2 py-0.5">
        <CircleDashed className="h-3 w-3" /> {label} N/A
      </span>
    );
  }
  return status.valid ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
      <Check className="h-3 w-3" /> {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
      <X className="h-3 w-3" /> {label}
    </span>
  );
}
