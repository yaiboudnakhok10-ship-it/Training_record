<script setup>
import { ref } from "vue"
import { ChevronDownIcon } from "@heroicons/vue/24/outline"

const props = defineProps({
  label: String,
  collapsed: { type: Boolean, default: false },
  collapsible: { type: Boolean, default: false },
  defaultOpen: { type: Boolean, default: true },
})

const open = ref(props.defaultOpen)
</script>

<template>
  <div class="mb-4">
    <div
      v-if="!collapsed && collapsible"
      @click="open = !open"
      class="flex items-center justify-between px-3 mb-2 cursor-pointer"
    >
      <p
        class="text-xs text-gray-400 dark:text-gray-600 uppercase font-semibold tracking-widest"
      >
        {{ label }}
      </p>
      <ChevronDownIcon
        :class="['w-4 h-4 text-gray-400 dark:text-gray-600 transition-transform', open ? 'rotate-180' : '']"
      />
    </div>
    <p
      v-else-if="!collapsed"
      class="text-xs text-gray-400 dark:text-gray-600 uppercase font-semibold px-3 mb-2 tracking-widest"
    >
      {{ label }}
    </p>
    <ul v-if="!collapsible || open" class="space-y-1">
      <slot />
    </ul>
  </div>
</template>