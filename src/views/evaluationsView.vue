<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { supabaseInternal } from '../server/supabase'
import { supabaseExternal } from '../server/supabase_data'
import { useAuth } from '../stores/auth'
import { MagnifyingGlassIcon, PlusIcon, PencilSquareIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/solid'
import Swal from 'sweetalert2'

const auth = useAuth()
const evaluations = ref([])
const employees = ref([])
const evaluationTopics = ref([])
const loading = ref(true)
const searchQuery = ref('')
const isSidebarOpen = ref(false)
const editingEvaluation = ref(null)
const tdlSearchQuery = ref('')
const showTdlDropdown = ref(false)
const tdlDropdownRef = ref(null)
const selectedDepartment = ref('')
const startDate = ref('')
const endDate = ref('')

const uniqueDepartments = computed(() => {
  const departments = new Set()
  evaluations.value.forEach(evalItem => {
    if (evalItem.department) {
      departments.add(evalItem.department)
    }
  })
  return Array.from(departments).sort()
})

const filteredEvaluations = computed(() => {
  let filtered = evaluations.value

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(evalItem => 
      evalItem.full_name?.toLowerCase().includes(query) ||
      evalItem.employee_code?.toLowerCase().includes(query) ||
      evalItem.id_lxml?.toLowerCase().includes(query) ||
      evalItem.department?.toLowerCase().includes(query) ||
      evalItem.evaluation_date?.toLowerCase().includes(query)
    )
  }

  // Filter by selected department
  if (selectedDepartment.value) {
    filtered = filtered.filter(evalItem => 
      evalItem.department === selectedDepartment.value
    )
  }

  // Filter by start date
  if (startDate.value) {
    filtered = filtered.filter(evalItem => 
      evalItem.evaluation_date && evalItem.evaluation_date >= startDate.value
    )
  }

  // Filter by end date
  if (endDate.value) {
    filtered = filtered.filter(evalItem => 
      evalItem.evaluation_date && evalItem.evaluation_date <= endDate.value
    )
  }

  return filtered
})

const filteredEmployees = computed(() => {
  if (!tdlSearchQuery.value) return employees.value
  const query = tdlSearchQuery.value.toLowerCase()
  return employees.value.filter(emp => 
    emp.employee_code?.toLowerCase().includes(query) ||
    emp.id_lxml?.toLowerCase().includes(query) ||
    emp.fullname?.toLowerCase().includes(query) ||
    emp.firstname?.toLowerCase().includes(query) ||
    emp.lastname?.toLowerCase().includes(query)
  )
})

const formData = ref({
  employee_code: '',
  full_name: '',
  position: '',
  department: '',
  evaluation_date: '',
  evaluation_type: '',
  id_lxml: ''
})

const fetchEvaluations = async () => {
  try {
    loading.value = true
    const { data, error } = await supabaseInternal
      .from('evaluations')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    evaluations.value = data
  } catch (error) {
    console.error('Error fetching evaluations:', error.message)
  } finally {
    loading.value = false
  }
}

const fetchEmployees = async () => {
  try {
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
  } catch (error) {
    console.error('Error fetching employees:', error.message)
  }
}

const fetchEvaluationTopics = async () => {
  try {
    const { data, error } = await supabaseInternal
      .from('evaluation_topics')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    evaluationTopics.value = data
  } catch (error) {
    console.error('Error fetching evaluation topics:', error.message)
  }
}

const fillEmployeeData = (code) => {
  const employee = employees.value.find(emp => emp.employee_code === code || emp.id_lxml === code)
  if (employee) {
    if (employee.fullname) {
      formData.value.full_name = employee.fullname
    } else {
      formData.value.full_name = `${employee.firstname || ''} ${employee.lastname || ''}`.trim()
    }
    formData.value.position = employee.position || ''
    formData.value.department = employee.department || ''
    formData.value.id_lxml = employee.id_lxml || ''
  }
}

const selectEmployee = (employee) => {
  formData.value.employee_code = employee.employee_code
  tdlSearchQuery.value = employee.fullname || `${employee.firstname} ${employee.lastname}` || employee.employee_code
  showTdlDropdown.value = false
  fillEmployeeData(employee.employee_code)
}

