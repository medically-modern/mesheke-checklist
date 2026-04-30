// ===== TEMPLATE: Monday board column mappings =====
// Map your board's column IDs and status indices here.
// Query the column's settings_str to find the correct index — never guess.

import type { Patient } from "./workflow";
import type { MondayItem } from "./mondayApi";

// ---- Status index constants ----
// Example: export const STAGE_INDEX = { step1: 0, step2: 1, complete: 2 } as const;

// ---- Item → Patient conversion ----
export function mondayItemToPatient(item: MondayItem): Patient {
  const col = (id: string) =>
    item.column_values.find((c) => c.id === id)?.text ?? "";

  return {
    id: item.id,
    name: item.name,
    dob: col("REPLACE_WITH_DOB_COLUMN_ID"),
    memberId1: col("REPLACE_WITH_MEMBER_ID_COLUMN_ID") || undefined,
    primaryInsurance: col("REPLACE_WITH_INSURANCE_COLUMN_ID") || undefined,
    serving: col("REPLACE_WITH_SERVING_COLUMN_ID") || undefined,
    notes: "",
  };
}
