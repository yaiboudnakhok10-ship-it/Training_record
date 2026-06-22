<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { supabaseInternal } from '../server/supabase'
import * as XLSX from 'xlsx'
import { 
  CalendarIcon, 
  UserGroupIcon, 
  AcademicCapIcon, 
  ChartBarIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowDownTrayIcon
} from '@heroicons/vue/24/solid'

const loading = ref(true)
const records = ref([])
const dateFilter = ref('all') // 'all', 'today', '7days', 'month', 'year'
const startDate = ref('')
const endDate = ref('')

// Modal states
const isModalOpen = ref(false)
const selectedPeriod = ref(null)
const modalTitle = ref('')
const modalSearchQuery = ref('')

// 快捷选项
const dateOptions = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'today', label: 'วันนี้' },
  { id: '7days', label: '7 วันย้อนหลัง' },
  { id: 'month', label: 'เดือนนี้' },
  { id: 'year', label: 'ปีนี้' }
]

// 根据选择更新日期范围
const updateDateRange = () => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  switch (dateFilter.value) {
    case 'today':
      startDate.value = today.toISOString().split('T')[0]
      endDate.value = today.toISOString().split('T')[0]
      break
    case '7days':
      const weekAgo = new Date(today)
      weekAgo.setDate(weekAgo.getDate() - 6)
      startDate.value = weekAgo.toISOString().split('T')[0]
      endDate.value = today.toISOString().split('T')[0]
      break
    case 'month':
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      startDate.value = firstDay.toISOString().split('T')[0]
      endDate.value = lastDay.toISOString().split('T')[0]
      break
    case 'year':
      startDate.value = `${now.getFullYear()}-01-01`
      endDate.value = `${now.getFullYear()}-12-31`
      break
    default: // all
      startDate.value = ''
      endDate.value = ''
  }
}

// 初始化
const initDateRange = () => {
  updateDateRange()
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
    console.log('Fetched records:', data?.length, 'records')
    if (data?.length > 0) {
      console.log('Sample record:', data[0])
    }
  } catch (error) {
    console.error('Error fetching records:', error.message)
  } finally {
    loading.value = false
  }
}

// 辅助函数：检查日期是否在范围内
const isDateInRange = (dateStr, start, end) => {
  if (!dateStr) return false
  const date = new Date(dateStr)
  const startDate = new Date(start)
  const endDate = new Date(end)
  // 将时间都设置为 00:00:00 来比较日期部分
  date.setHours(0, 0, 0, 0)
  startDate.setHours(0, 0, 0, 0)
  endDate.setHours(0, 0, 0, 0)
  return date >= startDate && date <= endDate
}

// 辅助函数：获取日期部分字符串（YYYY-MM-DD）
const getDateString = (dateStr) => {
  if (!dateStr) return null
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return null
  return date.toISOString().split('T')[0]
}

// 辅助函数：计算唯一员工数量
const getUniqueEmployees = (data) => {
  const unique = new Set()
  data.forEach(record => {
    const key = `${record.first_name}-${record.last_name}-${record.employee_id || record.id_tdl || 'no-id'}`
    unique.add(key)
  })
  return unique.size
}

