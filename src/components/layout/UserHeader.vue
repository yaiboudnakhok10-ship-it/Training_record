<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import {
  ArrowRightStartOnRectangleIcon,
  Bars3Icon,
  BellIcon,
  EyeIcon,
  PencilSquareIcon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/vue/24/outline"
import { useAuth } from "../../stores/auth"
import { supabaseInternal } from "../../server/supabase"
import Swal from "sweetalert2"

const emit = defineEmits(["logout", "toggle-sidebar"])
const auth = useAuth()

const props = defineProps({
  title: { type: String, default: "Dashboard" },
})

// ใช้ computed เพื่ออ่านข้อมูลจาก auth store โดยตรง
const currentUser = computed(() => {
  console.log('auth.user value:', auth.user)
  return {
    fullName: auth.user?.fullname || auth.user?.fullName || "ไม่พบชื่อ",
    employeeId: auth.user?.emp_code || auth.user?.employeeId || "-",
    role: auth.user?.role || "-",
    position: auth.user?.position || "-",
  }
})

const showNotif = ref(false)
const profileOpen = ref(false)
const isProfileSidebarOpen = ref(false)
const showPassword = ref(false)
const savingProfile = ref(false)
const notificationsRef = ref(null)
const profileRef = ref(null)

const profileForm = ref({
  fullname: '',
  password: '',
})

const openProfileSidebar = () => {
  profileForm.value = {
    fullname: auth.user?.fullname || auth.user?.fullName || '',
    password: '',
  }
  showPassword.value = false
  isProfileSidebarOpen.value = true
  closeAll()
}

const closeProfileSidebar = () => {
  isProfileSidebarOpen.value = false
  profileForm.value = { fullname: '', password: '' }
  showPassword.value = false
}

const saveProfile = async () => {
  if (!profileForm.value.fullname.trim()) {
    await Swal.fire({
      icon: 'warning',
      title: 'ข้อมูลไม่ครบถ้วน',
      text: 'กรุณากรอกชื่อ-นามสกุล',
    })
    return
  }

  if (!auth.user?.id) {
    await Swal.fire({
      icon: 'error',
      title: 'เกิดข้อผิดพลาด',
      text: 'ไม่พบข้อมูลผู้ใช้',
    })
    return
  }

  try {
    savingProfile.value = true

    const updateData = {
      fullname: profileForm.value.fullname.trim(),
      updated_at: new Date().toISOString(),
    }

    if (profileForm.value.password.trim()) {
      updateData.password = profileForm.value.password.trim()
    }

    const { error } = await supabaseInternal
      .from('system_users')
      .update(updateData)
      .eq('id', auth.user.id)

    if (error) throw error

    auth.user = {
      ...auth.user,
      fullname: updateData.fullname,
      fullName: updateData.fullname,
    }

    closeProfileSidebar()

    await Swal.fire({
      icon: 'success',
      title: 'บันทึกข้อมูลสำเร็จ',
      timer: 1200,
      showConfirmButton: false,
    })
  } catch (error) {
    console.error('Error saving profile:', error.message)
    await Swal.fire({
      icon: 'error',
      title: 'เกิดข้อผิดพลาด',
      text: 'ไม่สามารถบันทึกข้อมูลได้',
    })
  } finally {
    savingProfile.value = false
  }
}

// 通知数据
const notifications = ref([])
const loadingNotifs = ref(false)
const readNotifications = ref(new Set()) // 已读通知的ID集合

// 获取明天的日期
const getTomorrowDate = () => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toISOString().split('T')[0]
}

// 获取今天的日期
const getTodayDate = () => {
  const today = new Date()
  return today.toISOString().split('T')[0]
}

// 辅助函数：获取 YYYY-MM-DD 格式日期
const getDateString = (dateStr) => {
  if (!dateStr) return null
  
  // 如果已经是 YYYY-MM-DD 格式，直接返回
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr
  }
  
  // 如果是 ISO 格式，提取日期部分
  if (typeof dateStr === 'string' && dateStr.includes('T')) {
    return dateStr.split('T')[0]
  }
  
  // 尝试解析日期
  try {
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  } catch (e) {
    console.error('Date parse error:', e)
  }
  
  return null
}

