// ===== TEMPLATE: Batch writer for "Send to Monday" =====
// Wire up your column writes here. Each write retries up to 2 times.

import { writeStatusIndex, writeText, COL } from "./mondayApi";
import type { Patient } from "./workflow";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 800;

interface WriteTask {
  label: string;
  columnId: string;
  fn: () => Promise<unknown>;
}

async function executeWithRetry(task: WriteTask): Promise<string | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await task.fn();
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[mondayWrite] ${task.label} (${task.columnId}) failed attempt ${attempt + 1}/${MAX_RETRIES + 1}: ${msg}`,
      );
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      } else {
        return `${task.label} (${task.columnId}): ${msg}`;
      }
    }
  }
  return null;
}

/**
 * Push columns for a patient to Monday.
 * @param p - The patient to write
 * @param context - Which tab initiated the send (use for conditional logic)
 */
export async function sendPatientToMonday(
  p: Patient,
  context: "tab1" | "tab2" | "tab3" = "tab1",
): Promise<void> {
  const tasks: WriteTask[] = [];

  // ---- Add your write tasks here ----
  // Example:
  // tasks.push({
  //   label: "Some Status",
  //   columnId: COL.someColumn,
  //   fn: () => writeStatusIndex(p.id, COL.someColumn, SOME_INDEX.value),
  // });

  if (typeof p.notes === "string" && p.notes.trim()) {
    tasks.push({
      label: "Notes",
      columnId: COL.joshDebug,
      fn: () => writeText(p.id, COL.joshDebug, p.notes),
    });
  }

  // ---- Execute all writes in parallel ----
  const results = await Promise.all(tasks.map(executeWithRetry));
  const failures = results.filter((r): r is string => r !== null);

  if (failures.length > 0) {
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const debugMsg = `[${timestamp}] ${failures.length} write(s) failed:\n${failures.join("\n")}`;
    try {
      await writeText(p.id, COL.joshDebug, debugMsg);
    } catch {
      console.error("[mondayWrite] Could not write debug:", debugMsg);
    }
    throw new Error(
      `${failures.length} column(s) failed after retries. Check debug column.`,
    );
  }
}