// KPI 计算
const stats = computed(() => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  
  // 本周开始（周一）
  const dayOfWeek = today.getDay()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  weekStart.setHours(0, 0, 0, 0)
  
  // 本月开始
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  monthStart.setHours(0, 0, 0, 0)
  
  // 本年开始
  const yearStart = new Date(now.getFullYear(), 0, 1)
  yearStart.setHours(0, 0, 0, 0)

  // 辅助函数：检查记录是否在某个日期之后
  const isOnOrAfter = (record, targetDate) => {
    const recordDateStr = getDateString(record.training_date) || getDateString(record.created_at)
    if (!recordDateStr) return false
    const recordDate = new Date(recordDateStr)
    recordDate.setHours(0, 0, 0, 0)
    return recordDate >= targetDate
  }

  // 辅助函数：检查记录是否是特定日期
  const isDateEqual = (record, targetDate) => {
    const recordDateStr = getDateString(record.training_date) || getDateString(record.created_at)
    if (!recordDateStr) return false
    const recordDate = new Date(recordDateStr)
    recordDate.setHours(0, 0, 0, 0)
    return recordDate.getTime() === targetDate.getTime()
  }

  // 筛选日期范围内的数据
  const filteredData = records.value.filter(record => {
    const date = record.training_date || record.created_at
    if (startDate.value && endDate.value) {
      return isDateInRange(date, startDate.value, endDate.value)
    }
    return true
  })

  // 计算明天的培训
  const tomorrowData = filteredData.filter(record => isDateEqual(record, tomorrow))

  // 计算今天的培训
  const todayData = filteredData.filter(record => isDateEqual(record, today))

  // 计算本周的培训
  const weekData = filteredData.filter(record => isOnOrAfter(record, weekStart))

  // 计算本月的培训
  const monthData = filteredData.filter(record => isOnOrAfter(record, monthStart))

  // 计算本年的培训
  const yearData = filteredData.filter(record => isOnOrAfter(record, yearStart))

  return {
    tomorrow: getUniqueEmployees(tomorrowData),
    today: getUniqueEmployees(todayData),
    week: getUniqueEmployees(weekData),
    month: getUniqueEmployees(monthData),
    year: getUniqueEmployees(yearData),
    total: getUniqueEmployees(filteredData)
  }
})

// 每日趋势数据
const dailyTrend = computed(() => {
  const now = new Date()
  const days = []
  const counts = []
  
  // 先筛选主日期范围的数据（只筛选一次）
  const filtered = records.value.filter(record => {
    const date = record.training_date || record.created_at
    if (startDate.value && endDate.value) {
      return isDateInRange(date, startDate.value, endDate.value)
    }
    return true
  })
  
  // 改为显示最近7天
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const targetDateStr = date.toISOString().split('T')[0]
    
    const dayData = filtered.filter(record => {
      const recordDateStr = getDateString(record.training_date) || getDateString(record.created_at)
      return recordDateStr === targetDateStr
    })
    
    // 星期几的泰文全称
    const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
    days.push(dayNames[date.getDay()])
    counts.push(getUniqueEmployees(dayData))
  }
  
  return { days, counts }
})

// 按课程统计
const courseStats = computed(() => {
  // 使用主筛选范围的 filteredData
  const data = records.value.filter(record => {
    const date = record.training_date || record.created_at
    if (startDate.value && endDate.value) {
      return isDateInRange(date, startDate.value, endDate.value)
    }
    return true
  })

  const courseMap = {}
  
  data.forEach(record => {
    if (record.course_name) {
      if (!courseMap[record.course_name]) {
        courseMap[record.course_name] = { count: 0, employees: new Set() }
      }
      courseMap[record.course_name].count++
      const key = `${record.first_name}-${record.last_name}-${record.employee_id || record.id_tdl || 'no-id'}`
      courseMap[record.course_name].employees.add(key)
    }
  })
  
  const result = Object.entries(courseMap).map(([name, data]) => ({
    name,
    count: data.employees.size
  }))
  
  return result.sort((a, b) => b.count - a.count).slice(0, 10)
})

// 饼图颜色 - 蓝色系为主
const pieColors = [
  '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe',
  '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554'
]

// 计算饼图数据
const pieChartData = computed(() => {
  const total = courseStats.value.reduce((sum, c) => sum + c.count, 0)
  let currentAngle = 0
  
  return courseStats.value.map((course, index) => {
    const percentage = total > 0 ? (course.count / total) * 100 : 0
    const angle = (percentage / 100) * 360
    const startAngle = currentAngle
    currentAngle += angle
    
    // 计算 SVG 弧形路径
    const x1 = 50 + 40 * Math.cos((startAngle - 90) * Math.PI / 180)
    const y1 = 50 + 40 * Math.sin((startAngle - 90) * Math.PI / 180)
    const x2 = 50 + 40 * Math.cos((startAngle + angle - 90) * Math.PI / 180)
    const y2 = 50 + 40 * Math.sin((startAngle + angle - 90) * Math.PI / 180)
    const largeArc = angle > 180 ? 1 : 0
    
    return {
      ...course,
      color: pieColors[index % pieColors.length],
      percentage: percentage.toFixed(1),
      path: `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`
    }
  })
})

