// Monday API layer for Medical Necessity board (18406060017)

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_VERSION = "2024-10";
const BOARD_ID = "18406060017";

export const GROUPS = {
  medicalNecessity: "group_mm1xf2jb",
} as const;

export const COL = {
  // Demographics (read)
  dob: "text_mm1xvxst",
  phone: "phone_mm1x44yk",
  primaryInsurance: "color_mm1x157j",
  memberId1: "text_mm1x2qk2",
  memberId2: "text_mm1xaccx",
  serving: "color_mm1w1cm9",
  referralType: "color_mm1wm4n4",
  referralSource: "color_mm1w5wxr",
  pumpType: "color_mm1wjjtk",
  cgmType: "color_mm1w7pmf",
  requestType: "color_mm1w1978",

  // Coverage paths
  ipCoveragePath: "color_mm1w5xn1",
  cgmCoveragePath: "color_mm1w7e5q",

  // Doctor
  doctorName: "text_mm1x46et",
  doctorPhone: "phone_mm1xz8c0",
  doctorNpi: "text_mm1x7d91",
  clinicalsMethod: "color_mm1xw7y5",
  doctorEmail: "email_mm1x6fq5",
  doctorFax: "email_mm1xdzcj",
  clinicName: "dropdown_mm1xbvas",

  // Pipeline tracking
  masterStage: "color_mm1ws96t",
  subStage: "color_mm1wyr92",
  daysSinceIntake: "color_mm1xwabn",
  daysSinceStageStart: "color_mm1wwm05",
  dateOfIntake: "date_mm1wf43j",
  dateOfStageStart: "date_mm1w6jeq",

  // Clinical eval checklist
  cgmScript: "color_mm1w8mp1",
  hypoLanguage: "color_mm1whggs",
  insulinLanguage: "color_mm1wgrst",
  ipScript: "color_mm1wsbk5",
  diabetesEducation: "color_mm1wjsyq",
  threeInjections: "color_mm1wj1v8",
  cgmUse: "color_mm1wgpek",
  bloodSugarIssues: "color_mm1wpcrd",
  lmn: "color_mm1wdcsf",
  oowDate: "color_mm1wmv5c",
  malfunction: "color_mm1wp4e9",
  diagnosis: "color_mm1wf7rv",

  // MRs / Clinicals
  mrsClinicals: "color_mm1y8rv8",
  lastVisit: "date_mm1wb9br",
  mrExpiryDate: "date_mm1ymthz",
  clinicalFiles: "file_mm1w5vwp",
  finalClinicals: "file_mm25m8c1",
  medicalNecessity: "color_mm1y6qrf",
  mnEvalNotes: "long_text_mm27zjt2",
  generalMnInvalidReasons: "dropdown_mm2xppn8",

  // Script generation
  generateCgmScript: "color_mm1w2ey",
  cgmTemplate: "file_mm1wf720",
  generateIpScript: "color_mm1w4wd8",
  ipTemplate: "file_mm1wft5h",

  // Confirm Receipt / Chase
  confirmChaseNotes: "text_mm1wssm8",
  confirmReceiptNotes: "text_mm1wbe5y",
  receiptConfirmedDate: "date_mm1wxpdk",
  receiptConfirmedName: "text_mm1wj9at",
  chaseRecipientName: "text_mm1wabj9",
  mnAttempts: "color_mm1wz0vg",
  nextActionDate: "date_mm1wadgs",

  // Advancers
  advancer2a: "color_mm1w73jx",
  advancer2b: "color_mm1wfbkz",
  advancer2c: "color_mm1wf98t",
  advancer2d: "color_mm1wcsbv",

  // Debug
  joshDebug: "text_mm2w1qn4",
} as const;

