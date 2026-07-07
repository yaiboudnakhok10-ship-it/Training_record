<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabaseInternal } from '../server/supabase'
import { ArrowLeftIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline'

const router = useRouter()
const route = useRoute()

// 状态管理
const employeeData = ref(null)
const loading = ref(true)
const completedCourses = ref([])
const registeredCourses = ref([])
const allCourses = ref([])
const employeeList = ref([])
const searchQuery = ref('')
const departmentFilter = ref('')
const selectedEmployee = ref(null)
const showDetail = ref(false)

// 获取所有唯一部门
const departmentOptions = computed(() => {
  const departments = new Set()
  employeeList.value.forEach(emp => {
    if (emp.department) {
      departments.add(emp.department)
    }
  })
  return Array.from(departments).sort()
})

// 筛选员工列表
const filteredEmployeeList = computed(() => {
  let result = employeeList.value
  
  // 搜索筛选
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(emp => 
      emp.full_name?.toLowerCase().includes(query) ||
      emp.tdl_code?.toLowerCase().includes(query) ||
      emp.id_lxml?.toLowerCase().includes(query) ||
      emp.department?.toLowerCase().includes(query)
    )
  }
  
  // 部门筛选
  if (departmentFilter.value) {
    result = result.filter(emp => emp.department === departmentFilter.value)
  }
  
  return result
})

// 获取所有员工列表
const fetchEmployeeList = async () => {
  try {
    loading.value = true
    const { data, error } = await supabaseInternal
      .from('employee_course_registration')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    employeeList.value = data
    console.log('Fetched employee list:', data?.length, 'employees')
  } catch (error) {
    console.error('Error fetching employee list:', error.message)
  } finally {
    loading.value = false
  }
}

// 获取员工详细信息
const fetchEmployeeData = async (employee) => {
  try {
    loading.value = true
    const tdlCode = employee?.tdl_code || route.query.code
    const firstName = employee?.full_name?.split(' ')[0] || route.query.first_name
    const lastName = employee?.full_name?.split(' ').slice(1).join(' ') || route.query.last_name
    console.log('Fetching data - tdlCode:', tdlCode, 'firstName:', firstName, 'lastName:', lastName)

    // 1. 从 employee_training_records 获取该员工的所有课程（显示所有，包括重复的）
    let trainingQuery = supabaseInternal
      .from('employee_training_records')
      .select('*')

    if (tdlCode) {
      trainingQuery = trainingQuery.eq('id_tdl', tdlCode)
    } else if (firstName && lastName) {
      trainingQuery = trainingQuery
        .eq('first_name', firstName)
        .eq('last_name', lastName)
    }

    const { data: trainingData, error: trainingError } = await trainingQuery
    if (trainingError) throw trainingError
    console.log('Training data:', trainingData)

    // 处理训练数据 - 获取员工基本信息
    if (trainingData && trainingData.length > 0) {
      const firstRecord = trainingData[0]
      console.log('First training record:', firstRecord)
      employeeData.value = {
        group: firstRecord.group,
        id_tdl: firstRecord.id_tdl,
        employee_id: firstRecord.employee_id,
        first_name: firstRecord.first_name,
        last_name: firstRecord.last_name,
        position: firstRecord.position,
        department: firstRecord.department,
        gender: firstRecord.gender,
        nationality: firstRecord.nationality,
        status: firstRecord.status,
        status_card: firstRecord.status_card,
        date_health_check: firstRecord.date_health_check,
        date_health_expiry: firstRecord.date_health_expiry
      }
      console.log('Set employeeData from training:', employeeData.value)
    }

    // 显示所有课程（包括重复的）
    trainingData.forEach(record => {
      if (record.course_name) {
        completedCourses.value.push({
          name: record.course_name,
          trainingDate: record.training_date,
          reDate: record.re_date,
          statusRe: record.status_re,
          status: record.status_courses || 'ผ่านแล้ว'
        })
      }
    })

    // 2. 从 employee_course_registration 获取注册课程 - 只显示该员工在表里有的课程
    let registrationQuery = supabaseInternal
      .from('employee_course_registration')
      .select('*')

    if (tdlCode) {
      registrationQuery = registrationQuery.eq('tdl_code', tdlCode)
    } else if (firstName && lastName) {
      registrationQuery = registrationQuery.eq('full_name', `${firstName} ${lastName}`)
    }

    const { data: registrationData, error: registrationError } = await registrationQuery
    if (registrationError) throw registrationError
    console.log('Registration data:', registrationData)

    // 如果还没有员工数据，从 registration 中获取
    if (registrationData && registrationData.length > 0 && !employeeData.value) {
      const firstRegRecord = registrationData[0]
      employeeData.value = {
        group_name: firstRegRecord.group_name,
        tdl_code: firstRegRecord.tdl_code,
        id_lxml: firstRegRecord.id_lxml,
        full_name: firstRegRecord.full_name,
        position: firstRegRecord.position,
        department: firstRegRecord.department,
        gender: firstRegRecord.gender,
        nationality: firstRegRecord.nationality,
        status: firstRegRecord.status
      }
      console.log('Set employeeData from registration:', employeeData.value)
    }

    // 只从 employee_course_registration 表里有的课程，排除已完成的课程
    const completedCourseNames = new Set(trainingData.map(r => r.course_name))
    const registeredCourseSet = new Set()
    registrationData.forEach(record => {
      if (record.course_name) {
        const courseNames = record.course_name.split(/[,，]/).map(c => c.trim()).filter(c => c)
        courseNames.forEach(courseName => {
          // 排除已经完成的课程
          if (!completedCourseNames.has(courseName) && !registeredCourseSet.has(courseName)) {
            registeredCourseSet.add(courseName)
            registeredCourses.value.push({
              name: courseName,
              status: 'ยังไม่ได้เรียน'
            })
          }
        })
      }
    })

  } catch (error) {
    console.error('Error fetching employee data:', error.message)
  } finally {
    loading.value = false
    console.log('Final employeeData:', employeeData.value)
    console.log('Final completedCourses:', completedCourses.value)
    console.log('Final registeredCourses:', registeredCourses.value)
  }
}

