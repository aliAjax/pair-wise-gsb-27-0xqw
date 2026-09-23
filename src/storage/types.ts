/**
 * 搬迁报价 · 数据模型
 */
import type { QuoteInput, QuoteResult } from "../pricing/rules";

export type QuoteStatus = "pending" | "confirmed";

export interface QuoteRecord {
  id: string;
  /** 同一方案多次改版共享一个 groupId，原报价始终可查 */
  groupId: string;
  version: number;
  status: QuoteStatus;
  input: QuoteInput;
  /** 仅已确认方案存在：确认时冻结的明细与总额，之后规则变化也不重算 */
  result?: QuoteResult;
  /** 是否为旧版本试算器遗留数据（缺字段也可打开） */
  legacy?: boolean;
  createdAt: string;
  confirmedAt?: string;
}

/** 列表摘要用的轻量类型 */
export interface FeeSummary {
  total: number;
  originFloor: number;
  destinationFloor: number;
  distance: number;
  bulky: number;
}
