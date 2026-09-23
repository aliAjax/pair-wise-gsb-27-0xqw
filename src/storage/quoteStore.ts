/**
 * 搬迁报价 · 存储层（Pinia）
 *
 * 规则：
 *  - 待确认方案可反复保存修改；
 *  - 确认后冻结总额与明细（快照），记录不可再改；
 *  - 对已确认方案改条件 → 另建一个“待确认”新版本，原报价保留可查。
 */
import { defineStore } from "pinia";
import { calculateQuote, type QuoteInput } from "../pricing/rules";
import { loadInitialRecords, normalizeRecord, persistRecords } from "./migration";
import type { QuoteRecord } from "./types";

interface State {
  records: QuoteRecord[];
  /** 正在编辑的待确认方案 id；null 表示新建 */
  editingId: string | null;
}

export const useQuoteStore = defineStore("movingQuote", {
  state: (): State => ({
    records: loadInitialRecords(),
    editingId: null
  }),

  getters: {
    sorted(state): QuoteRecord[] {
      return [...state.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    confirmedCount(state): number {
      return state.records.filter((r) => r.status === "confirmed").length;
    },
    pendingCount(state): number {
      return state.records.filter((r) => r.status === "pending").length;
    },
    getById(state): (id: string) => QuoteRecord | undefined {
      return (id: string) => state.records.find((r) => r.id === id);
    },
    /** 同组最新版本号 */
    maxVersion(state): (groupId: string) => number {
      return (groupId: string) =>
        state.records.filter((r) => r.groupId === groupId).reduce((m, r) => Math.max(m, r.version), 0);
    }
  },

  actions: {
    persist() {
      persistRecords(this.records);
    },

    /** 新建待确认方案 */
    addDraft(input: QuoteInput): QuoteRecord {
      const now = new Date().toISOString();
      const record: QuoteRecord = {
        id: crypto.randomUUID(),
        groupId: crypto.randomUUID(),
        version: 1,
        status: "pending",
        input: structuredCloneSafe(input),
        createdAt: now
      };
      this.records.unshift(record);
      this.persist();
      return record;
    },

    /** 保存待确认方案的修改（已确认方案禁止调用） */
    updateDraft(id: string, input: QuoteInput) {
      const record = this.records.find((r) => r.id === id);
      if (!record || record.status !== "pending") return;
      record.input = structuredCloneSafe(input);
      this.persist();
    },

    /** 确认方案：按当前录入冻结明细与总额 */
    confirm(id: string) {
      const record = this.records.find((r) => r.id === id);
      if (!record || record.status !== "pending") return;
      record.status = "confirmed";
      record.result = calculateQuote(record.input);
      record.confirmedAt = new Date().toISOString();
      if (this.editingId === id) this.editingId = null;
      this.persist();
    },

    /**
     * 基于已确认（或任意）方案改条件 → 另建待确认新版本；
     * 原报价原封不动继续可查。
     */
    revise(baseId: string, input: QuoteInput): QuoteRecord {
      const base = this.records.find((r) => r.id === baseId);
      const nextVersion = base ? this.maxVersion(base.groupId) + 1 : 1;
      const now = new Date().toISOString();
      const record: QuoteRecord = {
        id: crypto.randomUUID(),
        groupId: base?.groupId ?? crypto.randomUUID(),
        version: nextVersion,
        status: "pending",
        input: structuredCloneSafe(input),
        createdAt: now
      };
      this.records.unshift(record);
      this.editingId = record.id;
      this.persist();
      return record;
    },

    remove(id: string) {
      this.records = this.records.filter((r) => r.id !== id);
      if (this.editingId === id) this.editingId = null;
      this.persist();
    },

    startEdit(id: string) {
      const record = this.records.find((r) => r.id === id);
      if (record?.status === "pending") this.editingId = id;
    },

    cancelEdit() {
      this.editingId = null;
    },

    /** 从外部（如历史导入/粘贴 JSON）容错加入记录 */
    importRecord(raw: unknown): QuoteRecord {
      const record = normalizeRecord(raw, this.records.length);
      this.records.unshift(record);
      this.persist();
      return record;
    }
  }
});

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