// 辅助函数：检查日期是否相等
const isDateEqual = (record, targetDate) => {
  const recordDateStr = getDateString(record.training_date) || getDateString(record.created_at)
  if (!recordDateStr) return false
  const recordDate = new Date(recordDateStr)
  recordDate.setHours(0, 0, 0, 0)
  return recordDate.getTime() === targetDate.getTime()
}

// 加载通知数据
const loadNotifications = async () => {
  try {
    loadingNotifs.value = true
    
    const { data: allRecords, error } = await supabaseInternal
      .from('employee_training_records')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    
    // 计算明天参加培训的人数
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    
    const tomorrowRecords = allRecords.filter(record => isDateEqual(record, tomorrow))
    const uniqueTomorrowEmployees = new Set()
    tomorrowRecords.forEach(record => {
      const key = `${record.first_name}-${record.last_name}-${record.id_tdl || 'no-id'}`
      uniqueTomorrowEmployees.add(key)
    })
    
    // 计算不同状态的人数
    const passedCount = allRecords.filter(r => r.status === 'ผ่าน').length
    const notPassedCount = allRecords.filter(r => r.status === 'ไม่ผ่าน').length
    const notCertCount = allRecords.filter(r => !r.status || r.status === '').length
    
    // 构建通知列表
    const todayStr = getTodayDate()
    notifications.value = [
      {
        id: `training-${todayStr}`,
        text: `พนักงานเรียนวันพรุ่งนี้: ${uniqueTomorrowEmployees.size} คน`,
        time: 'วันนี้',
        type: 'training',
        count: uniqueTomorrowEmployees.size
      },
      {
        id: `passed-${todayStr}`,
        text: `พนักงานที่ผ่าน: ${passedCount} คน`,
        time: 'วันนี้',
        type: 'passed',
        count: passedCount
      },
      {
        id: `not-passed-${todayStr}`,
        text: `พนักงานที่ไม่ผ่าน: ${notPassedCount} คน`,
        time: 'วันนี้',
        type: 'not-passed',
        count: notPassedCount
      },
      {
        id: `not-cert-${todayStr}`,
        text: `พนักงานที่ยังไม่ได้รับบัต: ${notCertCount} คน`,
        time: 'วันนี้',
        type: 'not-cert',
        count: notCertCount
      }
    ]
    
  } catch (error) {
    console.error('Error loading notifications:', error)
  } finally {
    loadingNotifs.value = false
  }
}

// 标记通知为已读
const markAsRead = (notification) => {
  readNotifications.value.add(notification.id)
}

// 计算是否有未读通知
const hasUnreadNotifications = computed(() => {
  return notifications.value.some(n => n.count > 0 && !readNotifications.value.has(n.id))
})

const now = ref(new Date())
const isCompact = ref(window.matchMedia("(max-width: 640px)").matches)

// แสดงข้อมูล user ใน console เพื่อ debug
console.log('UserHeader received user prop:', props.user)
const dateTimeText = computed(() => {
  const formatter = new Intl.DateTimeFormat(
    "th-TH",
    isCompact.value
      ? {
          year: "2-digit",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }
      : {
          year: "numeric",
          month: "long",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }
  )
  return formatter.format(now.value)
})

function toggleNotifications() {
  profileOpen.value = false
  showNotif.value = !showNotif.value
  if (showNotif.value) {
    loadNotifications()
  }
}

function toggleProfile() {
  showNotif.value = false
  profileOpen.value = !profileOpen.value
}

function closeAll() {
  showNotif.value = false
  profileOpen.value = false
}



function onPointerDown(event) {
  const notiEl = notificationsRef.value
  if (
    showNotif.value &&
    notiEl instanceof HTMLElement &&
    !notiEl.contains(event.target)
  ) {
    showNotif.value = false
  }

  const profileEl = profileRef.value
  if (
    profileOpen.value &&
    profileEl instanceof HTMLElement &&
    !profileEl.contains(event.target)
  ) {
    profileOpen.value = false
  }
}

