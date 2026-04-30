// Fetch the Monday file columns for one item: Clinical Files, Final Clinicals,
// CGM Template, IP Template. Returned grouped by column id.

import { useCallback, useEffect, useRef, useState } from "react";
import { COL, fetchItemFileColumns, hasToken, type MondayFileEntry } from "@/lib/mondayApi";

const FILE_COLUMN_IDS = [
  COL.clinicalFiles,
  COL.finalClinicals,
  COL.cgmTemplate,
  COL.ipTemplate,
];

export interface MondayFilesResult {
  clinicalFiles: MondayFileEntry[];
  finalClinicals: MondayFileEntry[];
  cgmTemplate: MondayFileEntry[];
  ipTemplate: MondayFileEntry[];
  loading: boolean; // ONLY true on initial fetch (not background polling)
  error: string | null;
  refetch: () => void;
}

interface UseMondayFilesOptions {
  /** If > 0, refetch silently every N ms (no loading flicker). */
  pollingIntervalMs?: number;
}

const EMPTY: MondayFileEntry[] = [];

export function useMondayFiles(
  itemId: string | null,
  { pollingIntervalMs = 0 }: UseMondayFilesOptions = {},
): MondayFilesResult {
  const [data, setData] = useState<Record<string, MondayFileEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const hasLoadedOnceRef = useRef(false);

  const refetch = useCallback(async () => {
    if (!itemId) return;
    if (!hasToken()) {
      setError("Monday token missing");
      return;
    }
    // Only show the loading spinner on the very first fetch for this patient.
    // Background refetches update silently — otherwise UI flickers every poll.
    const isInitial = !hasLoadedOnceRef.current;
    if (isInitial) setLoading(true);
    setError(null);
    try {
      const result = await fetchItemFileColumns(itemId, FILE_COLUMN_IDS);
      if (mountedRef.current) {
        setData(result);
        hasLoadedOnceRef.current = true;
      }
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current && isInitial) setLoading(false);
    }
  }, [itemId]);

  // Reset state when itemId changes; do an initial fetch.
  useEffect(() => {
    mountedRef.current = true;
    hasLoadedOnceRef.current = false;
    setData({});
    if (itemId) refetch();
    return () => {
      mountedRef.current = false;
    };
  }, [itemId, refetch]);

  // Background polling — silent (no loading flicker).
  useEffect(() => {
    if (!itemId) return;
    if (!pollingIntervalMs || pollingIntervalMs <= 0) return;
    const id = setInterval(() => {
      void refetch();
    }, pollingIntervalMs);
    return () => clearInterval(id);
  }, [itemId, pollingIntervalMs, refetch]);

  return {
    clinicalFiles: data[COL.clinicalFiles] ?? EMPTY,
    finalClinicals: data[COL.finalClinicals] ?? EMPTY,
    cgmTemplate: data[COL.cgmTemplate] ?? EMPTY,
    ipTemplate: data[COL.ipTemplate] ?? EMPTY,
    loading,
    error,
    refetch,
  };
}
