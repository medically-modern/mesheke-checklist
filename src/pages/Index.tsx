import { useEffect, useMemo, useState } from "react";
import { useMondayPatients, type TabKey } from "@/hooks/useMondayPatients";
import type { Patient } from "@/lib/workflow";
import { EvaluatePanel } from "@/components/dashboard/EvaluatePanel";
import { SendRequestPanel } from "@/components/dashboard/SendRequestPanel";
import { ReceiptChasePanel } from "@/components/dashboard/ReceiptChasePanel";
import { PatientsSidebar } from "@/components/dashboard/PatientsSidebar";
import { PatientProfileCard } from "@/components/dashboard/PatientProfileCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { RotateCcw, Stethoscope, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

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

  const onUpdate = (patch: Partial<Patient>) => {
    if (!selected) return;
    update(selected.id, patch);
  };

  const resetForNewPatient = () => {
    if (!selected) return;
    clearOverlay(selected.id);
    toast.success("Cleared local edits — refetching from Monday");
    refetch();
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
                    <EvaluatePanel patient={selected} />
                  </TabsContent>

                  <TabsContent value="sendRequest" className="space-y-5 mt-0">
                    <PatientProfileCard patient={selected} />
                    <DisconnectedBanner />
                    <SendRequestPanel patient={selected} onUpdate={onUpdate} />
                  </TabsContent>

                  <TabsContent value="confirmReceipt" className="space-y-5 mt-0">
                    <PatientProfileCard patient={selected} />
                    <DisconnectedBanner />
                    <ReceiptChasePanel patient={selected} mode="confirmReceipt" onUpdate={onUpdate} />
                  </TabsContent>

                  <TabsContent value="chase" className="space-y-5 mt-0">
                    <PatientProfileCard patient={selected} />
                    <DisconnectedBanner />
                    <ReceiptChasePanel patient={selected} mode="chase" onUpdate={onUpdate} />
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

function DisconnectedBanner() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-center gap-2">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        <strong>Monday writes disabled.</strong> This tab is in playground mode while we rebuild — changes here will not sync.
      </span>
    </div>
  );
}

export default Index;