const handleTdlInputClick = () => {
  showTdlDropdown.value = true
  if (!formData.value.employee_code) {
    tdlSearchQuery.value = ''
  }
}

const handleClickOutside = (event) => {
  if (tdlDropdownRef.value && !tdlDropdownRef.value.contains(event.target)) {
    showTdlDropdown.value = false
  }
}

const openAddSidebar = () => {
  editingEvaluation.value = null
  formData.value = {
    employee_code: '',
    full_name: '',
    position: '',
    department: '',
    evaluation_date: '',
    evaluation_type: '',
    id_lxml: ''
  }
  tdlSearchQuery.value = ''
  isSidebarOpen.value = true
}

const openEditSidebar = (evaluation) => {
  editingEvaluation.value = evaluation
  formData.value = { ...evaluation }
  tdlSearchQuery.value = evaluation.full_name || evaluation.employee_code
  isSidebarOpen.value = true
}

const resetFilters = () => {
  searchQuery.value = ''
  selectedDepartment.value = ''
  startDate.value = ''
  endDate.value = ''
}

const closeSidebar = () => {
  isSidebarOpen.value = false
  editingEvaluation.value = null
  formData.value = {
    employee_code: '',
    full_name: '',
    position: '',
    department: '',
    evaluation_date: '',
    evaluation_type: '',
    id_lxml: ''
  }
}

