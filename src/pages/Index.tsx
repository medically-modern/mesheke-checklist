import { useEffect, useMemo, useState } from "react";
import { useMondayPatients, type TabKey } from "@/hooks/useMondayPatients";
import type { Patient } from "@/lib/workflow";
import { EvaluatePanel } from "@/components/dashboard/EvaluatePanel";
import { SendRequestPanel } from "@/components/dashboard/SendRequestPanel";
import { ReceiptChasePanel } from "@/components/dashboard/ReceiptChasePanel";
import { PatientsSidebar } from "@/components/dashboard/PatientsSidebar";
import { PatientProfileCard } from "@/components/dashboard/PatientProfileCard";
import { SendToMondayButton } from "@/components/dashboard/SendToMondayButton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { RotateCcw, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { sendPatientToMonday } from "@/lib/mondayWrite";

const TAB_LABELS: Record<TabKey, string> = {
  evaluate: "Evaluate",
  sendRequest: "Send Request",
  confirmReceipt: "Confirm Receipt",
  chase: "Chase",
};

const Index = () => {
  const [mainTab, setMainTab] = useState<TabKey>("evaluate");
  const { patients, loading, error, refetch, update, clearOverlay } = useMondayPatients(mainTab);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleMainTabChange = (tab: string) => {
    setMainTab(tab as TabKey);
    setSelectedId(null);
  };

  useEffect(() => {
    if (!selectedId && patients.length > 0) setSelectedId(patients[0].id);
  }, [patients, selectedId]);

  const selected: Patient | undefined = useMemo(
    () => patients.find((p) => p.id === selectedId),
    [patients, selectedId],
  );

  const resetForNewPatient = () => {
    if (!selected) return;
    clearOverlay(selected.id);
    toast.success("Cleared local edits — refetching from Monday");
    refetch();
  };

  const handleSend = async () => {
    if (!selected) return;
    try {
      await sendPatientToMonday(selected, mainTab);
      toast.success("Sent to Monday");
      // Refetch after send since the patient will move to next sub-stage
      setTimeout(refetch, 1000);
    } catch (e) {
      toast.error("Send to Monday failed", { description: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-subtle">
        <PatientsSidebar
          patients={patients}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={loading}
          error={error}
          onRefresh={refetch}
          activeTab={mainTab}
        />

        <Tabs value={mainTab} onValueChange={handleMainTabChange} className="flex-1 flex flex-col min-w-0">
          <header className="bg-gradient-navy text-navy-foreground border-b border-sidebar-border">
            <div className="px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="text-navy-foreground hover:bg-white/10" />
                <div className="h-10 w-10 rounded-lg bg-gradient-primary flex items-center justify-center shadow-elevate">
                  <Stethoscope className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">Medically Modern · Medical Necessity</p>
                  <h1 className="text-xl font-semibold">
                    {selected ? `${selected.name} · Medical Necessity` : "Medical Necessity Dashboard"}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={resetForNewPatient}
                  disabled={!selected}
                  className="gap-2 bg-white text-navy hover:bg-white/90 shadow-elevate"
                >
                  <RotateCcw className="h-4 w-4" /> Reset
                </Button>
              </div>
            </div>
          </header>

          <div className="flex justify-center py-3 border-b bg-background">
            <TabsList className="grid w-full max-w-2xl grid-cols-4">
              {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
                <TabsTrigger key={key} value={key}>{TAB_LABELS[key]}</TabsTrigger>
              ))}
            </TabsList>
          </div>

          <main className="flex-1 px-6 py-6">
            <section className="max-w-5xl mx-auto space-y-5">
              {!selected && (
                <div className="rounded-xl bg-card border shadow-card p-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    {loading
                      ? "Loading patients from Monday…"
                      : error
                        ? error
                        : "Select a patient from the sidebar to begin."}
                  </p>
                </div>
              )}

              {selected && (
                <>
                  <TabsContent value="evaluate" className="space-y-5 mt-0">
                    <PatientProfileCard patient={selected} />
                    <EvaluatePanel
                      patient={selected}
                      onNotesChange={(v) => update(selected.id, { mnEvalNotes: v })}
                    />
                    <SendToMondayButton onSend={handleSend} disabled={!selected} />
                  </TabsContent>

                  <TabsContent value="sendRequest" className="space-y-5 mt-0">
                    <PatientProfileCard patient={selected} />
                    <SendRequestPanel
                      patient={selected}
                      onNotesChange={(v) => update(selected.id, { confirmChaseNotes: v })}
                    />
                    <SendToMondayButton onSend={handleSend} disabled={!selected} />
                  </TabsContent>

                  <TabsContent value="confirmReceipt" className="space-y-5 mt-0">
                    <PatientProfileCard patient={selected} />
                    <ReceiptChasePanel
                      patient={selected}
                      mode="confirmReceipt"
                      onUpdate={(patch) => update(selected.id, patch)}
                    />
                    <SendToMondayButton onSend={handleSend} disabled={!selected} />
                  </TabsContent>

                  <TabsContent value="chase" className="space-y-5 mt-0">
                    <PatientProfileCard patient={selected} />
                    <ReceiptChasePanel
                      patient={selected}
                      mode="chase"
                      onUpdate={(patch) => update(selected.id, patch)}
                    />
                    <SendToMondayButton onSend={handleSend} disabled={!selected} />
                  </TabsContent>
                </>
              )}
            </section>
          </main>
        </Tabs>
      </div>
    </SidebarProvider>
  );
};

export default Index;
