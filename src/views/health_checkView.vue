<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabaseInternal } from '../server/supabase'
import { MagnifyingGlassIcon, ArrowLeftIcon, TrashIcon, ArrowDownTrayIcon } from '@heroicons/vue/24/outline'
import { showSuccess, showError, showConfirm } from '../utils/sweetalert'
import * as XLSX from 'xlsx'

const router = useRouter()

const healthRecords = ref([])
const filteredRecords = ref([])
const searchQuery = ref('')
const selectedDepartment = ref('')
const loading = ref(false)

// รายชื่อแผนกทั้งหมด (ไม่ซ้ำ) ดึงจากข้อมูลที่มีอยู่ สำหรับใช้ใน dropdown
const departmentOptions = computed(() => {
  const depts = healthRecords.value
    .map(r => r.department)
    .filter(d => d && d.trim() !== '')
  return [...new Set(depts)].sort()
})

const fetchHealthRecords = async () => {
  try {
    loading.value = true
    const { data, error } = await supabaseInternal
      .from('health_check')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    
    healthRecords.value = data
    applyFilters()
  } catch (error) {
    console.error('Error fetching health check records:', error.message)
  } finally {
    loading.value = false
  }
}

const deleteRecord = async (record) => {
  const result = await showConfirm(
    'คุณแน่ใจหรือไม่?',
    `คุณต้องการลบข้อมูลของ ${record.full_name} ใช่หรือไม่?`,
    'ใช่, ลบเลย!',
    'ยกเลิก'
  )

  if (result.isConfirmed) {
    try {
      const { error } = await supabaseInternal
        .from('health_check')
        .delete()
        .eq('id', record.id)
      
      if (error) throw error
      
      await showSuccess('ลบสำเร็จ!', 'ข้อมูลถูกลบเรียบร้อยแล้ว')
      
      fetchHealthRecords()
    } catch (error) {
      console.error('Error deleting record:', error.message)
      await showError('เกิดข้อผิดพลาด!', 'เกิดข้อผิดพลาดในการลบข้อมูล: ' + error.message)
    }
  }
}

// กรองข้อมูลตามคำค้นหาและแผนกที่เลือก (ทำงานร่วมกันทั้งสองเงื่อนไข)
const applyFilters = () => {
  const query = (searchQuery.value || '').toLowerCase().trim()
  const dept = selectedDepartment.value

  filteredRecords.value = healthRecords.value.filter(record => {
    const matchesQuery = !query || (
      record.full_name?.toLowerCase().includes(query) ||
      record.tdl_code?.toLowerCase().includes(query)
    )
    const matchesDept = !dept || record.department === dept
    return matchesQuery && matchesDept
  })
}

const searchRecords = () => {
  applyFilters()
}

const clearSearch = () => {
  searchQuery.value = ''
  selectedDepartment.value = ''
  filteredRecords.value = healthRecords.value
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

const isExpired = (expireDateStr) => {
  if (!expireDateStr) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expireDate = new Date(expireDateStr)
  expireDate.setHours(0, 0, 0, 0)
  return expireDate <= today
}

const getYearFromDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.getFullYear()
}

const calculateYearsDifference = (startDateStr, endDateStr) => {
  if (!startDateStr || !endDateStr) return '-'
  const startDate = new Date(startDateStr)
  const endDate = new Date(endDateStr)
  
  let years = endDate.getFullYear() - startDate.getFullYear()
  
  const monthDiff = endDate.getMonth() - startDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && endDate.getDate() < startDate.getDate())) {
    years--
  }
  
  return years
}

// ดาวน์โหลดข้อมูลที่กรองอยู่ ณ ขณะนี้เป็นไฟล์ Excel
const downloadExcel = () => {
  if (filteredRecords.value.length === 0) {
    showError('ไม่มีข้อมูล!', 'ไม่มีข้อมูลให้ดาวน์โหลดในขณะนี้')
    return
  }

  const rows = filteredRecords.value.map(record => ({
    'กลุ่ม': record.group_name || '-',
    'รหัส TDL': record.tdl_code || '-',
    'ชื่อ-นามสกุล': record.full_name || '-',
    'เพศ': record.gender || '-',
    'ตำแหน่ง': record.position || '-',
    'แผนก': record.department || '-',
    'สัญชาติ': record.nationality || '-',
    'สถานะ': record.status || '-',
    'วันที่ตรวจสุขภาพ': formatDate(record.checkup_date),
    'วันที่หมดอายุ': formatDate(record.checkup_expire_date),
    'สถานะการตรวจ': isExpired(record.checkup_expire_date) ? 'หมดอายุ' : 'ยังไม่หมดอายุ'
  }))

  const worksheet = XLSX.utils.json_to_sheet(rows)
  worksheet['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 8 }, { wch: 18 },
    { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'หมดอายุตรวจสุขภาพ')

  const deptLabel = selectedDepartment.value ? `_${selectedDepartment.value}` : ''
  const dateLabel = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(workbook, `หมดอายุตรวจสุขภาพ${deptLabel}_${dateLabel}.xlsx`)
}

onMounted(() => {
  fetchHealthRecords()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div class="flex items-center gap-3">
        <button
          @click="router.push('/employee-training')"
          class="inline-flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 text-sm font-medium rounded-xl transition-all"
        >
          <ArrowLeftIcon class="h-5 w-5" />
        </button>
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">หมดอายุตรวจสุขภาพ</h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">รายชื่อพนักงานที่หมดอายุตรวจสุขภาพ</p>
        </div>
      </div>

      <button
        @click="downloadExcel"
        class="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
      >
        <ArrowDownTrayIcon class="h-5 w-5" />
        ดาวน์โหลด Excel
      </button>
    </div>

    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
      <div class="flex flex-col sm:flex-row gap-4">
        <div class="flex-1">
          <div class="relative">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon class="h-5 w-5 text-gray-400" />
            </span>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="ค้นหา: รหัส TDL, ชื่อ..."
              class="block w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              @keyup.enter="searchRecords"
            />
          </div>
        </div>

        <div class="w-full sm:w-56">
          <select
            v-model="selectedDepartment"
            @change="applyFilters"
            class="block w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          >
            <option value="">ทุกแผนก</option>
            <option v-for="dept in departmentOptions" :key="dept" :value="dept">
              {{ dept }}
            </option>
          </select>
        </div>

        <div class="flex gap-3">
          <button
            @click="searchRecords"
            class="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
          >
            <MagnifyingGlassIcon class="h-5 w-5" />
            ค้นหา
          </button>
          <button
            @click="clearSearch"
            class="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl transition-all"
          >
            ล้าง
          </button>
        </div>
      </div>
    </div>

    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div v-if="loading" class="p-12 text-center">
        <div class="animate-pulse text-gray-500 dark:text-gray-400">กำลังโหลด...</div>
      </div>
      <div v-else-if="filteredRecords.length === 0" class="p-12 text-center">
        <p class="text-gray-500 dark:text-gray-400 italic">ไม่มีข้อมูล</p>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
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
              <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
              <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <tr v-for="record in filteredRecords" :key="record.id" class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors">
              <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">{{ record.group_name || '-' }}</td>
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
                  record.status === 'กำลังดำเนินการ' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' :
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
                  isExpired(record.checkup_expire_date) ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                ]">
                  {{ isExpired(record.checkup_expire_date) ? 'หมดอายุ' : 'ยังไม่หมดอายุ' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <button
                  @click="deleteRecord(record)"
                  class="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <TrashIcon class="h-5 w-5" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>