const saveEvaluation = async () => {
  if (!formData.value.employee_code.trim() || !formData.value.evaluation_date || !formData.value.evaluation_type.trim()) {
    Swal.fire({
      title: 'แจ้งเตือน!',
      text: 'กรุณากรอกข้อมูลให้ครบถ้วน',
      icon: 'warning',
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
    // Check for duplicate entry (same employee and same evaluation_date)
    const duplicateCheck = evaluations.value.find(record => 
      record.employee_code === formData.value.employee_code.trim() && 
      record.evaluation_date === formData.value.evaluation_date && 
      record.id !== (editingEvaluation.value?.id || '')
    )

    if (duplicateCheck) {
      Swal.fire({
        title: 'แจ้งเตือน!',
        text: `พนักงาน ${formData.value.full_name} มีบันทึกการประเมินวันที่ ${new Date(formData.value.evaluation_date).toLocaleDateString('en-GB')} แล้ว`,
        icon: 'warning',
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

    if (editingEvaluation.value) {
      const { error } = await supabaseInternal
        .from('evaluations')
        .update({
          employee_code: formData.value.employee_code.trim(),
          id_lxml: formData.value.id_lxml.trim(),
          full_name: formData.value.full_name.trim(),
          position: formData.value.position.trim(),
          department: formData.value.department.trim(),
          evaluation_date: formData.value.evaluation_date,
          evaluation_type: formData.value.evaluation_type.trim(),
          updated_by: auth.user?.fullname || 'Unknown',
          updated_at: new Date().toISOString()
        })
        .eq('id', editingEvaluation.value.id)

      if (error) throw error
    } else {
      const { error } = await supabaseInternal
        .from('evaluations')
        .insert({
          employee_code: formData.value.employee_code.trim(),
          id_lxml: formData.value.id_lxml.trim(),
          full_name: formData.value.full_name.trim(),
          position: formData.value.position.trim(),
          department: formData.value.department.trim(),
          evaluation_date: formData.value.evaluation_date,
          evaluation_type: formData.value.evaluation_type.trim(),
          created_by: auth.user?.fullname || 'Unknown'
        })

      if (error) throw error
    }

    closeSidebar()
    fetchEvaluations()
    
    Swal.fire({
      title: 'บันทึกสำเร็จ!',
      text: 'บันทึกข้อมูลการประเมินเรียบร้อยแล้ว',
      icon: 'success',
      customClass: {
        popup: '!p-3 !max-w-md',
        title: '!text-base',
        htmlContainer: '!text-xs',
        confirmButton: '!px-3 !py-1.5 !text-xs',
        icon: '!scale-75'
      }
    })
  } catch (error) {
    console.error('Error saving evaluation:', error.message)
    Swal.fire({
      title: 'เกิดข้อผิดพลาด!',
      text: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล',
      icon: 'error',
      customClass: {
        popup: '!p-3 !max-w-md',
        title: '!text-base',
        htmlContainer: '!text-xs',
        confirmButton: '!px-3 !py-1.5 !text-xs',
        icon: '!scale-75'
      }
    })
  }
}

const deleteEvaluation = async (evaluation) => {
  const result = await Swal.fire({
    title: 'คุณแน่ใจหรือไม่?',
    text: `คุณต้องการลบการประเมินของ "${evaluation.full_name}" ใช่หรือไม่?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    confirmButtonText: 'ใช่, ลบเลย!',
    cancelButtonText: 'ยกเลิก',
    customClass: {
      popup: '!p-3 !max-w-md',
      title: '!text-base',
      htmlContainer: '!text-xs',
      confirmButton: '!px-3 !py-1.5 !text-xs',
      cancelButton: '!px-3 !py-1.5 !text-xs',
      icon: '!scale-75'
    }
  })

  if (result.isConfirmed) {
    try {
      const { error } = await supabaseInternal
        .from('evaluations')
        .delete()
        .eq('id', evaluation.id)

      if (error) throw error
      fetchEvaluations()
      
      Swal.fire({
        title: 'ลบสำเร็จ!',
        text: 'ลบข้อมูลการประเมินเรียบร้อยแล้ว',
        icon: 'success',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          icon: '!scale-75'
        }
      })
    } catch (error) {
      console.error('Error deleting evaluation:', error.message)
      Swal.fire({
        title: 'เกิดข้อผิดพลาด!',
        text: 'เกิดข้อผิดพลาดในการลบข้อมูล: ' + error.message,
        icon: 'error',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          icon: '!scale-75'
        }
      })
    }
  }
}

onMounted(() => {
  fetchEvaluations()
  fetchEmployees()
  fetchEvaluationTopics()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">บันทึกการประเมิน</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">จัดการข้อมูลการประเมินพนักงาน</p>
      </div>
      <div class="text-sm text-gray-500 dark:text-gray-400">
        รายการทั้งหมด: <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ filteredEvaluations.length }}</span>
      </div>
    </div>

    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex flex-wrap items-center gap-3 w-full sm:w-auto">
        <div class="relative max-w-sm w-full">
          <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon class="h-5 w-5 text-gray-400" />
          </span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="ค้นหารายการ (ชื่อ, รหัส, แผนก)..."
            class="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
        <select
          v-model="selectedDepartment"
          class="px-4 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
        >
          <option value="">ทุกแผนก</option>
          <option v-for="dept in uniqueDepartments" :key="dept" :value="dept">{{ dept }}</option>
        </select>
        <div class="flex items-center gap-2">
          <input
            v-model="startDate"
            type="date"
            class="px-4 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            placeholder="วันที่เริ่มต้น"
          />
          <span class="text-gray-500 dark:text-gray-400">ถึง</span>
          <input
            v-model="endDate"
            type="date"
            class="px-4 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            placeholder="วันที่สิ้นสุด"
          />
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="resetFilters"
          class="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl transition-all shadow-sm"
        >
          <XMarkIcon class="h-5 w-5" />
          ล้างตัวกรอง
        </button>
        <button
          @click="openAddSidebar"
          class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
        >
          <PlusIcon class="h-5 w-5" />
          เพิ่มการประเมิน
        </button>
      </div>
    </div>

    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัสพนักงาน</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัสล้านช้าง</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตำแหน่ง</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">แผนก</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">วันที่ประเมิน</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ประเภทประเมิน</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ผู้สร้าง / วันที่</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">จัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <template v-if="loading">
              <tr v-for="i in 3" :key="i" class="animate-pulse">
                <td colspan="9" class="px-6 py-4">
                  <div class="h-10 bg-gray-100 dark:bg-gray-900 rounded-lg w-full"></div>
                </td>
              </tr>
            </template>
            <tr v-else-if="filteredEvaluations.length === 0" class="text-center">
              <td colspan="9" class="px-6 py-12 text-gray-500 dark:text-gray-400 italic">
                ไม่พบข้อมูลการประเมิน
              </td>
            </tr>
            <tr 
              v-for="evaluation in filteredEvaluations" 
              :key="evaluation.id"
              class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors group"
            >
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                {{ evaluation.employee_code }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                {{ evaluation.id_lxml || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-bold">
                {{ evaluation.full_name }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ evaluation.position || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ evaluation.department || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ evaluation.evaluation_date ? new Date(evaluation.evaluation_date).toLocaleDateString('en-GB') : '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ evaluation.evaluation_type || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  {{ evaluation.created_by || '-' }}
                </div>
                <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {{ evaluation.created_at ? new Date(evaluation.created_at).toLocaleDateString('en-GB') + ' ' + new Date(evaluation.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-' }}
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center gap-2">
                  <button
                    @click="openEditSidebar(evaluation)"
                    class="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                  >
                    <PencilSquareIcon class="h-4 w-4" />
                  </button>
                  <button
                    @click="deleteEvaluation(evaluation)"
                    class="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <TrashIcon class="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div class="px-6 py-4 bg-gray-50/30 dark:bg-gray-900/30 border-t border-gray-200 dark:border-gray-800">
        <p class="text-xs text-gray-500 dark:text-gray-400">
          แสดงข้อมูลการประเมินทั้งหมด {{ filteredEvaluations.length }} รายการ
        </p>
      </div>
    </div>

    <div v-if="isSidebarOpen" class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/50" @click="closeSidebar"></div>
      <div class="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-950 shadow-xl transform transition-transform duration-300">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">
            {{ editingEvaluation ? 'แก้ไขการประเมิน' : 'เพิ่มการประเมิน' }}
          </h3>
          <button @click="closeSidebar" class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900">
            <XMarkIcon class="h-6 w-6" />
          </button>
        </div>

        <div class="p-6 space-y-4">
          <div class="relative" ref="tdlDropdownRef">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รหัสพนักงาน</label>
            <input
              v-model="tdlSearchQuery"
              type="text"
              @click="handleTdlInputClick"
              @input="showTdlDropdown = true"
              placeholder="ค้นหารหัส TDL หรือ id_lxml..."
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
            <!-- Dropdown list -->
            <div v-if="showTdlDropdown" class="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg max-h-60 overflow-y-auto">
              <div
                v-for="emp in filteredEmployees"
                :key="emp.id"
                @click="selectEmployee(emp)"
                class="px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
              >
                <div class="flex flex-col">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-gray-900 dark:text-white">{{ emp.employee_code }}</span>
                    <span v-if="emp.id_lxml" class="text-xs text-gray-500 dark:text-gray-400">{{ emp.id_lxml }}</span>
                  </div>
                  <span class="text-sm text-gray-500 dark:text-gray-400">{{ emp.fullname || `${emp.firstname} ${emp.lastname}` }}</span>
                </div>
              </div>
              <div v-if="filteredEmployees.length === 0" class="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                ไม่พบข้อมูลพนักงาน
              </div>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ชื่อ-นามสกุล</label>
            <input
              v-model="formData.full_name"
              type="text"
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="ชื่อ-นามสกุล จะแสดงอัตโนมัติ"
              readonly
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รหัสล้านช้าง</label>
            <input
              v-model="formData.id_lxml"
              type="text"
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="รหัสล้านช้าง จะแสดงอัตโนมัติ"
              readonly
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ตำแหน่ง</label>
            <input
              v-model="formData.position"
              type="text"
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="ตำแหน่ง จะแสดงอัตโนมัติ"
              readonly
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">แผนก</label>
            <input
              v-model="formData.department"
              type="text"
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="แผนก จะแสดงอัตโนมัติ"
              readonly
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">วันที่ประเมิน</label>
            <input
              v-model="formData.evaluation_date"
              type="date"
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ประเภทประเมิน</label>
            <select
              v-model="formData.evaluation_type"
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              <option value="">เลือกประเภทประเมิน</option>
              <option v-for="topic in evaluationTopics" :key="topic.id" :value="topic.topic_name">
                {{ topic.topic_name }}
              </option>
            </select>
          </div>
        </div>

        <div class="absolute bottom-0 left-0 right-0 p-6 border-t border-gray-200 dark:border-gray-800">
          <div class="flex items-center gap-3">
            <button
              @click="closeSidebar"
              class="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-colors"
            >
              ยกเลิก
            </button>
            <button
              @click="saveEvaluation"
              class="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
            >
              {{ editingEvaluation ? 'บันทึกการแก้ไข' : 'บันทึก' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
