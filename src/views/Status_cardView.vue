<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { supabaseInternal } from '../server/supabase'
import { MagnifyingGlassIcon } from '@heroicons/vue/24/outline'

const route = useRoute()

const records = ref([])
const loading = ref(true)
const searchQuery = ref('')
const statusFilter = ref('all')

// Set default filter based on route name
const setDefaultFilter = () => {
  if (route.name === 'search') {
    statusFilter.value = 'ได้รับแล้ว'
  } else {
    statusFilter.value = 'all'
  }
}

// Call on mount and when route changes
onMounted(() => {
  setDefaultFilter()
  fetchRecords()
})

watch(() => route.name, () => {
  setDefaultFilter()
})

const pageTitle = computed(() => {
  if (route.name === 'search') {
    return 'พนักงานที่ได้บัตแล้ว'
  } else if (route.name === 'register-employee') {
    return 'พนักงานที่จบทุกหลักสูตร'
  }
  return 'รายการพนักงานสถานะบัตร'
})

const pageDescription = computed(() => {
  if (route.name === 'search') {
    return 'แสดงข้อมูลพนักงานที่ได้รับบัตรแล้ว'
  } else if (route.name === 'register-employee') {
    return 'แสดงข้อมูลพนักงานที่จบทุกหลักสูตร'
  }
  return 'แสดงข้อมูลพนักงานและสถานะการรับบัตร'
})

const fetchRecords = async () => {
  try {
    loading.value = true
    const { data, error } = await supabaseInternal
      .from('employee_training_records')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    
    // จัดกลุ่มข้อมูลตามพนักงาน
    const grouped = {}
    data.forEach(record => {
      const key = `${record.first_name}-${record.last_name}-${record.id_tdl || 'no-id'}`
      if (!grouped[key]) {
        grouped[key] = {
          id: record.id,
          group: record.group,
          id_tdl: record.id_tdl,
          employee_id: record.employee_id,
          first_name: record.first_name,
          last_name: record.last_name,
          position: record.position,
          department: record.department,
          gender: record.gender,
          nationality: record.nationality,
          status: record.status,
          status_card: record.status_card,
          created_by: record.created_by,
          created_at: record.created_at,
          updated_by: record.updated_by,
          updated_at: record.updated_at
        }
      }
    })
    
    records.value = Object.values(grouped)
  } catch (error) {
    console.error('Error fetching records:', error.message)
  } finally {
    loading.value = false
  }
}

const filteredRecords = computed(() => {
  let result = records.value
  
  if (statusFilter.value !== 'all') {
    result = result.filter(rec => rec.status_card === statusFilter.value)
  }
  
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(rec => 
      rec.first_name?.toLowerCase().includes(query) ||
      rec.last_name?.toLowerCase().includes(query) ||
      rec.id_tdl?.toLowerCase().includes(query) ||
      rec.employee_id?.toLowerCase().includes(query) ||
      rec.position?.toLowerCase().includes(query) ||
      rec.department?.toLowerCase().includes(query)
    )
  }
  
  return result
})

onMounted(() => {
  fetchRecords()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ pageTitle }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ pageDescription }}</p>
      </div>
      <div class="text-sm text-gray-500 dark:text-gray-400">
        ทั้งหมด: <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ filteredRecords.length }}</span> คน
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-col sm:flex-row sm:items-center gap-4">
      <div class="relative max-w-sm w-full">
        <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MagnifyingGlassIcon class="h-5 w-5 text-gray-400" />
        </span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="ค้นหาชื่อ, รหัส, ตำแหน่ง..."
          class="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
        />
      </div>
      <select
        v-model="statusFilter"
        class="block w-full sm:w-48 pl-3 pr-10 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
      >
        <option value="all">ทุกสถานะ</option>
        <option value="ยังไม่ได้รับ">ยังไม่ได้รับ</option>
        <option value="ได้รับแล้ว">ได้รับแล้ว</option>
      </select>
    </div>

    <!-- Table Container -->
    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">กลุ่ม</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัส TDL</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัสพนักงาน</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เพศ</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตำแหน่ง</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">แผนก</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สัญชาติ</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ผู้อัปเดต</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <template v-if="loading">
              <tr v-for="i in 5" :key="i" class="animate-pulse">
                <td colspan="10" class="px-6 py-4">
                  <div class="h-10 bg-gray-100 dark:bg-gray-900 rounded-lg w-full"></div>
                </td>
              </tr>
            </template>
            <tr v-else-if="filteredRecords.length === 0" class="text-center">
              <td colspan="10" class="px-6 py-12 text-gray-500 dark:text-gray-400 italic">
                ไม่พบข้อมูล
              </td>
            </tr>
            <template v-else>
              <tr
                v-for="record in filteredRecords"
                :key="record.id"
                class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors"
              >
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ record.group || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ record.id_tdl || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ record.employee_id || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-bold text-gray-900 dark:text-white">
                    {{ record.first_name }} {{ record.last_name }}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ record.gender || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ record.position || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ record.department || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ record.nationality || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span
                    :class="[
                      'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                      record.status_card === 'ได้รับแล้ว'
                        ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                        : record.status_card === 'ยังไม่ได้รับ'
                        ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400'
                        : 'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
                    ]"
                  >
                    {{ record.status_card || '-' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900 dark:text-white">
                    <span class="font-medium">อัปเดต:</span> {{ record.updated_by || record.created_by || '-' }}
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    {{ (record.updated_at || record.created_at) ? new Date(record.updated_at || record.created_at).toLocaleString('th-TH') : '-' }}
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
