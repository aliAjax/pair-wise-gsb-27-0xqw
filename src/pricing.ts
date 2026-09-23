import type {
  FeeLine,
  QuoteBreakdown,
  QuoteConditions,
  SideConditions,
} from "./types";

/**
 * 搬迁费用规则（唯一真源，页面与保存都只通过这里算价）
 *
 * 1. 楼层费：
 *    - 有电梯且电梯直达入户层：不收楼层费；
 *    - 有电梯但电梯不到入户层：入户层与电梯到达层之间的楼层按步行楼层计；
 *    - 无电梯：按步行楼层计（1 层为平地，不收）；
 *    - 起、止两侧步行楼层合计，每层 20 元。
 * 2. 搬运距离费：车到门口超过 30 米，收 50 元（一次性）。
 * 3. 大件费：每件 80 元。
 */
export const PRICING_RULES = {
  floorFeePerLevel: 20,
  distanceFreeLimitMeters: 30,
  distanceFee: 50,
  bulkyFeePerItem: 80,
} as const;

/** 规范化非负整数；无法识别时回退为默认值 */
export function toNonNegativeInt(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

function normalizeSide(
  floor: unknown,
  hasElevator: unknown,
  elevatorFloor: unknown
): SideConditions {
  const f = toNonNegativeInt(floor, 1);
  const has = toBoolean(hasElevator, false);
  // 电梯到达层不得高于入户层（取 min 更直观），也不低于 1 层
  const e = has
    ? Math.min(Math.max(toNonNegativeInt(elevatorFloor, f), 1), Math.max(f, 1))
    : 1;
  return { floor: Math.max(f, 1), hasElevator: has, elevatorFloor: e };
}

/**
 * 归一化任意来源（页面录入 / localStorage / 旧记录扩展）的条件，
 * 缺字段时全部给安全默认值，保证“旧记录缺字段也能打开”。
 */
export function normalizeConditions(input?: Partial<QuoteConditions> | null): QuoteConditions {
  const src = input ?? {};
  const origin = normalizeSide(src.originFloor, src.originHasElevator, src.originElevatorFloor);
  const dest = normalizeSide(src.destFloor, src.destHasElevator, src.destElevatorFloor);
  return {
    origin: typeof src.origin === "string" ? src.origin : "",
    destination: typeof src.destination === "string" ? src.destination : "",
    originFloor: origin.floor,
    originHasElevator: origin.hasElevator,
    originElevatorFloor: origin.elevatorFloor,
    destFloor: dest.floor,
    destHasElevator: dest.hasElevator,
    destElevatorFloor: dest.elevatorFloor,
    distanceMeters: toNonNegativeInt(src.distanceMeters, 0),
    bulkyCount: toNonNegativeInt(src.bulkyCount, 0),
    note: typeof src.note === "string" ? src.note : "",
  };
}

export function emptyConditions(): QuoteConditions {
  return normalizeConditions({
    origin: "",
    destination: "",
    originFloor: 1,
    originHasElevator: false,
    originElevatorFloor: 1,
    destFloor: 1,
    destHasElevator: false,
    destElevatorFloor: 1,
    distanceMeters: 0,
    bulkyCount: 0,
    note: "",
  });
}

/** 单侧需要人工步行搬运的楼层数 */
export function walkLevelsOf(side: SideConditions): number {
  if (!side.hasElevator) {
    // 1 层无需爬楼
    return Math.max(0, side.floor - 1);
  }
  // 有电梯：电梯到入户层之间的差额；直达入户层为 0
  return Math.max(0, side.floor - side.elevatorFloor);
}

function sideBasis(side: SideConditions, label: string): string {
  if (!side.hasElevator) {
    return `${label}无电梯 ${side.floor} 层，步行 ${walkLevelsOf(side)} 层`;
  }
  const walk = walkLevelsOf(side);
  if (walk === 0) return `${label}电梯直达 ${side.floor} 层`;
  return `${label}电梯只到 ${side.elevatorFloor} 层，入户 ${side.floor} 层，步行 ${walk} 层`;
}

/** 按规则计算费用明细与总额（纯函数，不依赖存储或页面） */
export function calculateQuote(input?: Partial<QuoteConditions> | null): QuoteBreakdown {
  const c = normalizeConditions(input);
  const originSide: SideConditions = {
    floor: c.originFloor,
    hasElevator: c.originHasElevator,
    elevatorFloor: c.originElevatorFloor,
  };
  const destSide: SideConditions = {
    floor: c.destFloor,
    hasElevator: c.destHasElevator,
    elevatorFloor: c.destElevatorFloor,
  };

  const originWalk = walkLevelsOf(originSide);
  const destWalk = walkLevelsOf(destSide);
  const walkLevels = originWalk + destWalk;

  const floorLine: FeeLine = {
    key: "floor",
    label: "楼层费",
    basis: `${sideBasis(originSide, "起点")}；${sideBasis(destSide, "终点")}，合计步行 ${walkLevels} 层`,
    quantity: walkLevels,
    unitPrice: PRICING_RULES.floorFeePerLevel,
    amount: walkLevels * PRICING_RULES.floorFeePerLevel,
  };

  const overDistance = c.distanceMeters > PRICING_RULES.distanceFreeLimitMeters;
  const distanceLine: FeeLine = {
    key: "distance",
    label: "搬运距离费",
    basis: overDistance
      ? `搬运距离 ${c.distanceMeters} 米，超过 ${PRICING_RULES.distanceFreeLimitMeters} 米`
      : `搬运距离 ${c.distanceMeters} 米，未超过 ${PRICING_RULES.distanceFreeLimitMeters} 米，免收`,
    quantity: overDistance ? 1 : 0,
    unitPrice: PRICING_RULES.distanceFee,
    amount: overDistance ? PRICING_RULES.distanceFee : 0,
  };

  const bulkyLine: FeeLine = {
    key: "bulky",
    label: "大件费",
    basis:
      c.bulkyCount > 0
        ? `大件 ${c.bulkyCount} 件`
        : "无大件",
    quantity: c.bulkyCount,
    unitPrice: PRICING_RULES.bulkyFeePerItem,
    amount: c.bulkyCount * PRICING_RULES.bulkyFeePerItem,
  };

  const lines = [floorLine, distanceLine, bulkyLine];
  return { lines, total: lines.reduce((sum, line) => sum + line.amount, 0) };
}

/** 金额展示：1234 -> "1,234 元" */
export function formatMoney(amount: number): string {
  return `${toNonNegativeInt(amount, 0).toLocaleString("zh-CN")} 元`;
}
