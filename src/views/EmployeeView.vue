<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabaseExternal } from '../server/supabase_data'
import { MagnifyingGlassIcon, FunnelIcon } from '@heroicons/vue/24/outline'

const employees = ref([])
const loading = ref(true)
const searchQuery = ref('')
const selectedDepartment = ref('ทั้งหมด')

const fetchEmployees = async () => {
  try {
    loading.value = true
    let allData = []
    let page = 0
    const pageSize = 1000
    let hasMore = true

    while (hasMore) {
      const { data, error } = await supabaseExternal
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (error) throw error
      
      if (data && data.length > 0) {
        allData = [...allData, ...data]
        if (data.length < pageSize) {
          hasMore = false
        } else {
          page++
        }
      } else {
        hasMore = false
      }
    }

    employees.value = allData
    
    // ตรวจสอบข้อมูลตัวแรกเพื่อดูว่ามี field อะไรบ้าง
    if (allData.length > 0) {
      console.log('Employee data sample:', allData[0])
      console.log('All available fields:', Object.keys(allData[0]))
    }
  } catch (error) {
    console.error('Error fetching employees:', error.message)
  } finally {
    loading.value = false
  }
}

const departments = computed(() => {
  const deps = employees.value
    .map(emp => emp.department)
    .filter(Boolean)
  return ['ทั้งหมด', ...new Set(deps)]
})

const filteredEmployees = () => {
  let result = employees.value

  if (selectedDepartment.value !== 'ทั้งหมด') {
    result = result.filter(emp => emp.department === selectedDepartment.value)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(emp => 
      emp.employee_code?.toLowerCase().includes(query) ||
      emp.fullname?.toLowerCase().includes(query) ||
      emp.firstname?.toLowerCase().includes(query) ||
      emp.lastname?.toLowerCase().includes(query) ||
      emp.position?.toLowerCase().includes(query) ||
      emp.department?.toLowerCase().includes(query) ||
      emp.project?.toLowerCase().includes(query)
    )
  }

  return result
}

// ฟังก์ชันแปลงชื่อ-นามสกุล (ทำความเข้ากันกับฐานข้อมูลใหม่)
const getEmployeeName = (emp) => {
  return emp.fullname || (emp.firstname && emp.lastname ? `${emp.firstname} ${emp.lastname}` : (emp.firstname || emp.lastname || '-'))
}

const getEmployeeLaoName = (emp) => {
  return emp.lao_name || '-'
}

const getStartDate = (emp) => {
  return emp.start_date ? new Date(emp.start_date).toLocaleDateString('en-GB') : '-'
}

const getEmployeeStatus = (emp) => {
  // ถ้าไม่มี status field เลย
  if (!emp.status) return 'Unknown'
  
  const status = emp.status.toLowerCase().trim()
  
  // เก็บค่า status ที่เป็นภาษาไทยหรืออังกฤษที่เหมือนกัน
  const activeStatuses = ['active', 'ทำงานอยู่', 'พนักงาน']
  const resignedStatuses = ['resigned', 'ลาออก', 'ออกงาน']
  
  if (activeStatuses.some(s => status.includes(s))) {
    return 'ทำงานอยู่'
  } else if (resignedStatuses.some(s => status.includes(s))) {
    return 'ลาออก'
  } else {
    return emp.status
  }
}

const getStatusClass = (emp) => {
  if (!emp.status) return 'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
  
  const status = emp.status.toLowerCase().trim()
  const activeStatuses = ['active', 'ทำงานอยู่', 'พนักงาน']
  const resignedStatuses = ['resigned', 'ลาออก', 'ออกงาน']
  
  if (activeStatuses.some(s => status.includes(s))) {
    return 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
  } else if (resignedStatuses.some(s => status.includes(s))) {
    return 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
  } else {
    return 'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
  }
}

onMounted(() => {
  fetchEmployees()
})
</script>

<template>
  <div class="space-y-6">

    <!-- ✅ หัวข้อหน้า -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ข้อมูลพนักงาน</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">รายชื่อและข้อมูลพนักงานทั้งหมดในระบบ</p>
      </div>
      <div class="text-sm text-gray-500 dark:text-gray-400">
        พนักงานทั้งหมด: <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ filteredEmployees().length }} คน</span>
      </div>
    </div>

    <!-- Header Actions -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
        <div class="relative max-w-sm w-full">
          <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon class="h-5 w-5 text-gray-400" />
          </span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="ค้นหาชื่อ, รหัสพนักงาน, โครงการ..."
            class="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>

        <select
          v-model="selectedDepartment"
          class="block w-full sm:w-48 pl-3 pr-10 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
        >
          <option v-for="dep in departments" :key="dep" :value="dep">
            {{ dep === 'ทั้งหมด' ? 'ทุกแผนก' : dep }}
          </option>
        </select>
      </div>
    </div>

    <!-- Table Container -->
    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">พนักงาน</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัสพนักงาน</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">แผนก / โครงการ</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตำแหน่ง</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">วันที่เริ่มงาน</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <template v-if="loading">
              <tr v-for="i in 3" :key="i" class="animate-pulse">
                <td colspan="6" class="px-6 py-4">
                  <div class="h-10 bg-gray-100 dark:bg-gray-900 rounded-lg w-full"></div>
                </td>
              </tr>
            </template>
            <tr v-else-if="filteredEmployees().length === 0" class="text-center">
              <td colspan="6" class="px-6 py-12 text-gray-500 dark:text-gray-400 italic">
                ไม่พบข้อมูลพนักงาน
              </td>
            </tr>
            <tr 
              v-for="emp in filteredEmployees()" 
              :key="emp.id"
              class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors group"
            >
              <td class="px-6 py-4 whitespace-nowrap">
                <div>
                  <div class="text-sm font-bold text-gray-900 dark:text-white">
                    {{ getEmployeeName(emp) }}
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    {{ getEmployeeLaoName(emp) }}
                  </div>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-600 dark:text-gray-400">
                {{ emp.employee_code }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900 dark:text-white">{{ emp.department || '-' }}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400">{{ emp.project || '-' }}</div>
              </td>
              <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-[150px] break-words">
                {{ emp.position || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ getStartDate(emp) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span 
                  :class="[
                    'px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider',
                    getStatusClass(emp)
                  ]"
                >
                  {{ getEmployeeStatus(emp) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- Footer Info -->
      <div class="px-6 py-4 bg-gray-50/30 dark:bg-gray-900/30 border-t border-gray-200 dark:border-gray-800">
        <p class="text-xs text-gray-500 dark:text-gray-400">
          แสดงข้อมูลพนักงานทั้งหมด {{ filteredEmployees().length }} คน
        </p>
      </div>
    </div>
  </div>
</template>