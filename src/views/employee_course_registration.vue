<script setup>
import { ref, onMounted, onUnmounted, onActivated, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabaseInternal } from '../server/supabase'
import { supabaseExternal } from '../server/supabase_data'
import { useAuth } from '../stores/auth'
import { MagnifyingGlassIcon, PlusIcon, PencilSquareIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon, ArrowLeftIcon } from '@heroicons/vue/24/outline'
import Swal from 'sweetalert2'

const router = useRouter()
const auth = useAuth()
const records = ref([])
const courses = ref([])
const employees = ref([])
const loading = ref(true)
const searchQuery = ref('')
const editingRecord = ref(null)
const tdlSearchQuery = ref('')
const showTdlDropdown = ref(false)
const tdlDropdownRef = ref(null)
const expandedRow = ref(null)
const courseSearchQuery = ref('')

// คอมพิวท์สำหรับกรองพนักงานตามคำค้นหา
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

// คอมพิวท์สำหรับกรองหลักสูตรตามคำค้นหา
const filteredCourses = computed(() => {
  if (!courseSearchQuery.value) return courses.value
  const query = courseSearchQuery.value.toLowerCase()
  return courses.value.filter(c => 
    c.course_name?.toLowerCase().includes(query)
  )
})

const formData = ref({
  group_name: '',
  tdl_code: '',
  id_lxml: '',
  full_name: '',
  gender: '',
  position: '',
  department: '',
  nationality: '',
  status: '',
  courses: []
})

const fullNameInput = ref('')

const toggleCourse = (courseName) => {
  const index = formData.value.courses.indexOf(courseName)
  if (index > -1) {
    formData.value.courses.splice(index, 1)
  } else {
    formData.value.courses.push(courseName)
  }
}

const parseFullName = (name) => {
  if (!name) {
    return { first_name: '', last_name: '' }
  }
  const parts = name.trim().split(' ')
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: '' }
  }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' ')
  }
}

const updateNameFromInput = () => {
  formData.value.full_name = fullNameInput.value
}

// ดึงข้อมูล courses สำหรับ dropdown
const fetchCourses = async () => {
  try {
    const { data, error } = await supabaseInternal
      .from('courses')
      .select('*')
      .order('course_name')
    
    if (error) throw error
    courses.value = data
  } catch (error) {
    console.error('Error fetching courses:', error.message)
  }
}

// ดึงข้อมูลพนักงานสำหรับ dropdown
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

// ฟังก์ชันเติมข้อมูลพนักงานอัตโนมัติเมื่อเลือกรหัส TDL หรือ id_lxml
const fillEmployeeData = (code) => {
  const employee = employees.value.find(emp => emp.employee_code === code || emp.id_lxml === code)
  if (employee) {
    formData.value.tdl_code = employee.employee_code || ''
    formData.value.id_lxml = employee.id_lxml || ''
    if (employee.fullname) {
      fullNameInput.value = employee.fullname
    } else {
      fullNameInput.value = `${employee.firstname || ''} ${employee.lastname || ''}`.trim()
    }
    formData.value.full_name = fullNameInput.value
    formData.value.position = employee.position || ''
    formData.value.department = employee.department || ''
    
    // ตรวจสอบเพศจากคอลัมน์ pn ก่อน
    let genderFromPn = ''
    if (employee.pn) {
      const pn = employee.pn.trim()
      if (pn.startsWith('ท้าว') || pn.startsWith('นาย')) {
        genderFromPn = 'ชาย'
      } else if (pn.startsWith('นางสาว') || pn.startsWith('นาง')) {
        genderFromPn = 'หญิง'
      }
    }
    // ใช้เพศจาก pn ถ้ามี ถ้าไม่มีใช้จาก gender field
    formData.value.gender = genderFromPn || employee.gender || ''
    
    formData.value.nationality = employee.nationality || ''
    formData.value.status = employee.status || ''
  }
}

