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
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const EMPTY: MondayFileEntry[] = [];

export function useMondayFiles(itemId: string | null): MondayFilesResult {
  const [data, setData] = useState<Record<string, MondayFileEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refetch = useCallback(async () => {
    if (!itemId) return;
    if (!hasToken()) {
      setError("Monday token missing");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchItemFileColumns(itemId, FILE_COLUMN_IDS);
      if (mountedRef.current) setData(result);
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    mountedRef.current = true;
    setData({});
    if (itemId) refetch();
    return () => {
      mountedRef.current = false;
    };
  }, [itemId, refetch]);

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