// Columns to read on load — keep small to avoid 503
export const READ_COLUMN_IDS: string[] = [
  COL.dob, COL.primaryInsurance, COL.memberId1, COL.memberId2,
  COL.serving, COL.referralType, COL.referralSource,
  COL.pumpType, COL.cgmType, COL.requestType,
  COL.ipCoveragePath, COL.cgmCoveragePath,
  COL.doctorName, COL.doctorNpi, COL.clinicalsMethod,
  COL.doctorFax, COL.clinicName,
  COL.masterStage, COL.subStage,
  COL.daysSinceIntake, COL.daysSinceStageStart,
  COL.dateOfIntake, COL.dateOfStageStart,
  // Eval checklist
  COL.cgmScript, COL.hypoLanguage, COL.insulinLanguage, COL.ipScript,
  COL.diabetesEducation, COL.threeInjections, COL.cgmUse, COL.bloodSugarIssues,
  COL.lmn, COL.oowDate, COL.malfunction, COL.diagnosis,
  // MRs
  COL.mrsClinicals, COL.medicalNecessity, COL.mnEvalNotes,
  // Scripts
  COL.generateCgmScript, COL.generateIpScript,
  // Receipt / Chase
  COL.confirmChaseNotes, COL.confirmReceiptNotes,
  COL.receiptConfirmedName, COL.chaseRecipientName,
  COL.mnAttempts, COL.nextActionDate,
  // Advancers
  COL.advancer2a, COL.advancer2b, COL.advancer2c, COL.advancer2d,
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

export async function fetchGroupItems(groupId: string = GROUPS.medicalNecessity): Promise<MondayItem[]> {
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

export async function writeDate(itemId: string, columnId: string, dateStr: string): Promise<void> {
  const value = JSON.stringify({ date: dateStr });
  await gql(`mutation { change_column_value(item_id: ${itemId}, board_id: ${BOARD_ID}, column_id: "${columnId}", value: ${JSON.stringify(value)}) { id } }`);
}

// ---- File asset helpers ----

export interface MondayAsset {
  id: string;
  name: string;
  url: string;
  public_url: string;
}

export async function fetchItemAssets(itemId: string): Promise<MondayAsset[]> {
  const query = `
    query ($itemId: [ID!]!) {
      items(ids: $itemId) {
        assets(assets_source: all) {
          id
          name
          url
          public_url
        }
      }
    }
  `;
  const data = await gql<{
    items: { assets: MondayAsset[] }[];
  }>(query, { itemId: [itemId] });
  return data.items?.[0]?.assets ?? [];
}

// ---- Per-column file fetcher ----
// Each Monday file column stores a JSON value like:
//   {"files":[{"name":"doc.pdf","assetId":12345,"isImage":false,...}]}
// We cross-reference the assetId with the item's full assets list to get
// public_url for each file in each requested column.

export interface MondayFileEntry {
  assetId: string;
  name: string;
  url?: string;
  public_url?: string;
}

export type ColumnFiles = Record<string, MondayFileEntry[]>;

/** Removes ALL files from a single file column on a single item. */
export async function deleteFileFromColumn(
  itemId: string,
  columnId: string,
): Promise<void> {
  const query = `
    mutation ($itemId: ID!, $columnId: String!) {
      change_column_value(
        item_id: $itemId,
        column_id: $columnId,
        board_id: ${BOARD_ID},
        value: "{\\"clear_all\\": true}"
      ) {
        id
      }
    }
  `;
  await gql(query, { itemId, columnId });
}

export async function fetchItemFileColumns(
  itemId: string,
  columnIds: string[],
): Promise<ColumnFiles> {
  if (columnIds.length === 0) return {};
  const query = `
    query ($itemId: [ID!]!, $columnIds: [String!]!) {
      items(ids: $itemId) {
        assets(assets_source: all) {
          id
          name
          url
          public_url
        }
        column_values(ids: $columnIds) {
          id
          value
        }
      }
    }
  `;
  const data = await gql<{
    items: {
      assets: MondayAsset[];
      column_values: { id: string; value: string | null }[];
    }[];
  }>(query, { itemId: [itemId], columnIds });
  const item = data.items?.[0];
  if (!item) return {};
  const assetById = new Map<string, MondayAsset>();
  for (const a of item.assets ?? []) assetById.set(String(a.id), a);

  const out: ColumnFiles = {};
  for (const cv of item.column_values ?? []) {
    out[cv.id] = [];
    if (!cv.value) continue;
    try {
      const parsed = JSON.parse(cv.value) as { files?: { name?: string; assetId?: number | string }[] };
      for (const f of parsed.files ?? []) {
        const assetId = String(f.assetId ?? "");
        if (!assetId) continue;
        const a = assetById.get(assetId);
        out[cv.id].push({
          assetId,
          name: f.name ?? a?.name ?? "(unnamed)",
          url: a?.url,
          public_url: a?.public_url,
        });
      }
    } catch {
      // ignore malformed value
    }
  }
  return out;
}
