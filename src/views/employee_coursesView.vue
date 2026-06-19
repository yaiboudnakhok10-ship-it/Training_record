<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabaseInternal } from '../server/supabase'
import * as XLSX from 'xlsx'
import { MagnifyingGlassIcon, XMarkIcon, ArrowDownTrayIcon } from '@heroicons/vue/24/outline'

const records = ref([])
const loading = ref(true)
const searchQuery = ref('')
const totalEmployees = ref(0)
const allTrainingRecords = ref([])

// Modal states
const isModalOpen = ref(false)
const selectedCourse = ref(null)
const selectedTimePeriod = ref(null)
const modalSearchQuery = ref('')

const getTodayDate = () => {
  return new Date()
}

const getDateString = (dateStr) => {
  if (!dateStr) return null
  try {
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return { year, month, day, date: d }
    }
  } catch (e) {
    console.error('Date parse error:', e)
  }
  return null
}

const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}

const fetchRecords = async () => {
  try {
    loading.value = true
    const { data, error } = await supabaseInternal
      .from('employee_training_records')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    
    // เก็บข้อมูลทั้งหมดไว้เพื่อใช้ใน modal
    allTrainingRecords.value = data
    
    // นับจำนวนพนักงานทั้งหมด (ไม่ซ้ำ)
    const uniqueEmployees = new Set()
    data.forEach(record => {
      const employeeKey = `${record.first_name}-${record.last_name}-${record.id_tdl || 'no-id'}`
      uniqueEmployees.add(employeeKey)
    })
    totalEmployees.value = uniqueEmployees.size
    
    // จัดกลุ่มข้อมูลตามหลักสูตร
    const courseGroups = {}
    const today = getTodayDate()
    const thisYear = today.getFullYear()
    const thisMonth = today.getMonth() + 1
    const thisWeek = getWeekNumber(today)
    
    data.forEach(record => {
      const courseName = record.course_name || 'ไม่ระบุชื่อหลักสูตร'
      
      if (!courseGroups[courseName]) {
        courseGroups[courseName] = {
          name: courseName,
          total: 0,
          thisWeek: 0,
          thisMonth: 0,
          thisYear: 0,
        }
      }
      
      courseGroups[courseName].total++
      
      // ตรวจสอบวันที่
      const dateInfo = getDateString(record.training_date || record.created_at)
      if (dateInfo) {
        const recordYear = parseInt(dateInfo.year)
        const recordMonth = parseInt(dateInfo.month)
        const recordWeek = getWeekNumber(dateInfo.date)
        
        if (recordYear === thisYear) {
          courseGroups[courseName].thisYear++
          
          if (recordMonth === thisMonth) {
            courseGroups[courseName].thisMonth++
          }
          
          if (recordWeek === thisWeek && recordYear === thisYear) {
            courseGroups[courseName].thisWeek++
          }
        }
      }
    })
    
    // แปลงเป็น array และเรียงลำดับ
    let sortedCourses = Object.values(courseGroups)
    sortedCourses.sort((a, b) => b.total - a.total)
    
    records.value = sortedCourses
  } catch (error) {
    console.error('Error fetching records:', error.message)
  } finally {
    loading.value = false
  }
}

const filteredRecords = computed(() => {
  if (!searchQuery.value) return records.value
  
  const query = searchQuery.value.toLowerCase()
  return records.value.filter(rec => 
    rec.name?.toLowerCase().includes(query)
  )
})

const getCourseEmployees = (courseName, timePeriod) => {
  const today = getTodayDate()
  const thisYear = today.getFullYear()
  const thisMonth = today.getMonth() + 1
  const thisWeek = getWeekNumber(today)
  
  return allTrainingRecords.value.filter(record => {
    const recordCourseName = record.course_name || 'ไม่ระบุชื่อหลักสูตร'
    if (recordCourseName !== courseName) return false
    
    const dateInfo = getDateString(record.training_date || record.created_at)
    if (!dateInfo) return false
    
    if (timePeriod === 'week') {
      const recordWeek = getWeekNumber(dateInfo.date)
      return recordWeek === thisWeek && dateInfo.year === thisYear
    } else if (timePeriod === 'month') {
      return dateInfo.year === thisYear && parseInt(dateInfo.month) === thisMonth
    } else if (timePeriod === 'year') {
      return dateInfo.year === thisYear
    }
    return false
  })
}

// 搜索结果计算属性
const filteredModalRecords = computed(() => {
  const data = getCourseEmployees(selectedCourse.value, selectedTimePeriod.value)
  if (!modalSearchQuery.value) return data
  
  const query = modalSearchQuery.value.toLowerCase()
  return data.filter(record => 
    (record.first_name?.toLowerCase().includes(query)) ||
    (record.last_name?.toLowerCase().includes(query)) ||
    (record.id_tdl?.toLowerCase().includes(query)) ||
    (record.employee_id?.toLowerCase().includes(query)) ||
    (record.course_name?.toLowerCase().includes(query))
  )
})

const openModal = (courseName, timePeriod) => {
  selectedCourse.value = courseName
  selectedTimePeriod.value = timePeriod
  modalSearchQuery.value = ''
  isModalOpen.value = true
}