let timerId
const onResize = () => {
  isCompact.value = window.matchMedia("(max-width: 640px)").matches
}

// 定时刷新通知（每小时刷新一次）
let notifTimerId

onMounted(() => {
  timerId = window.setInterval(() => {
    now.value = new Date()
  }, 1000)
  window.addEventListener("resize", onResize)
  window.addEventListener("pointerdown", onPointerDown)
  
  // 初始化加载通知
  loadNotifications()
  
  // 每小时刷新一次通知数据
  notifTimerId = window.setInterval(() => {
    loadNotifications()
  }, 3600000)
})

onBeforeUnmount(() => {
  window.clearInterval(timerId)
  window.clearInterval(notifTimerId)
  window.removeEventListener("resize", onResize)
  window.removeEventListener("pointerdown", onPointerDown)
})
</script>

<template>
  <header
    class="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 border-b bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"
  >
    <div class="flex items-center gap-2 min-w-0">
      <button
        type="button"
        class="sm:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700 transition"
        @click="emit('toggle-sidebar')"
        aria-label="เมนู"
      >
        <Bars3Icon class="w-5 h-5" />
      </button>
      <h1
        class="font-semibold text-base sm:text-lg text-gray-900 dark:text-white truncate"
      >
        {{ title }}
      </h1>
    </div>

    <div class="flex items-center gap-2 sm:gap-3 flex-shrink-0">
      <div
        class="rounded-lg px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200 whitespace-nowrap"
      >
        {{ dateTimeText }}
      </div>



      <div ref="notificationsRef" class="relative">
        <button
          type="button"
          @click="toggleNotifications"
          class="relative rounded-lg p-1.5 transition text-gray-600 hover:text-gray-900 bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:bg-gray-800"
        >
          <BellIcon class="w-5 h-5" />
          <!-- 显示有通知的标记 -->
          <span 
            v-if="hasUnreadNotifications"
            class="absolute top-0.5 right-0.5 w-2 h-2 bg-blue-500 rounded-full" 
          />
        </button>

        <div
          v-if="showNotif"
          class="absolute right-0 mt-2 w-72 rounded-xl shadow-xl border z-50 overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
        >
          <div
            class="px-4 py-3 font-semibold text-sm border-b text-gray-900 dark:text-white border-gray-200 dark:border-gray-700"
          >
            แจ้งเตือนการอบรม
          </div>
          
          <div v-if="loadingNotifs" class="px-4 py-6 text-center">
            <div class="animate-pulse text-gray-400">กำลังโหลด...</div>
          </div>
          
          <div v-else-if="notifications.filter(n => n.count > 0).length === 0" class="px-4 py-6 text-center">
            <p class="text-gray-500 dark:text-gray-400">ไม่มีแจ้งเตือน</p>
          </div>
          
          <ul v-else>
            <li
              v-for="notif in notifications.filter(n => n.count > 0)"
              :key="notif.id"
              @click="markAsRead(notif)"
              class="px-4 py-3 flex items-center justify-between cursor-pointer transition hover:bg-gray-50 dark:hover:bg-gray-800"
              :class="[
                notif.type === 'training' ? 'bg-orange-50/50 dark:bg-orange-900/10' : '',
                readNotifications.has(notif.id) ? 'opacity-60' : ''
              ]"
            >
              <div class="flex items-center gap-3">
                <span 
                  v-if="!readNotifications.has(notif.id)"
                  class="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"
                />
                <div class="flex flex-col gap-0.5">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {{ notif.text }}
                  </span>
                  <span class="text-xs text-gray-500 dark:text-gray-400">{{ notif.time }}</span>
                </div>
              </div>
              <span 
                class="px-2.5 py-1 text-xs font-bold rounded-full text-white"
                :class="
                  notif.type === 'training' ? 'bg-orange-500' :
                  notif.type === 'passed' ? 'bg-green-500' :
                  notif.type === 'not-passed' ? 'bg-red-500' :
                  'bg-yellow-500'
                "
              >
                {{ notif.count }}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div ref="profileRef" class="relative">
        <button
          type="button"
          class="flex items-center justify-center w-9 h-9 rounded-full bg-white text-gray-800 hover:bg-gray-50 border border-gray-200 transition dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:border-gray-700"
          @click="toggleProfile"
          aria-haspopup="menu"
          :aria-expanded="profileOpen"
        >
          <UserCircleIcon
            class="w-7 h-7 text-gray-900 dark:text-white"
            stroke-width="2.25"
          />
        </button>

        <div
          v-if="profileOpen"
          class="absolute right-0 mt-2 w-80 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-lg p-0 z-50 overflow-hidden"
          role="menu"
        >
          <!-- Header ส่วนบน (สีขาว) -->
          <div class="bg-white dark:bg-gray-900 p-6 text-center border-b border-gray-200 dark:border-gray-700">
            <div class="mx-auto w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
              <UserCircleIcon class="w-12 h-12 text-gray-600 dark:text-gray-300" stroke-width="2" />
            </div>
            <p class="text-lg font-bold text-gray-900 dark:text-white">{{ currentUser.fullName }}</p>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ currentUser.employeeId }}</p>
          </div>

          <!-- ข้อมูลเพิ่มเติม -->
          <div class="p-4 border-b border-gray-200 dark:border-gray-700">
            <div class="text-center">
              <p class="text-xs text-gray-500 uppercase tracking-wider">ตำแหน่ง</p>
              <p class="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-1">{{ currentUser.position }}</p>
              <p class="text-xs text-gray-500 mt-2">สิทธิ์: {{ currentUser.role }}</p>
            </div>
          </div>

          <!-- เมนูตัวเลือก -->
          <div class="p-4 space-y-2">
            <button
              type="button"
              class="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm transition"
              @click="openProfileSidebar"
            >
              <PencilSquareIcon class="w-5 h-5" />
              แก้ไขข้อมูลส่วนตัว
            </button>
            <button
              type="button"
              class="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60 text-red-700 dark:text-red-300 text-sm transition"
              @click="emit('logout'); closeAll()"
            >
              <ArrowRightStartOnRectangleIcon class="w-5 h-5" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>

  <div v-if="isProfileSidebarOpen" class="fixed inset-0 z-[60]">
    <div class="absolute inset-0 bg-black/50" @click="closeProfileSidebar"></div>
    <div class="absolute right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-gray-950 shadow-xl overflow-y-auto">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-950 z-10">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">แก้ไขข้อมูลส่วนตัว</h3>
        <button
          type="button"
          @click="closeProfileSidebar"
          class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900"
        >
          <XMarkIcon class="h-6 w-6" />
        </button>
      </div>

      <div class="p-6 space-y-5">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รหัสพนักงาน</label>
          <input
            :value="currentUser.employeeId"
            type="text"
            readonly
            class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900 text-sm"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ชื่อ-นามสกุล <span class="text-red-500">*</span></label>
          <input
            v-model="profileForm.fullname"
            type="text"
            class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            placeholder="กรอกชื่อ-นามสกุล"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ตำแหน่ง</label>
          <input
            :value="currentUser.position"
            type="text"
            readonly
            class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900 text-sm"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            รหัสผ่านใหม่
            <span class="text-gray-400 font-normal">(เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน)</span>
          </label>
          <div class="relative">
            <input
              v-model="profileForm.password"
              :type="showPassword ? 'text' : 'password'"
              class="w-full px-4 py-3 pr-12 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="กรอกรหัสผ่านใหม่"
            />
            <button
              type="button"
              @click="showPassword = !showPassword"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <EyeIcon class="h-5 w-5" :class="{ 'text-indigo-500': showPassword }" />
            </button>
          </div>
        </div>
      </div>

      <div class="p-6 border-t border-gray-200 dark:border-gray-800">
        <div class="flex items-center gap-3">
          <button
            type="button"
            @click="closeProfileSidebar"
            class="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-colors"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            :disabled="savingProfile"
            @click="saveProfile"
            class="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
          >
            {{ savingProfile ? 'กำลังบันทึก...' : 'บันทึก' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