// 找到最大值用于图表
const maxDaily = computed(() => {
  return Math.max(...dailyTrend.value.counts, 1)
})

// 课程统计的最大值
const maxCourse = computed(() => {
  return Math.max(...courseStats.value.map(c => c.count), 1)
})

// 计算折线图的点
const points = computed(() => {
  const result = []
  const stepX = 400 / (dailyTrend.value.counts.length || 1)
  const startX = stepX / 2
  
  dailyTrend.value.counts.forEach((count, index) => {
    const height = maxDaily.value > 0 ? (count / maxDaily.value) * 140 : 0
    result.push({
      x: startX + (index * stepX),
      y: 170 - height
    })
  })
  
  return result
})

// 折线的字符串
const linePoints = computed(() => {
  return points.value.map(p => `${p.x},${p.y}`).join(' ')
})

// 区域填充的字符串
const areaPoints = computed(() => {
  const firstX = points.value.length > 0 ? points.value[0].x : 0
  const lastX = points.value.length > 0 ? points.value[points.value.length - 1].x : 0
  return `${firstX},170 ${linePoints.value} ${lastX},170`
})

// 12个月趋势数据
const monthlyTrend = computed(() => {
  const months = []
  const counts = []
  
  // 先筛选主日期范围的数据
  const filtered = records.value.filter(record => {
    const date = record.training_date || record.created_at
    if (startDate.value && endDate.value) {
      return isDateInRange(date, startDate.value, endDate.value)
    }
    return true
  })
  
  for (let i = 11; i >= 0; i--) {
    const now = new Date()
    const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
    const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59)
    
    const monthData = filtered.filter(record => {
      const recordDateStr = getDateString(record.training_date) || getDateString(record.created_at)
      if (!recordDateStr) return false
      const recordDate = new Date(recordDateStr)
      return recordDate >= monthStart && recordDate <= monthEnd
    })
    
    const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                       'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
    months.push(monthNames[targetDate.getMonth()])
    counts.push(getUniqueEmployees(monthData))
  }
  
  return { months, counts }
})

// 找到12个月最大值
const maxMonthly = computed(() => {
  return Math.max(...monthlyTrend.value.counts, 1)
})

// 计算12个月图表点
const monthlyPoints = computed(() => {
  const result = []
  const stepX = 700 / (monthlyTrend.value.counts.length || 1)
  const startX = stepX / 2
  
  monthlyTrend.value.counts.forEach((count, index) => {
    const height = maxMonthly.value > 0 ? (count / maxMonthly.value) * 140 : 0
    result.push({
      x: startX + (index * stepX),
      y: 170 - height
    })
  })
  
  return result
})

// 12个月折线的字符串
const monthlyLinePoints = computed(() => {
  return monthlyPoints.value.map(p => `${p.x},${p.y}`).join(' ')
})

// 12个月区域填充的字符串
const monthlyAreaPoints = computed(() => {
  const firstX = monthlyPoints.value.length > 0 ? monthlyPoints.value[0].x : 0
  const lastX = monthlyPoints.value.length > 0 ? monthlyPoints.value[monthlyPoints.value.length - 1].x : 0
  return `${firstX},170 ${monthlyLinePoints.value} ${lastX},170`
})

// 监听 dateFilter 变化
watch(dateFilter, () => {
  updateDateRange()
})

onMounted(() => {
  initDateRange()
  fetchRecords()
})

// 格式化泰国日期
const formatThaiDate = (dateStr) => {
  if (!dateStr) return '-'
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB')
  } catch (e) {
    return dateStr
  }
}

