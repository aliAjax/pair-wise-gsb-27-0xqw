/**
 * 搬迁报价 · 旧记录容错迁移
 *
 * 旧版“物流费用试算器”只有 customer/route/weight/service/notes 等字段，
 * 或搬迁报价的历史版本缺少楼层/电梯/距离/大件字段。
 * 这里做宽松解析：任何缺字段、错类型都能补默认值后正常打开。
 */
import {
  calculateQuote,
  defaultEndpoint,
  type ElevatorStatus,
  type Endpoint,
  type QuoteInput
} from "../pricing/rules";
import type { FeeSummary, QuoteRecord, QuoteStatus } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

export const STORAGE_KEY = "hxwlfront-13-moving-quotes-v2";
const LEGACY_KEY = "hxwlfront-13-freight";
const SCHEMA_VERSION = 2;

function isObject(value: unknown): value is Loose {
  return typeof value === "object" && value !== null;
}

function intOr(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

function strOr(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function normalizeElevator(value: unknown): ElevatorStatus {
  const v = String(value ?? "").toLowerCase();
  if (v === "elevator" || v === "true" || v === "有" || v.includes("直达") || v.includes("有电梯")) {
    return "elevator";
  }
  if (v === "partial" || v.includes("不到") || v.includes("步行") || v.includes("部分")) {
    return "partial";
  }
  if (v === "none" || v === "false" || v === "无" || v.includes("无电梯")) {
    return "none";
  }
  // 旧数据缺电梯信息时，按“有电梯直达”处理，避免误收楼层费
  return "elevator";
}

/** 容错解析一端（起点/终点），兼容扁平旧字段 */
function normalizeEndpoint(raw: unknown, side: "origin" | "destination", root?: Loose): Endpoint {
  const fallbackFloor = intOr(root?.[side === "origin" ? "originFloor" : "destFloor"], 1);
  const base = defaultEndpoint();
  if (!isObject(raw)) {
    return { ...base, floor: fallbackFloor };
  }
  return {
    address: strOr(raw.address),
    floor: intOr(raw.floor, fallbackFloor),
    elevator: normalizeElevator(raw.elevator),
    walkFloors: intOr(raw.walkFloors, intOr(raw.walk, 0))
  };
}

export function normalizeInput(raw: unknown): QuoteInput {
  const base: QuoteInput = {
    customer: "",
    origin: defaultEndpoint(),
    destination: defaultEndpoint(),
    carryDistance: 0,
    bulkyCount: 0,
    notes: ""
  };
  if (!isObject(raw)) return base;

  // 兼容更旧的扁平结构
  if (!isObject(raw.origin) || !isObject(raw.destination)) {
    const route = strOr(raw.route);
    const [from, to] = route.split(/[-—–至到]/).map((s) => s.trim());
    return {
      customer: strOr(raw.customer),
      origin: { ...defaultEndpoint(from), floor: intOr(raw.originFloor, 1) },
      destination: { ...defaultEndpoint(to), floor: intOr(raw.destFloor, 1) },
      carryDistance: intOr(raw.carryDistance, 0),
      bulkyCount: intOr(raw.bulkyCount, intOr(raw.bulky, 0)),
      notes: strOr(raw.notes)
    };
  }

  return {
    customer: strOr(raw.customer),
    origin: normalizeEndpoint(raw.origin, "origin", raw),
    destination: normalizeEndpoint(raw.destination, "destination", raw),
    carryDistance: intOr(raw.carryDistance, intOr(raw.distance, 0)),
    bulkyCount: intOr(raw.bulkyCount, intOr(raw.bulky, 0)),
    notes: strOr(raw.notes)
  };
}

function normalizeStatus(raw: unknown): QuoteStatus {
  return raw === "confirmed" || raw === "已报价" || raw === "已确认" ? "confirmed" : "pending";
}

function isValidResult(raw: unknown): boolean {
  return isObject(raw) && Array.isArray(raw.lines) && typeof raw.total === "number";
}

/** 把任意历史/损坏数据容错成可打开的报价记录 */
export function normalizeRecord(raw: unknown, index = 0): QuoteRecord {
  const r = isObject(raw) ? raw : {};
  const input = normalizeInput(r.input ?? r);
  const status = normalizeStatus(r.status);

  return {
    id: strOr(r.id, `legacy-${Date.now()}-${index}`),
    groupId: strOr(r.groupId, strOr(r.id, `legacy-group-${index}`)),
    version: intOr(r.version, 1),
    status,
    input,
    result: isValidResult(r.result)
      ? (r.result as QuoteRecord["result"])
      : status === "confirmed"
        ? calculateQuote(input) // 老的已报价记录缺明细：用当前规则补算，但不再影响原金额字段以外的展示
        : undefined,
    legacy: r.legacy === true || !isObject(r.input),
    createdAt: strOr(r.createdAt, new Date(Date.now() - index * 86400000).toISOString()),
    confirmedAt: r.confirmedAt ? strOr(r.confirmedAt) : status === "confirmed" ? strOr(r.createdAt) : undefined
  };
}

export function summarize(record: QuoteRecord): FeeSummary {
  const result = record.result ?? calculateQuote(record.input);
  const line = (key: string) => result.lines.find((l) => l.key === key)?.amount ?? 0;
  return {
    total: result.total,
    originFloor: line("originFloor"),
    destinationFloor: line("destinationFloor"),
    distance: line("distance"),
    bulky: line("bulky")
  };
}

/** 安全读取 localStorage 中本版数据；损坏时回退空数组 */
function readRaw(): unknown[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed;
    if (isObject(parsed) && Array.isArray(parsed.records)) return parsed.records as unknown[];
    return null;
  } catch {
    return null;
  }
}

/** 首次使用：迁移旧版试算器记录（只读旧库，不覆盖） */
function migrateLegacy(): QuoteRecord[] {
  let old: unknown[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) old = parsed;
    }
  } catch {
    old = [];
  }
  return old.map((item, index) => {
    const record = normalizeRecord(item, index);
    record.legacy = true;
    record.groupId = record.id; // 旧记录各自独立，不与新方案串组
    return record;
  });
}

