/** 一侧（起点或终点）的楼层与电梯情况 */
export interface SideConditions {
  /** 入户楼层，从 1 层起算 */
  floor: number;
  /** 是否有电梯 */
  hasElevator: boolean;
  /** 电梯能够到达的楼层；有电梯但不到入户层时，差额按步行楼层计 */
  elevatorFloor: number;
}

/** 搬迁报价录入条件 */
export interface QuoteConditions {
  origin: string;
  destination: string;
  originFloor: number;
  originHasElevator: boolean;
  originElevatorFloor: number;
  destFloor: number;
  destHasElevator: boolean;
  destElevatorFloor: number;
  /** 车到门口的搬运距离（米） */
  distanceMeters: number;
  /** 大件件数（钢琴、保险柜、大鱼缸等） */
  bulkyCount: number;
  note: string;
}

/** 一条费用明细 */
export interface FeeLine {
  key: "floor" | "distance" | "bulky";
  label: string;
  /** 计费依据的人话说明 */
  basis: string;
  /** 计费数量（楼层数 / 次数 / 件数） */
  quantity: number;
  unitPrice: number;
  amount: number;
}

/** 报价拆分结果 */
export interface QuoteBreakdown {
  lines: FeeLine[];
  total: number;
}

export type QuoteStatus = "pending" | "confirmed";

interface BaseRecord {
  id: string;
  createdAt: string;
}

/** 新版搬迁报价记录 */
export interface QuoteRecord extends BaseRecord {
  kind: "quote";
  version: 2;
  status: QuoteStatus;
  /** 确认时冻结的条件快照 */
  conditions: QuoteConditions;
  /** 确认时冻结的费用明细快照；待确认方案仅作预览参考 */
  breakdown: QuoteBreakdown;
  confirmedAt?: string;
  /** 由哪条方案“改条件另建”而来 */
  sourceId?: string;
}

/** 旧版试算器记录（字段可能缺失，只保证能打开查看） */
export interface LegacyRecord extends BaseRecord {
  kind: "legacy";
  legacyStatus?: string;
  notes?: string;
  /** 原始记录全部字段（customer / route / weight / service 等） */
  data: Record<string, unknown>;
}

export type AnyQuoteRecord = QuoteRecord | LegacyRecord;

export const isQuoteRecord = (record: AnyQuoteRecord): record is QuoteRecord =>
  record.kind === "quote";