// 获取对应时间段的记录
const getPeriodRecords = (period) => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  
  // 本周开始（周一）
  const dayOfWeek = today.getDay()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  weekStart.setHours(0, 0, 0, 0)
  
  // 本月开始
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  monthStart.setHours(0, 0, 0, 0)
  
  // 本年开始
  const yearStart = new Date(now.getFullYear(), 0, 1)
  yearStart.setHours(0, 0, 0, 0)

  // 辅助函数：检查记录是否在某个日期之后
  const isOnOrAfter = (record, targetDate) => {
    const recordDateStr = getDateString(record.training_date) || getDateString(record.created_at)
    if (!recordDateStr) return false
    const recordDate = new Date(recordDateStr)
    recordDate.setHours(0, 0, 0, 0)
    return recordDate >= targetDate
  }

  // 辅助函数：检查记录是否是特定日期
  const isDateEqual = (record, targetDate) => {
    const recordDateStr = getDateString(record.training_date) || getDateString(record.created_at)
    if (!recordDateStr) return false
    const recordDate = new Date(recordDateStr)
    recordDate.setHours(0, 0, 0, 0)
    return recordDate.getTime() === targetDate.getTime()
  }

  // 筛选主日期范围的数据
  const filteredData = records.value.filter(record => {
    const date = record.training_date || record.created_at
    if (startDate.value && endDate.value) {
      return isDateInRange(date, startDate.value, endDate.value)
    }
    return true
  })

  switch (period) {
    case 'tomorrow':
      return filteredData.filter(record => isDateEqual(record, tomorrow))
    case 'today':
      return filteredData.filter(record => isDateEqual(record, today))
    case 'week':
      return filteredData.filter(record => isOnOrAfter(record, weekStart))
    case 'month':
      return filteredData.filter(record => isOnOrAfter(record, monthStart))
    case 'year':
      return filteredData.filter(record => isOnOrAfter(record, yearStart))
    default:
      return filteredData
  }
}

// 打开模态框
const openModal = (period) => {
  selectedPeriod.value = period
  modalSearchQuery.value = ''
  switch (period) {
    case 'tomorrow':
      modalTitle.value = 'เรียนวันพรุ่งนี้'
      break
    case 'today':
      modalTitle.value = 'เรียนวันนี้'
      break
    case 'week':
      modalTitle.value = 'เรียนอาทิตย์นี้'
      break
    case 'month':
      modalTitle.value = 'เรียนเดือนนี้'
      break
    case 'year':
      modalTitle.value = 'เรียนปีนี้'
      break
    default:
      modalTitle.value = 'ข้อมูลทั้งหมด'
  }
  isModalOpen.value = true
}

// 搜索结果计算属性
const filteredModalRecords = computed(() => {
  const data = getPeriodRecords(selectedPeriod.value)
  if (!modalSearchQuery.value) return data
  
  const query = modalSearchQuery.value.toLowerCase()
  return data.filter(record => 
    (record.first_name?.toLowerCase().includes(query)) ||
    (record.last_name?.toLowerCase().includes(query)) ||
    (record.id_tdl?.toLowerCase().includes(query)) ||
    (record.employee_id?.toLowerCase().includes(query)) ||
    (record.course_name?.toLowerCase().includes(query)) ||
    (record.position?.toLowerCase().includes(query)) ||
    (record.department?.toLowerCase().includes(query))
  )
})

// 关闭模态框
const closeModal = () => {
  isModalOpen.value = false
  selectedPeriod.value = null
}

