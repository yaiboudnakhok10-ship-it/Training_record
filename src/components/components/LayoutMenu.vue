<script setup>
import { computed, ref, onMounted, watch } from "vue"
import { useRouter, useRoute, RouterView } from "vue-router"
import Swal from "sweetalert2"
import { useAuth } from "../../stores/auth"
import { supabaseInternal } from "../../server/supabase"
import UserSidebar from "../layout/UserSidebar.vue"
import UserHeader from "../layout/UserHeader.vue"

const auth = useAuth()
const router = useRouter()
const route = useRoute()

// debug
console.log('LayoutMenu auth.user:', auth.user)
const sidebarOpen = ref(false)

const selection = ref({
  itemId: "dashboard",
  childId: null,
  itemLabel: "Dashboard",
  childLabel: null,
})

// Update selection based on current route
const updateSelectionFromRoute = () => {
  if (route.name) {
    selection.value.itemId = route.name
  }
}

onMounted(updateSelectionFromRoute)
watch(() => route.name, updateSelectionFromRoute)

const headerUser = computed(() => ({
  fullName: auth.user.value?.fullname ?? auth.user.value?.fullName ?? "-",
  employeeId: auth.user.value?.emp_code ?? auth.user.value?.employeeId ?? "-",
  role: auth.user.value?.role ?? "-",
  position: auth.user.value?.position ?? "-",
}))

const pageTitle = computed(() => {
  const base = selection.value.itemLabel ?? selection.value.itemId
  const child = selection.value.childLabel ?? selection.value.childId
  if (child) return `${base} / ${child}`
  return base
})

const onSelect = (payload) => {
  if (!payload || typeof payload !== "object") return
  selection.value = {
    itemId: payload.itemId ?? selection.value.itemId,
    childId: payload.childId ?? null,
    itemLabel: payload.itemLabel ?? selection.value.itemLabel,
    childLabel: payload.childLabel ?? null,
  }
  sidebarOpen.value = false
  
  // Navigate to the selected route
  if (payload.itemId) {
    router.push({ name: payload.itemId }).catch(() => {
      console.warn(`Route ${payload.itemId} not found`)
    })
  }
}

const onLogout = async () => {
  const result = await Swal.fire({
    icon: "question",
    title: "ต้องการออกจากระบบหรือไม่?",
    showCancelButton: true,
    confirmButtonText: "ออกจากระบบ",
    cancelButtonText: "ยกเลิก",
    customClass: {
      popup: '!p-3 !max-w-md',
      title: '!text-base',
      htmlContainer: '!text-xs',
      confirmButton: '!px-3 !py-1.5 !text-xs',
      cancelButton: '!px-3 !py-1.5 !text-xs',
      icon: '!scale-75'
    }
  })
  if (!result.isConfirmed) return

  // 获取用户 IP 地址
  let userIp = null
  try {
    const ipResponse = await fetch('https://api.ipify.org?format=json')
    const ipData = await ipResponse.json()
    userIp = ipData.ip
    console.log('Got user IP:', userIp)
    
    // 验证 IP 地址格式是否有效
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
    if (!ipRegex.test(userIp)) {
      console.log('Invalid IP format, using null')
      userIp = null
    }
  } catch (ipError) {
    console.log('Could not get IP address, using null')
  }
  
  // บันทึก log การออกจากระบบ
  if (auth.user?.id) {
    try {
      console.log('Saving logout log for user:', auth.user.id)
      const logEntry = {
        system_user_id: auth.user.id,
        action: 'logout',
        user_agent: navigator.userAgent,
        ip_address: userIp,
        view_mode: 'web',
        old_value: {
          logout_at: new Date().toISOString()
        }
      }
      console.log('Log entry:', logEntry)
      
      const { data: logData, error: logError } = await supabaseInternal
        .from('user_logs')
        .insert(logEntry)
        .select()
      
      if (logError) {
        console.error('Error saving logout log:', logError)
      } else {
        console.log('Logout log saved successfully:', logData)
      }
    } catch (logError) {
      console.error('Error logging logout:', logError)
    }
  }

  auth.logout()
  await Swal.fire({
    icon: "success",
    title: "ออกจากระบบแล้ว",
    timer: 800,
    showConfirmButton: false,
    customClass: {
      popup: '!p-3 !max-w-md',
      title: '!text-base',
      htmlContainer: '!text-xs',
      icon: '!scale-75'
    }
  })
  router.replace({ name: "login" })
}
</script>

<template>
  <div
    class="flex h-full bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400"
  >
    <UserSidebar
      :mobileOpen="sidebarOpen"
      @close="sidebarOpen = false"
      @select="onSelect"
    />
    <div class="flex flex-col flex-1 min-h-0 overflow-hidden">
      <UserHeader
        :title="pageTitle"
        :user="headerUser"
        @toggle-sidebar="sidebarOpen = true"
        @logout="onLogout"
      />
      <main class="flex-1 overflow-auto p-4 sm:p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
