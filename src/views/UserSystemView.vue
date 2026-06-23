<script setup>
import { ref, onMounted, computed, watch, onUnmounted } from 'vue'
import { supabaseInternal } from '../server/supabase'
import { supabaseExternal } from '../server/supabase_data'
import { useAuth } from '../stores/auth'
import { MagnifyingGlassIcon, PlusIcon, XMarkIcon, EyeIcon } from '@heroicons/vue/24/outline'
import Swal from 'sweetalert2'

const auth = useAuth()
const users = ref([])
const employees = ref([])
const loading = ref(true)
const searchQuery = ref('')
const isSidebarOpen = ref(false)
const showPassword = ref(false)
const showEmpDropdown = ref(false)
const empDropdownRef = ref(null)

const formData = ref({
  emp_code: '',
  fullname: '',
  position: '',
  department: '',
  username: '',
  password: ''
})

const filteredEmployees = computed(() => {
  if (!formData.value.emp_code) return employees.value
  const query = formData.value.emp_code.toLowerCase()
  return employees.value.filter(emp =>
    emp.employee_code?.toLowerCase().includes(query) ||
    emp.fullname?.toLowerCase().includes(query) ||
    emp.firstname?.toLowerCase().includes(query) ||
    emp.lastname?.toLowerCase().includes(query)
  )
})

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

const fillEmployeeData = (empCode) => {
  const employee = employees.value.find(emp => emp.employee_code === empCode)
  if (employee) {
    formData.value.fullname = employee.fullname ||
      `${employee.firstname || ''} ${employee.lastname || ''}`.trim()
    formData.value.position = employee.position || ''
    formData.value.department = employee.department || ''
    formData.value.emp_code = employee.employee_code || empCode
  }
}

const selectEmployee = (employee) => {
  formData.value.emp_code = employee.employee_code
  showEmpDropdown.value = false
  fillEmployeeData(employee.employee_code)
}

const handleEmpInputClick = () => {
  showEmpDropdown.value = true
}

const handleClickOutside = (event) => {
  if (empDropdownRef.value && !empDropdownRef.value.contains(event.target)) {
    showEmpDropdown.value = false
  }
}

const fetchUsers = async () => {
  try {
    loading.value = true
    const { data, error } = await supabaseInternal
      .from('system_users')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    users.value = data
  } catch (error) {
    console.error('Error fetching users:', error.message)
  } finally {
    loading.value = false
  }
}

const filteredUsers = () => {
  if (!searchQuery.value) return users.value
  const query = searchQuery.value.toLowerCase()
  return users.value.filter(user => 
    user.fullname?.toLowerCase().includes(query) ||
    user.username?.toLowerCase().includes(query) ||
    user.emp_code?.toLowerCase().includes(query) ||
    user.department?.toLowerCase().includes(query)
  )
}

const openAddSidebar = () => {
  formData.value = {
    emp_code: '',
    fullname: '',
    position: '',
    department: '',
    username: '',
    password: ''
  }
  showPassword.value = false
  isSidebarOpen.value = true
}

const closeSidebar = () => {
  isSidebarOpen.value = false
  showEmpDropdown.value = false
  formData.value = {
    emp_code: '',
    fullname: '',
    position: '',
    department: '',
    username: '',
    password: ''
  }
  showPassword.value = false
}

const isDuplicateEmpCode = (empCode) => {
  const code = empCode.trim().toLowerCase()
  return users.value.some(user => user.emp_code?.trim().toLowerCase() === code)
}

const isDuplicateUsername = (username) => {
  const name = username.trim().toLowerCase()
  return users.value.some(user => user.username?.trim().toLowerCase() === name)
}

const getSaveErrorMessage = (error) => {
  const msg = error?.message || ''
  if (msg.includes('system_users_emp_code_key')) {
    return 'รหัสพนักงานนี้มีในระบบแล้ว กรุณาใช้รหัสอื่น'
  }
  if (msg.includes('system_users_username_key') || msg.includes('username')) {
    return 'ชื่อผู้ใช้นี้มีในระบบแล้ว กรุณาใช้ชื่อผู้ใช้อื่น'
  }
  return 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + (msg || 'Unknown error')
}

