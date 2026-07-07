<script setup>
import { ref } from "vue"
import {
  HomeIcon,
  PencilIcon,
  PencilSquareIcon,
  DocumentDuplicateIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  UsersIcon,
  ClipboardDocumentListIcon,
  XMarkIcon,
  CodeBracketIcon,
  AcademicCapIcon,
  CheckCircleIcon,
  ChartBarIcon,
  ClipboardDocumentCheckIcon,
  CalendarIcon,
  HeartIcon,
} from "@heroicons/vue/24/outline"
import UserMenuItem from "../components/UserMenuItem.vue"
import UserMenuGroup from "../components/UserMenuGroup.vue"

const emit = defineEmits(["select", "close"])

const props = defineProps({
  mobileOpen: { type: Boolean, default: false },
})

const collapsed = ref(false)
const activeItem = ref("dashboard")
const activeChild = ref("")

const menuGroups = [
  {
    label: "ข้อมูลภาพรวม",
    items: [
      { id: "dashboard", icon: HomeIcon, label: "แดชบอร์ด" },
      // { id: "employee_training_records", icon: ChartBarIcon, label: "สรุปข้อมูลการอบรม" },
      // { id: "training-record", icon: CalendarIcon, label: "รายชื่อการอบรม (แต่ละวัน)" },
      // { id: "employee-courses", icon: ClipboardDocumentCheckIcon, label: "สรุปหลักสูตร & พนักงาน" },
    ]
  },
  {
    label: "การจัดการข้อมูล",
    items: [
      { id: "employee-course-registration", icon: ClipboardDocumentListIcon, label: "กิจกรรมการจองฝึกอบรม" },
      { id: "register-course", icon: PencilSquareIcon, label: "ลงทะเบียนหลักสูตร & พนักงาน" },
      { id: "course-list", icon: DocumentDuplicateIcon, label: "รายการหลักสูตร" },
    ]
  },
  {
    label: "การประเมิน",
    items: [
      { id: "training-record", icon: CalendarIcon, label: "บันทืกการประเมิน" },
      { id: "employee-courses", icon: ClipboardDocumentCheckIcon, label: "ประเภทการประเมิน" },
      { id: "employee-training", icon: ClipboardDocumentListIcon, label: "Recerd Accident Re-Training" },
    ]
  },
  {
    label: "สถานะพนักงาน",
    items: [
      { id: "search", icon: CheckCircleIcon, label: "พนักงานที่ได้บัตแล้ว" },
      { id: "register-employee", icon: AcademicCapIcon, label: "ข้อมูลพนักงาน" },
      { id: "review", icon: ClipboardDocumentListIcon, label: "REหลักสูตร" },
      // { id: "employee-one", icon: UserGroupIcon, label: "พนักงานบุคคล" },
      // { id: "health-check", icon: HeartIcon, label: "หมดอายุตรวจสุขภาพ" },
    ]
  },
  {
    label: "ระบบ",
    items: [
      { id: "employee-info", icon: UserGroupIcon, label: "ทะเบียนลูกจ้าง" },
      { id: "system-users", icon: UsersIcon, label: "ผู้ใช้ระบบ" },
      { id: "usage-logs", icon: ClipboardDocumentListIcon, label: "การบันทึกใช้งาน" },
    ]
  },
]

// 为了保持兼容性，把所有菜单项展平
const mainMenu = menuGroups.flatMap(g => g.items)

const findLabels = (itemId, childId) => {
  const item = mainMenu.find((x) => x.id === itemId)
  const itemLabel = item?.label ?? itemId
  const childLabel = childId
    ? item?.children?.find((c) => c.id === childId)?.label ?? childId
    : null
  return { itemLabel, childLabel }
}

const onSelectItem = (id) => {
  activeItem.value = id
  activeChild.value = ""
  const { itemLabel } = findLabels(id, null)
  emit("select", { itemId: id, childId: null, itemLabel, childLabel: null })
  if (props.mobileOpen) emit("close")
}

const onSelectChild = (id) => {
  activeChild.value = id
  const { itemLabel, childLabel } = findLabels(activeItem.value, id)
  emit("select", { itemId: activeItem.value, childId: id, itemLabel, childLabel })
  if (props.mobileOpen) emit("close")
}

const closeMobile = () => {
  emit("close")
}
</script>

<template>
  <div>
    <div
      v-if="props.mobileOpen"
      class="fixed inset-0 bg-black/40 z-40 sm:hidden"
      @click="closeMobile"
    />
    <aside
      :class="[
        'flex flex-col justify-between h-full border-r py-4 px-2 bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 transition-all duration-300 transform-gpu',
        collapsed ? 'w-16' : 'w-60',
        'fixed left-0 top-0 z-50 shadow-xl sm:static sm:z-auto sm:shadow-none',
        props.mobileOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0',
      ]"
    >
    <!-- Logo -->
    <div>
      <div class="flex items-center justify-between px-2 mb-6">
        <div class="flex items-center gap-2">
          <div
            class="w-8 h-8 rounded-full border-2 border-gray-400 dark:border-gray-600 flex items-center justify-center flex-shrink-0"
          >
            <CodeBracketIcon class="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </div>
          <span
            v-if="!collapsed"
            class="font-bold text-sm tracking-tight text-gray-900 dark:text-white"
          >
            TRAINING RECORD
          </span>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="hidden sm:inline-flex p-1.5 rounded-lg border transition text-xs border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800"
            @click="collapsed = !collapsed"
          >
            {{ collapsed ? "›" : "‹›" }}
          </button>
          <button
            type="button"
            class="sm:hidden p-1.5 rounded-lg border transition text-xs border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800"
            aria-label="ปิดเมนู"
            @click="closeMobile"
          >
            <XMarkIcon class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Main Menu -->
      <template v-for="group in menuGroups" :key="group.label">
        <UserMenuGroup 
          :label="group.label" 
          :collapsed="collapsed" 
          :collapsible="group.label === 'สถานะพนักงาน'"
          :default-open="group.label !== 'สถานะพนักงาน'"
        >
          <UserMenuItem
            v-for="item in group.items"
            :key="item.id"
            :icon="item.icon"
            :label="item.label"
            :active="activeItem === item.id"
            :collapsed="collapsed"
            :badge="item.badge"
            @click="onSelectItem(item.id)"
          />
        </UserMenuGroup>
      </template>
    </div>

    <div
      class="border-t pt-3 px-3 border-gray-200 dark:border-gray-800 text-xs text-center text-gray-500 dark:text-gray-400"
    >
      <span v-if="!collapsed">Powered DMIS</span>
    </div>
    </aside>
  </div>
</template>
