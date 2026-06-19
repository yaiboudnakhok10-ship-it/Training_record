<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabaseInternal } from '../server/supabase'
import * as XLSX from 'xlsx'
import { MagnifyingGlassIcon, ArrowDownTrayIcon } from '@heroicons/vue/24/outline'

const records = ref([])
const loading = ref(true)
const searchQuery = ref('')
const selectedDate = ref('')

const getTodayDate = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Function to get YYYY-MM-DD from any date string
const getDateString = (dateStr) => {
  if (!dateStr) return null
  
  // If it's already in YYYY-MM-DD format, return it
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr
  }
  
  // If it's an ISO string with T, extract date part
  if (typeof dateStr === 'string' && dateStr.includes('T')) {
    return dateStr.split('T')[0]
  }
  
  // Try to parse the date
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

const fetchRecords = async () => {
  try {
    loading.value = true
    const { data, error } = await supabaseInternal
      .from('employee_training_records')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    records.value = data
  } catch (error) {
    console.error('Error fetching records:', error.message)
  } finally {
    loading.value = false
  }
}

const filteredRecords = computed(() => {
  const targetDate = selectedDate.value || getTodayDate()
  
  // Filter records where either training_date OR created_at matches the target date
let result = records.value.filter(record => {
  // ใช้วันที่ของระเบียนนั้นๆ เพียงค่าเดียว: training_date เป็นหลัก
  // ถ้าไม่มี training_date ค่อย fallback ไปใช้ created_at
  const recordDateStr = getDateString(record.training_date) || getDateString(record.created_at)
  return recordDateStr === targetDate
})
  
  // Apply search filter if needed
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(rec => 
      (rec.first_name && rec.first_name.toLowerCase().includes(query)) ||
      (rec.last_name && rec.last_name.toLowerCase().includes(query)) ||
      (rec.id_tdl && rec.id_tdl.toLowerCase().includes(query)) ||
      (rec.employee_id && rec.employee_id.toLowerCase().includes(query)) ||
      (rec.course_name && rec.course_name.toLowerCase().includes(query)) ||
      (rec.position && rec.position.toLowerCase().includes(query)) ||
      (rec.department && rec.department.toLowerCase().includes(query))
    )
  }
  
  return result
})

const formatThaiDate = (dateStr) => {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('th-TH')
  } catch (e) {
    return dateStr
  }
}

// 导出Excel
const exportToExcel = () => {
  const data = filteredRecords.value
  
  // 准备Excel数据
  const excelData = data.map(record => ({
    'กลุ่ม': record.group || '-',
    'รหัส TDL': record.id_tdl || '-',
    'ชื่อ': record.first_name || '-',
    'นามสกุล': record.last_name || '-',
    'เพศ': record.gender || '-',
    'ตำแหน่ง': record.position || '-',
    'แผนก': record.department || '-',
    'สัญชาติ': record.nationality || '-',
    'สถานะ': record.status || '-',
    'หลักสูตร': record.course_name || '-',
    'วันที่ไปเรียน': formatThaiDate(record.training_date || record.created_at)
  }))
  
  // 创建工作簿
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(excelData)
  
  // 调整列宽
  ws['!cols'] = [
    { wch: 10 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 8 },
    { wch: 20 },
    { wch: 15 },
    { wch: 10 },
    { wch: 10 },
    { wch: 30 },
    { wch: 15 }
  ]
  
  XLSX.utils.book_append_sheet(wb, ws, 'ข้อมูลการอบรม')
  
  // 下载文件
  const fileName = `สรุปข้อมูลการอบรม_${selectedDate.value || getTodayDate()}.xlsx`
  XLSX.writeFile(wb, fileName)
}

onMounted(() => {
  selectedDate.value = getTodayDate()
  fetchRecords()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">สรุปข้อมูลการอบรม (แต่ละวัน)</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">แสดงข้อมูลพนักงานที่ไปเรียนในวันที่เลือก</p>
      </div>
      <div class="text-sm text-gray-500 dark:text-gray-400">
        {{ formatThaiDate(selectedDate || getTodayDate()) }}: <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ filteredRecords.length }}</span> คน
      </div>
    </div>

    <!-- Search and Date Filter -->
    <div class="flex flex-col sm:flex-row sm:items-center gap-4">
      <div class="relative max-w-sm w-full">
        <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MagnifyingGlassIcon class="h-5 w-5 text-gray-400" />
        </span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="ค้นหาชื่อ, รหัส, หลักสูตร..."
          class="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
        />
      </div>
      <div class="relative max-w-sm w-full sm:w-auto">
        <input
          v-model="selectedDate"
          type="date"
          class="block w-full px-4 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
        />
      </div>
      <button @click="exportToExcel" 
        class="flex items-center gap-2 px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl transition-colors font-medium">
        <ArrowDownTrayIcon class="h-5 w-5" />
        ดาวโหลด Excel
      </button>
    </div>

    <!-- Table Container -->
    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">กลุ่ม</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัส TDL</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เพศ</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตำแหน่ง</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">แผนก</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สัญชาติ</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">หลักสูตร</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">วันที่ไปเรียน</th>
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
                ไม่มีพนักงานไปเรียนในวันที่ {{ formatThaiDate(selectedDate || getTodayDate()) }}
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
                      record.status === 'ปกติ'
                        ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
                    ]"
                  >
                    {{ record.status || '-' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ record.course_name || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ (record.training_date || record.created_at) ? new Date(record.training_date || record.created_at).toLocaleDateString('th-TH') : '-' }}
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
