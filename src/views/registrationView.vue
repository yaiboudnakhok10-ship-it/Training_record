<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabaseInternal } from '../server/supabase'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, ListBulletIcon } from '@heroicons/vue/24/outline'

const router = useRouter()

const currentDate = ref(new Date())
const showAddModal = ref(false)
const selectedDay = ref(null)
const editingCourse = ref(null)
const courses = ref([])
const records = ref([])
const selectedCourse = ref(null)
const showCourseDropdown = ref(false)
const courseDropdownRef = ref(null)
const courseSearchQuery = ref('')
const selectedEmployees = ref([])
const showViewModal = ref(false)
const viewDay = ref(null)
const selectedViewCourse = ref(null)

const formData = ref({
  courseName: '',
  startTime: '',
  endTime: '',
  days: ''
})

const monthNames = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]

const dayNames = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

const formatDateLocal = (year, month, day) => {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

const currentYear = computed(() => currentDate.value.getFullYear())
const currentMonth = computed(() => currentDate.value.getMonth())

const filteredCourses = computed(() => {
  if (!courseSearchQuery.value) return courses.value
  const query = courseSearchQuery.value.toLowerCase()
  return courses.value.filter(course => 
    course.course_name?.toLowerCase().includes(query)
  )
})

const daysInMonth = computed(() => {
  return new Date(currentYear.value, currentMonth.value + 1, 0).getDate()
})

const firstDayOfMonth = computed(() => {
  return new Date(currentYear.value, currentMonth.value, 1).getDay()
})

const calendarDays = computed(() => {
  const days = []
  
  for (let i = 0; i < firstDayOfMonth.value; i++) {
    days.push(null)
  }
  
  for (let day = 1; day <= daysInMonth.value; day++) {
    days.push(day)
  }
  
  return days
})

const previousMonth = () => {
  currentDate.value = new Date(currentYear.value, currentMonth.value - 1, 1)
}

const nextMonth = () => {
  currentDate.value = new Date(currentYear.value, currentMonth.value + 1, 1)
}

const isToday = (day) => {
  if (!day) return false
  const today = new Date()
  return (
    day === today.getDate() &&
    currentMonth.value === today.getMonth() &&
    currentYear.value === today.getFullYear()
  )
}

const isWeekend = (index) => {
  const dayOfWeek = (firstDayOfMonth.value + index) % 7
  return dayOfWeek === 0 || dayOfWeek === 6
}

const courseSchedules = ref([])

const getCoursesForDay = (day) => {
  if (!day) return []
  return courseSchedules.value.filter(course => 
    course.date === day && 
    course.month === currentMonth.value && 
    course.year === currentYear.value
  )
}

const getEmployeesForCourse = (courseName) => {
  if (!courseName) return []
  return records.value.filter(record => {
    const recordCourses = getRecordCourses(record)
    return recordCourses.includes(courseName)
  })
}

const getEmployeeById = (empId) => {
  return records.value.find(record => record.id === empId)
}

const getRecordCourses = (record) => {
  if (record.courses && record.courses.length > 0) {
    return record.courses
  } else if (record.course_name) {
    return record.course_name.split(/[,，]/).map(c => c.trim()).filter(c => c)
  }
  return []
}

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

const fetchRecords = async () => {
  try {
    const { data, error } = await supabaseInternal
      .from('employee_course_registration')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    records.value = data
  } catch (error) {
    console.error('Error fetching records:', error.message)
  }
}

const openAddModal = (day) => {
  selectedDay.value = day
  editingCourse.value = null
  selectedCourse.value = null
  showCourseDropdown.value = false
  courseSearchQuery.value = ''
  selectedEmployees.value = []
  formData.value = {
    courseName: '',
    startTime: '',
    endTime: '',
    days: ''
  }
  showAddModal.value = true
}

const viewingCourse = ref(null)

const openViewModal = (course) => {
  viewingCourse.value = course
  selectedViewCourse.value = course
  viewDay.value = course.date
  showViewModal.value = true
}

const openViewDayModal = (day) => {
  viewDay.value = day
  const coursesForDay = getCoursesForDay(day)
  if (coursesForDay.length === 1) {
    // มีหลักสูตรเดียว เปิดดูรายละเอียดเลย
    openViewModal(coursesForDay[0])
  } else {
    // มีหลายหลักสูตร แสดงเป็นรายการให้เลือกก่อน
    selectedViewCourse.value = null
    viewingCourse.value = null
    showViewModal.value = true
  }
}

const openEditModal = (course) => {
  editingCourse.value = course
  selectedDay.value = course.date
  selectedCourse.value = course.courseName
  courseSearchQuery.value = ''
  selectedEmployees.value = course.selectedEmployees || []
  formData.value = {
    courseName: course.courseName,
    startTime: course.startTime || '',
    endTime: course.endTime || '',
    days: course.days || ''
  }
  showAddModal.value = true
}

const saveCourse = async () => {
  if (!formData.value.courseName.trim()) {
    alert('กรุณาเลือกหลักสูตร')
    return
  }

  if (selectedEmployees.value.length === 0) {
    alert('กรุณาเลือกพนักงานที่จะเรียน')
    return
  }

  try {
    // สร้างวันที่ในรูปแบบ YYYY-MM-DD ตามวันที่ที่เลือกจริง (ไม่ผ่าน UTC conversion เพื่อกันวันที่เพี้ยน)
    const formattedDate = formatDateLocal(currentYear.value, currentMonth.value, selectedDay.value)

    // ดึงข้อมูลพนักงานที่เลือกทั้งหมด
    const selectedEmployeeData = getEmployeesForCourse(formData.value.courseName).filter(emp => 
      selectedEmployees.value.includes(emp.id)
    )

    // เตรียมข้อมูลที่จะบันทึกไป employee_course_today
    const recordsToInsert = selectedEmployeeData.map(emp => ({
      group_name: emp.group_name || null,
      tdl_code: emp.tdl_code || emp.employee_code || null,
      full_name: emp.full_name || emp.fullname || `${emp.firstname || ''} ${emp.lastname || ''}`.trim(),
      gender: emp.gender || null,
      position: emp.position || null,
      department: emp.department || null,
      nationality: emp.nationality || null,
      status: emp.status || null,
      course_name: formData.value.courseName,
      start_time: formData.value.startTime || null,
      end_time: formData.value.endTime || null,
      total_days: formData.value.days ? parseInt(formData.value.days) : null,
      study_date: formattedDate
    }))

    // เตรียมข้อมูลที่จะบันทึกไป employee_training_records (status_courses)
    const trainingRecordsToInsert = selectedEmployeeData.map(emp => {
      const nameParts = (emp.full_name || emp.fullname || `${emp.firstname || ''} ${emp.lastname || ''}`.trim()).split(' ')
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''
      
      return {
        group: emp.group_name || null,
        id_tdl: emp.tdl_code || emp.employee_code || null,
        first_name: firstName,
        last_name: lastName,
        position: emp.position || null,
        department: emp.department || null,
        gender: emp.gender || null,
        nationality: emp.nationality || null,
        status: emp.status || null,
        course_name: formData.value.courseName,
        training_date: formattedDate,
        status_courses: 'ผ่านแล้ว' // ตั้งค่าเริ่มต้นว่าผ่านแล้ว
      }
    })

    // บันทึกลง employee_course_today
    const { error: insertError } = await supabaseInternal
      .from('employee_course_today')
      .insert(recordsToInsert)

    if (insertError) throw insertError

    // บันทึกลง employee_training_records
    const { error: trainingError } = await supabaseInternal
      .from('employee_training_records')
      .insert(trainingRecordsToInsert)

    if (trainingError) throw trainingError

    // ลบหลักสูตรออกจาก employee_course_registration สำหรับพนักงานที่เลือก
    for (const emp of selectedEmployeeData) {
      // 1. ดึงข้อมูลเดิมของพนักงานนี้
      const { data: existingRecord, error: fetchError } = await supabaseInternal
        .from('employee_course_registration')
        .select('*')
        .eq('id', emp.id)
        .single()

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = ไม่พบข้อมูล
        continue
      }

      if (existingRecord) {
        // 2. เอาหลักสูตรที่มีอยู่ออกจากรายการ
        let remainingCourses = []
        if (existingRecord.courses && existingRecord.courses.length > 0) {
          remainingCourses = existingRecord.courses.filter(c => c !== formData.value.courseName)
        } else if (existingRecord.course_name) {
          const courseList = existingRecord.course_name.split(/[,，]/).map(c => c.trim()).filter(c => c)
          remainingCourses = courseList.filter(c => c !== formData.value.courseName)
        }

        // 3. อัปเดตข้อมูล
        await supabaseInternal
          .from('employee_course_registration')
          .update({
            course_name: remainingCourses.join(', ') || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', emp.id)
      }
    }

    // อัปเดตข้อมูลในหน้าจอ
    if (editingCourse.value) {
      const index = courseSchedules.value.findIndex(c => c.id === editingCourse.value.id)
      if (index !== -1) {
        courseSchedules.value[index] = {
          ...courseSchedules.value[index],
          ...formData.value,
          employees: selectedEmployeeData
        }
      }
    } else {
      courseSchedules.value.push({
        id: Date.now(),
        date: selectedDay.value,
        month: currentMonth.value,
        year: currentYear.value,
        ...formData.value,
        employees: selectedEmployeeData
      })
    }

    // โหลดข้อมูล records ใหม่เพื่ออัปเดตหน้าจอ
    await fetchRecords()

    alert('บันทึกข้อมูลสำเร็จ!')
    showAddModal.value = false
    selectedDay.value = null
    editingCourse.value = null
    selectedCourse.value = null
  } catch (error) {
    console.error('Error saving course:', error)
    alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + error.message)
  }
}

const deleteCourse = async (course) => {
  if (confirm('คุณต้องการลบหลักสูตรนี้หรือไม่?')) {
    try {
      // สร้างวันที่สำหรับค้นหา ตรงตามวันที่จริง (ไม่ผ่าน UTC conversion)
      const formattedDate = formatDateLocal(course.year, course.month, course.date)

      // ดึงข้อมูลพนักงานที่จะต้องย้อนกลับ
      const employeesToRestore = course.employees || []

      // 1. ลบจาก employee_course_today
      const { error: deleteTodayError } = await supabaseInternal
        .from('employee_course_today')
        .delete()
        .eq('study_date', formattedDate)
        .eq('course_name', course.courseName)

      if (deleteTodayError) throw deleteTodayError

      // 2. ลบจาก employee_training_records
      const { error: deleteTrainingError } = await supabaseInternal
        .from('employee_training_records')
        .delete()
        .eq('training_date', formattedDate)
        .eq('course_name', course.courseName)

      if (deleteTrainingError) throw deleteTrainingError

      // 3. ย้อนกลับหลักสูตรไป employee_course_registration
      for (const emp of employeesToRestore) {
        // ค้นหาข้อมูลพนักงานใน records
        const record = records.value.find(r => r.id === emp.id || r.tdl_code === emp.tdl_code)
        
        if (record) {
          // ดึงข้อมูลเดิม
          let currentCourses = []
          if (record.courses && record.courses.length > 0) {
            currentCourses = [...record.courses]
          } else if (record.course_name) {
            currentCourses = record.course_name.split(/[,，]/).map(c => c.trim()).filter(c => c)
          }

          // เพิ่มหลักสูตรกลับเข้าไปถ้ายังไม่มี
          if (!currentCourses.includes(course.courseName)) {
            currentCourses.push(course.courseName)
          }

          // อัปเดตฐานข้อมูล
          await supabaseInternal
            .from('employee_course_registration')
            .update({
              course_name: currentCourses.join(', ') || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', record.id)
        }
      }

      // ลบจากหน้าจอ
      courseSchedules.value = courseSchedules.value.filter(c => c.id !== course.id)
      
      // โหลดข้อมูล records ใหม่
      await fetchRecords()
      
      alert('ลบข้อมูลสำเร็จ!')
    } catch (error) {
      console.error('Error deleting course:', error)
      alert('เกิดข้อผิดพลาดในการลบข้อมูล: ' + error.message)
    }
  }
}

const selectCourseFromDropdown = (course) => {
  selectedCourse.value = course.course_name
  formData.value.courseName = course.course_name
  showCourseDropdown.value = false
}

const toggleCourseDropdown = () => {
  showCourseDropdown.value = !showCourseDropdown.value
}

const toggleEmployee = (employeeId) => {
  const index = selectedEmployees.value.indexOf(employeeId)
  if (index > -1) {
    selectedEmployees.value.splice(index, 1)
  } else {
    selectedEmployees.value.push(employeeId)
  }
}

const selectAllEmployees = () => {
  const employees = getEmployeesForCourse(formData.value.courseName)
  selectedEmployees.value = employees.map(emp => emp.id)
}

const deselectAllEmployees = () => {
  selectedEmployees.value = []
}

const handleClickOutside = (event) => {
  if (courseDropdownRef.value && !courseDropdownRef.value.contains(event.target)) {
    showCourseDropdown.value = false
  }
}

const fetchCourseSchedules = async () => {
  try {
    const { data, error } = await supabaseInternal
      .from('employee_course_today')
      .select('*')
      .order('study_date', { ascending: true })

    if (error) throw error

    // จัดกลุ่มข้อมูลตามวันที่และหลักสูตร
    const groupedData = {}
    data.forEach(record => {
      const studyDate = new Date(record.study_date)
      const key = `${studyDate.getFullYear()}-${studyDate.getMonth()}-${studyDate.getDate()}-${record.course_name}`
      
      if (!groupedData[key]) {
        groupedData[key] = {
          id: `${key}-${Date.now()}`,
          date: studyDate.getDate(),
          month: studyDate.getMonth(),
          year: studyDate.getFullYear(),
          courseName: record.course_name,
          startTime: record.start_time,
          endTime: record.end_time,
          days: record.total_days,
          employees: [] // เก็บข้อมูลพนักงานทั้งหมดเลย
        }
      }
      
      // เก็บข้อมูลพนักงานทั้งหมด
      groupedData[key].employees.push({
        id: record.id,
        group_name: record.group_name,
        tdl_code: record.tdl_code,
        full_name: record.full_name,
        gender: record.gender,
        position: record.position,
        department: record.department,
        nationality: record.nationality,
        status: record.status
      })
    })

    courseSchedules.value = Object.values(groupedData)
  } catch (error) {
    console.error('Error fetching course schedules:', error)
  }
}

onMounted(() => {
  fetchCourses()
  fetchRecords()
  fetchCourseSchedules()
  document.addEventListener('click', handleClickOutside)
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
          @click="router.push({ name: 'employee-course-registration' })"
          class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2"
        >
          กลับไป
        </button>
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">แผนวันที่</h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ดูแผนการงานตามวันที่</p>
        </div>
      </div>
    </div>

    <div class="flex-1 px-4 pb-4">
      <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <button
            @click="previousMonth"
            class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ChevronLeftIcon class="w-5 h-5" />
          </button>
          
          <h2 class="text-xl font-bold text-gray-900 dark:text-white">
            {{ monthNames[currentMonth] }} {{ currentYear }}
          </h2>
          
          <button
            @click="nextMonth"
            class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ChevronRightIcon class="w-5 h-5" />
          </button>
        </div>

        <div class="p-4">
          <div class="grid grid-cols-7 gap-1 mb-2">
            <div
              v-for="(dayName, index) in dayNames"
              :key="index"
              class="text-center py-2 text-sm font-bold text-gray-500 dark:text-gray-400"
              :class="{
                'text-red-500 dark:text-red-400': index === 0 || index === 6
              }"
            >
              {{ dayName }}
            </div>
          </div>

          <div class="grid grid-cols-7 gap-1">
            <div
              v-for="(day, index) in calendarDays"
              :key="index"
              class="aspect-square p-2 rounded border border-gray-300 dark:border-gray-700 flex flex-col overflow-hidden"
              :class="{
                'bg-gray-50 dark:bg-gray-900': !day,
                'bg-white dark:bg-gray-950': day,
                'bg-blue-50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-600': isToday(day),
                'hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer': day
              }"
            >
              <div v-if="day" class="flex-shrink-0 flex items-center justify-between">
                <span
                  class="text-sm font-bold"
                  :class="{
                    'text-gray-900 dark:text-white': !isWeekend(index),
                    'text-red-600 dark:text-red-400': isWeekend(index),
                    'text-blue-700 dark:text-blue-400 font-extrabold': isToday(day)
                  }"
                >
                  {{ day }}
                </span>
                <div class="flex items-center gap-1">
                  <button
                    @click.stop="openAddModal(day)"
                    class="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-900/20 rounded transition-colors"
                  >
                    <PlusIcon class="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div v-if="day" class="flex-1 overflow-y-auto mt-1">
                <div v-if="getCoursesForDay(day).length === 0" class="h-full flex items-center justify-center text-center">
                  <span class="text-xs sm:text-sm text-gray-400 dark:text-gray-500 italic leading-tight">
                    ไม่มีหลักสูตร
                  </span>
                </div>
                <div v-else class="space-y-0.5">
                  <div
                    v-for="course in getCoursesForDay(day)"
                    :key="course.id"
                    @click.stop="openViewModal(course)"
                    class="bg-white rounded-md p-1 text-xs sm:text-sm relative group leading-snug flex items-center justify-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div class="font-bold text-gray-900 text-center">
                      <span class="font-semibold text-gray-600">Course: </span>{{ course.courseName }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showAddModal" class="fixed inset-0 z-50">
      <div @click="showAddModal = false" class="absolute inset-0 bg-black/50"></div>
      <div class="absolute right-0 top-0 h-full w-full max-w-2xl bg-white dark:bg-gray-950 shadow-xl transform transition-transform duration-300 ease-in-out">
        <div class="h-full flex flex-col">
          <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <div>
              <h3 class="text-lg font-bold text-gray-900 dark:text-white">
                {{ editingCourse ? 'แก้ไขหลักสูตร' : 'เพิ่มหลักสูตร' }}
              </h3>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                วันที่ {{ selectedDay }} {{ monthNames[currentMonth] }} {{ currentYear }}
              </p>
            </div>
            <button
              @click="showAddModal = false"
              class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ชื่อหลักสูตร</label>
              <div class="relative" ref="courseDropdownRef">
                <button
                  type="button"
                  @click.stop="toggleCourseDropdown"
                  class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-left flex items-center justify-between"
                >
                  <span :class="{ 'text-gray-400': !formData.courseName }">
                    {{ formData.courseName || 'เลือกหลักสูตร...' }}
                  </span>
                  <svg class="w-4 h-4 text-gray-400 transition-transform" :class="{ 'rotate-180': showCourseDropdown }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div v-if="showCourseDropdown" class="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg overflow-hidden">
                  <div class="p-2 border-b border-gray-200 dark:border-gray-800">
                    <input
                      v-model="courseSearchQuery"
                      type="text"
                      placeholder="ค้นหาหลักสูตร..."
                      class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      @click.stop
                    />
                  </div>
                  <div class="max-h-48 overflow-y-auto">
                    <div
                      v-for="course in filteredCourses"
                      :key="course.id"
                      @click="selectCourseFromDropdown(course)"
                      class="px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors text-sm"
                      :class="{
                        'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300': formData.courseName === course.course_name
                      }"
                    >
                      {{ course.course_name }}
                    </div>
                    <div v-if="filteredCourses.length === 0" class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                      ไม่พบหลักสูตร
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div v-if="formData.courseName" class="mt-6">
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-bold text-gray-900 dark:text-white">
                  รายชื่อพนักงานในหลักสูตร "{{ formData.courseName }}"
                </h4>
                <div class="flex gap-2">
                  <button
                    @click="selectAllEmployees"
                    class="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 rounded hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                  >
                    เลือกทั้งหมด
                  </button>
                  <button
                    @click="deselectAllEmployees"
                    class="text-xs px-2 py-1 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    ยกเลิกทั้งหมด
                  </button>
                </div>
              </div>
              <div v-if="getEmployeesForCourse(formData.courseName).length === 0" class="text-sm text-gray-500 dark:text-gray-400 italic py-4 text-center">
                ไม่มีพนักงานในหลักสูตรนี้
              </div>
              <div v-else class="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                <div class="max-h-64 overflow-y-auto">
                  <table class="w-full text-left">
                    <thead class="bg-gray-50 dark:bg-gray-800 sticky top-0">
                      <tr>
                        <th class="px-3 py-2 w-10"></th>
                        <th class="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">ชื่อ-นามสกุล</th>
                        <th class="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">รหัส TDL</th>
                        <th class="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">แผนก</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                      <tr
                        v-for="emp in getEmployeesForCourse(formData.courseName)"
                        :key="emp.id"
                        class="hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <td class="px-3 py-2">
                          <div class="flex items-center justify-center">
                            <div
                              @click="toggleEmployee(emp.id)"
                              class="w-5 h-5 border-2 rounded cursor-pointer flex items-center justify-center transition-colors"
                              :class="{
                                'bg-indigo-600 border-indigo-600': selectedEmployees.includes(emp.id),
                                'border-gray-300 dark:border-gray-600 hover:border-indigo-400': !selectedEmployees.includes(emp.id)
                              }"
                            >
                              <svg v-if="selectedEmployees.includes(emp.id)" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          </div>
                        </td>
                        <td class="px-3 py-2 text-sm text-gray-900 dark:text-white">{{ emp.full_name }}</td>
                        <td class="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{{ emp.tdl_code || '-' }}</td>
                        <td class="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{{ emp.department || '-' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    เลือกแล้ว {{ selectedEmployees.length }} จาก {{ getEmployeesForCourse(formData.courseName).length }} คน
                  </span>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">เวลาเริ่ม</label>
                <input
                  v-model="formData.startTime"
                  type="time"
                  class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">เวลาเสร็จ</label>
                <input
                  v-model="formData.endTime"
                  type="time"
                  class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">เรียนกี่วัน</label>
              <input
                v-model="formData.days"
                type="number"
                min="1"
                class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="เช่น 1"
              />
            </div>
          </div>
          <div class="p-4 border-t border-gray-200 dark:border-gray-800 flex gap-3">
            <button
              @click="showAddModal = false"
              class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              @click="saveCourse"
              class="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {{ editingCourse ? 'บันทึกการแก้ไข' : 'เพิ่มหลักสูตร' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- View Course Modal (ปรับให้กว้างขึ้นเป็นครึ่งจอ) -->
    <div v-if="showViewModal" class="fixed inset-0 z-50">
      <div @click="showViewModal = false" class="absolute inset-0 bg-black/50"></div>
      <div class="absolute inset-0 bg-white dark:bg-gray-950 shadow-xl transform transition-transform duration-300 ease-in-out">
        <div class="h-full flex flex-col">
          <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">
              {{ selectedViewCourse ? 'ดูข้อมูลหลักสูตร' : 'เลือกหลักสูตร' }}
            </h3>
            <button
              @click="showViewModal = false"
              class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-4">
            <!-- If multiple courses, show list -->
            <div v-if="!selectedViewCourse && viewDay" class="space-y-2">
              <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                หลักสูตรวันที่ {{ `${String(viewDay).padStart(2, '0')}/${String(currentMonth + 1).padStart(2, '0')}/${currentYear}` }}
              </h4>
              <div
                v-for="course in getCoursesForDay(viewDay)"
                :key="course.id"
                @click="openViewModal(course)"
                class="p-4 border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer transition-colors"
              >
                <div class="font-bold text-gray-900 dark:text-white">{{ course.courseName }}</div>
                <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {{ course.startTime && course.endTime ? `${course.startTime.slice(0, 5)}-${course.endTime.slice(0, 5)}` : course.time || '-' }}
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  จำนวน: {{ course.employees ? course.employees.length : 0 }} คน
                </div>
              </div>
            </div>
            
            <!-- If single course selected, show details -->
            <div v-else-if="viewingCourse" class="space-y-6">
              <!-- Course Info -->
              <div class="space-y-3">
                <div class="flex">
                  <span class="font-bold text-gray-800 dark:text-gray-200 w-36 flex-shrink-0">Course:</span>
                  <span class="text-gray-900 dark:text-white">{{ viewingCourse.courseName }}</span>
                </div>
                <div class="flex">
                  <span class="font-bold text-gray-800 dark:text-gray-200 w-36 flex-shrink-0">Schedule Date:</span>
                  <span class="text-gray-900 dark:text-white">
                    {{ viewDay && viewingCourse ? `${String(viewDay).padStart(2, '0')}/${String(viewingCourse.month + 1).padStart(2, '0')}/${viewingCourse.year}` : '-' }}
                  </span>
                </div>
                <div class="flex">
                  <span class="font-bold text-gray-800 dark:text-gray-200 w-36 flex-shrink-0">Duration:</span>
                  <span class="text-gray-900 dark:text-white">{{ viewingCourse.days || '-' }} วัน</span>
                </div>
                <div class="flex">
                  <span class="font-bold text-gray-800 dark:text-gray-200 w-36 flex-shrink-0">Course Capacity:</span>
                  <span class="text-gray-900 dark:text-white">
                    {{ viewingCourse.employees ? viewingCourse.employees.length : 0 }}
                  </span>
                </div>
                <div class="flex">
                  <span class="font-bold text-gray-800 dark:text-gray-200 w-36 flex-shrink-0">Time:</span>
                  <span class="text-gray-900 dark:text-white">
                    {{ viewingCourse.startTime && viewingCourse.endTime ? `${viewingCourse.startTime.slice(0, 5)}-${viewingCourse.endTime.slice(0, 5)}` : viewingCourse.time || '-' }}
                  </span>
                </div>
              </div>

              <div>
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-sm font-bold text-gray-900 dark:text-white">
                    รายชื่อพนักงาน ({{ viewingCourse.employees ? viewingCourse.employees.length : 0 }} คน)
                  </h4>
                </div>
                <div v-if="!viewingCourse.employees || viewingCourse.employees.length === 0" class="text-sm text-gray-500 dark:text-gray-400 italic py-4 text-center">
                  ไม่มีพนักงานในหลักสูตรนี้
                </div>
                <div v-else class="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                  <div class="overflow-x-auto">
                    <table class="w-full text-left">
                      <thead class="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          <th class="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">กลุ่ม</th>
                          <th class="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">รหัส TDL</th>
                          <th class="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">ชื่อ-นามสกุล</th>
                          <th class="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">เพศ</th>
                          <th class="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">ตำแหน่ง</th>
                          <th class="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">แผนก</th>
                          <th class="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">สัญชาติ</th>
                          <th class="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                        <tr
                          v-for="emp in viewingCourse.employees"
                          :key="emp.id"
                          class="hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <td class="px-3 py-2 text-sm text-gray-900 dark:text-white">{{ emp.group_name || '-' }}</td>
                          <td class="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{{ emp.tdl_code || '-' }}</td>
                          <td class="px-3 py-2 text-sm text-gray-900 dark:text-white">{{ emp.full_name || '-' }}</td>
                          <td class="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{{ emp.gender || '-' }}</td>
                          <td class="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{{ emp.position || '-' }}</td>
                          <td class="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{{ emp.department || '-' }}</td>
                          <td class="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{{ emp.nationality || '-' }}</td>
                          <td class="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{{ emp.status || '-' }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <!-- Back button when viewing a single course -->
              <div v-if="viewDay && getCoursesForDay(viewDay).length > 1">
                <button
                  @click="selectedViewCourse = null; viewingCourse = null"
                  class="w-full px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 rounded-xl transition-colors"
                >
                  กลับไปเลือกหลักสูตรอื่น
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>