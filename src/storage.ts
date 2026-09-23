import { calculateQuote, emptyConditions, normalizeConditions } from "./pricing";
import type { AnyQuoteRecord, LegacyRecord, QuoteConditions, QuoteRecord } from "./types";

/**
 * 保存层：只管 localStorage 的读写与历史数据兼容，
 * 不掺费用规则（算价走 pricing.ts），不感知页面。
 * 沿用旧试算器的 storageKey，老用户本地已有记录也能被读出。
 */
export const STORAGE_KEY = "hxwlfront-13-freight";

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 把任意一条历史存储项归一化为统一记录：
 * - 新结构（kind: "quote"）：补齐缺失字段，确认/待确认都能打开；
 * - 旧结构（客户/线路/重量…）：包装成 legacy，原样保留，缺字段也不报错。
 */
export function normalizeRecord(raw: unknown, index = 0): AnyQuoteRecord {
  if (!isRecord(raw)) {
    return {
      kind: "legacy",
      id: `broken-${index}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      data: { value: String(raw) },
    };
  }

  // 新版搬迁报价
  if (raw.kind === "quote") {
    const conditions: QuoteConditions = normalizeConditions(
      isRecord(raw.conditions) ? raw.conditions : null
    );
    const fallback = calculateQuote(conditions);
    const status = raw.status === "confirmed" ? "confirmed" : "pending";
    const record: QuoteRecord = {
      kind: "quote",
      version: 2,
      id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
      status,
      conditions,
      // 已确认记录优先用冻结明细；明细缺失/损坏时按当前规则补算，保证能打开。
      // 待确认方案不使用旧明细，展示时实时算，避免脏数据。
      breakdown:
        status === "confirmed" && isRecord(raw.breakdown) && Array.isArray(raw.breakdown.lines)
          ? (raw.breakdown as unknown as QuoteRecord["breakdown"])
          : fallback,
    };
    if (typeof raw.confirmedAt === "string") record.confirmedAt = raw.confirmedAt;
    if (typeof raw.sourceId === "string") record.sourceId = raw.sourceId;
    return record;
  }

  // 旧版试算器记录（含最初的 seed 结构）
  const legacy: LegacyRecord = {
    kind: "legacy",
    id: typeof raw.id === "string" && raw.id ? raw.id : `seed-${index + 1}`,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    data: raw,
  };
  if (typeof raw.status === "string") legacy.legacyStatus = raw.status;
  if (typeof raw.notes === "string") legacy.notes = raw.notes;
  return legacy;
}

/** 首次使用时的演示数据：保留两条旧试算器记录，其中一条故意缺字段 */
function seedRecords(): AnyQuoteRecord[] {
  const now = Date.now();
  const day = 86400000;

  const confirmed: QuoteRecord = (() => {
    const conditions = normalizeConditions({
      origin: "广州市天河区珠江新城",
      destination: "广州市番禺区万博商圈",
      originFloor: 12,
      originHasElevator: true,
      originElevatorFloor: 12,
      destFloor: 6,
      destHasElevator: true,
      destElevatorFloor: 3,
      distanceMeters: 45,
      bulkyCount: 2,
      note: "客户有一台立式钢琴，需两名师傅",
    });
    return {
      kind: "quote",
      version: 2,
      id: "seed-quote-1",
      createdAt: new Date(now - day).toISOString(),
      status: "confirmed",
      conditions,
      breakdown: calculateQuote(conditions),
      confirmedAt: new Date(now - day + 3600000).toISOString(),
    };
  })();

  const pending: QuoteRecord = (() => {
    const conditions = normalizeConditions({
      origin: "深圳市福田区车公庙",
      destination: "深圳市南山区科技园",
      originFloor: 7,
      originHasElevator: false,
      originElevatorFloor: 1,
      destFloor: 3,
      destHasElevator: false,
      destElevatorFloor: 1,
      distanceMeters: 20,
      bulkyCount: 1,
      note: "老小区无电梯，等客户确认楼层费",
    });
    return {
      kind: "quote",
      version: 2,
      id: "seed-quote-2",
      createdAt: new Date(now - 2 * 3600000).toISOString(),
      status: "pending",
      conditions,
      breakdown: calculateQuote(conditions),
    };
  })();

  const legacyA = normalizeRecord(
    {
      customer: "海沃商贸",
      route: "上海-南京",
      weight: 180,
      service: "标准达",
      status: "已报价",
      notes: "预估费用1260元（旧试算器记录）",
      id: "seed-1",
      createdAt: new Date(now - 5 * day).toISOString(),
    },
    0
  );

  // 故意缺少多个字段，验证旧记录缺字段也能打开
  const legacyB = normalizeRecord(
    {
      customer: "云仓食品",
      notes: "待确认温区（旧试算器残缺记录）",
      id: "seed-2",
      createdAt: new Date(now - 6 * day).toISOString(),
    },
    1
  );

  return [pending, confirmed, legacyA, legacyB];
}

export function loadRecords(): AnyQuoteRecord[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return seedRecords();
  }
  if (!raw) return seedRecords();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return seedRecords();
  }
  if (!Array.isArray(parsed)) return seedRecords();
  return parsed.map((item, index) => normalizeRecord(item, index));
}

export function saveRecords(records: AnyQuoteRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // 存储不可用时静默失败，页面内存中的记录仍可查看
  }
}

export { emptyConditions };
