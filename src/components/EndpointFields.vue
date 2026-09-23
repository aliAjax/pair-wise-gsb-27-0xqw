<script setup lang="ts">
/** 一端（起点/终点）的地址、楼层、电梯情况录入 */
import { walkingFloors, elevatorText, type Endpoint } from "../pricing/rules";

defineProps<{
  title: string;
  placeholder?: string;
}>();

const model = defineModel<Endpoint>({ required: true });

const elevatorOptions: Array<{ value: Endpoint["elevator"]; label: string }> = [
  { value: "elevator", label: elevatorText("elevator") },
  { value: "partial", label: elevatorText("partial") },
  { value: "none", label: elevatorText("none") }
];
</script>

<template>
  <div class="endpoint">
    <label class="full">
      {{ title }}地址
      <input v-model="model.address" type="text" :placeholder="placeholder" />
    </label>

    <label>
      入户楼层
      <input v-model.number="model.floor" type="number" min="1" step="1" />
    </label>

    <label>
      电梯情况
      <select v-model="model.elevator">
        <option v-for="opt in elevatorOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
    </label>

    <label v-if="model.elevator === 'partial'" class="full">
      实际步行楼层（电梯停运层到入户层之间需要爬的层数，只算这些楼层）
      <input v-model.number="model.walkFloors" type="number" min="0" step="1" />
    </label>
    <p v-else-if="model.elevator === 'none'" class="hint full">
      无电梯：按 {{ walkingFloors(model) }} 层 × 20 元/层计楼层费
    </p>
    <p v-else class="hint full ok">电梯直达入户层，楼层费免收</p>
  </div>
</template>
