<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabaseInternal } from '../server/supabase'
import { MagnifyingGlassIcon } from '@heroicons/vue/24/outline'

const logs = ref([])
const loading = ref(true)
const searchQuery = ref('')

const fetchLogs = async () => {
  try {
    loading.value = true
    const { data, error } = await supabaseInternal
      .from('user_logs')
      .select(`
        *,
        system_users (
          id,
          emp_code,
          fullname
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    logs.value = data
  } catch (error) {
    console.error('Error fetching logs:', error)
  } finally {
    loading.value = false
  }
}

const formatThaiDate = (dateStr) => {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (e) {
    return dateStr
  }
}

const filteredLogs = computed(() => {
  if (!searchQuery.value) return logs.value

  const query = searchQuery.value.toLowerCase()
  return logs.value.filter(log => {
    const userName = log.system_users?.fullname?.toLowerCase() || ''
    const userCode = log.system_users?.emp_code?.toLowerCase() || ''
    const action = log.action?.toLowerCase() || ''
    const userAgent = log.user_agent?.toLowerCase() || ''

    return userName.includes(query) ||
           userCode.includes(query) ||
           action.includes(query) ||
           userAgent.includes(query)
  })
})

onMounted(() => {
  fetchLogs()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">การบันทึกใช้งาน</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          บันทึกการใช้งานระบบทั้งหมด
        </p>
      </div>
      <div class="text-sm text-gray-500 dark:text-gray-400">
        รายการทั้งหมด: <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ filteredLogs.length }}</span> รายการ
      </div>
    </div>

    <!-- Search -->
    <div class="relative max-w-md w-full">
      <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <MagnifyingGlassIcon class="h-5 w-5 text-gray-400" />
      </span>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="ค้นหาชื่อผู้ใช้, รหัสพนักงาน, การกระทำ..."
        class="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
      />
    </div>

    <!-- Table Container -->
    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                ผู้ใช้งาน
              </th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                การกระทำ
              </th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                รายละเอียด
              </th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                IP Address
              </th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                User Agent
              </th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                เวลา
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <template v-if="loading">
              <tr v-for="i in 5" :key="i" class="animate-pulse">
                <td colspan="6" class="px-6 py-4">
                  <div class="h-10 bg-gray-100 dark:bg-gray-900 rounded-lg w-full"></div>
                </td>
              </tr>
            </template>
            <tr v-else-if="filteredLogs.length === 0" class="text-center">
              <td colspan="6" class="px-6 py-12 text-gray-500 dark:text-gray-400 italic">
                ไม่มีรายการบันทึก
              </td>
            </tr>
            <template v-else>
              <tr
                v-for="log in filteredLogs"
                :key="log.id"
                class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors"
              >
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-medium text-gray-900 dark:text-white">
                    {{ log.system_users?.fullname || '-' }}
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    {{ log.system_users?.emp_code || '-' }}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span
                    class="px-2.5 py-1 rounded-full text-xs font-bold uppercase"
                    :class="[
                      log.action === 'login' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                      log.action === 'logout' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' :
                      'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
                    ]"
                  >
                    {{ log.action || '-' }}
                  </span>
                </td>
                <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                  {{ log.old_value ? JSON.stringify(log.old_value) : '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ log.ip_address || '-' }}
                </td>
                <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-md truncate">
                  {{ log.user_agent || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ formatThaiDate(log.created_at) }}
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
