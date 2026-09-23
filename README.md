# 搬迁报价台

- 行业：搬迁
- 技术栈：Vue3、Vite、TypeScript、Pinia
- 启动：`npm install && npm run dev`
- 构建：`npm run build`

客服录入起终点、楼层、电梯情况、平面搬运距离与大件件数，系统按统一规则自动报价，避免手工试算出错。数据保存在浏览器 localStorage。

## 费用规则

| 项目 | 规则 |
| --- | --- |
| 楼层费 | 有电梯且直达入户层：免收；电梯不到入户层：只按实际步行楼层计；无电梯：每层 20 元（起、终点分别计算） |
| 平面搬运费 | 距离超过 30 米一次性加收 50 元，未超过不收 |
| 大件搬运费 | 每件 80 元 |

## 报价流转

- 方案分“待确认”和“已确认”两种状态。
- 确认后冻结**明细与总额快照**，记录不可再修改。
- 对已确认报价改条件：在列表点“改条件·另建待确认版本”，生成同组新方案（第 2 版、第 3 版……），原报价原封不动、随时可查。
- 旧版“物流费用试算器”的记录（`hxwlfront-13-freight`）首次打开时只读迁移；字段缺失、类型不对也能补默认值正常打开，卡片带“旧记录”标记。

## 分层结构（规则 / 存储 / 页面分离）

```
src/
  pricing/rules.ts           纯费用规则：电梯/楼层、距离、大件 → 明细+总额，可独立单测
  storage/types.ts           报价记录数据模型
  storage/migration.ts       旧记录容错迁移、localStorage 读写、明细汇总
  storage/quoteStore.ts      Pinia：保存、确认冻结、改版另建、删除、编辑态
  components/EndpointFields.vue  起/终点录入（地址、楼层、电梯、步行楼层）
  components/QuoteForm.vue       录入 + 实时试算 + 保存/确认
  components/QuoteList.vue       列表、明细查询、确认/改版/删除
  App.vue                    页面组装
```
