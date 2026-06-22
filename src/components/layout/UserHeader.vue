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
const showPendingCoursesModal = ref(false)
const pendingCoursesData = ref([])
const showReCoursesModal = ref(false)
const reCoursesData = ref([])
const showUpcomingReModal = ref(false)
const upcomingReData = ref([])
const showUpcomingHealthCheckModal = ref(false)
const upcomingHealthCheckData = ref([])

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
      customClass: {
        popup: '!p-3 !max-w-md',
        title: '!text-base',
        htmlContainer: '!text-xs',
        confirmButton: '!px-3 !py-1.5 !text-xs',
        icon: '!scale-75'
      }
    })
    return
  }

  if (!auth.user?.id) {
    await Swal.fire({
      icon: 'error',
      title: 'เกิดข้อผิดพลาด',
      text: 'ไม่พบข้อมูลผู้ใช้',
      customClass: {
        popup: '!p-3 !max-w-md',
        title: '!text-base',
        htmlContainer: '!text-xs',
        confirmButton: '!px-3 !py-1.5 !text-xs',
        icon: '!scale-75'
      }
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
      customClass: {
        popup: '!p-3 !max-w-md',
        title: '!text-base',
        htmlContainer: '!text-xs',
        icon: '!scale-75'
      }
    })
  } catch (error) {
    console.error('Error saving profile:', error.message)
    await Swal.fire({
      icon: 'error',
      title: 'เกิดข้อผิดพลาด',
      text: 'ไม่สามารถบันทึกข้อมูลได้',
      customClass: {
        popup: '!p-3 !max-w-md',
        title: '!text-base',
        htmlContainer: '!text-xs',
        confirmButton: '!px-3 !py-1.5 !text-xs',
        icon: '!scale-75'
      }
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
    
    // ดึงข้อมูลจาก employee_training_records (สำหรับแจ้งเตือนอื่นๆ)
    const { data: allRecords, error } = await supabaseInternal
      .from('employee_training_records')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    
    // ดึงข้อมูลจาก employee_course_registration (สำหรับแจ้งเตือนหลักสูตรที่ยังไม่ได้ไปเรียน)
    const { data: registrationRecords, error: registrationError } = await supabaseInternal
      .from('employee_course_registration')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (registrationError) throw registrationError
    
    // ดึงข้อมูลจาก re_courses (สำหรับแจ้งเตือน Re หลักสูตร)
    const { data: reRecords, error: reError } = await supabaseInternal
      .from('re_courses')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (reError) throw reError
    
    // ดึงข้อมูลจาก health_check (สำหรับแจ้งเตือนตรวจสุขภาพ - archived)
    // AND ดึงข้อมูลจาก employee_training_records สำหรับ active health check data
    const { data: archivedHealthCheckRecords, error: archivedHealthCheckError } = await supabaseInternal
      .from('health_check')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (archivedHealthCheckError) throw archivedHealthCheckError
    
    // รวมข้อมูล health check ทั้ง active และ archived
    const tempHealthCheckRecords = [
      ...archivedHealthCheckRecords,
      ...allRecords.filter(record => record.date_health_expiry).map(record => ({
        ...record,
        group_name: record.group,
        tdl_code: record.id_tdl,
        full_name: `${record.first_name || ''} ${record.last_name || ''}`.trim(),
        checkup_date: record.date_health_check,
        checkup_expire_date: record.date_health_expiry
      }))
    ]
    
    // Deduplicate by tdl_code or full_name
    const seenEmployees = new Set()
    const healthCheckRecords = tempHealthCheckRecords.filter(record => {
      const key = record.tdl_code || record.full_name
      if (seenEmployees.has(key)) return false
      seenEmployees.add(key)
      return true
    })
    
    // เก็บข้อมูลสำหรับแสดงใน modal (กรองเฉพาะที่มีหลักสูตร)
    pendingCoursesData.value = registrationRecords.filter(record => record.course_name && record.course_name.trim() !== '')
    
    // เก็บข้อมูลสำหรับแสดงใน modal Re หลักสูตร
    reCoursesData.value = reRecords
    
    // คำนวณวันที่ 2 เดือนจากวันนี้
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const twoMonthsFromNow = new Date(today)
    twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2)
    
    // กรองข้อมูลที่ re_date อยู่ระหว่างวันพรุ่งนี้ถึง 2 เดือนข้างหน้า และ ยังไม่ Re แล้ว
    upcomingReData.value = allRecords.filter(record => {
      if (!record.re_date) return false
      if (record.status_re === 'Reแล้ว') return false
      const reDate = new Date(record.re_date)
      reDate.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      return reDate >= tomorrow && reDate <= twoMonthsFromNow
    })
    
    // กรองข้อมูลที่ checkup_expire_date อยู่ระหว่างวันพรุ่งนี้ถึง 2 เดือนข้างหน้า
    upcomingHealthCheckData.value = healthCheckRecords.filter(record => {
      if (!record.checkup_expire_date) return false
      const expireDate = new Date(record.checkup_expire_date)
      expireDate.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      const isInRange = expireDate >= tomorrow && expireDate <= twoMonthsFromNow
      console.log('Health check record:', record.full_name, 'Expire date:', record.checkup_expire_date, 'In range:', isInRange)
      return isInRange
    })
    console.log('Upcoming health check data:', upcomingHealthCheckData.value)
    
    // คำนวณจำนวนพนักงานที่ใกล้ถึงวัน Re
    const uniqueUpcomingReEmployees = new Set()
    upcomingReData.value.forEach(record => {
      const key = `${record.first_name}-${record.last_name}-${record.id_tdl || 'no-id'}`
      uniqueUpcomingReEmployees.add(key)
    })
    
    // คำนวณจำนวนพนักงานที่ใกล้หมดอายุตรวจสุขภาพ
    const uniqueUpcomingHealthCheckEmployees = new Set()
    upcomingHealthCheckData.value.forEach(record => {
      const key = `${record.full_name}-${record.tdl_code || 'no-id'}`
      uniqueUpcomingHealthCheckEmployees.add(key)
    })
    
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
    
    // คำนวณจำนวนพนักงานที่ยังไม่ได้ไปเรียนหลักสูตร (เฉพาะที่มีหลักสูตร)
    const uniqueRegistrations = new Set()
    pendingCoursesData.value.forEach(record => {
      const key = `${record.full_name}-${record.tdl_code || 'no-id'}`
      uniqueRegistrations.add(key)
    })
    
    // คำนวณจำนวนพนักงานที่ Re แล้ว
    const uniqueReEmployees = new Set()
    reCoursesData.value.forEach(record => {
      const key = `${record.full_name}-${record.tdl_code || 'no-id'}`
      uniqueReEmployees.add(key)
    })
    
    // 构建通知列表
    const todayStr = getTodayDate()
    notifications.value = [
      {
        id: `upcoming-health-check-${todayStr}`,
        text: `พนักงานใกล้หมดอายุตรวจสุขภาพ: ${uniqueUpcomingHealthCheckEmployees.size} คน`,
        time: 'วันนี้',
        type: 'upcoming-health-check',
        count: uniqueUpcomingHealthCheckEmployees.size
      },
      {
        id: `upcoming-re-${todayStr}`,
        text: `พนักงานใกล้ถึงวัน Re: ${uniqueUpcomingReEmployees.size} คน`,
        time: 'วันนี้',
        type: 'upcoming-re',
        count: uniqueUpcomingReEmployees.size
      },
      {
        id: `pending-courses-${todayStr}`,
        text: `พนักงานที่ยังไม่ได้ไปเรียนหลักสูตร: ${uniqueRegistrations.size} คน`,
        time: 'วันนี้',
        type: 'pending-courses',
        count: uniqueRegistrations.size
      },
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

// เปิด modal แสดงรายการหลักสูตรที่ยังไม่ได้ไปเรียน
const openPendingCoursesModal = () => {
  showPendingCoursesModal.value = true
  showNotif.value = false
}

// เปิด modal แสดงรายการ Re หลักสูตร
const openReCoursesModal = () => {
  showReCoursesModal.value = true
  showNotif.value = false
}

// เปิด modal แสดงรายการใกล้ถึงวัน Re
const openUpcomingReModal = () => {
  showUpcomingReModal.value = true
  showNotif.value = false
}

// เปิด modal แสดงรายการใกล้หมดอายุตรวจสุขภาพ
const openUpcomingHealthCheckModal = () => {
  showUpcomingHealthCheckModal.value = true
  showNotif.value = false
}

// 标记通知为已读
const markAsRead = (notification) => {
  readNotifications.value.add(notification.id)
}

// 计算是否有未读通知
const hasUnreadNotifications = computed(() => {
  return notifications.value.some(n => n.count > 0 && !readNotifications.value.has(n.id))
})

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

const getDaysRemaining = (dateStr) => {
  if (!dateStr) return '-'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const targetDate = new Date(dateStr)
  targetDate.setHours(0, 0, 0, 0)
  const diffTime = targetDate - today
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays < 0) {
    return 'หมดอายุ'
  } else if (diffDays === 0) {
    return 'วันนี้'
  } else {
    return `${diffDays} วัน`
  }
}

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
              @click="notif.type === 'pending-courses' ? openPendingCoursesModal() : (notif.type === 're-courses' ? openReCoursesModal() : (notif.type === 'upcoming-re' ? openUpcomingReModal() : (notif.type === 'upcoming-health-check' ? openUpcomingHealthCheckModal() : markAsRead(notif))))"
              class="px-4 py-3 flex items-center justify-between cursor-pointer transition hover:bg-gray-50 dark:hover:bg-gray-800"
              :class="[
                notif.type === 'training' ? 'bg-orange-50/50 dark:bg-orange-900/10' : '',
                notif.type === 'pending-courses' ? 'bg-purple-50/50 dark:bg-purple-900/10' : '',
                notif.type === 're-courses' ? 'bg-green-50/50 dark:bg-green-900/10' : '',
                notif.type === 'upcoming-re' ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : '',
                notif.type === 'upcoming-health-check' ? 'bg-pink-50/50 dark:bg-pink-900/10' : '',
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
                  notif.type === 'pending-courses' ? 'bg-purple-500' :
                  notif.type === 're-courses' ? 'bg-green-500' :
                  notif.type === 'upcoming-re' ? 'bg-yellow-500' :
                  notif.type === 'upcoming-health-check' ? 'bg-pink-500' :
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

  <!-- Modal แสดงรายการ Re หลักสูตร -->
  <div v-if="showReCoursesModal" class="fixed inset-0 z-[9999]">
    <div class="absolute inset-0 bg-black/50" @click="showReCoursesModal = false"></div>
    <div class="absolute inset-4 md:inset-8 bg-white dark:bg-gray-950 rounded-2xl shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">พนักงานที่ Re แล้ว</h2>
        <button
          @click="showReCoursesModal = false"
          class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      
      <!-- Content -->
      <div class="flex-1 p-6 overflow-y-auto" style="height: calc(100% - 80px);">
        <div v-if="reCoursesData.length === 0" class="flex items-center justify-center h-full">
          <p class="text-gray-500 dark:text-gray-400 text-lg">ไม่มีข้อมูล</p>
        </div>
        <div v-else class="h-full overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="sticky top-0 bg-white dark:bg-gray-950 z-10">
              <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">กลุ่ม</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัส TDL</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เพศ</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตำแหน่ง</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">แผนก</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สัญชาติ</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">หลักสูตร</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">วันที่อบรม</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">REหลักสูตร</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ RE</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <tr v-for="record in reCoursesData" :key="record.id" class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors">
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.group_name || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.tdl_code || '-' }}</td>
                <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{{ record.full_name || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.gender || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.position || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.department || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.nationality || '-' }}</td>
                <td class="px-4 py-3">
                  <span :class="[
                    'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                    record.status === 'สำเร็จ' || record.status === 'ผ่านแล้ว' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                    'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
                  ]">
                    {{ record.status || '-' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">{{ record.course_name || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ formatDate(record.training_date) }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ formatDate(record.re_date) }}</td>
                <td class="px-4 py-3">
                  <span class="px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400">
                    {{ record.re_status || 'Reแล้ว' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal แสดงรายการหลักสูตรที่ยังไม่ได้ไปเรียน -->
  <div v-if="showPendingCoursesModal" class="fixed inset-0 z-[9999]">
    <div class="absolute inset-0 bg-black/50" @click="showPendingCoursesModal = false"></div>
    <div class="absolute inset-4 md:inset-8 bg-white dark:bg-gray-950 rounded-2xl shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">พนักงานที่ยังไม่ได้ไปเรียนหลักสูตร</h2>
        <button
          @click="showPendingCoursesModal = false"
          class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      
      <!-- Content -->
      <div class="flex-1 p-6 overflow-y-auto" style="height: calc(100% - 80px);">
        <div v-if="pendingCoursesData.length === 0" class="flex items-center justify-center h-full">
          <p class="text-gray-500 dark:text-gray-400 text-lg">ไม่มีข้อมูล</p>
        </div>
        <div v-else class="h-full overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="sticky top-0 bg-white dark:bg-gray-950 z-10">
              <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">กลุ่ม</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัส TDL</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เพศ</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตำแหน่ง</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">แผนก</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สัญชาติ</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">หลักสูตร</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <tr v-for="record in pendingCoursesData" :key="record.id" class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors">
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.group_name || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.tdl_code || '-' }}</td>
                <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{{ record.full_name || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.gender || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.position || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.department || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.nationality || '-' }}</td>
                <td class="px-4 py-3">
                  <span :class="[
                    'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                    record.status === 'สำเร็จ' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                    record.status === 'กำลังดำเนินการ' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' :
                    'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
                  ]">
                    {{ record.status || '-' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">{{ record.course_name || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal แสดงรายการใกล้ถึงวัน Re -->
  <div v-if="showUpcomingReModal" class="fixed inset-0 z-[9999]">
    <div class="absolute inset-0 bg-black/50" @click="showUpcomingReModal = false"></div>
    <div class="absolute inset-4 md:inset-8 bg-white dark:bg-gray-950 rounded-2xl shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">พนักงานใกล้ถึงวัน Re</h2>
        <button
          @click="showUpcomingReModal = false"
          class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      
      <!-- Content -->
      <div class="flex-1 p-6 overflow-y-auto" style="height: calc(100% - 80px);">
        <div v-if="upcomingReData.length === 0" class="flex items-center justify-center h-full">
          <p class="text-gray-500 dark:text-gray-400 text-lg">ไม่มีข้อมูล</p>
        </div>
        <div v-else class="h-full overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="sticky top-0 bg-white dark:bg-gray-950 z-10">
              <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">กลุ่ม</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัส TDL</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เพศ</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตำแหน่ง</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">แผนก</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สัญชาติ</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">หลักสูตร</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">วันที่อบรม</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">REหลักสูตร</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เหลืออีกกี่วัน</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <tr v-for="record in upcomingReData" :key="record.id" class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors">
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.group || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.id_tdl || '-' }}</td>
                <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{{ record.first_name }} {{ record.last_name }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.gender || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.position || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.department || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.nationality || '-' }}</td>
                <td class="px-4 py-3">
                  <span :class="[
                    'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                    record.status === 'สำเร็จ' || record.status === 'ผ่านแล้ว' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                    'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
                  ]">
                    {{ record.status || '-' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">{{ record.course_name || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ formatDate(record.training_date) }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ formatDate(record.re_date) }}</td>
                <td class="px-4 py-3">
                  <span :class="[
                    'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                    (() => {
                      const days = getDaysRemaining(record.re_date);
                      if (days === 'หมดอายุ') return 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400';
                      if (days === 'วันนี้') return 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400';
                      const dayNum = parseInt(days);
                      if (!isNaN(dayNum) && dayNum <= 30) return 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400';
                      return 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400';
                    })()
                  ]">
                    {{ getDaysRemaining(record.re_date) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal แสดงรายการใกล้หมดอายุตรวจสุขภาพ -->
  <div v-if="showUpcomingHealthCheckModal" class="fixed inset-0 z-[9999]">
    <div class="absolute inset-0 bg-black/50" @click="showUpcomingHealthCheckModal = false"></div>
    <div class="absolute inset-4 md:inset-8 bg-white dark:bg-gray-950 rounded-2xl shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">พนักงานใกล้หมดอายุตรวจสุขภาพ</h2>
        <button
          @click="showUpcomingHealthCheckModal = false"
          class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      
      <!-- Content -->
      <div class="flex-1 p-6 overflow-y-auto" style="height: calc(100% - 80px);">
        <div v-if="upcomingHealthCheckData.length === 0" class="flex items-center justify-center h-full">
          <p class="text-gray-500 dark:text-gray-400 text-lg">ไม่มีข้อมูล</p>
        </div>
        <div v-else class="h-full overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="sticky top-0 bg-white dark:bg-gray-950 z-10">
              <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">กลุ่ม</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัส TDL</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เพศ</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตำแหน่ง</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">แผนก</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สัญชาติ</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">วันที่ตรวจสุขภาพ</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">วันที่หมดอายุ</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เหลืออีกกี่วัน</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <tr v-for="record in upcomingHealthCheckData" :key="record.id" class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors">
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.group_name || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.tdl_code || '-' }}</td>
                <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{{ record.full_name || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.gender || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.position || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.department || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.nationality || '-' }}</td>
                <td class="px-4 py-3">
                  <span :class="[
                    'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                    record.status === 'สำเร็จ' || record.status === 'ผ่านแล้ว' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                    'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
                  ]">
                    {{ record.status || '-' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ formatDate(record.checkup_date) }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ formatDate(record.checkup_expire_date) }}</td>
                <td class="px-4 py-3">
                  <span :class="[
                    'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                    (() => {
                      const days = getDaysRemaining(record.checkup_expire_date);
                      if (days === 'หมดอายุ') return 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400';
                      if (days === 'วันนี้') return 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400';
                      const dayNum = parseInt(days);
                      if (!isNaN(dayNum) && dayNum <= 30) return 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400';
                      return 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400';
                    })()
                  ]">
                    {{ getDaysRemaining(record.checkup_expire_date) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
