<script setup>
import { ref } from "vue"
import { ChevronDownIcon } from "@heroicons/vue/24/outline"

const props = defineProps({
  icon: [Object, Function],
  label: String,
  active: { type: Boolean, default: false },
  collapsed: { type: Boolean, default: false },
  children: { type: Array, default: null },
  badge: { type: Number, default: null },
})

const emit = defineEmits(["click"])
const open = ref(false)

const toggle = () => {
  if (props.children) open.value = !open.value
  emit("click")
}
</script>

<template>
  <div>
    <!-- Tooltip wrapper -->
    <div class="relative group">
      <li
        @click="toggle"
        :class="[
          'flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 select-none',
          active && !children
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold'
            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white',
        ]"
      >
        <component :is="icon" class="w-5 h-5 flex-shrink-0" />
        <span
          v-if="!collapsed"
          class="text-[14px] leading-snug flex-1"
          v-html="label"
        ></span>
        <span
          v-if="badge && !collapsed"
          class="ml-auto bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
        >
          {{ badge }}
        </span>
        <ChevronDownIcon
          v-if="children && !collapsed"
          :class="['w-4 h-4 ml-auto transition-transform', open ? 'rotate-180' : '']"
        />
      </li>

      <!-- Tooltip เมื่อ collapsed -->
      <div
        v-if="collapsed"
        class="absolute left-14 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-lg"
      >
        {{ label }}
      </div>
    </div>

    <!-- Submenu -->
    <ul
      v-if="children && open && !collapsed"
      class="ml-8 mt-1 space-y-1 border-l border-gray-200 dark:border-gray-700 pl-3"
    >
      <li
        v-for="child in children"
        :key="child.id"
        @click="$emit('child-click', child.id)"
        :class="[
          'text-sm px-3 py-2 rounded-lg cursor-pointer transition-all',
          child.active
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium'
            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white',
        ]"
      >
        {{ child.label }}
      </li>
    </ul>
  </div>
</template>
