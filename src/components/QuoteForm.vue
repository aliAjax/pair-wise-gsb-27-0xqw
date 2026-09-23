<script setup lang="ts">
/** 搬迁报价录入面板：录入条件、实时试算、保存待确认 / 确认冻结 */
import { computed, reactive, watch } from "vue";
import {
  calculateQuote,
  defaultInput,
  FLAT_DISTANCE_LIMIT,
  type QuoteInput
} from "../pricing/rules";
import { useQuoteStore } from "../storage/quoteStore";
import EndpointFields from "./EndpointFields.vue";

const store = useQuoteStore();

const form = reactive<QuoteInput>(defaultInput());

const editing = computed(() =>
  store.editingId ? store.getById(store.editingId) ?? null : null
);

// 编辑指定待确认方案时，把它的条件灌入表单
watch(
  () => store.editingId,
  (id) => {
    const record = id ? store.getById(id) : undefined;
    if (record && record.status === "pending") {
      Object.assign(form, JSON.parse(JSON.stringify(record.input)) as QuoteInput);
    }
  },
  { immediate: true }
);

const preview = computed(() => calculateQuote(form));

const customerInvalid = computed(() => !form.customer.trim());
const originInvalid = computed(() => !form.origin.address.trim());
const destinationInvalid = computed(() => !form.destination.address.trim());
const canSave = computed(() =>
  !customerInvalid.value && !originInvalid.value && !destinationInvalid.value
);

function reset() {
  Object.assign(form, defaultInput());
  store.cancelEdit();
}

function saveDraft() {
  if (!canSave.value) return;
  if (editing.value) store.updateDraft(editing.value.id, form);
  else store.addDraft(form);
  reset();
}

function confirmNow() {
  if (!canSave.value) return;
  if (editing.value) {
    store.updateDraft(editing.value.id, form);
    store.confirm(editing.value.id);
  } else {
    const record = store.addDraft(form);
    store.confirm(record.id);
  }
  reset();
}
</script>

<template>
  <section class="panel quote-form">
    <h2>{{ editing ? `编辑待确认方案 · 第 ${editing.version} 版` : "搬迁报价录入" }}</h2>

    <div class="form-grid">
      <label class="full">
        客户名称
        <input v-model="form.customer" type="text" placeholder="客户 / 联系人" />
      </label>

      <EndpointFields v-model="form.origin" title="起点" placeholder="如：上海·浦东仓库" />
      <EndpointFields v-model="form.destination" title="终点" placeholder="如：上海·静安新家" />

      <div class="two-col full">
        <label>
          平面搬运距离（米）
          <input v-model.number="form.carryDistance" type="number" min="0" step="1" />
          <span class="hint">超过 {{ FLAT_DISTANCE_LIMIT }} 米加收 50 元</span>
        </label>
        <label>
          大件件数
          <input v-model.number="form.bulkyCount" type="number" min="0" step="1" />
          <span class="hint">每件 80 元（钢琴、保险柜等）</span>
        </label>
      </div>

      <label class="full">
        备注
        <textarea v-model="form.notes" placeholder="现场情况、拆装需求等" />
      </label>
    </div>

    <!-- 实时试算 -->
    <div class="preview">
      <h3>费用试算</h3>
      <div v-for="line in preview.lines" :key="line.key" class="preview-line">
        <div>
          <strong>{{ line.label }}</strong>
          <span class="basis">{{ line.basis }}</span>
        </div>
        <em :class="{ zero: line.amount === 0 }">{{ line.amount }} 元</em>
      </div>
      <div class="preview-total">
        <span>合计</span>
        <strong>{{ preview.total }} 元</strong>
      </div>
    </div>

    <p v-if="!canSave" class="form-warn">请先填写客户名称与起终点地址</p>

    <div class="form-actions">
      <button type="button" :disabled="!canSave" @click="confirmNow">
        {{ editing ? "修改并确认冻结" : "计算并确认冻结" }}
      </button>
      <button type="button" class="secondary" :disabled="!canSave" @click="saveDraft">
        {{ editing ? "保存修改（仍待确认）" : "存为待确认方案" }}
      </button>
      <button type="button" class="ghost" @click="reset">清空</button>
    </div>
  </section>
</template>
