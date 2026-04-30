// Batch writer for Medical Necessity "Send to Monday"

import { writeStatusIndex, writeText, writeLongText, writeDate, COL } from "./mondayApi";
import {
  SUB_STAGE_INDEX,
  ADVANCER_2A_INDEX,
  ADVANCER_2B_INDEX,
  ADVANCER_2C_INDEX,
  ADVANCER_2D_INDEX,
} from "./mondayMapping";
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

export type TabContext = "evaluate" | "sendRequest" | "confirmReceipt" | "chase";

export async function sendPatientToMonday(
  p: Patient,
  context: TabContext,
): Promise<void> {
  const tasks: WriteTask[] = [];

  // ---- Tab-specific writes ----

  if (context === "evaluate") {
    // Write MN Evaluation Notes
    if (p.mnEvalNotes) {
      tasks.push({
        label: "MN Eval Notes",
        columnId: COL.mnEvalNotes,
        fn: () => writeLongText(p.id, COL.mnEvalNotes, p.mnEvalNotes!),
      });
    }
    // Flip advancer 2A → Complete
    tasks.push({
      label: "Advancer 2A",
      columnId: COL.advancer2a,
      fn: () => writeStatusIndex(p.id, COL.advancer2a, ADVANCER_2A_INDEX.complete),
    });
    // Advance sub-stage → 2B. Send Request
    tasks.push({
      label: "Sub-Stage → Send Request",
      columnId: COL.subStage,
      fn: () => writeStatusIndex(p.id, COL.subStage, SUB_STAGE_INDEX.sendRequest),
    });
  }

  if (context === "sendRequest") {
    // Write confirm/chase notes
    if (p.confirmChaseNotes) {
      tasks.push({
        label: "Confirm/Chase Notes",
        columnId: COL.confirmChaseNotes,
        fn: () => writeText(p.id, COL.confirmChaseNotes, p.confirmChaseNotes!),
      });
    }
    // Flip advancer 2B → Complete
    tasks.push({
      label: "Advancer 2B",
      columnId: COL.advancer2b,
      fn: () => writeStatusIndex(p.id, COL.advancer2b, ADVANCER_2B_INDEX.complete),
    });
    // Advance sub-stage → 2C. Confirm Receipt
    tasks.push({
      label: "Sub-Stage → Confirm Receipt",
      columnId: COL.subStage,
      fn: () => writeStatusIndex(p.id, COL.subStage, SUB_STAGE_INDEX.confirmReceipt),
    });
  }

  if (context === "confirmReceipt") {
    // Write receipt confirmed date
    if (p.receiptConfirmedDate) {
      tasks.push({
        label: "Receipt Confirmed Date",
        columnId: COL.receiptConfirmedDate,
        fn: () => writeDate(p.id, COL.receiptConfirmedDate, p.receiptConfirmedDate!),
      });
    }
    // Write receipt confirmed name
    if (p.receiptConfirmedName) {
      tasks.push({
        label: "Receipt Confirmed Name",
        columnId: COL.receiptConfirmedName,
        fn: () => writeText(p.id, COL.receiptConfirmedName, p.receiptConfirmedName!),
      });
    }
    // Write confirm receipt notes
    if (p.confirmReceiptNotes) {
      tasks.push({
        label: "Confirm Receipt Notes",
        columnId: COL.confirmReceiptNotes,
        fn: () => writeText(p.id, COL.confirmReceiptNotes, p.confirmReceiptNotes!),
      });
    }
    // Write confirm/chase notes
    if (p.confirmChaseNotes) {
      tasks.push({
        label: "Confirm/Chase Notes",
        columnId: COL.confirmChaseNotes,
        fn: () => writeText(p.id, COL.confirmChaseNotes, p.confirmChaseNotes!),
      });
    }
    // Flip advancer 2C → Complete
    tasks.push({
      label: "Advancer 2C",
      columnId: COL.advancer2c,
      fn: () => writeStatusIndex(p.id, COL.advancer2c, ADVANCER_2C_INDEX.complete),
    });
    // Advance sub-stage → 2D. Chase
    tasks.push({
      label: "Sub-Stage → Chase",
      columnId: COL.subStage,
      fn: () => writeStatusIndex(p.id, COL.subStage, SUB_STAGE_INDEX.chase),
    });
  }

  if (context === "chase") {
    // Write next action date
    if (p.nextActionDate) {
      tasks.push({
        label: "Next Action Date",
        columnId: COL.nextActionDate,
        fn: () => writeDate(p.id, COL.nextActionDate, p.nextActionDate!),
      });
    }
    // Write chase recipient name
    if (p.chaseRecipientName) {
      tasks.push({
        label: "Chase Recipient Name",
        columnId: COL.chaseRecipientName,
        fn: () => writeText(p.id, COL.chaseRecipientName, p.chaseRecipientName!),
      });
    }
    // Write confirm/chase notes
    if (p.confirmChaseNotes) {
      tasks.push({
        label: "Confirm/Chase Notes",
        columnId: COL.confirmChaseNotes,
        fn: () => writeText(p.id, COL.confirmChaseNotes, p.confirmChaseNotes!),
      });
    }
    // Flip advancer 2D → Complete
    tasks.push({
      label: "Advancer 2D",
      columnId: COL.advancer2d,
      fn: () => writeStatusIndex(p.id, COL.advancer2d, ADVANCER_2D_INDEX.complete),
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
