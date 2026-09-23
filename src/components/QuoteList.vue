<script setup lang="ts">
/** 报价记录列表：已确认方案可查明细、可改条件另建新版；待确认方案可继续编辑 */
import { computed, ref } from "vue";
import { elevatorText } from "../pricing/rules";
import { useQuoteStore } from "../storage/quoteStore";
import { summarize } from "../storage/migration";
import type { QuoteRecord } from "../storage/types";

const store = useQuoteStore();

type Filter = "all" | "pending" | "confirmed";
const filter = ref<Filter>("all");
const expanded = ref<Set<string>>(new Set());

const records = computed(() => {
  if (filter.value === "all") return store.sorted;
  return store.sorted.filter((r) => r.status === filter.value);
});

function toggle(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

function editPending(record: QuoteRecord) {
  store.startEdit(record.id);
  document.querySelector(".quote-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function revise(record: QuoteRecord) {
  store.revise(record.id, JSON.parse(JSON.stringify(record.input)));
  document.querySelector(".quote-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fmtTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function groupInfo(record: QuoteRecord) {
  const peers = store.records.filter((r) => r.groupId === record.groupId);
  if (peers.length <= 1) return null;
  const latest = peers.reduce((a, b) => (a.version >= b.version ? a : b));
  return { count: peers.length, latest, isLatest: latest.id === record.id };
}
</script>

<template>
  <section class="list-panel">
    <div class="toolbar">
      <h2>报价方案</h2>
      <select v-model="filter">
        <option value="all">全部方案</option>
        <option value="pending">待确认</option>
        <option value="confirmed">已确认（已冻结）</option>
      </select>
    </div>

    <div class="record-grid">
      <div v-if="records.length === 0" class="empty">暂无匹配方案</div>

      <article
        v-for="record in records"
        :key="record.id"
        class="record"
        :class="{ editing: store.editingId === record.id, confirmed: record.status === 'confirmed' }"
      >
        <div class="record-head">
          <div>
            <p class="record-title">
              {{ record.input.customer || "未命名客户" }}
              <span class="route">{{ record.input.origin.address }} → {{ record.input.destination.address }}</span>
            </p>
            <p class="meta">
              第 {{ record.version }} 版
              <template v-if="groupInfo(record)">
                · 同方案共 {{ groupInfo(record)?.count }} 版
                <span v-if="groupInfo(record)?.isLatest" class="chip latest">最新版</span>
                <span v-else class="chip">历史版</span>
              </template>
              <span v-if="record.legacy" class="chip legacy">旧记录</span>
            </p>
          </div>
          <span class="status" :class="record.status">
            {{ record.status === "confirmed" ? "已确认·冻结" : "待确认" }}
          </span>
        </div>

        <div class="details">
          <span>起点：{{ record.input.origin.floor }} 层，{{ elevatorText(record.input.origin.elevator) }}</span>
          <span>终点：{{ record.input.destination.floor }} 层，{{ elevatorText(record.input.destination.elevator) }}</span>
          <span>搬运距离：{{ record.input.carryDistance }} 米</span>
          <span>大件：{{ record.input.bulkyCount }} 件</span>
        </div>

        <div class="record-summary">
          <span>总额</span>
          <strong :class="{ frozen: record.status === 'confirmed' }">
            {{ summarize(record).total }} 元
          </strong>
          <button type="button" class="link" @click="toggle(record.id)">
            {{ expanded.has(record.id) ? "收起明细" : "查看明细" }}
          </button>
        </div>

        <div v-if="expanded.has(record.id)" class="breakdown">
          <!-- 已确认：展示确认时冻结的明细快照；待确认：按当前条件实时试算 -->
          <template v-if="record.result">
            <div v-for="line in record.result.lines" :key="line.key" class="breakdown-line">
              <div>
                <span>{{ line.label }}</span>
                <small>{{ line.basis }}</small>
              </div>
              <em :class="{ zero: line.amount === 0 }">{{ line.amount }} 元</em>
            </div>
            <div class="breakdown-total">
              冻结总额 <strong>{{ record.result.total }} 元</strong>
            </div>
            <p class="freeze-note">确认于 {{ fmtTime(record.confirmedAt) }}，明细与总额已冻结，不再随规则变化</p>
          </template>
          <template v-else>
            <p class="pending-note">方案尚未确认，以下为按当前条件的实时试算：</p>
            <div
              v-for="line in [
                { label: '起点楼层费', amount: summarize(record).originFloor },
                { label: '终点楼层费', amount: summarize(record).destinationFloor },
                { label: '平面搬运费', amount: summarize(record).distance },
                { label: '大件搬运费', amount: summarize(record).bulky }
              ]"
              :key="line.label"
              class="breakdown-line"
            >
              <span>{{ line.label }}</span>
              <em :class="{ zero: line.amount === 0 }">{{ line.amount }} 元</em>
            </div>
            <div class="breakdown-total">试算总额 <strong>{{ summarize(record).total }} 元</strong></div>
          </template>
          <p v-if="record.input.notes" class="note">备注：{{ record.input.notes }}</p>
        </div>

        <div class="actions">
          <button v-if="record.status === 'pending'" type="button" @click="editPending(record)">
            编辑
          </button>
          <button v-if="record.status === 'pending'" type="button" @click="store.confirm(record.id)">
            确认冻结
          </button>
          <button
            v-else
            type="button"
            class="secondary"
            :title="'按该方案条件另建待确认版本，原报价保留'"
            @click="revise(record)"
          >
            改条件·另建待确认版本
          </button>
          <button type="button" class="danger" @click="store.remove(record.id)">删除</button>
        </div>
      </article>
    </div>
  </section>
</template>