const selectEmployee = (employee) => {
  formData.value.tdl_code = employee.employee_code
  formData.value.id_lxml = employee.id_lxml || ''
  tdlSearchQuery.value = employee.fullname || `${employee.firstname} ${employee.lastname}` || employee.employee_code || employee.id_lxml
  showTdlDropdown.value = false
  fillEmployeeData(employee.employee_code || employee.id_lxml)
}

const handleTdlInputClick = () => {
  showTdlDropdown.value = true
  if (!formData.value.tdl_code) {
    tdlSearchQuery.value = ''
  }
}

const handleClickOutside = (event) => {
  if (tdlDropdownRef.value && !tdlDropdownRef.value.contains(event.target)) {
    showTdlDropdown.value = false
  }
}

const toggleRow = (recordId) => {
  if (expandedRow.value === recordId) {
    expandedRow.value = null
  } else {
    expandedRow.value = recordId
  }
}

const getRecordCourses = (record) => {
  if (record.courses && record.courses.length > 0) {
    return record.courses
  } else if (record.course_name) {
    return record.course_name.split(/[,，]/).map(c => c.trim()).filter(c => c)
  }
  return []
}

const fetchRecords = async () => {
  try {
    loading.value = true
    const { data, error } = await supabaseInternal
      .from('employee_course_registration')
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
  if (!searchQuery.value) return records.value
  const query = searchQuery.value.toLowerCase()
  return records.value.filter(record => 
    record.full_name?.toLowerCase().includes(query) ||
    record.tdl_code?.toLowerCase().includes(query) ||
    record.id_lxml?.toLowerCase().includes(query) ||
    record.course_name?.toLowerCase().includes(query) ||
    record.department?.toLowerCase().includes(query)
  )
})

const openAddForm = () => {
  editingRecord.value = null
  tdlSearchQuery.value = ''
  fullNameInput.value = ''
  courseSearchQuery.value = ''
  formData.value = {
    group_name: '',
    tdl_code: '',
    id_lxml: '',
    full_name: '',
    gender: '',
    position: '',
    department: '',
    nationality: '',
    status: '',
    courses: []
  }
}

const openEditForm = (record) => {
  editingRecord.value = record
  tdlSearchQuery.value = record.full_name || ''
  fullNameInput.value = record.full_name || ''
  courseSearchQuery.value = ''
  
  // แปลง course_name เป็น courses array
  let coursesList = []
  if (record.courses && record.courses.length > 0) {
    coursesList = [...record.courses]
  } else if (record.course_name) {
    coursesList = record.course_name.split(/[,،]/).map(c => c.trim()).filter(c => c)
  }
  
  formData.value = {
    group_name: record.group_name || '',
    tdl_code: record.tdl_code || '',
    id_lxml: record.id_lxml || '',
    full_name: record.full_name || '',
    gender: record.gender || '',
    position: record.position || '',
    department: record.department || '',
    nationality: record.nationality || '',
    status: record.status || '',
    courses: coursesList
  }
}

const clearForm = () => {
  editingRecord.value = null
  tdlSearchQuery.value = ''
  fullNameInput.value = ''
  courseSearchQuery.value = ''
  formData.value = {
    group_name: '',
    tdl_code: '',
    id_lxml: '',
    full_name: '',
    gender: '',
    position: '',
    department: '',
    nationality: '',
    status: '',
    courses: []
  }
}

