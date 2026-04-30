import { useState } from "react";
import { Download, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchItemAssets, type MondayAsset } from "@/lib/mondayApi";

interface Props {
  itemId: string;
  patientName: string;
}

export function ClinicalsDownloadButton({ itemId, patientName }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const assets = await fetchItemAssets(itemId);
      if (assets.length === 0) {
        setError("No files attached");
        return;
      }
      // Open each file's public_url in a new tab
      for (const asset of assets) {
        const url = asset.public_url || asset.url;
        if (url) window.open(url, "_blank");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={loading}
        className="gap-1.5 text-xs"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        Clinicals
      </Button>
      {error && (
        <span className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {error}
        </span>
      )}
    </div>
  );
}