// 查看员工详情
const viewEmployeeDetail = (employee) => {
  selectedEmployee.value = employee
  showDetail.value = true
  // 清空旧数据
  completedCourses.value = []
  registeredCourses.value = []
  employeeData.value = null
  console.log('Viewing employee:', employee)
  fetchEmployeeData(employee)
}

// 返回列表
const backToList = () => {
  showDetail.value = false
  selectedEmployee.value = null
  employeeData.value = null
  completedCourses.value = []
  registeredCourses.value = []
}

// 获取员工姓名
const getEmployeeName = () => {
  if (!employeeData.value) return '-'
  if (employeeData.value.full_name) return employeeData.value.full_name
  if (employeeData.value.first_name && employeeData.value.last_name) {
    return `${employeeData.value.first_name} ${employeeData.value.last_name}`
  }
  return '-'
}

// 图表数据计算
const chartData = computed(() => {
  return {
    completed: completedCourses.value.length,
    registered: registeredCourses.value.length
  }
})

const maxChartValue = computed(() => {
  return Math.max(chartData.value.completed, chartData.value.registered, 1)
})

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-GB')
}

// 初始化
onMounted(async () => {
  await fetchEmployeeList()
  
  // 检查是否有查询参数
  if (route.query.code || (route.query.first_name && route.query.last_name)) {
    showDetail.value = true
    await fetchEmployeeData(null)
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <button
        v-if="showDetail"
        @click="backToList"
        class="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-lg transition-colors"
      >
        <ArrowLeftIcon class="w-6 h-6" />
      </button>
      <button
        v-else
        @click="router.back()"
        class="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-lg transition-colors"
      >
        <ArrowLeftIcon class="w-6 h-6" />
      </button>
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ showDetail ? 'ข้อมูลบุคคลหลักสูตร' : 'รายชื่อพนักงาน' }}
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {{ showDetail && employeeData ? `สรุปข้อมูลหลักสูตรของ ${getEmployeeName()}` : 'เลือกพนักงานเพื่อดูข้อมูลหลักสูตร' }}
        </p>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="animate-pulse text-gray-500">กำลังโหลด...</div>
    </div>

    <!-- Employee List -->
    <div v-else-if="!showDetail" class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">รายชื่อพนักงาน</h3>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          รายการทั้งหมด: <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ filteredEmployeeList.length }}</span> รายการ
        </div>
      </div>
      
      <!-- Search and Filter -->
      <div class="flex flex-col sm:flex-row gap-4 mb-4">
        <div class="relative max-w-sm flex-1">
          <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon class="h-5 w-5 text-gray-400" />
          </span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="ค้นหาชื่อ, รหัส TDL, รหัสล้านช้าง..."
            class="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
        <div class="relative max-w-xs">
          <select
            v-model="departmentFilter"
            class="block w-full pl-3 pr-10 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          >
            <option value="">ทุกแผนก</option>
            <option v-for="dept in departmentOptions" :key="dept" :value="dept">
              {{ dept }}
            </option>
          </select>
        </div>
      </div>

      <!-- Employee List Table -->
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
              <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <tr v-if="filteredEmployeeList.length === 0" class="text-center">
              <td colspan="8" class="px-4 py-12 text-gray-500 dark:text-gray-400 italic">
                ไม่พบข้อมูล
              </td>
            </tr>
            <tr
              v-for="employee in filteredEmployeeList"
              :key="employee.id"
              @click="viewEmployeeDetail(employee)"
              class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors cursor-pointer"
            >
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ employee.group_name || '-' }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ employee.tdl_code || '-' }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ employee.id_lxml || '-' }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                {{ employee.full_name }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ employee.gender || '-' }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ employee.position || '-' }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ employee.department || '-' }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                <span :class="[
                  'px-2 py-1 rounded-full text-xs font-bold uppercase',
                  employee.status === 'สำเร็จ' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                  employee.status === 'กำลังดำเนินการ' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' :
                  'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
                ]">
                  {{ employee.status || '-' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- No Data Found -->
    <div v-else-if="showDetail && !employeeData" class="text-center py-12 text-gray-500">
      ไม่พบข้อมูลพนักงาน
    </div>

    <!-- Employee Detail -->
    <div v-else-if="employeeData" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Employee Info -->
      <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">ข้อมูลส่วนตัว</h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">รหัส TDL</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ employeeData?.id_tdl || employeeData?.tdl_code || '-' }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">รหัสล้านช้าง</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ employeeData?.employee_id || employeeData?.id_lxml || '-' }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">ชื่อ-นามสกุล</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ getEmployeeName() }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">กลุ่ม</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ employeeData?.group || employeeData?.group_name || '-' }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">แผนก</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ employeeData?.department || '-' }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">ตำแหน่ง</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ employeeData?.position || '-' }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">เพศ</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ employeeData?.gender || '-' }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">สัญชาติ</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ employeeData?.nationality || '-' }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">สถานะ</span>
            <span class="px-2 py-1 rounded-full text-xs font-bold bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400">
              {{ employeeData?.status || '-' }}
            </span>
          </div>
          <div v-if="employeeData?.date_health_check" class="flex justify-between items-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">วันตรวจสุขภาพ</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ formatDate(employeeData.date_health_check) }}</span>
          </div>
          <div v-if="employeeData?.date_health_expiry" class="flex justify-between items-center">
            <span class="text-sm text-gray-600 dark:text-gray-400">วันหมดอายุตรวจสุขภาพ</span>
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ formatDate(employeeData.date_health_expiry) }}</span>
          </div>
        </div>
      </div>

      <!-- Chart -->
      <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">สรุปหลักสูตร</h3>
        <div class="flex items-end gap-8 h-64">
          <!-- Completed Courses -->
          <div class="flex flex-col items-center flex-1">
            <div class="relative flex-1 w-full flex items-end justify-center">
              <div
                class="w-24 bg-gradient-to-t from-green-600 to-green-400 rounded-t-lg transition-all duration-500"
                :style="{ height: `${(chartData.completed / maxChartValue) * 100 }%` }"
              ></div>
            </div>
            <div class="mt-4 text-center">
              <div class="text-3xl font-bold text-green-600">{{ chartData.completed }}</div>
              <div class="text-sm text-gray-600 dark:text-gray-400">หลักสูตรที่เรียนแล้ว</div>
            </div>
          </div>

          <!-- Registered Courses -->
          <div class="flex flex-col items-center flex-1">
            <div class="relative flex-1 w-full flex items-end justify-center">
              <div
                class="w-24 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-lg transition-all duration-500"
                :style="{ height: `${(chartData.registered / maxChartValue) * 100 }%` }"
              ></div>
            </div>
            <div class="mt-4 text-center">
              <div class="text-3xl font-bold text-blue-600">{{ chartData.registered }}</div>
              <div class="text-sm text-gray-600 dark:text-gray-400">หลักสูตรที่ลงทะเบียน</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Completed Courses List -->
      <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">
          หลักสูตรที่เรียนแล้ว ({{ completedCourses.length }})
        </h3>
        <div v-if="completedCourses.length === 0" class="text-center py-8 text-gray-500">
          ไม่พบข้อมูล
        </div>
        <div v-else class="space-y-2 max-h-64 overflow-y-auto">
          <div
            v-for="(course, idx) in completedCourses"
            :key="idx"
            class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-medium text-gray-900 dark:text-white">{{ course.name }}</span>
              <span class="px-2 py-1 rounded-full text-xs font-bold bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400">
                {{ course.status }}
              </span>
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              <span v-if="course.trainingDate">วันที่ฝึก: {{ formatDate(course.trainingDate) }}</span>
              <span v-if="course.reDate" class="ml-2">วัน Re: {{ formatDate(course.reDate) }}</span>
              <span v-if="course.statusRe" class="ml-2">สถานะ Re: {{ course.statusRe }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Registered Courses List -->
      <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">
          หลักสูตรที่ลงทะเบียน ({{ registeredCourses.length }})
        </h3>
        <div v-if="registeredCourses.length === 0" class="text-center py-8 text-gray-500">
          ไม่พบข้อมูล
        </div>
        <div v-else class="space-y-2 max-h-64 overflow-y-auto">
          <div
            v-for="(course, idx) in registeredCourses"
            :key="idx"
            class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
          >
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ course.name }}</span>
            <span class="px-2 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
              {{ course.status }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
