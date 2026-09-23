<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { calculateQuote, formatMoney, normalizeConditions } from "./pricing";
import { useQuoteStore } from "./stores/quoteStore";
import {
  isQuoteRecord,
  type AnyQuoteRecord,
  type QuoteBreakdown,
  type QuoteConditions,
  type QuoteRecord,
  type SideConditions,
} from "./types";

const store = useQuoteStore();

type FilterKey = "all" | "pending" | "confirmed" | "legacy";
const filters: { key: FilterKey; label: string }[] = [
  { key: "all", label: "全部方案" },
  { key: "pending", label: "待确认" },
  { key: "confirmed", label: "已冻结" },
  { key: "legacy", label: "旧试算记录" },
];

const filter = ref<FilterKey>("all");

/** 录入表单 */
const form = reactive<QuoteConditions>(store.emptyConditions());
/** 正在编辑的待确认方案（原地修改） */
const editingId = ref<string | null>(null);
/** “改条件另建”时引用的原方案（新方案另存，原报价不动） */
const sourceId = ref<string | null>(null);

const editingRecord = computed(() =>
  editingId.value ? store.getById(editingId.value) : undefined
);
const sourceRecord = computed(() =>
  sourceId.value ? store.getById(sourceId.value) : undefined
);

const isEditing = computed(() => editingId.value !== null);
const modeTitle = computed(() => {
  if (isEditing.value) return "修改待确认方案";
  if (sourceId.value) return "改条件另建方案";
  return "搬迁报价录入";
});

const preview = computed(() => calculateQuote(form));
const canSubmit = computed(
  () => form.origin.trim().length > 0 && form.destination.trim().length > 0
);

const metrics = computed(() => {
  const quotes = store.quoteRecords;
  const confirmedTotal = store.confirmedRecords.reduce(
    (sum, record) => sum + record.breakdown.total,
    0
  );
  return [
    { label: "报价方案", value: `${quotes.length} 单` },
    { label: "待确认", value: `${store.pendingRecords.length} 单` },
    { label: "已确认总额", value: formatMoney(confirmedTotal) },
  ];
});

const filteredRecords = computed(() => {
  if (filter.value === "all") return store.records;
  if (filter.value === "legacy") return store.records.filter((r) => !isQuoteRecord(r));
  return store.quoteRecords.filter((r) => r.status === filter.value);
});

/** 待确认方案实时算；已确认方案只读冻结快照 */
function breakdownOf(record: QuoteRecord): QuoteBreakdown {
  return record.status === "confirmed" ? record.breakdown : calculateQuote(record.conditions);
}

function sideOf(conditions: QuoteConditions, side: "origin" | "dest"): SideConditions {
  return side === "origin"
    ? {
        floor: conditions.originFloor,
        hasElevator: conditions.originHasElevator,
        elevatorFloor: conditions.originElevatorFloor,
      }
    : {
        floor: conditions.destFloor,
        hasElevator: conditions.destHasElevator,
        elevatorFloor: conditions.destElevatorFloor,
      };
}

function sideText(conditions: QuoteConditions, side: "origin" | "dest"): string {
  const s = sideOf(conditions, side);
  if (!s.hasElevator) return `${s.floor} 层 · 无电梯`;
  if (s.floor <= s.elevatorFloor) return `${s.floor} 层 · 电梯直达`;
  return `${s.floor} 层 · 电梯到 ${s.elevatorFloor} 层`;
}

/** 勾选电梯时，默认电梯停靠层与入户层一致 */
function onElevatorToggle(side: "origin" | "dest") {
  if (side === "origin" && form.originHasElevator) {
    form.originElevatorFloor = Math.min(form.originElevatorFloor || form.originFloor, form.originFloor);
    if (!form.originElevatorFloor) form.originElevatorFloor = form.originFloor;
  }
  if (side === "dest" && form.destHasElevator) {
    form.destElevatorFloor = Math.min(form.destElevatorFloor || form.destFloor, form.destFloor);
    if (!form.destElevatorFloor) form.destElevatorFloor = form.destFloor;
  }
}

function resetForm() {
  Object.assign(form, store.emptyConditions());
  editingId.value = null;
  sourceId.value = null;
}

function saveAsDraft() {
  if (!canSubmit.value) return;
  if (editingId.value) {
    store.updateDraft(editingId.value, { ...form });
  } else {
    store.saveDraft({ ...form }, sourceId.value ?? undefined);
  }
  resetForm();
}

function saveAndConfirm() {
  if (!canSubmit.value) return;
  if (editingId.value) {
    store.updateDraft(editingId.value, { ...form });
    store.confirm(editingId.value);
  } else {
    store.confirmNew({ ...form }, sourceId.value ?? undefined);
  }
  resetForm();
}

/** 待确认方案：载入表单原地修改 */
function editDraft(record: QuoteRecord) {
  Object.assign(form, normalizeConditions(record.conditions));
  editingId.value = record.id;
  sourceId.value = null;
}

/** 已确认方案改条件：复制条件到表单，另建新方案，原报价继续可查 */
function forkFrom(record: QuoteRecord) {
  Object.assign(form, normalizeConditions(record.conditions));
  sourceId.value = record.id;
  editingId.value = null;
}