const saveUser = async () => {
  if (!formData.value.emp_code.trim()) {
    Swal.fire({
      title: 'แจ้งเตือน!',
      text: 'กรุณากรอกรหัสพนักงาน',
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
  if (!formData.value.fullname.trim()) {
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
  if (!formData.value.username.trim()) {
    Swal.fire({
      title: 'แจ้งเตือน!',
      text: 'กรุณากรอกชื่อผู้ใช้',
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
  if (!formData.value.password.trim()) {
    Swal.fire({
      title: 'แจ้งเตือน!',
      text: 'กรุณากรอกรหัสผ่าน',
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
  if (isDuplicateEmpCode(formData.value.emp_code)) {
    Swal.fire({
      title: 'แจ้งเตือน!',
      text: 'รหัสพนักงานนี้มีในระบบแล้ว กรุณาใช้รหัสอื่น',
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
  if (isDuplicateUsername(formData.value.username)) {
    Swal.fire({
      title: 'แจ้งเตือน!',
      text: 'ชื่อผู้ใช้นี้มีในระบบแล้ว กรุณาใช้ชื่อผู้ใช้อื่น',
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
    const { error } = await supabaseInternal
      .from('system_users')
      .insert({
        emp_code: formData.value.emp_code.trim(),
        fullname: formData.value.fullname.trim(),
        position: formData.value.position.trim() || null,
        department: formData.value.department.trim() || null,
        username: formData.value.username.trim(),
        password: formData.value.password.trim(),
        role: 'admin',
        created_by: auth.user?.fullname || 'Unknown'
      })

    if (error) throw error

    closeSidebar()
    fetchUsers()
    
    Swal.fire({
      title: 'บันทึกสำเร็จ!',
      text: 'เพิ่มผู้ใช้เรียบร้อยแล้ว',
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
    console.error('Error saving user:', error.message)
    Swal.fire({
      title: 'เกิดข้อผิดพลาด!',
      text: getSaveErrorMessage(error),
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

onMounted(() => {
  fetchUsers()
  fetchEmployees()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

watch(() => formData.value.emp_code, (newVal) => {
  if (newVal?.trim()) {
    fillEmployeeData(newVal.trim())
  }
})
</script>

<template>
  <div class="space-y-6">

    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ผู้ใช้ระบบ</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">จัดการข้อมูลผู้ใช้ระบบทั้งหมด</p>
      </div>
      <div class="text-sm text-gray-500 dark:text-gray-400">
        ผู้ใช้ทั้งหมด: <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ filteredUsers().length }} คน</span>
      </div>
    </div>

    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
        <div class="relative max-w-sm w-full">
          <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon class="h-5 w-5 text-gray-400" />
          </span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="ค้นหาชื่อ, ชื่อผู้ใช้, รหัสพนักงาน..."
            class="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
      </div>

      <button
        @click="openAddSidebar"
        class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
      >
        <PlusIcon class="h-5 w-5" />
        เพิ่มผู้ใช้
      </button>
    </div>

    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ผู้ใช้</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัสพนักงาน</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตำแหน่ง</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">แผนก</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อผู้ใช้</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <template v-if="loading">
              <tr v-for="i in 3" :key="i" class="animate-pulse">
                <td colspan="5" class="px-6 py-4">
                  <div class="h-10 bg-gray-100 dark:bg-gray-900 rounded-lg w-full"></div>
                </td>
              </tr>
            </template>
            <tr v-else-if="filteredUsers().length === 0" class="text-center">
              <td colspan="5" class="px-6 py-12 text-gray-500 dark:text-gray-400 italic">
                ไม่พบข้อมูลผู้ใช้
              </td>
            </tr>
            <tr 
              v-for="user in filteredUsers()" 
              :key="user.id"
              class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors group"
            >
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-bold text-gray-900 dark:text-white">
                  {{ user.fullname }}
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ user.emp_code || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ user.position || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ user.department || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ user.username }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div class="px-6 py-4 bg-gray-50/30 dark:bg-gray-900/30 border-t border-gray-200 dark:border-gray-800">
        <p class="text-xs text-gray-500 dark:text-gray-400">
          แสดงข้อมูลผู้ใช้ทั้งหมด {{ filteredUsers().length }} คน
        </p>
      </div>
    </div>

    <div v-if="isSidebarOpen" class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/50" @click="closeSidebar"></div>
      <div class="absolute right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-gray-950 shadow-xl transform transition-transform duration-300 overflow-y-auto">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-950 z-10">
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">
            เพิ่มผู้ใช้
          </h3>
          <button @click="closeSidebar" class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900">
            <XMarkIcon class="h-6 w-6" />
          </button>
        </div>

        <div class="p-6 space-y-5">
          <div class="relative" ref="empDropdownRef">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รหัสพนักงาน <span class="text-red-500">*</span></label>
            <input
              v-model="formData.emp_code"
              type="text"
              @click="handleEmpInputClick"
              @input="showEmpDropdown = true"
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="ค้นหารหัสพนักงาน..."
            />
            <div v-if="showEmpDropdown" class="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg max-h-60 overflow-y-auto">
              <div
                v-for="emp in filteredEmployees"
                :key="emp.id"
                @click="selectEmployee(emp)"
                class="px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
              >
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-900 dark:text-white">{{ emp.employee_code }}</span>
                  <span class="text-sm text-gray-500 dark:text-gray-400">{{ emp.fullname || `${emp.firstname} ${emp.lastname}` }}</span>
                </div>
              </div>
              <div v-if="filteredEmployees.length === 0" class="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                ไม่พบข้อมูลพนักงาน
              </div>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ชื่อ-นามสกุล <span class="text-red-500">*</span></label>
            <input
              v-model="formData.fullname"
              type="text"
              readonly
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="กรอกชื่อ-นามสกุล"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ตำแหน่ง</label>
              <input
                v-model="formData.position"
                type="text"
                readonly
                class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="กรอกตำแหน่ง"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">แผนก</label>
              <input
                v-model="formData.department"
                type="text"
                readonly
                class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="กรอกแผนก"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ชื่อผู้ใช้ <span class="text-red-500">*</span></label>
            <input
              v-model="formData.username"
              type="text"
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="กรอกชื่อผู้ใช้"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              รหัสผ่าน <span class="text-red-500">*</span>
            </label>
            <div class="relative">
              <input
                v-model="formData.password"
                :type="showPassword ? 'text' : 'password'"
                class="w-full px-4 py-3 pr-12 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="กรอกรหัสผ่าน"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <EyeIcon class="h-5 w-5" :class="{ 'text-indigo-500': showPassword }" />
              </button>
            </div>
          </div>
        </div>

        <div class="p-6 border-t border-gray-200 dark:border-gray-800">
          <div class="flex items-center gap-3">
            <button
              @click="closeSidebar"
              class="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-colors"
            >
              ยกเลิก
            </button>
            <button
              @click="saveUser"
              class="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
            >
              เพิ่มผู้ใช้
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
