import { defineStore } from "pinia";
import { calculateQuote, emptyConditions, normalizeConditions } from "../pricing";
import { loadRecords, saveRecords, uid } from "../storage";
import type {
  AnyQuoteRecord,
  QuoteConditions,
  QuoteRecord,
} from "../types";

interface QuoteState {
  records: AnyQuoteRecord[];
}

/**
 * 状态编排层：规则在 pricing.ts，存取在 storage.ts，
 * 这里只负责“待确认 / 确认冻结 / 改条件另建方案”的业务流程。
 */
export const useQuoteStore = defineStore("move-quote", {
  state: (): QuoteState => ({
    records: loadRecords(),
  }),

  getters: {
    quoteRecords(state): QuoteRecord[] {
      return state.records.filter((r): r is QuoteRecord => r.kind === "quote");
    },
    pendingRecords(): QuoteRecord[] {
      return this.quoteRecords.filter((r) => r.status === "pending");
    },
    confirmedRecords(): QuoteRecord[] {
      return this.quoteRecords.filter((r) => r.status === "confirmed");
    },
    getById: (state) => (id: string) =>
      state.records.find((record) => record.id === id),
  },

  actions: {
    persist() {
      saveRecords(this.records);
    },

    /** 录入后存为待确认方案；可标记由哪条方案改条件而来 */
    saveDraft(input: Partial<QuoteConditions>, sourceId?: string): QuoteRecord {
      const conditions = normalizeConditions(input);
      const record: QuoteRecord = {
        kind: "quote",
        version: 2,
        id: uid(),
        createdAt: new Date().toISOString(),
        status: "pending",
        conditions,
        breakdown: calculateQuote(conditions),
      };
      if (sourceId) record.sourceId = sourceId;
      this.records = [record, ...this.records];
      this.persist();
      return record;
    },

    /**
     * 确认报价：把条件与按规则算出的总额、明细一并冻结快照。
     * 之后规则或条件再怎么变，已确认报价都不会被改写。
     */
    confirm(id: string): QuoteRecord | undefined {
      const index = this.records.findIndex((r) => r.id === id);
      if (index < 0) return undefined;
      const current = this.records[index];
      if (current.kind !== "quote") return undefined;
      if (current.status === "confirmed") return current;

      const frozen: QuoteRecord = {
        ...current,
        status: "confirmed",
        conditions: normalizeConditions(current.conditions),
        breakdown: calculateQuote(current.conditions),
        confirmedAt: new Date().toISOString(),
      };
      this.records = [
        frozen,
        ...this.records.slice(0, index),
        ...this.records.slice(index + 1),
      ];
      this.persist();
      return frozen;
    },

    /** 录入即确认（试算无误直接冻结） */
    confirmNew(input: Partial<QuoteConditions>, sourceId?: string): QuoteRecord {
      const draft = this.saveDraft(input, sourceId);
      return this.confirm(draft.id) ?? draft;
    },

    /** 待确认方案可继续改条件；已确认记录不允许改，只能另建方案 */
    updateDraft(id: string, input: Partial<QuoteConditions>): QuoteRecord | undefined {
      const record = this.getById(id);
      if (!record || record.kind !== "quote" || record.status !== "pending") return undefined;
      record.conditions = normalizeConditions(input);
      record.breakdown = calculateQuote(record.conditions);
      this.persist();
      return record;
    },

    remove(id: string) {
      this.records = this.records.filter((record) => record.id !== id);
      this.persist();
    },

    emptyConditions(): QuoteConditions {
      return emptyConditions();
    },
  },
});