/** 旧试算记录：尽量从中提取线路信息，带入新报价录入 */
function prefillFromLegacy(record: AnyQuoteRecord) {
  if (isQuoteRecord(record)) return;
  const data = record.data;
  const route = typeof data.route === "string" ? data.route : "";
  const [routeOrigin, routeDest] = route.split(/[-—–]/);
  Object.assign(form, store.emptyConditions(), {
    origin: routeOrigin?.trim() || "",
    destination: routeDest?.trim() || "",
    note: [data.customer ? `客户：${data.customer}` : "", record.notes ? `原备注：${record.notes}` : ""]
      .filter(Boolean)
      .join("；"),
  });
  editingId.value = null;
  sourceId.value = null;
}

function statusLabel(record: QuoteRecord): string {
  return record.status === "confirmed" ? "已冻结" : "待确认";
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function legacyEntries(record: AnyQuoteRecord) {
  if (isQuoteRecord(record)) return [];
  return Object.entries(record.data).filter(
    ([key]) => !["id", "createdAt", "status", "notes"].includes(key)
  );
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return "—";
  return String(value);
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">搬迁业务 · 报价最小闭环</p>
          <h1>搬迁报价台</h1>
          <p class="subtitle">
            录入起终点、楼层、电梯、搬运距离与大件件数自动计价：有电梯不收楼层费，电梯不到入户层只算步行楼层，
            无电梯每层 20 元，搬运超过 30 米收 50 元，大件每件 80 元。确认后总额与明细冻结，改条件请另建方案。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">TypeScript</span>
          <span class="tag">Pinia</span>
          <span class="tag">规则 / 存储 / 页面分层</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="metric in metrics" :key="metric.label" class="metric">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      </section>

      <section class="workspace">
        <form class="panel" @submit.prevent="saveAndConfirm">
          <h2>{{ modeTitle }}</h2>

          <div v-if="isEditing" class="mode-banner editing">
            正在编辑待确认方案 <strong>#{{ shortId(editingRecord?.id ?? "") }}</strong>，保存后在原方案上更新。
            <button type="button" class="link" @click="resetForm">放弃并新建</button>
          </div>
          <div v-else-if="sourceId" class="mode-banner forking">
            正基于已确认方案 <strong>#{{ shortId(sourceRecord?.id ?? "") }}</strong> 改条件，保存后生成独立新方案，原报价保留可查。
            <button type="button" class="link" @click="resetForm">取消</button>
          </div>

          <div class="form-grid">
            <label>
              起点地址
              <input v-model="form.origin" type="text" placeholder="如：广州市天河区珠江新城" required />
            </label>
            <label>
              终点地址
              <input v-model="form.destination" type="text" placeholder="如：广州市番禺区万博商圈" required />
            </label>

            <fieldset class="side-block">
              <legend>起点楼层</legend>
              <div class="side-row">
                <label class="grow">
                  入户楼层
                  <input v-model.number="form.originFloor" type="number" min="1" step="1" required />
                </label>
                <label class="check">
                  <input v-model="form.originHasElevator" type="checkbox" @change="onElevatorToggle('origin')" />
                  有电梯
                </label>
              </div>
              <label v-if="form.originHasElevator" class="grow">
                电梯到达楼层（不到入户层时只算步行楼层）
                <input
                  v-model.number="form.originElevatorFloor"
                  type="number"
                  min="1"
                  :max="form.originFloor"
                  step="1"
                />
              </label>
            </fieldset>

            <fieldset class="side-block">
              <legend>终点楼层</legend>
              <div class="side-row">
                <label class="grow">
                  入户楼层
                  <input v-model.number="form.destFloor" type="number" min="1" step="1" required />
                </label>
                <label class="check">
                  <input v-model="form.destHasElevator" type="checkbox" @change="onElevatorToggle('dest')" />
                  有电梯
                </label>
              </div>
              <label v-if="form.destHasElevator" class="grow">
                电梯到达楼层（不到入户层时只算步行楼层）
                <input
                  v-model.number="form.destElevatorFloor"
                  type="number"
                  min="1"
                  :max="form.destFloor"
                  step="1"
                />
              </label>
            </fieldset>

            <div class="two-col">
              <label>
                搬运距离（米）
                <input v-model.number="form.distanceMeters" type="number" min="0" step="1" required />
              </label>
              <label>
                大件件数
                <input v-model.number="form.bulkyCount" type="number" min="0" step="1" required />
              </label>
            </div>

            <label>
              备注
              <textarea v-model="form.note" placeholder="钢琴、保险柜、现场路况等说明" />
            </label>
          </div>

          <section class="preview">
            <h3>费用试算</h3>
            <ul class="fee-lines">
              <li v-for="line in preview.lines" :key="line.key" :class="{ zero: line.amount === 0 }">
                <div class="fee-line-head">
                  <span>{{ line.label }}</span>
                  <strong>{{ formatMoney(line.amount) }}</strong>
                </div>
                <p class="basis">
                  {{ line.basis }}
                  <template v-if="line.quantity > 0">
                    ，{{ line.quantity }}
                    {{ line.key === "distance" ? "次" : line.key === "bulky" ? "件" : "层" }}
                    × {{ line.unitPrice }} 元
                  </template>
                </p>
              </li>
            </ul>
            <div class="preview-total">
              <span>合计</span>
              <strong>{{ formatMoney(preview.total) }}</strong>
            </div>
          </section>

          <div class="form-actions">
            <button type="button" class="secondary" :disabled="!canSubmit" @click="saveAsDraft">
              存为待确认方案
            </button>
            <button type="submit" :disabled="!canSubmit">
              {{ isEditing ? "保存并确认冻结" : "确认并冻结" }}
            </button>
          </div>
          <p v-if="!canSubmit" class="hint">请先填写起点和终点地址</p>
        </form>

        <section class="list-panel">
          <div class="toolbar">
            <h2>报价方案</h2>
            <div class="filters">
              <button
                v-for="item in filters"
                :key="item.key"
                type="button"
                class="chip"
                :class="{ active: filter === item.key }"
                @click="filter = item.key"
              >
                {{ item.label }}
              </button>
            </div>
          </div>

          <div class="record-grid">
            <div v-if="filteredRecords.length === 0" class="empty">暂无匹配记录</div>

            <article
              v-for="record in filteredRecords"
              :key="record.id"
              class="record"
              :class="{ legacy: !isQuoteRecord(record) }"
            >
              <!-- 搬迁报价 -->
              <template v-if="isQuoteRecord(record)">
                <div class="record-head">
                  <p class="record-title">{{ record.conditions.origin }} → {{ record.conditions.destination }}</p>
                  <span class="status" :class="record.status">{{ statusLabel(record) }}</span>
                </div>

                <div class="details">
                  <span>起点：{{ sideText(record.conditions, "origin") }}</span>
                  <span>终点：{{ sideText(record.conditions, "dest") }}</span>
                  <span>搬运距离：{{ record.conditions.distanceMeters }} 米</span>
                  <span>大件：{{ record.conditions.bulkyCount }} 件</span>
                </div>

                <ul class="fee-lines compact">
                  <li
                    v-for="line in breakdownOf(record).lines"
                    :key="line.key"
                    :class="{ zero: line.amount === 0 }"
                  >
                    <div class="fee-line-head">
                      <span>{{ line.label }}</span>
                      <strong>{{ formatMoney(line.amount) }}</strong>
                    </div>
                    <p class="basis">
                      {{ line.basis }}
                      <template v-if="line.quantity > 0">
                        ，{{ line.quantity }}
                        {{ line.key === "distance" ? "次" : line.key === "bulky" ? "件" : "层" }}
                        × {{ line.unitPrice }} 元
                      </template>
                    </p>
                  </li>
                </ul>

                <div class="total-row" :class="record.status">
                  <span>{{ record.status === "confirmed" ? "冻结总额" : "试算总额" }}</span>
                  <strong>{{ formatMoney(breakdownOf(record).total) }}</strong>
                </div>

                <p v-if="record.conditions.note" class="note">{{ record.conditions.note }}</p>

                <p class="meta">
                  创建于 {{ formatTime(record.createdAt) }}
                  <template v-if="record.confirmedAt"> · 确认于 {{ formatTime(record.confirmedAt) }}</template>
                  <template v-if="record.sourceId"> · 改自方案 #{{ shortId(record.sourceId) }}</template>
                </p>

                <div class="actions">
                  <button v-if="record.status === 'pending'" type="button" @click="store.confirm(record.id)">
                    确认冻结
                  </button>
                  <button
                    v-if="record.status === 'pending'"
                    type="button"
                    class="secondary"
                    @click="editDraft(record)"
                  >
                    修改条件
                  </button>
                  <button
                    v-if="record.status === 'confirmed'"
                    type="button"
                    class="secondary"
                    @click="forkFrom(record)"
                  >
                    改条件另建方案
                  </button>
                  <button type="button" class="danger ghost" @click="store.remove(record.id)">删除</button>
                </div>
              </template>

              <!-- 旧版试算器记录：缺字段也能打开查看 -->
              <template v-else>
                <div class="record-head">
                  <p class="record-title">{{ displayValue(record.data.customer) || "未命名客户" }}</p>
                  <span class="status legacy">旧试算记录</span>
                </div>
                <div class="details">
                  <span v-for="[key, value] in legacyEntries(record)" :key="key">
                    {{ key }}：{{ displayValue(value) }}
                  </span>
                </div>
                <p v-if="record.notes" class="note">{{ record.notes }}</p>
                <p v-else class="note muted">该记录由旧版试算器生成，部分字段缺失，仅支持查看。</p>
                <p class="meta">创建于 {{ formatTime(record.createdAt) }}</p>
                <div class="actions">
                  <button type="button" class="secondary" @click="prefillFromLegacy(record)">
                    按此录入新报价
                  </button>
                  <button type="button" class="danger ghost" @click="store.remove(record.id)">删除</button>
                </div>
              </template>
            </article>
          </div>
        </section>
      </section>
    </div>
  </main>
</template>
