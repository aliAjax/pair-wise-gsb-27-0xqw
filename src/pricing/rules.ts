/**
 * 搬迁报价 · 费用规则层
 *
 * 只负责规则与试算，不依赖 Vue / localStorage，可独立单测。
 * 规则（与客服约定一致）：
 *  1. 有电梯且直达入户层：不收楼层费；
 *  2. 电梯不到入户层：只按实际步行楼层计楼层费；
 *  3. 无电梯：每层 20 元；
 *  4. 平面搬运距离超过 30 米：一次性加收 50 元（未超过不收）；
 *  5. 大件每件 80 元。
 */

export const FLOOR_UNIT_FEE = 20; // 元/层
export const FLAT_DISTANCE_LIMIT = 30; // 米，超过才收费
export const FLAT_DISTANCE_FEE = 50; // 超距一次性费用
export const BULKY_UNIT_FEE = 80; // 元/件

export type ElevatorStatus = "elevator" | "partial" | "none";
// elevator: 有电梯且直达入户层
// partial: 有电梯但不到入户层（只走步行楼层）
// none: 无电梯

export interface Endpoint {
  address: string;
  /** 入户楼层（1 为地面一层） */
  floor: number;
  elevator: ElevatorStatus;
  /** 电梯不到入户层时，实际需要步行的楼层数 */
  walkFloors: number;
}

export interface QuoteInput {
  customer: string;
  origin: Endpoint;
  destination: Endpoint;
  /** 平面搬运距离（米） */
  carryDistance: number;
  /** 大件件数 */
  bulkyCount: number;
  notes: string;
}

export type FeeLineKey = "originFloor" | "destinationFloor" | "distance" | "bulky";

export interface FeeLine {
  key: FeeLineKey;
  label: string;
  basis: string;
  amount: number;
}

export interface QuoteResult {
  lines: FeeLine[];
  total: number;
}

export function defaultEndpoint(address = ""): Endpoint {
  return { address, floor: 1, elevator: "elevator", walkFloors: 0 };
}

export function defaultInput(): QuoteInput {
  return {
    customer: "",
    origin: defaultEndpoint(),
    destination: defaultEndpoint(),
    carryDistance: 0,
    bulkyCount: 0,
    notes: ""
  };
}

export function elevatorText(status: ElevatorStatus): string {
  switch (status) {
    case "elevator":
      return "有电梯直达入户层";
    case "partial":
      return "电梯不到入户层";
    case "none":
      return "无电梯";
  }
}

function toNonNegInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

/** 按电梯情况折算实际需要步行的楼层数 */
export function walkingFloors(endpoint: Pick<Endpoint, "elevator" | "floor" | "walkFloors">): number {
  switch (endpoint.elevator) {
    case "elevator":
      return 0;
    case "partial":
      return toNonNegInt(endpoint.walkFloors);
    case "none":
    default:
      // 无电梯：入户楼层即步行楼层，每层 20 元
      return toNonNegInt(endpoint.floor);
  }
}

function floorLine(
  key: Extract<FeeLineKey, "originFloor" | "destinationFloor">,
  label: string,
  endpoint: Endpoint
): FeeLine {
  const walk = walkingFloors(endpoint);
  const basis =
    endpoint.elevator === "elevator"
      ? `${elevatorText("elevator")}，楼层费免收`
      : `${elevatorText(endpoint.elevator)}，步行 ${walk} 层 × ${FLOOR_UNIT_FEE} 元/层`;
  return { key, label, basis, amount: walk * FLOOR_UNIT_FEE };
}

/** 根据录入条件试算费用明细与总额（纯函数） */
export function calculateQuote(input: QuoteInput): QuoteResult {
  const distance = toNonNegInt(input.carryDistance);
  const bulky = toNonNegInt(input.bulkyCount);
  const overDistance = distance > FLAT_DISTANCE_LIMIT;

  const lines: FeeLine[] = [
    floorLine("originFloor", "起点楼层费", input.origin),
    floorLine("destinationFloor", "终点楼层费", input.destination),
    {
      key: "distance",
      label: "平面搬运费",
      basis: overDistance
        ? `搬运距离 ${distance} 米，超过 ${FLAT_DISTANCE_LIMIT} 米，一次性加收 ${FLAT_DISTANCE_FEE} 元`
        : `搬运距离 ${distance} 米，未超过 ${FLAT_DISTANCE_LIMIT} 米，免收`,
      amount: overDistance ? FLAT_DISTANCE_FEE : 0
    },
    {
      key: "bulky",
      label: "大件搬运费",
      basis: `大件 ${bulky} 件 × ${BULKY_UNIT_FEE} 元/件`,
      amount: bulky * BULKY_UNIT_FEE
    }
  ];

  return { lines, total: lines.reduce((sum, line) => sum + line.amount, 0) };
}