// 导出Excel
const exportToExcel = () => {
  const data = filteredModalRecords.value
  
  // 准备Excel数据
  const excelData = data.map(record => ({
    'กลุ่ม': record.group || '-',
    'รหัส TDL': record.id_tdl || '-',
    'รหัสล้านช้าง': record.employee_id || '-',
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
  const fileName = `${modalTitle.value}_${new Date().toISOString().split('T')[0]}.xlsx`
  XLSX.writeFile(wb, fileName)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">แดชบอร์ด</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ภาพรวมข้อมูลการฝึกอบรมพนักงาน</p>
      </div>
      
      <!-- Date Filter Tabs -->
      <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
        <button v-for="option in dateOptions" :key="option.id"
                @click="dateFilter = option.id; updateDateRange()"
                :class="[
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  dateFilter === option.id
                    ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                ]">
          {{ option.label }}
        </button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <!-- Tomorrow -->
      <div @click="openModal('tomorrow')" class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm cursor-pointer hover:shadow-md hover:border-orange-300 dark:hover:border-orange-700 transition-all">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">เรียนวันพรุ่งนี้</p>
            <p class="text-3xl font-bold text-orange-600 dark:text-orange-400 mt-1">{{ loading ? '-' : stats.tomorrow }}</p>
            <p class="text-xs text-gray-400 mt-1">คน</p>
          </div>
          <div class="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
            <CalendarIcon class="h-6 w-6 text-orange-500" />
          </div>
        </div>
      </div>

      <!-- Today -->
      <div @click="openModal('today')" class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm cursor-pointer hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">เรียนวันนี้</p>
            <p class="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">{{ loading ? '-' : stats.today }}</p>
            <p class="text-xs text-gray-400 mt-1">คน</p>
          </div>
          <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
            <CalendarIcon class="h-6 w-6 text-blue-500" />
          </div>
        </div>
      </div>

      <!-- This Week -->
      <div @click="openModal('week')" class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm cursor-pointer hover:shadow-md hover:border-green-300 dark:hover:border-green-700 transition-all">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">เรียนอาทิตย์นี้</p>
            <p class="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{{ loading ? '-' : stats.week }}</p>
            <p class="text-xs text-gray-400 mt-1">คน</p>
          </div>
          <div class="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
            <UserGroupIcon class="h-6 w-6 text-green-500" />
          </div>
        </div>
      </div>

      <!-- This Month -->
      <div @click="openModal('month')" class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm cursor-pointer hover:shadow-md hover:border-purple-300 dark:hover:border-purple-700 transition-all">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">เรียนเดือนนี้</p>
            <p class="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-1">{{ loading ? '-' : stats.month }}</p>
            <p class="text-xs text-gray-400 mt-1">คน</p>
          </div>
          <div class="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
            <AcademicCapIcon class="h-6 w-6 text-purple-500" />
          </div>
        </div>
      </div>

      <!-- This Year -->
      <div @click="openModal('year')" class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm cursor-pointer hover:shadow-md hover:border-pink-300 dark:hover:border-pink-700 transition-all">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">เรียนปีนี้</p>
            <p class="text-3xl font-bold text-pink-600 dark:text-pink-400 mt-1">{{ loading ? '-' : stats.year }}</p>
            <p class="text-xs text-gray-400 mt-1">คน</p>
          </div>
          <div class="p-3 bg-pink-50 dark:bg-pink-900/20 rounded-xl">
            <ChartBarIcon class="h-6 w-6 text-pink-500" />
          </div>
        </div>
      </div>

      <!-- Total -->
      <div @click="openModal('total')" class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm cursor-pointer hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">ข้อมูลทั้งหมด</p>
            <p class="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{{ loading ? '-' : stats.total }}</p>
            <p class="text-xs text-gray-400 mt-1">คน</p>
          </div>
          <div class="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
            <UserGroupIcon class="h-6 w-6 text-indigo-500" />
          </div>
        </div>
      </div>
    </div>

    <!-- Trend Charts - Two Side by Side -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- 7 Day Trend Chart -->
      <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">แนวโน้มการเข้าฝึกรายวัน (7 วัน)</h3>
        <div class="h-64">
          <div v-if="loading" class="flex items-center justify-center h-full">
            <div class="animate-pulse text-gray-400">กำลังโหลด...</div>
          </div>
          <div v-else-if="records.length === 0" class="flex items-center justify-center h-full text-gray-400">
            ไม่มีข้อมูล
          </div>
          <div v-else class="relative w-full h-full">
            <!-- SVG Line Chart -->
            <svg :viewBox="`0 0 400 200`" class="w-full h-full">
              <!-- Grid lines -->
              <line x1="0" y1="170" x2="400" y2="170" stroke="#e5e7eb" stroke-width="1"/>
              <line x1="0" y1="120" x2="400" y2="120" stroke="#f3f4f6" stroke-width="1"/>
              <line x1="0" y1="70" x2="400" y2="70" stroke="#f3f4f6" stroke-width="1"/>
              <line x1="0" y1="20" x2="400" y2="20" stroke="#f3f4f6" stroke-width="1"/>
              
              <!-- Y-axis labels -->
              <text x="5" y="175" font-size="10" fill="#9ca3af">0</text>
              <text x="5" y="125" font-size="10" fill="#9ca3af" v-if="maxDaily > 0">{{ Math.round(maxDaily / 2) }}</text>
              <text x="5" y="25" font-size="10" fill="#9ca3af" v-if="maxDaily > 0">{{ maxDaily }}</text>
              
              <!-- Area fill -->
              <polygon
                :points="areaPoints"
                fill="url(#areaGradient)"
                opacity="0.3"
              />
              
              <!-- Line -->
              <polyline
                :points="linePoints"
                fill="none"
                stroke="#3b82f6"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              
              <!-- Dots and labels -->
              <g v-for="(point, index) in points" :key="index">
                <!-- Dot -->
                <circle
                  :cx="point.x"
                  :cy="point.y"
                  r="6"
                  fill="#3b82f6"
                  stroke="white"
                  stroke-width="2"
                  class="transition-all duration-300 hover:r-8"
                />
                <!-- Value label above dot -->
                <text
                  :x="point.x"
                  :y="point.y - 12"
                  text-anchor="middle"
                  font-size="12"
                  font-weight="bold"
                  fill="#1f2937"
                >
                  {{ dailyTrend.counts[index] }}
                </text>
                <!-- Day label below -->
                <text
                  :x="point.x"
                  y="190"
                  text-anchor="middle"
                  font-size="11"
                  font-weight="500"
                  fill="#6b7280"
                >
                  {{ dailyTrend.days[index] }}
                </text>
              </g>
              
              <!-- Gradient -->
              <defs>
                <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0.4" />
                  <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:0" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      <!-- 12 Month Trend Chart -->
      <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">แนวโน้มการเข้าฝึกรายเดือน (12 เดือน)</h3>
        <div class="h-64">
          <div v-if="loading" class="flex items-center justify-center h-full">
            <div class="animate-pulse text-gray-400">กำลังโหลด...</div>
          </div>
          <div v-else-if="records.length === 0" class="flex items-center justify-center h-full text-gray-400">
            ไม่มีข้อมูล
          </div>
          <div v-else class="relative w-full h-full overflow-x-auto">
            <!-- SVG Line Chart -->
            <svg :viewBox="`0 0 700 200`" class="w-full min-w-[700px] h-full">
              <!-- Grid lines -->
              <line x1="0" y1="170" x2="700" y2="170" stroke="#e5e7eb" stroke-width="1"/>
              <line x1="0" y1="120" x2="700" y2="120" stroke="#f3f4f6" stroke-width="1"/>
              <line x1="0" y1="70" x2="700" y2="70" stroke="#f3f4f6" stroke-width="1"/>
              <line x1="0" y1="20" x2="700" y2="20" stroke="#f3f4f6" stroke-width="1"/>
              
              <!-- Y-axis labels -->
              <text x="5" y="175" font-size="10" fill="#9ca3af">0</text>
              <text x="5" y="125" font-size="10" fill="#9ca3af" v-if="maxMonthly > 0">{{ Math.round(maxMonthly / 2) }}</text>
              <text x="5" y="25" font-size="10" fill="#9ca3af" v-if="maxMonthly > 0">{{ maxMonthly }}</text>
              
              <!-- Area fill -->
              <polygon
                :points="monthlyAreaPoints"
                fill="url(#monthlyAreaGradient)"
                opacity="0.3"
              />
              
              <!-- Line -->
              <polyline
                :points="monthlyLinePoints"
                fill="none"
                stroke="#8b5cf6"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              
              <!-- Dots and labels -->
              <g v-for="(point, index) in monthlyPoints" :key="index">
                <!-- Dot -->
                <circle
                  :cx="point.x"
                  :cy="point.y"
                  r="6"
                  fill="#8b5cf6"
                  stroke="white"
                  stroke-width="2"
                  class="transition-all duration-300 hover:r-8"
                />
                <!-- Value label above dot -->
                <text
                  :x="point.x"
                  :y="point.y - 12"
                  text-anchor="middle"
                  font-size="12"
                  font-weight="bold"
                  fill="#1f2937"
                >
                  {{ monthlyTrend.counts[index] }}
                </text>
                <!-- Month label below -->
                <text
                  :x="point.x"
                  y="195"
                  text-anchor="middle"
                  font-size="9"
                  font-weight="500"
                  fill="#6b7280"
                >
                  {{ monthlyTrend.months[index] }}
                </text>
              </g>
              
              <!-- Gradient -->
              <defs>
                <linearGradient id="monthlyAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style="stop-color:#8b5cf6;stop-opacity:0.4" />
                  <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:0" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Course Charts - Two Side by Side -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Course Pie Chart -->
      <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4 text-center">หลักสูตรยอดนิยม (แผนภูมิวงกลม)</h3>
        <div class="h-64">
          <div v-if="loading" class="flex items-center justify-center h-full">
            <div class="animate-pulse text-gray-400">กำลังโหลด...</div>
          </div>
          <div v-else-if="pieChartData.length === 0" class="flex items-center justify-center h-full text-gray-400">
            ไม่มีข้อมูล
          </div>
          <div v-else class="flex items-center gap-6 h-full">
            <!-- Pie Chart -->
            <div class="flex-shrink-0">
              <svg viewBox="0 0 100 100" class="w-48 h-48">
                <path v-for="(course, index) in pieChartData" :key="index"
                      :d="course.path"
                      :fill="course.color"
                      class="transition-all duration-300 hover:opacity-80 cursor-pointer"
                      :title="`${course.name}: ${course.count} คน (${course.percentage}%)`">
                </path>
              </svg>
            </div>
            <!-- Legend -->
            <div class="flex-1 overflow-y-auto max-h-full">
              <div class="space-y-2">
                <div v-for="(course, index) in pieChartData" :key="index" class="flex items-center gap-2">
                  <div class="w-4 h-4 rounded flex-shrink-0" :style="{ backgroundColor: course.color }"></div>
                  <span class="text-sm text-gray-700 dark:text-gray-300 truncate flex-1" :title="course.name">
                    {{ course.name }}
                  </span>
                  <span class="text-sm font-bold text-gray-900 dark:text-white flex-shrink-0">
                    {{ course.count }}
                  </span>
                  <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                    ({{ course.percentage }}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Course Bar Chart -->
      <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4 text-center">หลักสูตรยอดนิยม (แผนภูมิแท่ง)</h3>
        <div class="h-64 overflow-y-auto">
          <div v-if="loading" class="flex items-center justify-center h-full">
            <div class="animate-pulse text-gray-400">กำลังโหลด...</div>
          </div>
          <div v-else-if="courseStats.length === 0" class="flex items-center justify-center h-full text-gray-400">
            ไม่มีข้อมูล
          </div>
          <div v-else class="space-y-3 pr-2">
            <div v-for="(course, index) in courseStats" :key="index" class="flex items-center gap-4">
              <!-- Course Name -->
              <div class="w-32 text-right">
                <span class="text-sm text-gray-700 dark:text-gray-300 truncate" :title="course.name">
                  {{ course.name }}
                </span>
              </div>
              <!-- Bar Container -->
              <div class="flex-1 relative">
                <!-- Bar -->
                <div class="relative">
                  <div class="h-7 bg-gradient-to-r from-blue-400 to-blue-600 rounded-r-lg flex items-center justify-end pr-3 transition-all duration-500"
                       :style="{ width: `${(course.count / maxCourse) * 100}%` }">
                    <!-- Count on bar -->
                    <span class="text-white text-sm font-bold">
                      {{ course.count }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
              <h3 class="text-xl font-bold text-gray-900 dark:text-white">{{ modalTitle }}</h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">จำนวน: {{ filteredModalRecords.length }} คน</p>
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
                      <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัสล้านช้าง</th>
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