function seedRecords(): QuoteRecord[] {
  const id = crypto.randomUUID();
  const group = crypto.randomUUID();
  const mk = (
    n: number,
    input: QuoteInput,
    status: QuoteStatus,
    daysAgo: number,
    gid = group
  ): QuoteRecord => {
    const created = new Date(Date.now() - daysAgo * 86400000).toISOString();
    return {
      id: status === "pending" ? id : crypto.randomUUID(),
      groupId: gid,
      version: n,
      status,
      input,
      result: status === "confirmed" ? calculateQuote(input) : undefined,
      createdAt: created,
      confirmedAt: status === "confirmed" ? created : undefined
    };
  };

  const v1: QuoteInput = {
    customer: "海沃商贸",
    origin: { address: "上海·浦东仓", floor: 6, elevator: "none", walkFloors: 0 },
    destination: { address: "上海·静安办公区", floor: 3, elevator: "elevator", walkFloors: 0 },
    carryDistance: 20,
    bulkyCount: 2,
    notes: "六楼无电梯，两件保险柜"
  };
  const v2: QuoteInput = {
    ...v1,
    origin: { address: "上海·浦东仓", floor: 6, elevator: "partial", walkFloors: 2 },
    carryDistance: 45,
    notes: "电梯只能到四层，步行两层；车位距单元门 45 米"
  };
  const standalone: QuoteInput = {
    customer: "云仓食品",
    origin: { address: "杭州·余杭仓库", floor: 1, elevator: "elevator", walkFloors: 0 },
    destination: { address: "杭州·拱墅门店", floor: 2, elevator: "elevator", walkFloors: 0 },
    carryDistance: 15,
    bulkyCount: 0,
    notes: "电梯直达"
  };

  return [mk(2, v2, "pending", 0), mk(1, v1, "confirmed", 3), mk(1, standalone, "confirmed", 6, crypto.randomUUID())];
}

/** 初始加载：本版数据 → 旧版迁移 → 内置示例 */
export function loadInitialRecords(): QuoteRecord[] {
  const raw = readRaw();
  if (raw) return raw.map((item, index) => normalizeRecord(item, index));

  const migrated = migrateLegacy();
  if (migrated.length > 0) return migrated;

  return seedRecords();
}

export function persistRecords(records: QuoteRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, records }));
  } catch {
    // localStorage 不可用时静默降级为内存态
  }
}
