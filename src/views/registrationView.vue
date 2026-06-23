<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabaseInternal } from '../server/supabase'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, ListBulletIcon } from '@heroicons/vue/24/outline'
import Swal from 'sweetalert2'

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
  days: '',
  attachments: [''] // ใช้ array สำหรับหลาย link
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
    days: '',
    attachments: ['']
  }
  showAddModal.value = true
}

// ใช้ plain object (ไม่ใช่ ref) เพื่อให้ใน script และ template ใช้ได้ตรงๆ
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
    openViewModal(coursesForDay[0])
  } else {
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
  selectedEmployees.value = course.employees?.map(emp => emp.id) || []
  // Load attachments as array (handle both single string and array)
  let attachments = []
  if (course.attachments && Array.isArray(course.attachments)) {
    attachments = [...course.attachments]
  } else if (course.attachment) {
    attachments = [course.attachment]
  } else {
    attachments = ['']
  }
  formData.value = {
    courseName: course.courseName,
    startTime: course.startTime || '',
    endTime: course.endTime || '',
    days: course.days || '',
    attachments: attachments
  }
  showAddModal.value = true
}

const saveCourse = async () => {
  if (!formData.value.courseName.trim()) {
    Swal.fire({
      title: 'แจ้งเตือน!',
      text: 'กรุณาเลือกหลักสูตร',
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

  if (selectedEmployees.value.length === 0) {
    Swal.fire({
      title: 'แจ้งเตือน!',
      text: 'กรุณาเลือกพนักงานที่จะเรียน',
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
    const formattedDate = formatDateLocal(currentYear.value, currentMonth.value, selectedDay.value)

    const selectedEmployeeData = getEmployeesForCourse(formData.value.courseName).filter(emp =>
      selectedEmployees.value.includes(emp.id)
    )

    // Filter out empty links and store as JSON string
    const filteredAttachments = formData.value.attachments.filter(link => link.trim() !== '')
    const attachmentToSave = filteredAttachments.length > 0 ? JSON.stringify(filteredAttachments) : null

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
      study_date: formattedDate,
      attachment: attachmentToSave
    }))

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
        status_courses: 'ผ่านแล้ว'
      }
    })

    const { error: insertError } = await supabaseInternal
      .from('employee_course_today')
      .insert(recordsToInsert)

    if (insertError) throw insertError

    const { error: trainingError } = await supabaseInternal
      .from('employee_training_records')
      .insert(trainingRecordsToInsert)

    if (trainingError) throw trainingError

    for (const emp of selectedEmployeeData) {
      const { data: existingRecord, error: fetchError } = await supabaseInternal
        .from('employee_course_registration')
        .select('*')
        .eq('id', emp.id)
        .maybeSingle() // ✅ แก้จาก .single() เป็น .maybeSingle()

      if (fetchError) continue

      if (existingRecord) {
        let remainingCourses = []
        if (existingRecord.courses && existingRecord.courses.length > 0) {
          remainingCourses = existingRecord.courses.filter(c => c !== formData.value.courseName)
        } else if (existingRecord.course_name) {
          const courseList = existingRecord.course_name.split(/[,，]/).map(c => c.trim()).filter(c => c)
          remainingCourses = courseList.filter(c => c !== formData.value.courseName)
        }

        await supabaseInternal
          .from('employee_course_registration')
          .update({
            course_name: remainingCourses.join(', ') || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', emp.id)
      }
    }

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
        studyDate: formattedDate,
        ...formData.value,
        employees: selectedEmployeeData
      })
    }

    await fetchRecords()

    Swal.fire({
      title: 'บันทึกสำเร็จ!',
      text: 'บันทึกข้อมูลสำเร็จ!',
      icon: 'success',
      customClass: {
        popup: '!p-3 !max-w-md',
        title: '!text-base',
        htmlContainer: '!text-xs',
        confirmButton: '!px-3 !py-1.5 !text-xs',
        icon: '!scale-75'
      }
    })
    showAddModal.value = false
    selectedDay.value = null
    editingCourse.value = null
    selectedCourse.value = null
  } catch (error) {
    console.error('Error saving course:', error)
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

const deleteCourse = async (course) => {
  const result = await Swal.fire({
    title: 'คุณต้องการลบหลักสูตรนี้หรือไม่?',
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
      // ✅ แก้: ใช้ studyDate จาก course โดยตรง ถ้าไม่มีค่อย query
      let formattedDate = course.studyDate

      if (!formattedDate && course.employees && course.employees.length > 0) {
        // ✅ แก้: เปลี่ยนจาก .single() เป็น .limit(1) แล้วดึง [0]
        const { data: rows, error: fetchError } = await supabaseInternal
          .from('employee_course_today')
          .select('study_date')
          .eq('course_name', course.courseName)
          .eq('tdl_code', course.employees[0].tdl_code)
          .limit(1)

        if (fetchError) throw fetchError
        formattedDate = rows?.[0]?.study_date
      }

      if (!formattedDate) {
        throw new Error('ไม่พบวันที่ของหลักสูตรนี้')
      }

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
        const record = records.value.find(r => r.id === emp.id || r.tdl_code === emp.tdl_code)

        if (record) {
          let currentCourses = []
          if (record.courses && record.courses.length > 0) {
            currentCourses = [...record.courses]
          } else if (record.course_name) {
            currentCourses = record.course_name.split(/[,，]/).map(c => c.trim()).filter(c => c)
          }

          if (!currentCourses.includes(course.courseName)) {
            currentCourses.push(course.courseName)
          }

          await supabaseInternal
            .from('employee_course_registration')
            .update({
              course_name: currentCourses.join(', ') || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', record.id)
        }
      }

      courseSchedules.value = courseSchedules.value.filter(c => c.id !== course.id)
      await fetchRecords()
      showViewModal.value = false

      Swal.fire({
        title: 'ลบสำเร็จ!',
        text: 'ลบข้อมูลสำเร็จ!',
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
      console.error('Error deleting course:', error)
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

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    Swal.fire({
      title: 'คัดลอกสำเร็จ!',
      text: 'ลิ้งค์ถูกคัดลอกไปยังคลิปบอร์ดแล้ว',
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
    console.error('Error copying to clipboard:', error)
    Swal.fire({
      title: 'เกิดข้อผิดพลาด!',
      text: 'ไม่สามารถคัดลอกลิ้งค์ได้',
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

const deleteEmployeeFromCourse = async (emp) => {
  const result = await Swal.fire({
    title: 'คุณต้องการลบพนักงานออกจากหลักสูตรนี้หรือไม่?',
    text: `${emp.full_name} - ${emp.tdl_code}`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
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

  if (!result.isConfirmed) return

  try {
    // ✅ แก้: ใช้ viewingCourse.value และเปลี่ยนจาก .single() เป็น .limit(1)
    const { data: rows, error: fetchError } = await supabaseInternal
      .from('employee_course_today')
      .select('study_date')
      .eq('course_name', viewingCourse.value.courseName)
      .eq('tdl_code', emp.tdl_code)
      .limit(1)

    if (fetchError) throw fetchError

    const formattedDate = rows?.[0]?.study_date

    if (!formattedDate) {
      throw new Error('ไม่พบวันที่ของพนักงานในหลักสูตรนี้')
    }

    // 1. ลบจาก employee_course_today
    const { error: deleteTodayError } = await supabaseInternal
      .from('employee_course_today')
      .delete()
      .eq('study_date', formattedDate)
      .eq('course_name', viewingCourse.value.courseName)  // ✅ แก้: .value
      .eq('tdl_code', emp.tdl_code)

    if (deleteTodayError) throw deleteTodayError

    // 2. ลบจาก employee_training_records
    const { error: deleteTrainingError } = await supabaseInternal
      .from('employee_training_records')
      .delete()
      .eq('training_date', formattedDate)
      .eq('course_name', viewingCourse.value.courseName)  // ✅ แก้: .value
      .eq('id_tdl', emp.tdl_code)

    if (deleteTrainingError) throw deleteTrainingError

    // 3. ย้อนกลับหลักสูตรไป employee_course_registration
    const record = records.value.find(r => r.id === emp.id || r.tdl_code === emp.tdl_code)
    if (record) {
      let currentCourses = []
      if (record.courses && record.courses.length > 0) {
        currentCourses = [...record.courses]
      } else if (record.course_name) {
        currentCourses = record.course_name.split(/[,，]/).map(c => c.trim()).filter(c => c)
      }

      if (!currentCourses.includes(viewingCourse.value.courseName)) {  // ✅ แก้: .value
        currentCourses.push(viewingCourse.value.courseName)
      }

      await supabaseInternal
        .from('employee_course_registration')
        .update({
          course_name: currentCourses.join(', ') || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', record.id)
    }

    // อัปเดต courseSchedules ใน local state
    const courseIndex = courseSchedules.value.findIndex(c => c.id === viewingCourse.value.id)  // ✅ แก้: .value
    if (courseIndex !== -1) {
      courseSchedules.value[courseIndex].employees = courseSchedules.value[courseIndex].employees.filter(e => e.id !== emp.id)

      if (courseSchedules.value[courseIndex].employees.length === 0) {
        courseSchedules.value.splice(courseIndex, 1)
        showViewModal.value = false
      } else {
        // ✅ แก้: อัปเดต viewingCourse.value
        viewingCourse.value = { ...courseSchedules.value[courseIndex] }
      }
    }

    await fetchRecords()

    Swal.fire({
      title: 'ลบสำเร็จ!',
      text: 'ลบพนักงานออกจากหลักสูตรเรียบร้อยแล้ว',
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
    console.error('Error deleting employee from course:', error)
    Swal.fire({
      title: 'เกิดข้อผิดพลาด!',
      text: 'เกิดข้อผิดพลาดในการลบพนักงาน: ' + error.message,
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

    const groupedData = {}
    data.forEach(record => {
      // ✅ แก้: parse วันที่แบบ local เพื่อกัน timezone shift
      const dateParts = record.study_date.split('-')
      const year = parseInt(dateParts[0])
      const month = parseInt(dateParts[1]) - 1
      const day = parseInt(dateParts[2])

      const key = `${year}-${month}-${day}-${record.course_name}`

      if (!groupedData[key]) {
        // Parse attachments from JSON string or use single string
        let attachments = []
        if (record.attachment) {
          try {
            attachments = JSON.parse(record.attachment)
            if (!Array.isArray(attachments)) {
              attachments = [record.attachment]
            }
          } catch (e) {
            // If not valid JSON, treat as single string
            attachments = [record.attachment]
          }
        }
        groupedData[key] = {
          id: `${key}-${Date.now()}`,
          date: day,
          month: month,
          year: year,
          studyDate: record.study_date,
          courseName: record.course_name,
          startTime: record.start_time,
          endTime: record.end_time,
          days: record.total_days,
          attachments: attachments,
          employees: []
        }
      }

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
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Calendar</h1>
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

    <!-- Add/Edit Modal -->
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
            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Link</label>
                <button
                  @click="formData.attachments.push('')"
                  class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  + เพิ่ม Link
                </button>
              </div>
              <div class="space-y-2">
                <div v-for="(link, index) in formData.attachments" :key="index" class="flex gap-2">
                  <input
                    v-model="formData.attachments[index]"
                    type="url"
                    class="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="ใส่ลิ้งค์ที่นี่..."
                  />
                  <button
                    v-if="formData.attachments.length > 1"
                    @click="formData.attachments.splice(index, 1)"
                    class="px-3 py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    x
                  </button>
                </div>
              </div>
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

    <!-- View Course Modal -->
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
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <span class="font-bold text-gray-800 dark:text-gray-200 w-36 flex-shrink-0">Course:</span>
                    <span class="text-gray-900 dark:text-white">{{ viewingCourse.courseName }}</span>
                  </div>
                  <button
                    @click="deleteCourse(viewingCourse)"
                    class="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="ลบหลักสูตร"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
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
                    {{ viewingCourse.employees ? viewingCourse.employees.length : 0 }} คน
                  </span>
                </div>
                <div class="flex">
                  <span class="font-bold text-gray-800 dark:text-gray-200 w-36 flex-shrink-0">Time:</span>
                  <span class="text-gray-900 dark:text-white">
                    {{ viewingCourse.startTime && viewingCourse.endTime ? `${viewingCourse.startTime.slice(0, 5)}-${viewingCourse.endTime.slice(0, 5)}` : viewingCourse.time || '-' }}
                  </span>
                </div>
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-gray-800 dark:text-gray-200">Links:</span>
                  </div>
                  <div v-if="viewingCourse.attachments && viewingCourse.attachments.length > 0" class="space-y-2">
                    <div v-for="(link, index) in viewingCourse.attachments" :key="index" class="flex items-center gap-2">
                      <a :href="link" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 break-all flex-1">
                        {{ link }}
                      </a>
                      <button
                        @click="copyToClipboard(link)"
                        class="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg transition-colors flex-shrink-0"
                      >
                        คัดลอก
                      </button>
                    </div>
                  </div>
                  <div v-else class="text-sm text-gray-500 dark:text-gray-400 italic">
                    ไม่มีลิ้งค์
                  </div>
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
                          <th class="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase w-10"></th>
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
                          <td class="px-3 py-2 text-right">
                            <button
                              @click="deleteEmployeeFromCourse(emp)"
                              class="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="ลบพนักงานออกจากหลักสูตร"
                            >
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <!-- Back button when viewing a single course -->
              <div v-if="viewDay && getCoursesForDay(viewDay).length > 1" class="mb-4">
                <button
                  @click="selectedViewCourse = null; viewingCourse = null"
                  class="w-full px-3 py-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 rounded-lg text-xs font-medium transition-colors"
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