const saveRecord = async () => {
  if (!formData.value.full_name.trim()) {
    Swal.fire({
      title: 'แจ้งเตือน!',
      text: 'กรุณากรอกชื่อ-นามสกุล',
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

  const username = auth.user?.fullname || auth.user?.name || auth.user?.username || 'Unknown'
  const validCourses = formData.value.courses.filter(c => c.trim())
  
  try {
    if (editingRecord.value) {
      const { error } = await supabaseInternal
        .from('employee_course_registration')
        .update({
          group_name: formData.value.group_name.trim() || null,
          tdl_code: formData.value.tdl_code.trim() || null,
          id_lxml: formData.value.id_lxml.trim() || null,
          full_name: formData.value.full_name.trim(),
          gender: formData.value.gender.trim() || null,
          position: formData.value.position.trim() || null,
          department: formData.value.department.trim() || null,
          nationality: formData.value.nationality.trim() || null,
          status: formData.value.status.trim() || null,
          course_name: validCourses.join(', ') || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingRecord.value.id)

      if (error) throw error
    } else {
      const { error } = await supabaseInternal
        .from('employee_course_registration')
        .insert({
          group_name: formData.value.group_name.trim() || null,
          tdl_code: formData.value.tdl_code.trim() || null,
          id_lxml: formData.value.id_lxml.trim() || null,
          full_name: formData.value.full_name.trim(),
          gender: formData.value.gender.trim() || null,
          position: formData.value.position.trim() || null,
          department: formData.value.department.trim() || null,
          nationality: formData.value.nationality.trim() || null,
          status: formData.value.status.trim() || null,
          course_name: validCourses.join(', ') || null
        })

      if (error) throw error
    }

    clearForm()
    fetchRecords()
    
    Swal.fire({
      title: 'บันทึกสำเร็จ!',
      text: 'ข้อมูลถูกบันทึกเรียบร้อยแล้ว',
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
    console.error('Error saving record:', error)
    Swal.fire({
      title: 'เกิดข้อผิดพลาด!',
      text: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + error.message,
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

const deleteRecord = async (record) => {
  const result = await Swal.fire({
    title: 'คุณแน่ใจหรือไม่?',
    text: `คุณต้องการลบข้อมูล "${record.full_name}" ใช่หรือไม่?`,
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
        .from('employee_course_registration')
        .delete()
        .eq('id', record.id)

      if (error) throw error

      Swal.fire({
        title: 'ลบสำเร็จ!',
        text: 'ข้อมูลถูกลบเรียบร้อยแล้ว',
        icon: 'success',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          icon: '!scale-75'
        }
      })

      fetchRecords()
    } catch (error) {
      console.error('Error deleting record:', error.message)
      Swal.fire({
        title: 'เกิดข้อผิดพลาด!',
        text: 'เกิดข้อผิดพลาดในการลบข้อมูล',
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

// โหลดข้อมูลครั้งแรกเมื่อคอมโพเนนต์ถูกสร้าง
onMounted(() => {
  fetchCourses()
  fetchEmployees()
  fetchRecords()
  document.addEventListener('click', handleClickOutside)
})

// โหลดข้อมูลใหม่ทุกครั้งเมื่อเข้ามาหน้านี้ (เมื่อกดกลับมาจากหน้าอื่น)
onActivated(() => {
  fetchRecords()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 pb-2">
      <div class="flex items-center gap-3">
        <button
          @click="router.push({ name: 'registration-view' })"
          class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2"
        >
          Calendar
        </button>
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">แผนพนักงานหลักสูตร</h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">จัดการข้อมูลลงทะเบียนหลักสูตรพนักงาน</p>
        </div>
      </div>
      <div class="text-sm text-gray-500 dark:text-gray-400">
        รายการทั้งหมด: <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ filteredRecords.length }}</span> รายการ
      </div>
    </div>

    <div class="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 px-4 pb-4">
      <!-- 左边：表单 -->
      <div class="lg:col-span-1">
        <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">
              {{ editingRecord ? 'แก้ไขรายการ' : 'ฟอร์ม' }}
            </h3>
            <button
              @click="clearForm"
              v-if="editingRecord"
              class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              เพิ่มใหม่
            </button>
          </div>
          
          <div class="space-y-4">
            <div class="relative" ref="tdlDropdownRef">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รหัส TDL / รหัสล้านช้าง</label>
              <input
                v-model="tdlSearchQuery"
                type="text"
                @click="handleTdlInputClick"
                @input="showTdlDropdown = true"
                placeholder="ค้นหารหัส TDL หรือ id_lxml..."
                class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
              <div v-if="showTdlDropdown" class="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                <div
                  v-for="emp in filteredEmployees"
                  :key="emp.id"
                  @click="selectEmployee(emp)"
                  class="px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex flex-col">
                      <span class="text-sm font-medium text-gray-900 dark:text-white">{{ emp.employee_code }}</span>
                      <span v-if="emp.id_lxml" class="text-xs text-gray-500 dark:text-gray-400">id_lxml: {{ emp.id_lxml }}</span>
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
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รหัสล้านช้าง</label>
              <input
                v-model="formData.id_lxml"
                type="text"
                readonly
                class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="รหัสล้านช้าง จะแสดงอัตโนมัติ"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">กลุ่ม</label>
                <input
                  v-model="formData.group_name"
                  type="text"
                  class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="กรอกกลุ่ม"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">เพศ</label>
                <select
                  v-model="formData.gender"
                  class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="">เลือกเพศ</option>
                  <option value="ชาย">ชาย</option>
                  <option value="หญิง">หญิง</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ชื่อ-นามสกุล <span class="text-red-500">*</span></label>
              <input
                v-model="fullNameInput"
                type="text"
                @input="updateNameFromInput"
                class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="กรอกชื่อ-นามสกุล"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ตำแหน่ง</label>
                <input
                  v-model="formData.position"
                  type="text"
                  class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="กรอกตำแหน่ง"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">แผนก</label>
                <input
                  v-model="formData.department"
                  type="text"
                  class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="กรอกแผนก"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">สัญชาติ</label>
                <select
                  v-model="formData.nationality"
                  class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="">เลือกสัญชาติ</option>
                  <option value="Thai">Thai</option>
                  <option value="Laos">Laos</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">สถานะ</label>
                <input
                  v-model="formData.status"
                  type="text"
                  readonly
                  class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="สถานะจะถูกตั้งค่าอัตโนมัติ"
                />
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">หลักสูตร</label>
              <div class="border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900">
                <!-- Search box -->
                <div class="p-2 border-b border-gray-200 dark:border-gray-800">
                  <div class="relative">
                    <MagnifyingGlassIcon class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      v-model="courseSearchQuery"
                      type="text"
                      placeholder="ค้นหาหลักสูตร..."
                      class="w-full pl-9 pr-3 py-2 border-0 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <!-- Course list -->
                <div class="max-h-[200px] overflow-y-auto p-2">
                  <div 
                    v-for="course in filteredCourses" 
                    :key="course.id"
                    class="flex items-center gap-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-2 cursor-pointer"
                    @click="toggleCourse(course.course_name)"
                  >
                    <div class="relative flex items-center">
                      <div :class="[
                        'w-5 h-5 border rounded transition-colors flex items-center justify-center',
                        formData.courses.includes(course.course_name)
                          ? 'bg-indigo-600 border-indigo-600'
                          : 'border-gray-300 dark:border-gray-600'
                      ]">
                        <svg v-if="formData.courses.includes(course.course_name)" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                    <span class="text-sm text-gray-700 dark:text-gray-300">{{ course.course_name }}</span>
                  </div>
                  <div v-if="filteredCourses.length === 0" class="px-2 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                    ไม่พบหลักสูตร
                  </div>
                </div>
                <!-- Selected courses summary -->
                <div v-if="formData.courses.length > 0" class="p-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                  <p class="text-xs text-gray-600 dark:text-gray-400 mb-1">
                    เลือกแล้ว {{ formData.courses.length }} หลักสูตร
                  </p>
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="(course, idx) in formData.courses"
                      :key="idx"
                      class="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs rounded"
                    >
                      {{ course }}
                      <button
                        type="button"
                        @click.stop="toggleCourse(course)"
                        class="hover:text-indigo-900 dark:hover:text-indigo-100"
                      >
                        ×
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex gap-3 pt-2">
              <button
                @click="clearForm"
                class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
              >
                ล้างฟอร์ม
              </button>
              <button
                @click="saveRecord"
                class="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {{ editingRecord ? 'อัปเดต' : 'บันทึก' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 右边：表格 -->
      <div class="lg:col-span-2 flex flex-col overflow-hidden">
        <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm flex flex-col h-full">
          <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
            <div class="relative max-w-sm">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon class="h-5 w-5 text-gray-400" />
              </span>
              <input
                v-model="searchQuery"
                type="text"
                placeholder="ค้นหาชื่อ, รหัส TDL..."
                class="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>
          
          <div class="overflow-x-auto overflow-y-auto flex-1">
            <table class="w-full text-left border-collapse">
              <thead class="sticky top-0 bg-white dark:bg-gray-950 z-10">
                <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
                  <th class="px-4 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10"></th>
                  <th class="px-4 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">กลุ่ม</th>
                  <th class="px-4 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัส TDL</th>
                  <th class="px-4 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัสล้านช้าง</th>
                  <th class="px-4 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
                  <th class="px-4 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เพศ</th>
                  <th class="px-4 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตำแหน่ง</th>
                  <th class="px-4 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">แผนก</th>
                  <th class="px-4 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สัญชาติ</th>
                  <th class="px-4 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
                  <th class="px-4 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">จัดการ</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                <template v-if="loading">
                  <tr v-for="i in 5" :key="i" class="animate-pulse">
                    <td colspan="11" class="px-4 py-4">
                      <div class="h-10 bg-gray-100 dark:bg-gray-900 rounded-lg w-full"></div>
                    </td>
                  </tr>
                </template>
                <tr v-else-if="filteredRecords.length === 0" class="text-center">
                  <td colspan="11" class="px-4 py-12 text-gray-500 dark:text-gray-400 italic">
                    ไม่พบข้อมูล
                  </td>
                </tr>
                <template v-else>
                  <template v-for="record in filteredRecords" :key="record.id">
                    <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors">
                      <td class="px-4 py-4">
                        <button
                          @click.stop="toggleRow(record.id)"
                          class="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                        >
                          <ChevronDownIcon
                            v-if="expandedRow !== record.id"
                            class="w-4 h-4 text-gray-500"
                          />
                          <ChevronUpIcon
                            v-else
                            class="w-4 h-4 text-gray-500"
                          />
                        </button>
                      </td>
                      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {{ record.group_name || '-' }}
                      </td>
                      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {{ record.tdl_code || '-' }}
                      </td>
                      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {{ record.id_lxml || '-' }}
                      </td>
                      <td class="px-4 py-4 whitespace-nowrap">
                        <div class="text-sm font-bold text-gray-900 dark:text-white">
                          {{ record.full_name }}
                        </div>
                      </td>
                      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {{ record.gender || '-' }}
                      </td>
                      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {{ record.position || '-' }}
                      </td>
                      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {{ record.department || '-' }}
                      </td>
                      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {{ record.nationality || '-' }}
                      </td>
                      <td class="px-4 py-4 whitespace-nowrap">
                        <span :class="[
                          'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                          record.status === 'สำเร็จ' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                          record.status === 'กำลังดำเนินการ' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' :
                          'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
                        ]">
                          {{ record.status || '-' }}
                        </span>
                      </td>
                      <td class="px-4 py-4 whitespace-nowrap">
                        <div class="flex items-center gap-2">
                          <button
                            @click.stop="openEditForm(record)"
                            class="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                          >
                            <PencilSquareIcon class="h-4 w-4" />
                          </button>
                          <button
                            @click.stop="deleteRecord(record)"
                            class="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <TrashIcon class="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    <!-- Expanded row for courses -->
                    <tr v-if="expandedRow === record.id" class="bg-gray-50/50 dark:bg-gray-900/30">
                      <td colspan="11" class="px-4 py-4">
                        <div class="space-y-2">
                          <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">หลักสูตรที่ลงทะเบียน</h4>
                          <div class="flex flex-wrap gap-2">
                            <span
                              v-for="(course, idx) in getRecordCourses(record)"
                              :key="idx"
                              class="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                            >
                              {{ course }}
                            </span>
                            <span
                              v-if="getRecordCourses(record).length === 0"
                              class="text-sm text-gray-500 dark:text-gray-400"
                            >
                              ไม่มีหลักสูตร
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </template>
                </template>
              </tbody>
            </table>
          </div>

          <div class="px-4 py-4 bg-gray-50/30 dark:bg-gray-900/30 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
            <p class="text-xs text-gray-500 dark:text-gray-400">
              แสดงข้อมูลทั้งหมด {{ filteredRecords.length }} รายการ
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