const closeModal = () => {
  isModalOpen.value = false
  selectedCourse.value = null
  selectedTimePeriod.value = null
}

const getTimePeriodLabel = (period) => {
  if (period === 'week') return 'รายสัปดาห์นี้'
  if (period === 'month') return 'รายเดือนนี้'
  if (period === 'year') return 'รายปีนี้'
  return ''
}

const formatThaiDate = (dateStr) => {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('th-TH')
  } catch (e) {
    return dateStr
  }
}

// 导出Excel
const exportToExcel = () => {
  const data = filteredModalRecords.value
  
  // 准备Excel数据
  const excelData = data.map(record => ({
    'กลุ่ม': record.group || '-',
    'รหัส TDL': record.id_tdl || '-',
    'รหัสพนักงาน': record.employee_id || '-',
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
  const fileName = `${selectedCourse.value}_${getTimePeriodLabel(selectedTimePeriod.value)}_${new Date().toISOString().split('T')[0]}.xlsx`
  XLSX.writeFile(wb, fileName)
}

onMounted(() => {
  fetchRecords()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">สรุปข้อมูลหลักสูตร</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">แสดงจำนวนพนักงานในแต่ละหลักสูตร แบ่งตามรายอาทิตย์ รายเดือน รายปี</p>
      </div>
      <div class="flex flex-col sm:flex-row gap-4 text-sm">
        <div class="text-gray-500 dark:text-gray-400">
          พนักงานทั้งหมด: <span class="font-bold text-green-600 dark:text-green-400 text-lg">{{ totalEmployees }}</span> คน
        </div>
        <div class="text-gray-500 dark:text-gray-400">
          หลักสูตรทั้งหมด: <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ filteredRecords.length }}</span> หลักสูตร
        </div>
      </div>
    </div>

    <!-- Search -->
    <div class="relative max-w-sm w-full">
      <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <MagnifyingGlassIcon class="h-5 w-5 text-gray-400" />
      </span>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="ค้นหาชื่อหลักสูตร..."
        class="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
      />
    </div>

    <!-- Tables Container -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      <!-- รายสัปดาห์นี้ -->
      <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
        <div class="bg-blue-50 dark:bg-blue-900/20 px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 class="text-lg font-bold text-blue-800 dark:text-blue-300">รายสัปดาห์นี้</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อหลักสูตร</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">จำนวน</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <template v-if="loading">
                <tr v-for="i in 5" :key="i" class="animate-pulse">
                  <td colspan="2" class="px-4 py-3">
                    <div class="h-8 bg-gray-100 dark:bg-gray-900 rounded-lg w-full"></div>
                  </td>
                </tr>
              </template>
              <template v-else>
                <tr v-for="(course, index) in filteredRecords.filter(c => c.thisWeek > 0)" :key="index">
                  <td :class="[
                    'px-4 py-2 whitespace-nowrap text-sm',
                    index % 2 === 0 ? 'bg-green-50 dark:bg-green-900/10' : 'bg-white dark:bg-gray-950'
                  ]">
                    {{ course.name }}
                  </td>
                  <td :class="[
                    'px-4 py-2 whitespace-nowrap text-sm font-bold text-center cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors',
                    index % 2 === 0 ? 'bg-green-50 dark:bg-green-900/10' : 'bg-white dark:bg-gray-950'
                  ]"
                  @click="openModal(course.name, 'week')">
                    <span class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200">
                      {{ course.thisWeek }}
                    </span>
                  </td>
                </tr>
                <tr v-if="filteredRecords.filter(c => c.thisWeek > 0).length === 0" class="text-center">
                  <td colspan="2" class="px-4 py-8 text-gray-500 dark:text-gray-400 italic">
                    ไม่มีข้อมูล
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- รายเดือนนี้ -->
      <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
        <div class="bg-blue-50 dark:bg-blue-900/20 px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 class="text-lg font-bold text-blue-800 dark:text-blue-300">รายเดือนนี้</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อหลักสูตร</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">จำนวน</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <template v-if="loading">
                <tr v-for="i in 5" :key="i" class="animate-pulse">
                  <td colspan="2" class="px-4 py-3">
                    <div class="h-8 bg-gray-100 dark:bg-gray-900 rounded-lg w-full"></div>
                  </td>
                </tr>
              </template>
              <template v-else>
                <tr v-for="(course, index) in filteredRecords.filter(c => c.thisMonth > 0)" :key="index">
                  <td :class="[
                    'px-4 py-2 whitespace-nowrap text-sm',
                    index % 2 === 0 ? 'bg-green-50 dark:bg-green-900/10' : 'bg-white dark:bg-gray-950'
                  ]">
                    {{ course.name }}
                  </td>
                  <td :class="[
                    'px-4 py-2 whitespace-nowrap text-sm font-bold text-center cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors',
                    index % 2 === 0 ? 'bg-green-50 dark:bg-green-900/10' : 'bg-white dark:bg-gray-950'
                  ]"
                  @click="openModal(course.name, 'month')">
                    <span class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200">
                      {{ course.thisMonth }}
                    </span>
                  </td>
                </tr>
                <tr v-if="filteredRecords.filter(c => c.thisMonth > 0).length === 0" class="text-center">
                  <td colspan="2" class="px-4 py-8 text-gray-500 dark:text-gray-400 italic">
                    ไม่มีข้อมูล
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- รายปีนี้ -->
      <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
        <div class="bg-blue-50 dark:bg-blue-900/20 px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 class="text-lg font-bold text-blue-800 dark:text-blue-300">รายปีนี้</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อหลักสูตร</th>
                <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">จำนวน</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <template v-if="loading">
                <tr v-for="i in 5" :key="i" class="animate-pulse">
                  <td colspan="2" class="px-4 py-3">
                    <div class="h-8 bg-gray-100 dark:bg-gray-900 rounded-lg w-full"></div>
                  </td>
                </tr>
              </template>
              <template v-else>
                <tr v-for="(course, index) in filteredRecords.filter(c => c.thisYear > 0)" :key="index">
                  <td :class="[
                    'px-4 py-2 whitespace-nowrap text-sm',
                    index % 2 === 0 ? 'bg-green-50 dark:bg-green-900/10' : 'bg-white dark:bg-gray-950'
                  ]">
                    {{ course.name }}
                  </td>
                  <td :class="[
                    'px-4 py-2 whitespace-nowrap text-sm font-bold text-center cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors',
                    index % 2 === 0 ? 'bg-green-50 dark:bg-green-900/10' : 'bg-white dark:bg-gray-950'
                  ]"
                  @click="openModal(course.name, 'year')">
                    <span class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200">
                      {{ course.thisYear }}
                    </span>
                  </td>
                </tr>
                <tr v-if="filteredRecords.filter(c => c.thisYear > 0).length === 0" class="text-center">
                  <td colspan="2" class="px-4 py-8 text-gray-500 dark:text-gray-400 italic">
                    ไม่มีข้อมูล
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
      
    </div>

    <!-- Modal -->
    <div v-if="isModalOpen" class="fixed inset-0 z-50 overflow-y-auto">
      <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
        <!-- Backdrop -->
        <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" @click="closeModal"></div>
        
        <!-- Modal content -->
        <div class="relative bg-white dark:bg-gray-950 rounded-2xl shadow-xl max-w-7xl w-[95vw] max-h-[85vh] overflow-hidden">
          <!-- Header -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
            <div>
              <h3 class="text-xl font-bold text-gray-900 dark:text-white">{{ selectedCourse }}</h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {{ getTimePeriodLabel(selectedTimePeriod) }} - 
                <span class="font-bold">{{ filteredModalRecords.length }}</span> คน
              </p>
            </div>
            <button @click="closeModal" class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors">
              <XMarkIcon class="h-6 w-6" />
            </button>
          </div>
          
          <!-- Search in Modal -->
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <div class="relative max-w-sm w-full">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon class="h-5 w-5 text-gray-400" />
              </span>
              <input
                v-model="modalSearchQuery"
                type="text"
                placeholder="ค้นหาชื่อ, รหัส, หลักสูตร..."
                class="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>
          
          <!-- Body -->
          <div class="p-6 overflow-y-auto max-h-[55vh]">
            <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
                      <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">กลุ่ม</th>
                      <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัส TDL</th>
                      <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัสพนักงาน</th>
                      <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
                      <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เพศ</th>
                      <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตำแหน่ง</th>
                      <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">แผนก</th>
                      <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สัญชาติ</th>
                      <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
                      <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">หลักสูตร</th>
                      <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">วันที่ไปเรียน</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                    <tr v-if="filteredModalRecords.length === 0" class="text-center">
                      <td colspan="11" class="px-4 py-8 text-gray-500 dark:text-gray-400 italic">
                        ไม่มีข้อมูล
                      </td>
                    </tr>
                    <template v-else>
                      <tr v-for="(record, index) in filteredModalRecords" :key="record.id"
                          :class="[
                            'hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors',
                            index % 2 === 0 ? 'bg-white dark:bg-gray-950' : 'bg-green-50 dark:bg-green-900/10'
                          ]">
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {{ record.group || '-' }}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {{ record.id_tdl || '-' }}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {{ record.employee_id || '-' }}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap">
                          <div class="text-sm font-bold text-gray-900 dark:text-white">
                            {{ record.first_name }} {{ record.last_name }}
                          </div>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {{ record.gender || '-' }}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {{ record.position || '-' }}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {{ record.department || '-' }}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {{ record.nationality || '-' }}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap">
                          <span :class="[
                            'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                            record.status === 'ปกติ'
                              ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                              : 'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
                          ]">
                            {{ record.status || '-' }}
                          </span>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {{ record.course_name || '-' }}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {{ formatThaiDate(record.training_date || record.created_at) }}
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          <!-- Footer -->
          <div class="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
            <button @click="exportToExcel" 
              class="flex items-center gap-2 px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl transition-colors font-medium">
              <ArrowDownTrayIcon class="h-5 w-5" />
              ดาวโหลด Excel
            </button>
            <button @click="closeModal" 
              class="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl transition-colors font-medium">
              ปิด
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
