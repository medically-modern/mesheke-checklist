// ===== TEMPLATE: Monday API layer =====
// Replace board ID, group IDs, and column IDs with your actual values.

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_VERSION = "2024-10";
const BOARD_ID = "REPLACE_WITH_BOARD_ID";

// ---- Groups on the board ----
export const GROUPS = {
  tab1: "REPLACE_WITH_GROUP_ID_1",
  tab2: "REPLACE_WITH_GROUP_ID_2",
  tab3: "REPLACE_WITH_GROUP_ID_3",
} as const;

// ---- Column IDs ----
export const COL = {
  // Read columns (fetched on load)
  // serving: "dropdown_xxxxx",
  // primaryInsurance: "color_xxxxx",

  // Write columns (written on send)
  // someStatus: "color_xxxxx",

  // Debug / error logging
  joshDebug: "REPLACE_WITH_DEBUG_COLUMN_ID",
} as const;

// Column IDs to fetch when loading patients
export const READ_COLUMN_IDS: string[] = [
  // COL.serving,
  // COL.primaryInsurance,
  // Add column IDs here — keep this array small to avoid 503 errors
];

export interface MondayColumnValue {
  id: string;
  text: string | null;
  value: string | null;
}

export interface MondayItem {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
}

function getToken(): string {
  return (import.meta.env.VITE_MONDAY_API_TOKEN as string | undefined) ?? "";
}

export function hasToken(): boolean {
  return !!getToken();
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("VITE_MONDAY_API_TOKEN is not set");
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "API-Version": MONDAY_API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("Monday API HTTP error", { status: res.status, body });
    throw new Error(`Monday request failed (${res.status})`);
  }
  const json = await res.json();
  if (json.errors) {
    console.error("Monday API GraphQL error", json.errors);
    throw new Error(json.errors.map((e: { message: string }) => e.message).join("; "));
  }
  return json.data as T;
}

export async function fetchGroupItems(groupId: string = GROUPS.tab1): Promise<MondayItem[]> {
  const query = `
    query ($boardId: ID!, $cols: [String!]) {
      boards(ids: [$boardId]) {
        groups(ids: ["${groupId}"]) {
          items_page(limit: 200) {
            items {
              id
              name
              column_values(ids: $cols) { id text value }
            }
          }
        }
      }
    }
  `;
  const data = await gql<{
    boards: { groups: { items_page: { items: MondayItem[] } }[] }[];
  }>(query, { boardId: BOARD_ID, cols: READ_COLUMN_IDS });

  return data.boards?.[0]?.groups?.[0]?.items_page?.items ?? [];
}

// ---- Write primitives ----

export async function writeStatusIndex(itemId: string, columnId: string, index: number): Promise<void> {
  const value = JSON.stringify({ index });
  await gql(`mutation { change_column_value(item_id: ${itemId}, board_id: ${BOARD_ID}, column_id: "${columnId}", value: ${JSON.stringify(value)}) { id } }`);
}

export async function writeText(itemId: string, columnId: string, text: string): Promise<void> {
  const value = JSON.stringify(text);
  await gql(`mutation { change_column_value(item_id: ${itemId}, board_id: ${BOARD_ID}, column_id: "${columnId}", value: ${JSON.stringify(value)}) { id } }`);
}

export async function writeLongText(itemId: string, columnId: string, text: string): Promise<void> {
  const value = JSON.stringify({ text });
  await gql(`mutation { change_column_value(item_id: ${itemId}, board_id: ${BOARD_ID}, column_id: "${columnId}", value: ${JSON.stringify(value)}) { id } }`);
}

export async function writeDropdownIds(itemId: string, columnId: string, ids: number[]): Promise<void> {
  const value = JSON.stringify({ ids });
  await gql(`mutation { change_column_value(item_id: ${itemId}, board_id: ${BOARD_ID}, column_id: "${columnId}", value: ${JSON.stringify(value)}) { id } }`);
}

export async function writeDate(itemId: string, columnId: string, dateStr: string): Promise<void> {
  const value = JSON.stringify({ date: dateStr });
  await gql(`mutation { change_column_value(item_id: ${itemId}, board_id: ${BOARD_ID}, column_id: "${columnId}", value: ${JSON.stringify(value)}) { id } }`);
}

export async function writeNumber(itemId: string, columnId: string, num: number): Promise<void> {
  const value = JSON.stringify(String(num));
  await gql(`mutation { change_column_value(item_id: ${itemId}, board_id: ${BOARD_ID}, column_id: "${columnId}", value: ${JSON.stringify(value)}) { id } }`);
}
