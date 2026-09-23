<script setup lang="ts">
import QuoteForm from "./components/QuoteForm.vue";
import QuoteList from "./components/QuoteList.vue";
import { useQuoteStore } from "./storage/quoteStore";

const store = useQuoteStore();
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">搬迁行业前端报价闭环</p>
          <h1>搬迁报价台</h1>
          <p class="subtitle">
            录入起终点、楼层、电梯、搬运距离与大件件数，系统按统一规则自动试算；
            确认后冻结总额与明细，改条件另建待确认版本，原报价始终可查。
          </p>
        </div>
        <div class="stack">
          <span class="tag">楼层费 20 元/层</span>
          <span class="tag">超 30 米 +50 元</span>
          <span class="tag">大件 80 元/件</span>
          <span class="tag">有电梯免收楼层费</span>
        </div>
      </header>

      <section class="metrics">
        <article class="metric">
          <span>方案总数</span>
          <strong>{{ store.records.length }}</strong>
        </article>
        <article class="metric">
          <span>待确认方案</span>
          <strong>{{ store.pendingCount }}</strong>
        </article>
        <article class="metric">
          <span>已确认冻结报价</span>
          <strong>{{ store.confirmedCount }}</strong>
        </article>
      </section>

      <section class="workspace">
        <QuoteForm />
        <QuoteList />
      </section>
    </div>
  </main>
</template>
