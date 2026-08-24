<script setup>
import { ref, onMounted, watch, computed, onUnmounted } from 'vue'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  ArrowDownTrayIcon,
  DocumentIcon,
  ArrowUpTrayIcon,
  ChevronRightIcon,
  PencilSquareIcon,
  TrashIcon,
  PaperClipIcon,
  XMarkIcon,
} from '@heroicons/vue/24/solid'
import { supabaseInternal } from '../server/supabase'
import { supabaseExternal } from '../server/supabase_data'
import { useAuth } from '../stores/auth'
import Swal from 'sweetalert2'
import * as XLSX from 'xlsx'

const auth = useAuth()

// === Core Data Refs ===
const records = ref([])
const employees = ref([])
const courses = ref([])
const loading = ref(false)
const isSidebarOpen = ref(false)
const editingRecord = ref(null)

const expandedRecordId = ref(null)
const isEditingSingleCourse = ref(false)
// === Refs สำหรับ inline แก้ไขวันที่ใน Expand section (หน้ารายการหลัก) ===
// key: `${recordId}_${courseRecordId}_training` หรือ `_re`
const expandDateEditLoading = ref({})
const expandHiddenTrainingDateRefs = ref({})
const expandHiddenReDateRefs = ref({})
const setExpandHiddenTrainingDateRef = (key, el) => {
  if (el) expandHiddenTrainingDateRefs.value[key] = el
}
const setExpandHiddenReDateRef = (key, el) => {
  if (el) expandHiddenReDateRefs.value[key] = el
}
// เปิด native date picker สำหรับ expand section
const openExpandTrainingDatePicker = (recordId, course) => {
  const key = `${recordId}_${course.record_id || course.course_name}_training`
  const el = expandHiddenTrainingDateRefs.value[key]
  if (el) {
    el.value = parseUserDate(course.training_date || '') || ''
    setTimeout(() => {
      try {
        if (typeof el.showPicker === 'function') el.showPicker()
        else { el.focus(); el.click() }
      } catch (e) { el.focus(); el.click() }
    }, 10)
  }
}
const openExpandReDatePicker = (recordId, course) => {
  const key = `${recordId}_${course.record_id || course.course_name}_re`
  const el = expandHiddenReDateRefs.value[key]
  if (el) {
    el.value = parseUserDate(course.re_date || '') || ''
    setTimeout(() => {
      try {
        if (typeof el.showPicker === 'function') el.showPicker()
        else { el.focus(); el.click() }
      } catch (e) { el.focus(); el.click() }
    }, 10)
  }
}
// ฟังก์ชันบันทึกวันที่ที่แก้ไขใน expand section ลงฐานข้อมูลโดยตรง
const updateCourseDateInline = async (record, course, field, newValue) => {
  const key = `${record.id}_${course.record_id || course.course_name}_${field}`
  if (!newValue) return
  const parsed = parseUserDate(newValue)
  if (!parsed) {
    Swal.fire({
      title: 'รูปแบบวันที่ไม่ถูกต้อง',
      text: 'กรุณาเลือกวันที่ใหม่อีกครั้ง',
      icon: 'warning',
      confirmButtonText: 'ตกลง',
      customClass: { popup: '!p-3 !max-w-md', title: '!text-base', htmlContainer: '!text-xs', confirmButton: '!px-3 !py-1.5 !text-xs' },
    })
    return
  }
  expandDateEditLoading.value[key] = true
  try {
    const src = course._source || (record._record_sources ? record._record_sources[course.record_id] : 'employee_training_records') || 'employee_training_records'
    if (!course.record_id) {
      throw new Error('ไม่พบรหัสหลักสูตรสำหรับบันทึกการแก้ไข')
    }
    const { error } = await supabaseInternal.from(src).update({
      [field]: parsed,
      updated_at: new Date().toISOString(),
      updated_by: auth.user?.fullname || auth.user?.name || auth.user?.username || 'Unknown',
    }).eq('id', course.record_id)
    if (error) throw error
    course[field] = parsed
    Swal.fire({
      title: 'บันทึกสำเร็จ!',
      text: `${field === 'training_date' ? 'วันที่ฝึกอบรม' : 'REหลักสูตร'} ถูกอัปเดตเป็น ${formatDate(parsed)} แล้ว`,
      icon: 'success',
      timer: 1400,
      showConfirmButton: false,
      customClass: { popup: '!p-3 !max-w-md', title: '!text-base', htmlContainer: '!text-xs' },
    })
    fetchRecords()
  } catch (err) {
    console.error('Error updating date inline:', err.message)
    Swal.fire({ title: 'เกิดข้อผิดพลาด!', text: err.message, icon: 'error', customClass: { popup: '!p-3 !max-w-md', title: '!text-base', htmlContainer: '!text-xs', confirmButton: '!px-3 !py-1.5 !text-xs' } })
  } finally {
    expandDateEditLoading.value[key] = false
  }
}

const searchQuery = ref('')
const tdlSearchQuery = ref('')
const showTdlDropdown = ref(false)
const tdlDropdownRef = ref(null)
const isEditingRow = ref(false)
const editingRowRecord = ref(null)
const openDropdownId = ref(null)
const originalEmployeeId = ref(null)
const courseSearchQueries = ref({}) // To hold search query per course index
const showCourseDropdowns = ref([]) // To track which course index is open (deprecated: ใช้ Modal แล้ว ไว้เผื่อ fallback)
const selectedCourses = ref({}) // To hold multi-selected courses per index: { 0: ['Course A', 'Course B'], ... }
const multiSelectTrainingDates = ref({}) // วันที่ฝึกอบรม ชั่วคราวสำหรับ multi-select
const multiSelectReDates = ref({}) // REหลักสูตร ชั่วคราวสำหรับ multi-select
const showCoursesAsTable = ref(true) // สลับมุมมองแสดงหลักสูตรแบบตาราง

// === Course Selector Modal (ใหญ่ กลางหน้าจอ เลือกง่าย)
const showCourseSelectorModal = ref(false)
const modalCourseIndex = ref(null) // index ของหลักสูตรที่เปิด modal (ใน formData.courses[?])
const modalSearchQuery = ref('')
const modalSelectedCourses = ref([]) // รายการหลักสูตรที่เลือกใน modal
const modalTrainingDate = ref('')
const modalReDate = ref('')
const modalOriginalCourse = ref(null) // เก็บชื่อหลักสูตรเดิมก่อนแก้ (ถ้ามี)

// Import Preview
const showImportPreview = ref(false)
const importPreviewData = ref([])
const expandedPreviewRow = ref(null)
const employeeAttachments = ref({}) // เก็บไฟล์แนบของแต่ละพนักงาน

// จัดกลุ่มข้อมูล preview ตามพนักงาน
const groupedImportPreview = computed(() => {
  const grouped = {}

  importPreviewData.value.forEach((row, index) => {
    const key = `${row['ชื่อ'] || ''}-${row['นามสกุล'] || ''}-${row['รหัส TDL'] || ''}`
    if (!grouped[key]) {
      grouped[key] = {
        index,
        ...row,
        courses: [],
      }
    }
    if (row['ชื่อหลักสูตร']) {
      grouped[key].courses.push({
        course_name: row['ชื่อหลักสูตร'],
        training_date: row['วันที่ฝึกอบรม'],
        re_date: row['REหลักสูตร'],
        status_courses: row['สถานะหลักสูตร'],
        originalIndex: index, // เก็บ index ดั้งเดิมของ row ใน importPreviewData
      })
    }
  })

  return Object.values(grouped)
})

// Dump File Dropdown
const showDumpFileDropdown = ref(false)
const dumpFileDropdownRef = ref(null)

// เก็บ input file refs สำหรับ preview
const previewFileInputRefs = ref({})

// อัปโหลดไฟล์แนบ
const attachmentFile = ref(null) // ไฟล์ที่เลือกไว้ (ยังไม่อัปโหลด) สำหรับกรณี global (ถ้ายังมีใช้)
const attachmentUploading = ref(false)
const attachmentInputRef = ref(null)
const courseAttachmentInputRef = ref(null)
// ไฟล์แนบระดับแต่ละหลักสูตร (Course-level attachment): ทุกรายการมีไฟล์แนบของตัวเองแยกกัน
const courseAttachmentFiles = ref({}) // { [index]: File Object } ไฟล์ที่เลือกใหม่ ยังไม่อัปโหลด
const courseAttachmentUploading = ref({}) // { [index]: true/false } สถานะกำลังอัปโหลดต่อหลักสูตร
const courseAttachmentInputRefs = ref({}) // { [index]: input element ref } สำหรับ input file ต่อหลักสูตร
// สำหรับอัปโหลดไฟล์แนบจากตาราง (record list)
const currentRecordForAttachment = ref(null)
const tableAttachmentInputRef = ref(null)

// คอมพิวท์สำหรับกรองพนักงานตามคำค้นหา
const filteredEmployees = computed(() => {
  if (!tdlSearchQuery.value) return employees.value
  const query = tdlSearchQuery.value.toLowerCase()
  return employees.value.filter(
    (emp) =>
      emp.employee_code?.toLowerCase().includes(query) ||
      emp.id_lxml?.toLowerCase().includes(query) ||
      emp.fullname?.toLowerCase().includes(query) ||
      emp.firstname?.toLowerCase().includes(query) ||
      emp.lastname?.toLowerCase().includes(query),
  )
})

// ฟังก์ชันสำหรับกรองหลักสูตรตามคำค้นหา
const getFilteredCourses = (query) => {
  if (!query) return courses.value
  const q = query.toLowerCase()
  return courses.value.filter((c) => c.course_name?.toLowerCase().includes(q))
}

const formData = ref({
  group: '',
  id_tdl: '',
  employee_id: '',
  first_name: '',
  last_name: '',
  position: '',
  department: '',
  gender: '',
  nationality: '',
  status: '',
  date_health_check: '',
  date_health_expiry: '',
  attachment_url: '',
  courses: [],
})

const fullNameInput = ref('')

// เช็คว่าไฟล์แนบเป็นรูปภาพหรือไม่ (จากนามสกุลไฟล์ใน URL)
const isImageAttachment = (url) => {
  if (!url) return false
  return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url)
}

// ตรวจสอบว่าเป็นหลักสูตรซ้ำหรือไม่
const isDuplicateCourse = (course, index) => {
  if (!course.course_name) return false

  // ค้นหาพนักงานคนนี้ใน records.value
  const existingEmployee = records.value.find(
    (r) =>
      (formData.value.id_tdl && r.id_tdl === formData.value.id_tdl) ||
      (!formData.value.id_tdl &&
        r.first_name === formData.value.first_name &&
        r.last_name === formData.value.last_name),
  )

  if (!existingEmployee) return false

  // ตรวจสอบว่ามีหลักสูตรนี้อยู่แล้วหรือไม่ (ยกเว้นถ้าเป็น course ที่มี record_id เดิม)
  const isExisting = existingEmployee.courses.some(
    (c) =>
      c.course_name &&
      c.course_name.trim() === course.course_name.trim() &&
      (!course.record_id || c.record_id !== course.record_id),
  )

  return isExisting
}

// ดึงชื่อไฟล์จาก URL เพื่อแสดงผล
const getAttachmentFileName = (url) => {
  if (!url) return ''
  try {
    const parts = url.split('/')
    const lastPart = parts[parts.length - 1]
    return decodeURIComponent(lastPart.split('?')[0])
  } catch {
    return url
  }
}

// เมื่อผู้ใช้เลือกไฟล์จาก input
const handleAttachmentChange = (event) => {
  const file = event.target.files?.[0]
  if (file) {
    attachmentFile.value = file
  }
}

// ลบไฟล์แนบที่เลือกไว้ (ก่อนบันทึก) หรือลบ URL เดิม (ถ้าไม่มีไฟล์ใหม่) — แยกตามหลักสูตร
const removeAttachment = (index) => {
  if (typeof index === 'number') {
    delete courseAttachmentFiles.value[index]
    if (formData.value.courses[index]) {
      formData.value.courses[index].attachment_url = ''
    }
    if (courseAttachmentInputRefs.value[index]) {
      courseAttachmentInputRefs.value[index].value = ''
    }
  } else {
    attachmentFile.value = null
    formData.value.attachment_url = ''
    if (attachmentInputRef.value) {
      attachmentInputRef.value.value = ''
    }
    if (courseAttachmentInputRef.value) {
      courseAttachmentInputRef.value.value = ''
    }
  }
}

// ฟังก์ชันเปิดเลือกไฟล์แนบจากตารางหลักสูตร (ใน Sidebar Form) — แยกตาม index
const openCourseAttachmentPicker = (index) => {
  if (typeof index === 'number') {
    courseAttachmentInputRefs.value[index]?.click()
  } else {
    courseAttachmentInputRef.value?.click()
  }
}

// ฟังก์ชัน handle การเปลี่ยนไฟล์แนบจาก input ที่เชื่อมต่อกับตารางหลักสูตร — แยกตาม index
const handleCourseAttachmentChange = (event, index) => {
  const file = event.target.files?.[0]
  if (file) {
    if (typeof index === 'number') {
      courseAttachmentFiles.value[index] = file
    } else {
      attachmentFile.value = file
    }
  }
}

// ฟังก์ชันสำหรับเพิ่มไฟล์แนบจากตาราง
const openTableAttachmentUpload = (record) => {
  currentRecordForAttachment.value = record
  tableAttachmentInputRef.value?.click()
}

const handleTableAttachmentChange = async (event) => {
  const file = event.target.files?.[0]
  if (!file || !currentRecordForAttachment.value) return

  try {
    attachmentUploading.value = true

    // อัปโหลดไฟล์
    const uploadedUrl = await uploadAttachment(file)
    if (uploadedUrl) {
      // อัปเดตทุก record ของพนักงานคนนี้ด้วย attachment_url ใหม่
      for (const recordId of currentRecordForAttachment.value.record_ids) {
        const { error } = await supabaseInternal
          .from('employee_training_records')
          .update({
            attachment_url: uploadedUrl,
            updated_by: auth.user?.fullname || auth.user?.name || auth.user?.username || 'Unknown',
          })
          .eq('id', recordId)

        if (error) {
          console.error('Error updating attachment:', error)
        }
      }

      Swal.fire({
        title: 'อัปโหลดสำเร็จ!',
        text: 'เพิ่มไฟล์แนบเรียบร้อยแล้ว',
        icon: 'success',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          icon: '!scale-75',
        },
      })

      // โหลดข้อมูลใหม่
      await fetchRecords()
    }
  } catch (error) {
    console.error('Error uploading table attachment:', error)
    Swal.fire({
      title: 'เกิดข้อผิดพลาด!',
      text: 'อัปโหลดไฟล์แนบไม่สำเร็จ: ' + error.message,
      icon: 'error',
      customClass: {
        popup: '!p-3 !max-w-md',
        title: '!text-base',
        htmlContainer: '!text-xs',
        confirmButton: '!px-3 !py-1.5 !text-xs',
        icon: '!scale-75',
      },
    })
  } finally {
    attachmentUploading.value = false
    currentRecordForAttachment.value = null
    event.target.value = '' // reset input
  }
}

// อัปโหลดไฟล์แนบขึ้น Supabase Storage bucket "imge" และคืนค่า public URL
const uploadAttachment = async (file) => {
  attachmentUploading.value = true
  try {
    const fileExt = file.name.split('.').pop()
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
    const filePath = `training_record/${Date.now()}_${safeName}`

    const { error: uploadError } = await supabaseInternal.storage
      .from('imge')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) throw uploadError

    const { data: publicUrlData } = supabaseInternal.storage.from('imge').getPublicUrl(filePath)

    return publicUrlData?.publicUrl || null
  } finally {
    attachmentUploading.value = false
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
    last_name: parts.slice(1).join(' '),
  }
}

const updateNameFromInput = () => {
  const { first_name, last_name } = parseFullName(fullNameInput.value)
  formData.value.first_name = first_name
  formData.value.last_name = last_name
}

// ดึงข้อมูล courses สำหรับ dropdown
const fetchCourses = async () => {
  try {
    const { data, error } = await supabaseInternal.from('courses').select('*').order('course_name')

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
    console.log('Fetched employees, first one:', allData[0])
    if (allData.length > 0) {
      console.log('All keys in employee object:', Object.keys(allData[0]))
    }
  } catch (error) {
    console.error('Error fetching employees:', error.message)
  }
}

// ฟังก์ชันเติมข้อมูลพนักงานอัตโนมัติเมื่อเลือกรหัส TDL หรือ id_lxml
const getNationalityFromIdTdl = (code) => {
  if (!code) return ''
  const firstChar = code.trim().charAt(0).toUpperCase()
  if (/[A-Z]/.test(firstChar)) {
    return 'Laos'
  } else if (/[0-9]/.test(firstChar)) {
    return 'Thai'
  }
  return ''
}

const fillEmployeeData = (code) => {
  const employee = employees.value.find((emp) => emp.employee_code === code || emp.id_lxml === code)
  console.log('fillEmployeeData called with code:', code)
  console.log('Found employee:', employee)

  const autoNationality = getNationalityFromIdTdl(code)

  if (employee) {
    // เติมค่า fullNameInput
    if (employee.fullname) {
      fullNameInput.value = employee.fullname
    } else {
      fullNameInput.value = `${employee.firstname || ''} ${employee.lastname || ''}`.trim()
    }
    // แยกชื่อและนามสกุลจาก fullname (ถ้ามี)
    if (employee.fullname) {
      const nameParts = employee.fullname.split(' ')
      formData.value.first_name = nameParts[0] || ''
      formData.value.last_name = nameParts.slice(1).join(' ') || ''
    } else {
      formData.value.first_name = employee.firstname || ''
      formData.value.last_name = employee.lastname || ''
    }
    formData.value.position = employee.position || ''
    formData.value.department = employee.department || ''
    formData.value.employee_id = employee.id_lxml || ''

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

    formData.value.nationality = employee.nationality || autoNationality

    console.log('Employee status from DB:', employee.status)

    // ใช้ค่าสถานะจากฐานข้อมูลตรงๆ เลย
    formData.value.status = employee.status || ''

    console.log('Set formData.status to:', formData.value.status)
    console.log('Gender determined from pn:', genderFromPn, 'Employee pn:', employee.pn)
  } else {
    if (autoNationality) {
      formData.value.nationality = autoNationality
    }
  }
}

// ฟังก์ชันแยกชื่อและนามสกุล
const parseFullname = (fullname) => {
  if (!fullname) return { first_name: '', last_name: '' }
  const parts = fullname.trim().split(' ')
  if (parts.length === 1) return { first_name: parts[0], last_name: '' }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  }
}

// ฟังก์ชันเลือกรหัส TDL จาก dropdown
const selectEmployee = (employee) => {
  formData.value.id_tdl = employee.employee_code
  tdlSearchQuery.value =
    employee.fullname || `${employee.firstname} ${employee.lastname}` || employee.employee_code
  showTdlDropdown.value = false
  fillEmployeeData(employee.employee_code)
}

// ฟังก์ชันเปิด dropdown เมื่อคลิกที่ input
const handleTdlInputClick = () => {
  showTdlDropdown.value = true
  if (!formData.value.id_tdl) {
    tdlSearchQuery.value = ''
  }
}

// Flag: ถ้าคลิกที่ input type=date หรือ input text ล่าสุด ให้หยุดปิด dropdown ชั่วคราว
const pendingDateClickIndex = ref(null)
const lastClickedType = ref('')

// ฟังก์ชันเมื่อคลิกนอก dropdown ให้ปิด
const handleClickOutside = (event) => {
  // === เฉพาะกรณีคลิกที่ input type="date" หรือ type="text" ภายใน dropdown หลักสูตร:
  // native date picker จะไม่มี element ใน DOM (จนเป็น shadow DOM ของ browser)
  // ดังนั้นเมื่อคลิกที่ไอคอนปฏิทิน / เลือกวันที่ document.activeElement จะยังคงเป็น input นั้น
  // เราต้องเช็ครอบนี้ก่อนปิด dropdown
  const activeEl = document.activeElement
  const isActiveDateOrTextInsideCourseDropdown =
    activeEl &&
    activeEl.tagName === 'INPUT' &&
    (activeEl.type === 'date' || activeEl.type === 'text') &&
    Object.keys(showCourseDropdowns.value).some((idx) => {
      const i = Number(idx)
      const wrapper = courseWrapperRefs.value[i]
      return wrapper && wrapper.contains(activeEl) && showCourseDropdowns.value[i]
    })

  if (tdlDropdownRef.value && !tdlDropdownRef.value.contains(event.target)) {
    showTdlDropdown.value = false
  }
  if (openDropdownId.value) {
    openDropdownId.value = null
  }
  // ปิด Dump File dropdown เมื่อคลิกนอก
  if (dumpFileDropdownRef.value && !dumpFileDropdownRef.value.contains(event.target)) {
    showDumpFileDropdown.value = false
  }
  // ปิด dropdown หลักสูตรที่เปิดอยู่เมื่อคลิกนอก wrapper ของมัน
  Object.keys(showCourseDropdowns.value).forEach((idx) => {
    const i = Number(idx)
    if (showCourseDropdowns.value[i]) {
      const wrapper = courseWrapperRefs.value[i]
      const clickedInsideWrapper = wrapper && wrapper.contains(event.target)
      // ยกเว้นกรณี: active element เป็น input date/text ที่อยู่ใน wrapper นี้
      const activeInsideThis =
        isActiveDateOrTextInsideCourseDropdown && wrapper && wrapper.contains(activeEl)
      if (!clickedInsideWrapper && !activeInsideThis) {
        setCourseDropdownOpen(i, false)
        delete selectedCourses.value[i]
        delete multiSelectTrainingDates.value[i]
        delete multiSelectReDates.value[i]
      }
    }
  })
}

const fetchRecords = async () => {
  try {
    loading.value = true

    // === ดึงข้อมูลจากทั้งสองตาราง: employee_training_records + re_courses (เพื่อให้ข้อมูลที่เคยถูกย้ายไปแล้วกลับมาสามารถดู/แก้ไข/ลบได้) ===
    const { data: mainData, error: mainError } = await supabaseInternal
      .from('employee_training_records')
      .select('*')
      .order('created_at', { ascending: false })

    if (mainError) throw mainError

    const { data: archiveData, error: archiveError } = await supabaseInternal
      .from('re_courses')
      .select('*')
      .order('created_at', { ascending: false })

    if (archiveError) {
      console.warn('Could not fetch re_courses (continuing with main data only):', archiveError)
    }

    // === แปลงข้อมูลจาก re_courses ให้มีโครงสร้างเดียวกับ employee_training_records แล้วรวมกัน ===
    const convertedArchive = (archiveData || []).map((ar) => ({
      id: ar.id,
      group: ar.group_name,
      id_tdl: ar.tdl_code,
      employee_id: ar.id_lxml,
      first_name: (ar.full_name || '').split(' ')[0] || '',
      last_name: (ar.full_name || '').split(' ').slice(1).join(' ') || '',
      position: ar.position,
      department: ar.department,
      gender: ar.gender,
      nationality: ar.nationality,
      status: ar.status,
      status_card: ar.status_card,
      date_health_check: ar.checkup_date,
      date_health_expiry: ar.checkup_expire_date,
      attachment_url: ar.attachment_url,
      created_by: ar.created_by,
      created_at: ar.created_at,
      updated_by: ar.updated_by,
      updated_at: ar.updated_at,
      course_name: ar.course_name,
      training_date: ar.training_date,
      re_date: ar.re_date,
      status_re: ar.re_status || 'Reแล้ว',
      status_courses: ar.status_courses,
      _source: 're_courses',
    }))

    // รวมข้อมูลจากทั้งสองตาราง (ให้ข้อมูลทุกอย่างอยู่ในหน้าเดียว สามารถแก้ไข/ลบได้)
    const data = [...(mainData || []), ...convertedArchive]

    console.log(
      'Raw data from database (combined):',
      data.length,
      'records (main:',
      mainData?.length || 0,
      '+ archive:',
      convertedArchive.length,
      ')',
    )

    // === ปิดการทำงาน Auto-Archive แล้ว! จะไม่ย้ายข้อมูลไป re_courses และไม่ลบข้อมูลออกจากตารางหลักอีกต่อไป ===
    // ยังคงอัปเดต status_re = 'Reแล้ว' เมื่อถึง re_date เท่านั้น (เป็นการแสดงผลสถานะ ไม่ได้ลบข้อมูล)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const updates = []
    const toHealthCheck = []
    data.forEach((record) => {
      // ข้ามการอัปเดตสำหรับรายการที่มาจาก re_courses (เป็นข้อมูลที่ถูกย้ายไปแล้ว)
      if (record._source === 're_courses') return

      let shouldUpdateStatus = false

      // ตรวจสอบเฉพาะการอัปเดต status_re เป็น 'Reแล้ว' (ไม่ทำการ archive / ย้ายข้อมูลอีกต่อไป)
      if (record.re_date && record.status_re !== 'Reแล้ว') {
        const reDate = new Date(record.re_date)
        reDate.setHours(0, 0, 0, 0)
        if (reDate <= today) {
          shouldUpdateStatus = true
        }
      }

      // ตรวจสอบว่าต้องบันทึกไป health_check หรือไม่ (คงฟีเจอร์นี้ไว้)
      if (record.date_health_expiry) {
        const expireDate = new Date(record.date_health_expiry)
        expireDate.setHours(0, 0, 0, 0)
        if (expireDate <= today) {
          toHealthCheck.push(record)
        }
      }

      if (shouldUpdateStatus) {
        updates.push({ id: record.id, status_re: 'Reแล้ว' })
      }
    })

    // อัปเดต status_re เท่านั้น (ไม่มีการ archive/ย้ายข้อมูลอีกต่อไป)
    for (const update of updates) {
      try {
        await supabaseInternal
          .from('employee_training_records')
          .update({ status_re: 'Reแล้ว' })
          .eq('id', update.id)
        const recordToUpdate = data.find((r) => r.id === update.id)
        if (recordToUpdate) {
          recordToUpdate.status_re = 'Reแล้ว'
        }
      } catch (updateError) {
        console.error('Error updating status_re:', updateError)
      }
    }

    // Auto-save expired health check to health_check table (คงฟีเจอร์นี้ไว้เหมือนเดิม)
    for (const record of toHealthCheck) {
      try {
        const { data: existingData, error: checkError } = await supabaseInternal
          .from('health_check')
          .select('id')
          .eq('group_name', record.group)
          .eq('tdl_code', record.id_tdl)
          .eq('checkup_date', record.date_health_check)
          .eq('checkup_expire_date', record.date_health_expiry)
          .limit(1)

        if (checkError) throw checkError
        if (existingData && existingData.length > 0) continue

        const fullName =
          record.first_name && record.last_name
            ? `${record.first_name} ${record.last_name}`
            : record.first_name || record.last_name || ''

        const healthCheckData = {
          group_name: record.group,
          tdl_code: record.id_tdl,
          id_lxml: record.employee_id,
          full_name: fullName,
          gender: record.gender,
          position: record.position,
          department: record.department,
          nationality: record.nationality,
          status: record.status,
          checkup_date: record.date_health_check,
          checkup_expire_date: record.date_health_expiry,
        }

        const { error: insertError } = await supabaseInternal
          .from('health_check')
          .insert(healthCheckData)

        if (insertError) throw insertError
      } catch (healthError) {
        console.error('Error saving health check:', healthError)
      }
    }

    // === ไม่ลบ/กรองข้อมูลออกอีกต่อไป ใช้ data ทั้งหมดโดยตรง ===
    // จัดกลุ่มข้อมูลตามพนักงาน (ใช้รหัส TDL เป็นหลัก)
    const grouped = {}
    data.forEach((record) => {
      // ใช้ id_tdl เป็นหลัก ถ้าไม่มีใช้ชื่อ-นามสกุล
      const key = record.id_tdl
        ? `tdl-${record.id_tdl}`
        : `${record.first_name}-${record.last_name}-${record.employee_id || 'no-id'}`
      const sourceTable =
        record._source === 're_courses' ? 're_courses' : 'employee_training_records'
      if (!grouped[key]) {
        grouped[key] = {
          id: record.id, // ใช้ id ล่าสุด
          record_ids: [record.id], // เก็บทุก id ของ record ในกลุ่มนี้
          _record_sources: { [record.id]: sourceTable }, // จำว่า id ไหนมาจากตรางไหน
          group: record.group,
          id_tdl: record.id_tdl,
          employee_id: record.employee_id,
          first_name: record.first_name,
          last_name: record.last_name,
          position: record.position,
          department: record.department,
          gender: record.gender,
          nationality: record.nationality,
          status: record.status,
          status_card: record.status_card,
          date_health_check: record.date_health_check,
          date_health_expiry: record.date_health_expiry,
          attachment_url: '',
          created_by: record.created_by,
          created_at: record.created_at,
          courses: [],
        }
      } else {
        grouped[key].record_ids.push(record.id)
        grouped[key]._record_sources[record.id] = sourceTable
      }
      if (record.course_name || record.training_date) {
        grouped[key].courses.push({
          course_name: record.course_name,
          training_date: record.training_date,
          re_date: record.re_date,
          status_re: record.status_re,
          record_id: record.id,
          _source: sourceTable, // จำว่าหลักสูตรนี้มาจากตรางไหน
          status: record.status_courses || record.status,
          attachment_url: record.attachment_url || '',
        })
      }
    })

    records.value = Object.values(grouped)
  } catch (error) {
    console.error('Error fetching records:', error.message)
  } finally {
    loading.value = false
  }
}

const filteredRecords = () => {
  if (!searchQuery.value) return records.value
  const query = searchQuery.value.toLowerCase()
  return records.value.filter(
    (record) =>
      record.first_name?.toLowerCase().includes(query) ||
      record.last_name?.toLowerCase().includes(query) ||
      record.employee_id?.toLowerCase().includes(query) ||
      record.id_tdl?.toLowerCase().includes(query) ||
      record.department?.toLowerCase().includes(query),
  )
}

const openAddSidebar = () => {
  editingRecord.value = null
  tdlSearchQuery.value = ''
  fullNameInput.value = ''
  attachmentFile.value = null
  // เคลียร์ไฟล์แนบระดับ course-level ทั้งหมด
  courseAttachmentFiles.value = {}
  courseAttachmentUploading.value = {}
  courseAttachmentInputRefs.value = {}
  courseSearchQueries.value = {}
  showCourseDropdowns.value = [false]
  selectedCourses.value = {}
  multiSelectTrainingDates.value = {}
  multiSelectReDates.value = {}
  showCoursesAsTable.value = true
  formData.value = {
    group: getNextGroupNumber(), // Auto-generate เลขกลุ่มถัดไป
    id_tdl: '',
    employee_id: '',
    first_name: '',
    last_name: '',
    position: '',
    department: '',
    gender: '',
    nationality: '',
    status: '',
    date_health_check: '',
    date_health_expiry: '',
    attachment_url: '',
    courses: [
      {
        course_name: '',
        training_date: '',
        re_date: '',
        status_re: '',
        record_id: null,
        status: 'ผ่านแล้ว',
        attachment_url: '',
      },
    ],
  }
  isSidebarOpen.value = true
}

const openEditSidebar = (record, course = null) => {
  isEditingRow.value = false
  editingRowRecord.value = null
  editingRecord.value = record
  isEditingSingleCourse.value = !!course
  attachmentFile.value = null
  // เคลียร์ไฟล์แนบระดับ course-level ทั้งหมดก่อน
  courseAttachmentFiles.value = {}
  courseAttachmentUploading.value = {}
  courseAttachmentInputRefs.value = {}
  originalEmployeeId.value = record.employee_id || null
  courseSearchQueries.value = {}
  selectedCourses.value = {}
  multiSelectTrainingDates.value = {}
  multiSelectReDates.value = {}
  const coursesForForm = course
    ? [
        {
          course_name: course.course_name,
          training_date: course.training_date,
          re_date: course.re_date,
          status_re: course.status_re,
          record_id: course.record_id,
          _source:
            course._source ||
            (record._record_sources
              ? record._record_sources[course.record_id]
              : 'employee_training_records'),
          status: course.status || 'ผ่านแล้ว',
          attachment_url: course.attachment_url || '',
        },
      ]
    : record.courses && record.courses.length > 0
      ? record.courses.map((c) => ({
          course_name: c.course_name,
          training_date: c.training_date,
          re_date: c.re_date,
          status_re: c.status_re,
          record_id: c.record_id,
          _source:
            c._source ||
            (record._record_sources
              ? record._record_sources[c.record_id]
              : 'employee_training_records'),
          status: c.status || 'ผ่านแล้ว',
          attachment_url: c.attachment_url || '',
        }))
      : [
          {
            course_name: '',
            training_date: '',
            re_date: '',
            status_re: '',
            record_id: null,
            status: 'ผ่านแล้ว',
            attachment_url: '',
          },
        ]

  showCourseDropdowns.value = new Array(coursesForForm.length).fill(false)
  if (record && !course) {
    showCoursesAsTable.value = true
  } else if (!record) {
    showCoursesAsTable.value = true
  }
  formData.value = {
    group: record.group || '',
    id_tdl: record.id_tdl || '',
    employee_id: record.employee_id || '',
    first_name: record.first_name || '',
    last_name: record.last_name || '',
    position: record.position || '',
    department: record.department || '',
    gender: record.gender || '',
    nationality: record.nationality || '',
    status: record.status || '',
    date_health_check: record.date_health_check || '',
    date_health_expiry: record.date_health_expiry || '',
    attachment_url: '',
    courses: coursesForForm,
  }
  // เติมค่า fullNameInput
  if (record.first_name || record.last_name) {
    fullNameInput.value = `${record.first_name || ''} ${record.last_name || ''}`.trim()
  } else {
    fullNameInput.value = ''
  }
  // เติมค่า search query สำหรับ dropdown
  if (record.id_tdl) {
    const employee = employees.value.find((emp) => emp.employee_code === record.id_tdl)
    tdlSearchQuery.value = employee
      ? employee.fullname || `${employee.firstname} ${employee.lastname}` || employee.employee_code
      : record.id_tdl
  } else {
    tdlSearchQuery.value = ''
  }
  isSidebarOpen.value = true
}

const openEditRowSidebar = (record) => {
  console.log('Opening edit row for record:', record)
  editingRowRecord.value = {
    id: record.id,
    group: record.group,
    id_tdl: record.id_tdl || '',
    original_employee_id: record.employee_id || '', // เก็บค่าเดิมไว้
    employee_id: record.employee_id || '',
    first_name: record.first_name,
    last_name: record.last_name,
    status_card: record.status_card || '',
    date_health_check: record.date_health_check || '',
    date_health_expiry: record.date_health_expiry || '',
  }
  editingRecord.value = null
  isEditingSingleCourse.value = false
  isEditingRow.value = true
  isSidebarOpen.value = true
  console.log('isEditingRow:', isEditingRow.value)
}

const saveEditRow = async () => {
  try {
    console.log('Saving row:', editingRowRecord.value)
    console.log('original_employee_id:', editingRowRecord.value.original_employee_id)

    // Auto-set status_card based on employee_id
    const autoStatusCard =
      editingRowRecord.value.employee_id && editingRowRecord.value.employee_id.trim() !== ''
        ? 'ได้รับแล้ว'
        : 'ยังไม่ได้รับ'
    console.log('Auto-set status_card to:', autoStatusCard)

    // === อัปเดตข้อมูลพนักงานใน employee_training_records ===
    let query = supabaseInternal
      .from('employee_training_records')
      .update({
        id_tdl: editingRowRecord.value.id_tdl || null,
        employee_id: editingRowRecord.value.employee_id || null,
        status_card: autoStatusCard,
        date_health_check: editingRowRecord.value.date_health_check || null,
        date_health_expiry: editingRowRecord.value.date_health_expiry || null,
      })
      .eq('first_name', editingRowRecord.value.first_name)
      .eq('last_name', editingRowRecord.value.last_name)

    if (editingRowRecord.value.original_employee_id) {
      query = query.eq('employee_id', editingRowRecord.value.original_employee_id)
    } else {
      query = query.is('employee_id', null)
    }

    console.log('Running update query...')
    const { data, error } = await query.select()

    console.log('Update result:', data, error)

    if (error) throw error

    // === อัปเดตข้อมูลพนักงานใน re_courses ด้วย (ใช้ full_name + id_lxml) ===
    const fullName =
      `${editingRowRecord.value.first_name} ${editingRowRecord.value.last_name}`.trim()
    let reQuery = supabaseInternal
      .from('re_courses')
      .update({
        tdl_code: editingRowRecord.value.id_tdl || null,
        id_lxml: editingRowRecord.value.employee_id || null,
        status_card: autoStatusCard,
        checkup_date: editingRowRecord.value.date_health_check || null,
        checkup_expire_date: editingRowRecord.value.date_health_expiry || null,
      })
      .eq('full_name', fullName)
    if (editingRowRecord.value.original_employee_id) {
      reQuery = reQuery.eq('id_lxml', editingRowRecord.value.original_employee_id)
    } else {
      reQuery = reQuery.is('id_lxml', null)
    }
    const { error: reErr } = await reQuery
    if (reErr) {
      console.warn('saveEditRow: re_courses update warning (non-fatal):', reErr)
    }

    closeSidebar()
    fetchRecords()
    Swal.fire({
      title: 'บันทึกสำเร็จ!',
      text: `บันทึกข้อมูลเรียบร้อยแล้ว (สถานะ: ${autoStatusCard})`,
      icon: 'success',
      customClass: {
        popup: '!p-3 !max-w-md',
        title: '!text-base',
        htmlContainer: '!text-xs',
        confirmButton: '!px-3 !py-1.5 !text-xs',
        icon: '!scale-75',
      },
    })
  } catch (error) {
    console.error('Error saving row:', error)
    Swal.fire({
      title: 'เกิดข้อผิดพลาด!',
      text: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + error.message,
      icon: 'error',
      customClass: {
        popup: '!p-3 !max-w-md',
        title: '!text-base',
        htmlContainer: '!text-xs',
        confirmButton: '!px-3 !py-1.5 !text-xs',
        icon: '!scale-75',
      },
    })
  }
}

const deleteCourse = async (record, course) => {
  const result = await Swal.fire({
    title: 'คุณแน่ใจหรือไม่?',
    text: `คุณต้องการลบหลักสูตร "${course.course_name}" ใช่หรือไม่?`,
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
      icon: '!scale-75',
    },
  })

  if (result.isConfirmed) {
    try {
      if (course.record_id) {
        const src =
          course._source ||
          (record._record_sources
            ? record._record_sources[course.record_id]
            : 'employee_training_records') ||
          'employee_training_records'
        const { error } = await supabaseInternal.from(src).delete().eq('id', course.record_id)

        if (error) throw error
      }

      Swal.fire({
        title: 'ลบสำเร็จ!',
        text: 'หลักสูตรถูกลบเรียบร้อยแล้ว',
        icon: 'success',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          icon: '!scale-75',
        },
      })

      fetchRecords()
    } catch (error) {
      console.error('Error deleting course:', error.message)
      Swal.fire({
        title: 'เกิดข้อผิดพลาด!',
        text: 'เกิดข้อผิดพลาดในการลบหลักสูตร',
        icon: 'error',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          icon: '!scale-75',
        },
      })
    }
  }
}

const archiveHealthCheck = async (record) => {
  const result = await Swal.fire({
    title: 'ย้ายข้อมูลไปหมดอายุตรวจสุขภาพ',
    text: `คุณต้องการย้ายข้อมูล "${record.first_name} ${record.last_name}" ไปที่หน้าหมดอายุตรวจสุขภาพใช่หรือไม่?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    confirmButtonText: 'ใช่, ย้าย!',
    cancelButtonText: 'ยกเลิก',
    customClass: {
      popup: '!p-3 !max-w-md',
      title: '!text-base',
      htmlContainer: '!text-xs',
      confirmButton: '!px-3 !py-1.5 !text-xs',
      cancelButton: '!px-3 !py-1.5 !text-xs',
      icon: '!scale-75',
    },
  })

  if (result.isConfirmed) {
    try {
      const fullName =
        record.first_name && record.last_name
          ? `${record.first_name} ${record.last_name}`
          : record.first_name || record.last_name || ''

      for (const recordId of record.record_ids) {
        const { data: originalData, error: fetchError } = await supabaseInternal
          .from('employee_training_records')
          .select('*')
          .eq('id', recordId)
          .single()

        if (fetchError) throw fetchError

        const healthCheckData = {
          group_name: originalData.group,
          tdl_code: originalData.id_tdl,
          id_lxml: originalData.employee_id,
          full_name: fullName,
          gender: originalData.gender,
          position: originalData.position,
          department: originalData.department,
          nationality: originalData.nationality,
          status: originalData.status,
          checkup_date: originalData.date_health_check,
          checkup_expire_date: originalData.date_health_expiry,
        }

        const { error: insertError } = await supabaseInternal
          .from('health_check')
          .insert(healthCheckData)

        if (insertError) throw insertError

        const { error: deleteError } = await supabaseInternal
          .from('employee_training_records')
          .delete()
          .eq('id', recordId)

        if (deleteError) throw deleteError
      }

      Swal.fire({
        title: 'ย้ายสำเร็จ!',
        text: 'ย้ายข้อมูลไปที่หน้าหมดอายุตรวจสุขภาพเรียบร้อยแล้ว',
        icon: 'success',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          icon: '!scale-75',
        },
      })

      fetchRecords()
    } catch (error) {
      console.error('Error archiving health check:', error.message)
      Swal.fire({
        title: 'เกิดข้อผิดพลาด!',
        text: 'เกิดข้อผิดพลาดในการย้ายข้อมูล: ' + error.message,
        icon: 'error',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          icon: '!scale-75',
        },
      })
    }
  }
}

const closeSidebar = () => {
  isSidebarOpen.value = false
  editingRecord.value = null
  isEditingSingleCourse.value = false
  isEditingRow.value = false
  editingRowRecord.value = null
  fullNameInput.value = ''
  openDropdownId.value = null
  attachmentFile.value = null
  // เคลียร์ไฟล์แนบระดับ course-level ทั้งหมดด้วย
  courseAttachmentFiles.value = {}
  courseAttachmentUploading.value = {}
  courseAttachmentInputRefs.value = {}
  originalEmployeeId.value = null
  courseSearchQueries.value = {}
  showCourseDropdowns.value = [false]
  selectedCourses.value = {}
  multiSelectTrainingDates.value = {}
  multiSelectReDates.value = {}
  formData.value = {
    group: '',
    id_tdl: '',
    employee_id: '',
    first_name: '',
    last_name: '',
    position: '',
    department: '',
    gender: '',
    nationality: '',
    status: '',
    date_health_check: '',
    date_health_expiry: '',
    attachment_url: '',
    courses: [
      {
        course_name: '',
        training_date: '',
        re_date: '',
        status_re: '',
        record_id: null,
        status: 'ผ่านแล้ว',
        attachment_url: '',
      },
    ],
  }
}

const toggleDropdown = (event, id) => {
  event.stopPropagation()
  openDropdownId.value = openDropdownId.value === id ? null : id
}

const addCourse = () => {
  formData.value.courses.push({
    course_name: '',
    training_date: '',
    re_date: '',
    status_re: '',
    record_id: null,
    status: 'ผ่านแล้ว',
    attachment_url: '',
  })
  showCourseDropdowns.value.push(false)
  showCoursesAsTable.value = true
}

const removeCourse = (index) => {
  const course = formData.value.courses[index]
  if (!course) return

  if (formData.value.courses.length <= 1 && !isDuplicateCourse(course, index)) {
    Swal.fire({
      title: 'ไม่สามารถลบได้',
      text: 'ต้องมีหลักสูตรอย่างน้อย 1 รายการในฟอร์ม กรุณาเพิ่มหลักสูตรอื่นก่อน หรือเปลี่ยนแค่ชื่อหลักสูตรแทน',
      icon: 'warning',
      confirmButtonText: 'ตกลง',
      customClass: {
        popup: '!p-4 !max-w-md',
        title: '!text-base',
        htmlContainer: '!text-sm',
        confirmButton: '!px-4 !py-2 !text-sm',
      },
    })
    return
  }

  const courseName = course.course_name || `หลักสูตร ${index + 1}`
  Swal.fire({
    title: 'ยืนยันการลบรายการหลักสูตร?',
    text: `ต้องการลบรายการ "${courseName}" ใช่หรือไม่? (ถ้ารายการนี้ถูกบันทึกในระบบอยู่แล้ว จะถูกลบออกจากฐานข้อมูลด้วยเมื่อกดบันทึก)`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ใช่, ลบเลย!',
    cancelButtonText: 'ยกเลิก',
    reverseButtons: true,
    customClass: {
      popup: '!p-4 !max-w-md',
      title: '!text-base',
      htmlContainer: '!text-sm',
      confirmButton: '!px-4 !py-2 !text-sm !bg-red-600 hover:!bg-red-700',
      cancelButton: '!px-4 !py-2 !text-sm',
    },
  }).then((r) => {
    if (!r.isConfirmed) return

    if (formData.value.courses.length > 1) {
      formData.value.courses.splice(index, 1)
      showCourseDropdowns.value.splice(index, 1)
      delete courseSearchQueries.value[index]
      delete selectedCourses.value[index]
      delete multiSelectTrainingDates.value[index]
      delete multiSelectReDates.value[index]
      delete courseAttachmentFiles.value[index]
      delete courseAttachmentUploading.value[index]
      delete courseAttachmentInputRefs.value[index]
      const rebuildIndexed = (obj) => {
        const rebuilt = {}
        let newIdx = 0
        for (let i = 0; i < formData.value.courses.length + 1; i++) {
          if (i === index) continue
          if (obj[i] !== undefined) {
            rebuilt[newIdx] = obj[i]
          }
          newIdx++
        }
        return rebuilt
      }
      courseSearchQueries.value = rebuildIndexed(courseSearchQueries.value)
      selectedCourses.value = rebuildIndexed(selectedCourses.value)
      multiSelectTrainingDates.value = rebuildIndexed(multiSelectTrainingDates.value)
      multiSelectReDates.value = rebuildIndexed(multiSelectReDates.value)
      courseAttachmentFiles.value = rebuildIndexed(courseAttachmentFiles.value)
      courseAttachmentUploading.value = rebuildIndexed(courseAttachmentUploading.value)
      courseAttachmentInputRefs.value = rebuildIndexed(courseAttachmentInputRefs.value)
    }
  })
}

// ฟังก์ชันช่วยเปิด/ปิด dropdown หลักสูตร (ใช้ .value ให้ reactive ถูกต้อง)
const setCourseDropdownOpen = (index, isOpen) => {
  showCourseDropdowns.value[index] = isOpen
}

// ฟังก์ชันเปิด Dropdown หลักสูตร พร้อมเติมค่าเดิม (ถ้ามี) เพื่อให้แก้ไขได้
const openCourseDropdownForEdit = (index) => {
  const course = formData.value.courses[index]
  if (course) {
    // ถ้ามีชื่อหลักสูตรอยู่แล้ว ให้เติมลง selectedCourses และ courseSearchQueries
    if (course.course_name && course.course_name.trim()) {
      selectedCourses.value[index] = [course.course_name]
      courseSearchQueries.value[index] = course.course_name
    } else {
      selectedCourses.value[index] = []
      courseSearchQueries.value[index] = ''
    }
    // ถ้ามีวันที่ฝึกอบรมอยู่แล้ว ให้เติมลง multiSelectTrainingDates
    if (course.training_date) {
      multiSelectTrainingDates.value[index] = course.training_date
    } else {
      multiSelectTrainingDates.value[index] = ''
    }
    // ถ้ามี REหลักสูตรอยู่แล้ว ให้เติมลง multiSelectReDates
    if (course.re_date) {
      multiSelectReDates.value[index] = course.re_date
    } else {
      multiSelectReDates.value[index] = ''
    }
  }
  setCourseDropdownOpen(index, true)
}

// ========== Course Selector Modal (ใหญ่ กลางหน้าจอ เลือกง่าย) ==========
const openCourseSelectorModal = (index) => {
  const course = formData.value.courses[index]
  modalCourseIndex.value = index
  modalOriginalCourse.value = course?.course_name || null
  modalSearchQuery.value = ''
  // ใส่ชื่อหลักสูตรเดิม (ถ้ามี) ลงในรายการที่เลือก
  modalSelectedCourses.value = course?.course_name?.trim() ? [course.course_name] : []
  // ใส่วันที่เดิม (ถ้ามี)
  modalTrainingDate.value = course?.training_date || ''
  modalReDate.value = course?.re_date || ''
  // ปิด dropdown เดิมทิ้งเสีย (ถ้ามีเปิดค้าง)
  setCourseDropdownOpen(index, false)
  showCourseSelectorModal.value = true
}
const closeCourseSelectorModal = () => {
  showCourseSelectorModal.value = false
  modalCourseIndex.value = null
  modalSearchQuery.value = ''
  modalSelectedCourses.value = []
  modalTrainingDate.value = ''
  modalReDate.value = ''
  modalOriginalCourse.value = null
}
const getModalFilteredCourses = () => {
  const q = (modalSearchQuery.value || '').trim().toLowerCase()
  if (!q) return courses.value
  return courses.value.filter((c) => (c.course_name || '').toLowerCase().includes(q))
}
const isModalCourseSelected = (name) => modalSelectedCourses.value.includes(name)
const toggleModalCourse = (name) => {
  const idx = modalSelectedCourses.value.indexOf(name)
  if (idx >= 0) modalSelectedCourses.value.splice(idx, 1)
  else modalSelectedCourses.value.push(name)
}
const clearModalCourseSelection = () => {
  modalSelectedCourses.value = []
}
const confirmModalCourseSelection = async () => {
  const index = modalCourseIndex.value
  if (index === null || index === undefined) return closeCourseSelectorModal()

  // 1) เลือก 0 รายการ = ยกเลิกการกำหนดหลักสูตรนี้
  if (modalSelectedCourses.value.length === 0) {
    if (modalOriginalCourse.value) {
      Swal.fire({
        title: 'ยืนยันการลบหลักสูตรนี้?',
        text: `ยกเลิกการเลือก "${modalOriginalCourse.value}" (ถ้าต้องการจะลบรายการนี้ กดยืนยัน)`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ล้างข้อมูลหลักสูตรนี้',
        cancelButtonText: 'กลับไป',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          cancelButton: '!px-3 !py-1.5 !text-xs',
        },
      }).then((r) => {
        if (r.isConfirmed) {
          formData.value.courses[index].course_name = ''
          formData.value.courses[index].status = 'ผ่านแล้ว'
          closeCourseSelectorModal()
        }
      })
    } else {
      closeCourseSelectorModal()
    }
    return
  }

  // 2) ต้องเลือกวันที่ฝึกอบรม
  if (!modalTrainingDate.value) {
    Swal.fire({
      icon: 'warning',
      title: 'กรุณาเลือกวันที่ฝึกอบรม',
      confirmButtonText: 'ตกลง',
      customClass: {
        popup: '!p-3 !max-w-md',
        title: '!text-base',
        confirmButton: '!px-3 !py-1.5 !text-xs',
      },
    })
    return
  }

  // 3) ถ้าเลือก 1 รายการ → ใส่ลงใน index นั้นเลย (รวมถึงวันที่ + RE)
  if (modalSelectedCourses.value.length === 1) {
    formData.value.courses[index].course_name = modalSelectedCourses.value[0]
    formData.value.courses[index].training_date = modalTrainingDate.value
    formData.value.courses[index].re_date = modalReDate.value || ''
    if (!formData.value.courses[index].status) formData.value.courses[index].status = 'ผ่านแล้ว'
    closeCourseSelectorModal()
    return
  }

  // 4) ถ้าเลือกมากกว่า 1 รายการ → ใส่หลักสูตรแรกลงใน index ปัจจุบัน แล้วเพิ่มหลักสูตรใหม่
  const remaining = [...modalSelectedCourses.value]
  const first = remaining.shift()
  formData.value.courses[index].course_name = first
  formData.value.courses[index].training_date = modalTrainingDate.value
  formData.value.courses[index].re_date = modalReDate.value || ''
  if (!formData.value.courses[index].status) formData.value.courses[index].status = 'ผ่านแล้ว'

  for (const name of remaining) {
    // ดึงไฟล์แนบจากหลักสูตรเดิมที่ index นี้ (แต่ถ้าเพิ่มใหม่ ไม่ต้องย้าย) — ไฟล์แนบจะยังคงอยู่เฉพาะตัวเอง
    const currentAttach = courseAttachmentFiles.value[index]
    const currentUrl = formData.value.courses[index].attachment_url || ''

    formData.value.courses.push({
      record_id: null,
      course_name: name,
      training_date: modalTrainingDate.value,
      re_date: modalReDate.value || '',
      status: 'ผ่านแล้ว',
      attachment_url: '', // เพิ่มใหม่ ไม่มีไฟล์แนบ
    })
    // ชี้ให้ชัดเจน: courseAttachmentFiles และ courseAttachmentInputRefs จะไม่ได้รับค่าเพิ่ม (เพิ่งสร้าง) จึงปล่อยว่าง
  }

  // หลังเพิ่ม หลักสูตรแรกจะยังคงไฟล์แนบเดิม (ไม่ได้เปลี่ยน index จริงๆ) — ไม่มีอะไรต้องย้าย
  closeCourseSelectorModal()
}

// ฟังก์ชันช่วยตั้งค่าคำค้นหาหลักสูตร (ใช้ .value ให้ reactive ถูกต้อง)
const setCourseSearchQuery = (index, value) => {
  courseSearchQueries.value[index] = value
}

// ฟังก์ชันจัดการ blur event สำหรับ dropdown หลักสูตร
const handleCourseDropdownBlur = (index) => {
  setTimeout(() => {
    setCourseDropdownOpen(index, false)
  }, 200)
}

const courseWrapperRefs = ref({}) // เก็บ ref ของ wrapper หลักสูตรแต่ละแถว
const setCourseWrapperRef = (index, el) => {
  if (el) courseWrapperRefs.value[index] = el
}

// ========== Custom Hybrid Date Input (ส่วนของ dropdown multi-select) ==========
// format: แปลง yyyy-mm-dd -> dd/mm/yyyy สำหรับแสดง
const formatDateInputDisplay = (isoDate) => {
  if (!isoDate) return ''
  const match = String(isoDate)
    .trim()
    .match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (match) {
    return `${String(match[3]).padStart(2, '0')}/${String(match[2]).padStart(2, '0')}/${match[1]}`
  }
  // ถ้าเป็น dd/mm/yyyy อยู่แล้ว ก็คืนได้เลย
  return String(isoDate).trim()
}

// สำหรับ display text ของ input วันที่ใน dropdown (multi-select)
const multiTrainingDateDisplay = (index) => {
  return formatDateInputDisplay(multiSelectTrainingDates.value[index] || '')
}
const multiReDateDisplay = (index) => {
  return formatDateInputDisplay(multiSelectReDates.value[index] || '')
}

// refs สำหรับ input type="date" ที่ซ่อนอยู่ใน dropdown (multi-select)
const hiddenMultiTrainingDateRefs = ref({})
const hiddenMultiReDateRefs = ref({})
const setHiddenMultiTrainingDateRef = (index, el) => {
  if (el) hiddenMultiTrainingDateRefs.value[index] = el
}
const setHiddenMultiReDateRef = (index, el) => {
  if (el) hiddenMultiReDateRefs.value[index] = el
}

// เมื่อพิมพ์ในช่อง text ของ multi-select
const handleMultiTrainingDateTextInput = (index, event) => {
  const raw = event.target.value
  multiSelectTrainingDates.value[index] = raw
}
const handleMultiReDateTextInput = (index, event) => {
  const raw = event.target.value
  multiSelectReDates.value[index] = raw
}

// คลิกที่ไอคอนปฏิทินของ multi-select -> เปิด native date picker
const openMultiTrainingDatePicker = (index) => {
  const el = hiddenMultiTrainingDateRefs.value[index]
  if (el) {
    el.value = parseUserDate(multiSelectTrainingDates.value[index] || '') || ''
    setTimeout(() => {
      try {
        if (typeof el.showPicker === 'function') {
          el.showPicker()
        } else {
          el.focus()
          el.click()
        }
      } catch (e) {
        el.focus()
        el.click()
      }
    }, 10)
  }
}
const openMultiReDatePicker = (index) => {
  const el = hiddenMultiReDateRefs.value[index]
  if (el) {
    el.value = parseUserDate(multiSelectReDates.value[index] || '') || ''
    setTimeout(() => {
      try {
        if (typeof el.showPicker === 'function') {
          el.showPicker()
        } else {
          el.focus()
          el.click()
        }
      } catch (e) {
        el.focus()
        el.click()
      }
    }, 10)
  }
}

// เมื่อเปลี่ยนค่าจาก native date picker (hidden) ของ multi-select
const handleMultiTrainingDatePickerChange = (index, event) => {
  const val = event.target.value
  if (val) {
    multiSelectTrainingDates.value[index] = val // เก็บเป็น yyyy-mm-dd
  }
}
const handleMultiReDatePickerChange = (index, event) => {
  const val = event.target.value
  if (val) {
    multiSelectReDates.value[index] = val // เก็บเป็น yyyy-mm-dd
  }
}

// ========== Custom Hybrid Date Input (ส่วนของ course card ทีละแถว - formData.courses) ==========
const hiddenTrainingDateRefs = ref({})
const hiddenReDateRefs = ref({})
const setHiddenTrainingDateRef = (index, el) => {
  if (el) hiddenTrainingDateRefs.value[index] = el
}
const setHiddenReDateRef = (index, el) => {
  if (el) hiddenReDateRefs.value[index] = el
}

const cardTrainingDateDisplay = (index) =>
  formatDate(formData.value.courses[index]?.training_date || '') === '-'
    ? ''
    : formatDate(formData.value.courses[index]?.training_date || '')
const cardReDateDisplay = (index) =>
  formatDate(formData.value.courses[index]?.re_date || '') === '-'
    ? ''
    : formatDate(formData.value.courses[index]?.re_date || '')

const handleCardTrainingDateInput = (index, e) => {
  const parsed = parseUserDate(e.target.value)
  formData.value.courses[index].training_date = parsed || e.target.value
}
const handleCardReDateInput = (index, e) => {
  const parsed = parseUserDate(e.target.value)
  formData.value.courses[index].re_date = parsed || e.target.value
}

const openCardTrainingDatePicker = (index) => {
  const el = hiddenTrainingDateRefs.value[index]
  if (el) {
    el.value = parseUserDate(formData.value.courses[index]?.training_date || '') || ''
    setTimeout(() => {
      try {
        if (typeof el.showPicker === 'function') el.showPicker()
        else {
          el.focus()
          el.click()
        }
      } catch (e) {
        el.focus()
        el.click()
      }
    }, 10)
  }
}
const openCardReDatePicker = (index) => {
  const el = hiddenReDateRefs.value[index]
  if (el) {
    el.value = parseUserDate(formData.value.courses[index]?.re_date || '') || ''
    setTimeout(() => {
      try {
        if (typeof el.showPicker === 'function') el.showPicker()
        else {
          el.focus()
          el.click()
        }
      } catch (e) {
        el.focus()
        el.click()
      }
    }, 10)
  }
}
const handleCardTrainingDatePickerChange = (index, e) => {
  if (e.target.value) formData.value.courses[index].training_date = e.target.value
}
const handleCardReDatePickerChange = (index, e) => {
  if (e.target.value) formData.value.courses[index].re_date = e.target.value
}

// ===== ฟังก์ชันสำหรับ Multi-Select หลักสูตรด้วย Checkbox =====
const toggleCourseSelection = (index, courseName) => {
  if (!selectedCourses.value[index]) {
    selectedCourses.value[index] = []
  }
  const i = selectedCourses.value[index].indexOf(courseName)
  if (i === -1) {
    selectedCourses.value[index].push(courseName)
  } else {
    selectedCourses.value[index].splice(i, 1)
  }
}

const isCourseSelected = (index, courseName) => {
  return selectedCourses.value[index]?.includes(courseName) || false
}

const clearCourseSelection = (index) => {
  selectedCourses.value[index] = []
}

// ฟังก์ชันแปลงวันที่จากการพิมพ์ของผู้ใช้ (รองรับ dd/mm/yyyy และ yyyy-mm-dd) เป็น yyyy-mm-dd สำหรับบันทึกลง DB
const parseUserDate = (dateStr) => {
  if (!dateStr) return ''
  const trimmed = String(dateStr).trim()
  if (!trimmed) return ''

  // ถ้าอยู่ในรูปแบบ yyyy-mm-dd อยู่แล้ว
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) {
    return `${isoMatch[1]}-${String(isoMatch[2]).padStart(2, '0')}-${String(isoMatch[3]).padStart(2, '0')}`
  }

  // ถ้าอยู่ในรูปแบบ dd/mm/yyyy หรือ dd-mm-yyyy
  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (slashMatch) {
    const day = String(slashMatch[1]).padStart(2, '0')
    const month = String(slashMatch[2]).padStart(2, '0')
    const year = slashMatch[3]
    return `${year}-${month}-${day}`
  }

  return trimmed
}

// ยืนยันการเลือกหลายหลักสูตร: ใช้อันแรกกับแถวปัจจุบัน สร้างแถวใหม่สำหรับที่เหลือ
const confirmMultiCourseSelection = (index) => {
  const selected = selectedCourses.value[index] || []
  const trainingDateRaw = multiSelectTrainingDates.value[index] || ''
  const reDateRaw = multiSelectReDates.value[index] || ''

  if (selected.length === 0) {
    setCourseDropdownOpen(index, false)
    return
  }
  if (!trainingDateRaw) {
    return
  }

  // แปลงวันที่ให้อยู่ในรูปแบบ yyyy-mm-dd
  const trainingDate = parseUserDate(trainingDateRaw)
  const reDate = parseUserDate(reDateRaw)

  if (!trainingDate) {
    Swal.fire({
      title: 'รูปแบบวันที่ไม่ถูกต้อง!',
      text: 'กรุณาป้อนวันที่ฝึกอบรมในรูปแบบ dd/mm/yyyy เช่น 20/08/2026',
      icon: 'warning',
      customClass: {
        popup: '!p-3 !max-w-md',
        title: '!text-base',
        htmlContainer: '!text-xs',
        confirmButton: '!px-3 !py-1.5 !text-xs',
        icon: '!scale-75',
      },
    })
    return
  }

  // ใช้หลักสูตรแรกกับแถวปัจจุบัน + วันที่ที่กรอกมา
  formData.value.courses[index].course_name = selected[0]
  formData.value.courses[index].training_date = trainingDate
  formData.value.courses[index].re_date = reDate
  if (!formData.value.courses[index].status_re) formData.value.courses[index].status_re = ''
  if (!formData.value.courses[index].record_id) formData.value.courses[index].record_id = null
  if (!formData.value.courses[index].status) formData.value.courses[index].status = 'ผ่านแล้ว'
  if (!formData.value.courses[index].attachment_url)
    formData.value.courses[index].attachment_url = ''
  courseSearchQueries.value[index] = selected[0]

  // สร้างแถวใหม่สำหรับหลักสูตรที่เหลือ พร้อมวันที่เดียวกัน
  for (let i = 1; i < selected.length; i++) {
    formData.value.courses.push({
      course_name: selected[i],
      training_date: trainingDate,
      re_date: reDate,
      status_re: '',
      record_id: null,
      status: 'ผ่านแล้ว',
      attachment_url: '',
    })
    showCourseDropdowns.value.push(false)
  }

  showCoursesAsTable.value = true

  delete selectedCourses.value[index]
  delete multiSelectTrainingDates.value[index]
  delete multiSelectReDates.value[index]
  setCourseDropdownOpen(index, false)
}

// ฟังก์ชันตรวจสอบข้อมูลในฟอร์ม "เพิ่ม/แก้ไขข้อมูลพนักงานทั้งหมด" ก่อนบันทึก
// คืนค่าเป็น array ของชื่อฟิวด์ที่ยังป้อนข้อมูลไม่ครบ (ถ้าไม่มีอะไรขาดจะคืน array ว่าง)
const validateForm = () => {
  const missing = []

  if (!fullNameInput.value.trim()) missing.push('ชื่อ-นามสกุล')
  if (!formData.value.gender || !formData.value.gender.trim()) missing.push('เพศ')
  if (!formData.value.nationality || !formData.value.nationality.trim()) missing.push('สัญชาติ')
  if (!formData.value.status || !formData.value.status.trim()) missing.push('สถานะ')

  // ตรวจสอบพากส่วนหลักสูตร - ทุกแถวต้องกรอกครบทุกช่อง
  formData.value.courses.forEach((course, index) => {
    const rowNumber = index + 1
    if (!course.course_name || !course.course_name.trim()) {
      missing.push(`หลักสูตร ${rowNumber} - ชื่อหลักสูตร`)
    }
    if (!course.training_date) {
      missing.push(`หลักสูตร ${rowNumber} - วันที่ฝึกอบรม`)
    }
    if (!course.re_date) {
      missing.push(`หลักสูตร ${rowNumber} - REหลักสูตร`)
    }
  })

  return missing
}

const saveRecord = async () => {
  console.log('auth.user value:', auth.user)
  console.log('formData.value:', formData.value)
  console.log('editingRecord.value:', editingRecord.value)
  console.log('isEditingSingleCourse.value:', isEditingSingleCourse.value)

  // FORCE: ตั้งสถานะทุกหลักสูตรเป็น "ผ่านแล้ว" ทั้งหมดก่อนบันทึก
  if (formData.value.courses && formData.value.courses.length) {
    formData.value.courses.forEach((c) => {
      c.status = 'ผ่านแล้ว'
    })
  }

  // ตรวจสอบว่ามีหลักสูตรซ้ำหรือไม่ (เฉพาะเมื่อเพิ่มใหม่ หรือเพิ่มหลักสูตรใหม่)
  if (!editingRecord.value || !isEditingSingleCourse.value) {
    for (const course of formData.value.courses) {
      if (course.course_name && !course.record_id) {
        // ตรวจสอบเฉพาะหลักสูตรที่มีชื่อและยังไม่มี record_id
        // ค้นหาพนักงานคนนี้ใน records.value
        const existingEmployee = records.value.find(
          (r) =>
            (formData.value.id_tdl && r.id_tdl === formData.value.id_tdl) ||
            (!formData.value.id_tdl &&
              r.first_name === formData.value.first_name &&
              r.last_name === formData.value.last_name),
        )

        if (existingEmployee) {
          // ตรวจสอบว่ามีหลักสูตรนี้อยู่แล้วหรือไม่
          const existingCourse = existingEmployee.courses.find(
            (c) => c.course_name && c.course_name.trim() === course.course_name.trim(),
          )

          if (existingCourse) {
            // สร้างรายการหลักสูตรทั้งหมด
            const allCoursesList = existingEmployee.courses
              .map((c) => `<li>• ${c.course_name}</li>`)
              .join('')

            Swal.fire({
              title: 'ข้อมูลซ้ำ!',
              html: `<strong>${formData.value.first_name} ${formData.value.last_name}</strong> เรียนหลักสูตร "${course.course_name}" แล้ว<br><br>รายการหลักสูตรทั้งหมด:<br><ul style="text-align:left; margin:0; padding-left:1.2em;">${allCoursesList}</ul>`,
              icon: 'warning',
              customClass: {
                popup: '!p-3 !max-w-md',
                title: '!text-base',
                htmlContainer: '!text-xs',
                confirmButton: '!px-3 !py-1.5 !text-xs',
                icon: '!scale-75',
              },
            })
            return
          }
        }
      }
    }
  }

  // ตรวจสอบเฉพาะเมื่อไม่ใช่การแก้ไข单个 course
  if (!isEditingSingleCourse.value) {
    // อัปเดต first_name และ last_name ก่อนบันทึก
    updateNameFromInput()

    const missingFields = validateForm()
    console.log('missingFields:', missingFields)
    if (missingFields.length > 0) {
      Swal.fire({
        title: 'กรุณาป้อนข้อมูลให้ครบ!',
        html:
          'ยังป้อนข้อมูลไม่ครบในช่องต่อไปนี้:<br><br>' +
          '<ul style="text-align:left; margin:0; padding-left:1.2em;">' +
          missingFields.map((f) => `<li>${f}</li>`).join('') +
          '</ul>',
        icon: 'warning',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs !text-left',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          icon: '!scale-75',
        },
      })
      return
    }
  }

  // Get the correct username from auth.user
  const username = auth.user?.fullname || auth.user?.name || auth.user?.username || 'Unknown'
  console.log('Username to save:', username)

  // Auto-set status_card based on employee_id
  const autoStatusCard =
    formData.value.employee_id && formData.value.employee_id.trim() !== ''
      ? 'ได้รับแล้ว'
      : 'ยังไม่ได้รับ'
  console.log('Auto-set status_card to:', autoStatusCard)

  // ===== จัดการไฟล์แนบ: ป้องกันการใช้ global fallback ร่วมกันหลายหลักสูตร =====
  // 1) ถ้ามีไฟล์แนบอยู่ใน global (attachmentFile) แต่ไม่ได้ถูกจัดสรรให้หลักสูตรใดเลย
  //    — ย้ายไปใส่หลักสูตรแรกอัตโนมัติ (ถ้าหลักสูตรแรกยังไม่มีไฟล์) เพื่อป้องกันไฟล์หายไป
  //    — หรือถ้าหลักสูตรแรกมีอยู่แล้ว ก็เคลียร์ทิ้งและเตือน
  if (attachmentFile.value && formData.value.courses.length > 0) {
    if (!courseAttachmentFiles.value[0] && !formData.value.courses[0].attachment_url) {
      console.log(
        '[Attachment] ย้ายไฟล์แนบ global ไปหลักสูตรที่ 1 อัตโนมัติ:',
        attachmentFile.value.name,
      )
      courseAttachmentFiles.value[0] = attachmentFile.value
    } else {
      console.warn(
        '[Attachment] มีไฟล์แนบ global ติดค้าง แต่หลักสูตรที่ 1 มีไฟล์อยู่แล้ว — เคลียร์ทิ้ง:',
        attachmentFile.value.name,
      )
    }
    attachmentFile.value = null
    formData.value.attachment_url = ''
  } else {
    // 2) เคลียร์ global เสมอ ไม่ว่าจะมีหรือไม่ เพื่อป้องกันการไปใช้ค่าค้าง
    attachmentFile.value = null
    formData.value.attachment_url = ''
  }

  // อัปโหลดไฟล์แนบระดับหลักสูตร (แยกตามแต่ละหลักสูตร) — หลักสูตรหนึ่งไฟล์แนบอันหนึ่งของตัวเอง
  for (let i = 0; i < formData.value.courses.length; i++) {
    const file = courseAttachmentFiles.value[i]
    if (file) {
      try {
        courseAttachmentUploading.value[i] = true
        console.log(`[Attachment] อัปโหลดไฟล์แนบสำหรับหลักสูตรที่ ${i + 1}:`, file.name)
        const uploadedUrl = await uploadAttachment(file)
        if (uploadedUrl) {
          formData.value.courses[i].attachment_url = uploadedUrl
          console.log(`[Attachment] หลักสูตรที่ ${i + 1} อัปโหลดสำเร็จ:`, uploadedUrl)
        }
      } catch (uploadError) {
        console.error('Error uploading course attachment:', uploadError)
        Swal.fire({
          title: 'เกิดข้อผิดพลาด!',
          text: 'อัปโหลดไฟล์แนบ (หลักสูตร ' + (i + 1) + ') ไม่สำเร็จ: ' + uploadError.message,
          icon: 'error',
          customClass: {
            popup: '!p-3 !max-w-md',
            title: '!text-base',
            htmlContainer: '!text-xs',
            confirmButton: '!px-3 !py-1.5 !text-xs',
            icon: '!scale-75',
          },
        })
        return
      } finally {
        courseAttachmentUploading.value[i] = false
      }
    }
  }

  // ===== แปลงรูปแบบวันที่ทุกฟิลด์ให้เป็น ISO (yyyy-mm-dd) ก่อนบันทึก =====
  formData.value.date_health_check = parseUserDate(formData.value.date_health_check || '') || null
  formData.value.date_health_expiry = parseUserDate(formData.value.date_health_expiry || '') || null
  formData.value.courses.forEach((course) => {
    course.training_date = parseUserDate(course.training_date || '') || null
    course.re_date = parseUserDate(course.re_date || '') || null
  })

  // เก็บรวมข้อผิดพลาดจากการจัดการหลักสูตรในโหมดแก้ไข
  const courseErrors = []

  try {
    if (editingRecord.value && !isEditingSingleCourse.value) {
      // อัพเดทข้อมูลพนักงานทั่วไป + จัดการหลักสูตร (แก้ไข/เพิ่ม/ลบ)
      // ห้ามใส่ attachment_url ในนี้โดยเด็ดขาด! เพราะจะโดนอัปเดตให้ทุกรายการ (ทุกหลักสูตร) ไฟล์แนบของหลักสูตรจะถูกจัดการแยกกันใน loop หลักสูตรด้านล่าง
      const dataToUpdateBase = {
        group: formData.value.group.trim() || null,
        id_tdl: formData.value.id_tdl.trim() || null,
        employee_id: formData.value.employee_id.trim() || null,
        first_name: formData.value.first_name.trim(),
        last_name: formData.value.last_name.trim(),
        position: formData.value.position.trim() || null,
        department: formData.value.department.trim() || null,
        gender: formData.value.gender.trim() || null,
        nationality: formData.value.nationality.trim() || null,
        status: formData.value.status || null,
        status_card: autoStatusCard,
        date_health_check: formData.value.date_health_check || null,
        date_health_expiry: formData.value.date_health_expiry || null,
      }
      // === สร้าง object สำหรับอัปเดต re_courses (ใช้ชื่อคอลัมน์ที่แตกต่าง) ===
      // ห้ามใส่ attachment_url ในนี้โดยเด็ดขาด!
      const dataToUpdateBaseReCourses = {
        group_name: formData.value.group.trim() || null,
        tdl_code: formData.value.id_tdl.trim() || null,
        id_lxml: formData.value.employee_id.trim() || null,
        full_name: `${formData.value.first_name.trim()} ${formData.value.last_name.trim()}`.trim(),
        position: formData.value.position.trim() || null,
        department: formData.value.department.trim() || null,
        gender: formData.value.gender.trim() || null,
        nationality: formData.value.nationality.trim() || null,
        status: formData.value.status || null,
        status_card: autoStatusCard,
        checkup_date: formData.value.date_health_check || null,
        checkup_expire_date: formData.value.date_health_expiry || null,
      }
      const dataToUpdateWithUpdatedBy = {
        ...dataToUpdateBase,
        updated_by: username,
      }
      const dataToUpdateReCoursesWithUpdatedBy = {
        ...dataToUpdateBaseReCourses,
        updated_by: username,
      }

      // === แยก ID ตามตารางต้นทาง ===
      const recordSources = editingRecord.value._record_sources || {}
      const archiveIds = Object.keys(recordSources).filter(
        (rid) => recordSources[rid] === 're_courses',
      )
      const mainIds = Object.keys(recordSources).filter(
        (rid) => recordSources[rid] !== 're_courses',
      )

      // === อัปเดตฐานข้อมูลพนักงานใน employee_training_records ===
      if (mainIds.length > 0) {
        let query = supabaseInternal
          .from('employee_training_records')
          .update(dataToUpdateWithUpdatedBy)
          .in('id', mainIds)
        let { error } = await query
        if (error) {
          console.log('Error updating main with updated_by, trying without...', error)
          const { error: errorWithoutUpdatedBy } = await supabaseInternal
            .from('employee_training_records')
            .update(dataToUpdateBase)
            .in('id', mainIds)
          if (errorWithoutUpdatedBy) throw errorWithoutUpdatedBy
        }
      }
      // === อัปเดตฐานข้อมูลพนักงานใน re_courses (ถ้ามี ID จากตรางนี้) ===
      if (archiveIds.length > 0) {
        let { error: arErr } = await supabaseInternal
          .from('re_courses')
          .update(dataToUpdateReCoursesWithUpdatedBy)
          .in('id', archiveIds)
        if (arErr) {
          console.log('Error updating re_courses with updated_by, trying without...', arErr)
          const { error: errNoBy } = await supabaseInternal
            .from('re_courses')
            .update(dataToUpdateBaseReCourses)
            .in('id', archiveIds)
          if (errNoBy) throw errNoBy
        }
      }

      // === จัดการหลักสูตร: ลบที่หายไป, แก้ไขที่มี, เพิ่มที่ใหม่ ===
      const existingCourses = editingRecord.value.courses || []
      const sourceById = {}
      existingCourses.forEach((c) => {
        if (c.record_id) sourceById[c.record_id] = c._source || 'employee_training_records'
      })
      const existingRecordIds = new Set(existingCourses.map((c) => c.record_id).filter(Boolean))
      const currentCourseRecordIds = new Set(
        formData.value.courses.filter((c) => c.record_id).map((c) => c.record_id),
      )

      // 1) ลบหลักสูตรที่ถูกเอาออกจากฟอร์มแต่ยังอยู่ในฐานข้อมูล
      const deletedRecordIds = [...existingRecordIds].filter(
        (id) => !currentCourseRecordIds.has(id),
      )
      for (const recordId of deletedRecordIds) {
        const src = sourceById[recordId] || recordSources[recordId] || 'employee_training_records'
        const { error: delErr } = await supabaseInternal.from(src).delete().eq('id', recordId)
        if (delErr) {
          console.warn('Course delete warning:', delErr)
          courseErrors.push('ลบหลักสูตรล้มเหลว: ' + delErr.message)
        }
      }

      // 2) อัปเดทหลักสูตรที่มีอยู่แล้ว (มี record_id) และ 3) เพิ่มหลักสูตรใหม่ (ไม่มี record_id)
      for (const course of formData.value.courses) {
        if (!course.course_name) continue
        if (course.record_id) {
          // แก้ไขหลักสูตรเดิม — กำหนดตารางต้นทาง
          const src =
            course._source || recordSources[course.record_id] || 'employee_training_records'
          if (src === 're_courses') {
            // === อัปเดตใน re_courses ===
            const updBase = {
              course_name: course.course_name,
              training_date: course.training_date || null,
              re_date: course.re_date || null,
              re_status: course.status_re || null,
              status_courses: course.status || 'ผ่านแล้ว',
              ...dataToUpdateBaseReCourses,
              attachment_url: course.attachment_url || null,
              updated_by: username,
            }
            const { error: uErr } = await supabaseInternal
              .from('re_courses')
              .update(updBase)
              .eq('id', course.record_id)
            if (uErr) {
              const { error: uErr2 } = await supabaseInternal
                .from('re_courses')
                .update({
                  course_name: course.course_name,
                  training_date: course.training_date || null,
                  re_date: course.re_date || null,
                  re_status: course.status_re || null,
                  status_courses: course.status || 'ผ่านแล้ว',
                  ...dataToUpdateBaseReCourses,
                  attachment_url: course.attachment_url || null,
                })
                .eq('id', course.record_id)
              if (uErr2) {
                console.warn('Course update warning (re_courses):', uErr2)
                courseErrors.push(
                  'แก้ไขหลักสูตร "' + course.course_name + '" ล้มเหลว: ' + uErr2.message,
                )
              }
            }
          } else {
            // === อัปเดตใน employee_training_records ===
            const updBase = {
              course_name: course.course_name,
              training_date: course.training_date || null,
              re_date: course.re_date || null,
              status_re: course.status_re || null,
              status_courses: course.status || 'ผ่านแล้ว',
              ...dataToUpdateBase,
              attachment_url: course.attachment_url || null,
              updated_by: username,
            }
            const { error: uErr } = await supabaseInternal
              .from('employee_training_records')
              .update(updBase)
              .eq('id', course.record_id)
            if (uErr) {
              const { error: uErr2 } = await supabaseInternal
                .from('employee_training_records')
                .update({
                  course_name: course.course_name,
                  training_date: course.training_date || null,
                  re_date: course.re_date || null,
                  status_re: course.status_re || null,
                  status_courses: course.status || 'ผ่านแล้ว',
                  ...dataToUpdateBase,
                  attachment_url: course.attachment_url || null,
                })
                .eq('id', course.record_id)
              if (uErr2) {
                console.warn('Course update warning:', uErr2)
                courseErrors.push(
                  'แก้ไขหลักสูตร "' + course.course_name + '" ล้มเหลว: ' + uErr2.message,
                )
              }
            }
          }
        } else {
          // เพิ่มหลักสูตรใหม่ (ผู้ใช้กด + เพิ่มหลักสูตรตอนแก้ไข) — เสมอไปใส่ใน employee_training_records
          const insBase = {
            ...dataToUpdateBase,
            course_name: course.course_name,
            training_date: course.training_date || null,
            re_date: course.re_date || null,
            status_re: course.status_re || null,
            status_courses: course.status || 'ผ่านแล้ว',
            attachment_url: course.attachment_url || null,
            created_by: username,
          }
          const { error: iErr } = await supabaseInternal
            .from('employee_training_records')
            .insert(insBase)
          if (iErr) {
            const { error: iErr2 } = await supabaseInternal
              .from('employee_training_records')
              .insert({
                ...dataToUpdateBase,
                course_name: course.course_name,
                training_date: course.training_date || null,
                re_date: course.re_date || null,
                status_re: course.status_re || null,
                status_courses: course.status || 'ผ่านแล้ว',
                attachment_url: course.attachment_url || null,
              })
            if (iErr2) {
              console.warn('Course insert warning:', iErr2)
              courseErrors.push(
                'เพิ่มหลักสูตร "' + course.course_name + '" ล้มเหลว: ' + iErr2.message,
              )
            }
          }
        }
      }
    } else if (isEditingSingleCourse.value) {
      // อัพเดท单个 course
      const course = formData.value.courses[0]
      const src = course._source || 'employee_training_records'
      if (src === 're_courses') {
        const dataToUpdateBase = {
          course_name: course.course_name,
          training_date: course.training_date || null,
          re_date: course.re_date || null,
          re_status: course.status_re || null,
          status_courses: course.status || 'ผ่านแล้ว',
          attachment_url: course.attachment_url || null,
        }
        const dataToUpdateWithUpdatedBy = {
          ...dataToUpdateBase,
          updated_by: username,
        }
        let { error } = await supabaseInternal
          .from('re_courses')
          .update(dataToUpdateWithUpdatedBy)
          .eq('id', course.record_id)
        if (error) {
          console.log('Error updating re_courses course with updated_by, trying without...', error)
          const { error: errorWithoutUpdatedBy } = await supabaseInternal
            .from('re_courses')
            .update(dataToUpdateBase)
            .eq('id', course.record_id)
          if (errorWithoutUpdatedBy) throw errorWithoutUpdatedBy
        }
        if (error) throw error
      } else {
        const dataToUpdateBase = {
          course_name: course.course_name,
          training_date: course.training_date || null,
          re_date: course.re_date || null,
          status_re: course.status_re || null,
          status_courses: course.status || 'ผ่านแล้ว',
          attachment_url: course.attachment_url || null,
        }
        const dataToUpdateWithUpdatedBy = {
          ...dataToUpdateBase,
          updated_by: username,
        }
        let { error } = await supabaseInternal
          .from('employee_training_records')
          .update(dataToUpdateWithUpdatedBy)
          .eq('id', course.record_id)
        if (error) {
          console.log('Error updating course with updated_by, trying without...', error)
          const { error: errorWithoutUpdatedBy } = await supabaseInternal
            .from('employee_training_records')
            .update(dataToUpdateBase)
            .eq('id', course.record_id)
          if (errorWithoutUpdatedBy) throw errorWithoutUpdatedBy
        }
        if (error) throw error
      }
    } else {
      // เพิ่มข้อมูลใหม่
      const validCourses = formData.value.courses.filter((c) => c.course_name)
      console.log('validCourses:', validCourses)

      if (validCourses.length === 0) {
        // ถ้าไม่มี course ให้เพิ่มแค่ข้อมูลพนักงาน
        const dataToInsertBase = {
          group: formData.value.group.trim() || null,
          id_tdl: formData.value.id_tdl.trim() || null,
          employee_id: formData.value.employee_id.trim() || null,
          first_name: formData.value.first_name.trim(),
          last_name: formData.value.last_name.trim(),
          position: formData.value.position.trim() || null,
          department: formData.value.department.trim() || null,
          gender: formData.value.gender.trim() || null,
          nationality: formData.value.nationality.trim() || null,
          status: formData.value.status.trim() || null,
          date_health_check: formData.value.date_health_check || null,
          date_health_expiry: formData.value.date_health_expiry || null,
          attachment_url: null,
          status_card: autoStatusCard,
          course_name: null,
          training_date: null,
        }
        console.log('dataToInsertBase (no course):', dataToInsertBase)
        const dataToInsertWithCreatedBy = {
          ...dataToInsertBase,
          created_by: username,
        }
        console.log('dataToInsertWithCreatedBy (no course):', dataToInsertWithCreatedBy)
        let { data, error } = await supabaseInternal
          .from('employee_training_records')
          .insert(dataToInsertWithCreatedBy)
          .select()
        console.log('Insert result (no course):', data, error)

        // If error, try without created_by
        if (error) {
          console.log('Error inserting with created_by, trying without...', error)
          const { data: dataWithoutCreatedBy, error: errorWithoutCreatedBy } =
            await supabaseInternal
              .from('employee_training_records')
              .insert(dataToInsertBase)
              .select()
          console.log(
            'Insert result without created_by (no course):',
            dataWithoutCreatedBy,
            errorWithoutCreatedBy,
          )
          if (errorWithoutCreatedBy) throw errorWithoutCreatedBy
        }
      } else {
        // เพิ่มทุก course
        for (const course of validCourses) {
          const dataToInsertBase = {
            group: formData.value.group.trim() || null,
            id_tdl: formData.value.id_tdl.trim() || null,
            employee_id: formData.value.employee_id.trim() || null,
            first_name: formData.value.first_name.trim(),
            last_name: formData.value.last_name.trim(),
            position: formData.value.position.trim() || null,
            department: formData.value.department.trim() || null,
            gender: formData.value.gender.trim() || null,
            nationality: formData.value.nationality.trim() || null,
            status: formData.value.status.trim() || null,
            date_health_check: formData.value.date_health_check || null,
            date_health_expiry: formData.value.date_health_expiry || null,
            attachment_url: course.attachment_url || null,
            status_card: autoStatusCard,
            status_courses: course.status || 'ผ่านแล้ว',
            course_name: course.course_name,
            training_date: course.training_date || null,
            re_date: course.re_date || null,
            status_re: course.status_re || null,
          }
          console.log('dataToInsertBase (with course):', dataToInsertBase)
          const dataToInsertWithCreatedBy = {
            ...dataToInsertBase,
            created_by: username,
          }
          console.log('dataToInsertWithCreatedBy (with course):', dataToInsertWithCreatedBy)
          let { data, error } = await supabaseInternal
            .from('employee_training_records')
            .insert(dataToInsertWithCreatedBy)
            .select()
          console.log('Insert result (with course):', data, error)

          // If error, try without created_by
          if (error) {
            console.log('Error inserting course with created_by, trying without...', error)
            const { data: dataWithoutCreatedBy, error: errorWithoutCreatedBy } =
              await supabaseInternal
                .from('employee_training_records')
                .insert(dataToInsertBase)
                .select()
            console.log(
              'Insert result without created_by (with course):',
              dataWithoutCreatedBy,
              errorWithoutCreatedBy,
            )
            if (errorWithoutCreatedBy) throw errorWithoutCreatedBy
          }
        }
      }
    }

    // ตรวจสอบว่ามีข้อผิดพลาดจากการจัดการหลักสูตรหรือไม่
    if (courseErrors.length > 0) {
      throw new Error('บางรายการหลักสูตรบันทึกไม่สำเร็จ:\n• ' + courseErrors.join('\n• '))
    }

    closeSidebar()

    // Check re_courses table
    const { data: reCoursesData, error: reCoursesError } = await supabaseInternal
      .from('re_courses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    console.log('re_courses data:', reCoursesData)
    console.log('re_courses error:', reCoursesError)

    fetchRecords()
    Swal.fire({
      title: 'บันทึกสำเร็จ!',
      text: `บันทึกข้อมูลเรียบร้อยแล้ว (สถานะ: ${autoStatusCard})`,
      icon: 'success',
      customClass: {
        popup: '!p-3 !max-w-md',
        title: '!text-base',
        htmlContainer: '!text-xs',
        confirmButton: '!px-3 !py-1.5 !text-xs',
        icon: '!scale-75',
      },
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
        icon: '!scale-75',
      },
    })
  }
}

const deleteRecord = async (record) => {
  const result = await Swal.fire({
    title: 'คุณแน่ใจหรือไม่?',
    text: `คุณต้องการลบข้อมูล "${record.first_name} ${record.last_name}" ใช่หรือไม่?`,
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
      icon: '!scale-75',
    },
  })

  if (result.isConfirmed) {
    try {
      // === แยก record_id ตามตารางต้นทาง (รองรับทั้ง employee_training_records และ re_courses) ===
      const sources = record._record_sources || {}
      const mainIds = []
      const archiveIds = []

      record.record_ids.forEach((rid) => {
        const src = sources[rid]
        if (src === 're_courses') {
          archiveIds.push(rid)
        } else {
          mainIds.push(rid)
        }
      })

      // ลบจาก employee_training_records (ถ้ามี)
      if (mainIds.length > 0) {
        const { error } = await supabaseInternal
          .from('employee_training_records')
          .delete()
          .in('id', mainIds)
        if (error) throw error
      }

      // ลบจาก re_courses (ถ้ามี)
      if (archiveIds.length > 0) {
        const { error: archiveErr } = await supabaseInternal
          .from('re_courses')
          .delete()
          .in('id', archiveIds)
        if (archiveErr) throw archiveErr
      }

      Swal.fire({
        title: 'ลบสำเร็จ!',
        text: 'ข้อมูลถูกลบเรียบร้อยแล้ว',
        icon: 'success',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          icon: '!scale-75',
        },
      })

      fetchRecords()
    } catch (error) {
      console.error('Error deleting record:', error.message)
      Swal.fire({
        title: 'เกิดข้อผิดพลาด!',
        text: 'เกิดข้อผิดพลาดในการลบข้อมูล: ' + error.message,
        icon: 'error',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          icon: '!scale-75',
        },
      })
    }
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const trimmed = String(dateStr).trim()
  if (!trimmed) return '-'

  let day, month, year

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) {
    year = isoMatch[1]
    month = String(isoMatch[2]).padStart(2, '0')
    day = String(isoMatch[3]).padStart(2, '0')
    return `${day}/${month}/${year}`
  }

  const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmmyyyyMatch) {
    day = String(ddmmyyyyMatch[1]).padStart(2, '0')
    month = String(ddmmyyyyMatch[2]).padStart(2, '0')
    year = ddmmyyyyMatch[3]
    return `${day}/${month}/${year}`
  }

  const ddmmMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (ddmmMatch) {
    day = String(ddmmMatch[1]).padStart(2, '0')
    month = String(ddmmMatch[2]).padStart(2, '0')
    year = new Date().getFullYear()
    return `${day}/${month}/${year}`
  }

  const date = new Date(trimmed)
  if (!isNaN(date.getTime())) {
    day = String(date.getDate()).padStart(2, '0')
    month = String(date.getMonth() + 1).padStart(2, '0')
    year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  return trimmed
}

// ========== ฟังก์ชัน Auto-generate เลขกลุ่ม ==========
// สกัดเลขทั้งหมดออกจากค่า group (รองรับ 1, 01, Group-1, A1, ฯลฯ) แล้วหาค่าสูงสุด + 1
const getNextGroupNumber = () => {
  let maxNum = 0
  records.value.forEach((r) => {
    if (r.group) {
      const matches = String(r.group).match(/\d+/g)
      if (matches) {
        matches.forEach((m) => {
          const n = parseInt(m, 10)
          if (!isNaN(n) && n > maxNum) maxNum = n
        })
      }
    }
  })
  return String(maxNum + 1)
}

// Reference สำหรับ file input
const fileInputRef = ref(null)

// ฟังก์ชัน import ข้อมูลจาก Excel
const importFromExcel = (event) => {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array', cellDates: true })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet)

      if (jsonData.length === 0) {
        Swal.fire({
          title: 'ข้อผิดพลาด',
          text: 'ไม่พบข้อมูลในไฟล์ Excel',
          icon: 'error',
          customClass: {
            popup: '!p-3 !max-w-md',
            title: '!text-base',
            htmlContainer: '!text-xs',
            confirmButton: '!px-3 !py-1.5 !text-xs',
            icon: '!scale-75',
          },
        })
        return
      }

      // เก็บข้อมูลไว้แสดง preview
      importPreviewData.value = jsonData
      showImportPreview.value = true
    } catch (error) {
      console.error('Error importing Excel:', error)
      Swal.fire({
        title: 'ข้อผิดพลาด',
        text: 'เกิดข้อผิดพลาดในการอ่านไฟล์ Excel',
        icon: 'error',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          icon: '!scale-75',
        },
      })
    }

    // ล้างค่า file input เพื่อให้เลือกไฟล์เดิมได้อีก
    event.target.value = ''
  }

  reader.readAsArrayBuffer(file)
}

// ฟังก์ชันบันทึกข้อมูลจาก preview
const confirmImportData = async () => {
  // ตรวจสอบข้อมูลซ้ำก่อนบันทึก
  for (const row of importPreviewData.value) {
    const firstName = row['ชื่อ'] || ''
    const lastName = row['นามสกุล'] || ''
    const courseName = row['ชื่อหลักสูตร']

    if (courseName) {
      // ค้นหาพนักงานคนนี้ใน records.value
      const existingEmployee = records.value.find(
        (r) =>
          (row['รหัส TDL'] && r.id_tdl === row['รหัส TDL']) ||
          (!row['รหัส TDL'] && r.first_name === firstName && r.last_name === lastName),
      )

      if (existingEmployee) {
        // ตรวจสอบว่ามีหลักสูตรนี้อยู่แล้วหรือไม่
        const existingCourse = existingEmployee.courses.find(
          (c) => c.course_name && c.course_name.trim() === courseName.trim(),
        )

        if (existingCourse) {
          // สร้างรายการหลักสูตรทั้งหมด
          const allCoursesList = existingEmployee.courses
            .map((c) => `<li>• ${c.course_name}</li>`)
            .join('')

          Swal.fire({
            title: 'ข้อมูลซ้ำ!',
            html: `<strong>${firstName} ${lastName}</strong> เรียนหลักสูตร "${courseName}" แล้ว<br><br>รายการหลักสูตรทั้งหมด:<br><ul style="text-align:left; margin:0; padding-left:1.2em;">${allCoursesList}</ul>`,
            icon: 'warning',
            customClass: {
              popup: '!p-3 !max-w-md',
              title: '!text-base',
              htmlContainer: '!text-xs',
              confirmButton: '!px-3 !py-1.5 !text-xs',
              icon: '!scale-75',
            },
          })
          return
        }
      }
    }
  }

  // ตรวจสอบข้อมูลซ้ำภายในไฟล์ import ด้วย
  const duplicateCheck = {}
  for (const row of importPreviewData.value) {
    const firstName = row['ชื่อ'] || ''
    const lastName = row['นามสกุล'] || ''
    const courseName = row['ชื่อหลักสูตร']
    const key = `${row['รหัส TDL'] || `${firstName}-${lastName}`}-${courseName}`

    if (duplicateCheck[key]) {
      Swal.fire({
        title: 'ข้อมูลซ้ำในไฟล์!',
        text: `${firstName} ${lastName} มีหลักสูตร "${courseName}" ซ้ำกันในไฟล์`,
        icon: 'warning',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          icon: '!scale-75',
        },
      })
      return
    }
    duplicateCheck[key] = true
  }

  // นำเข้าข้อมูลทีละรายการ
  let successCount = 0
  let failCount = 0

  for (let rowIndex = 0; rowIndex < importPreviewData.value.length; rowIndex++) {
    const row = importPreviewData.value[rowIndex]
    try {
      console.log('Processing row:', row, 'rowIndex:', rowIndex)

      // แปลงชื่อ-นามสกุล
      let firstName = row['ชื่อ'] || ''
      let lastName = row['นามสกุล'] || ''
      const key = `${firstName}-${lastName}-${row['รหัส TDL'] || ''}`

      // ตรวจสอบไฟล์แนบสำหรับหลักสูตรนี้ (เก็บใน row._attachment_file โดยตรง)
      let attachmentUrl = null
      const courseAttachment = row._attachment_file

      // อัปโหลดไฟล์แนบเฉพาะหลักสูตรนี้ (แยกกันเด็ดขาด ของใครของมัน ไม่แชร์ระหว่างหลักสูตร)
      if (courseAttachment) {
        try {
          const fileExt = courseAttachment.name.split('.').pop()
          const safeName = courseAttachment.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
          const filePath = `training_record/${Date.now()}_${safeName}`

          const { error: uploadError } = await supabaseInternal.storage
            .from('imge')
            .upload(filePath, courseAttachment, {
              cacheControl: '3600',
              upsert: false,
            })

          if (!uploadError) {
            const { data: publicUrlData } = supabaseInternal.storage
              .from('imge')
              .getPublicUrl(filePath)
            attachmentUrl = publicUrlData?.publicUrl || null
            console.log(`[Import Row ${rowIndex}] Attachment uploaded:`, attachmentUrl)
          } else {
            console.log(`[Import Row ${rowIndex}] Attachment upload error:`, uploadError)
          }
        } catch (uploadErr) {
          console.error(`[Import Row ${rowIndex}] Error uploading attachment:`, uploadErr)
        }
      }

      // สร้างข้อมูลสำหรับบันทึก - รวมทุกฟิลด์
      const recordDataBase = {
        group: (row['กลุ่ม'] || '').trim() || null,
        id_tdl: (row['รหัส TDL'] || '').trim() || null,
        employee_id: (row['รหัสล้านช้าง'] || '').trim() || null,
        first_name: firstName.trim(), // ไม่มี || null ต้องมีค่า!
        last_name: lastName.trim(), // ไม่มี || null ต้องมีค่า!
        gender: (row['เพศ'] || '').trim() || null,
        position: (row['ตำแหน่ง'] || '').trim() || null,
        department: (row['แผนก'] || '').trim() || null,
        nationality: (row['สัญชาติ'] || '').trim() || null,
        status: (row['สถานะ'] || '').trim() || null,
        date_health_check: parseExcelDate(row['วันที่ตรวจสุขภาพ']),
        date_health_expiry: parseExcelDate(row['วันหมดอายุสุขภาพ']),
        course_name: row['ชื่อหลักสูตร'] || null,
        training_date: parseExcelDate(row['วันที่ฝึกอบรม']),
        re_date: parseExcelDate(row['REหลักสูตร']),
        status_courses: row['สถานะหลักสูตร'] || null,
        status_re: null,
        attachment_url: attachmentUrl,
      }

      console.log('Prepared record data:', recordDataBase)

      const username = auth.user?.fullname || auth.user?.name || auth.user?.username || 'Import'

      const recordDataWithCreatedBy = {
        ...recordDataBase,
        created_by: username,
      }

      // บันทึกลงฐานข้อมูล
      let insertResult = await supabaseInternal
        .from('employee_training_records')
        .insert(recordDataWithCreatedBy)

      if (insertResult.error) {
        console.log(
          'Error inserting with created_by, trying without...',
          JSON.stringify(insertResult.error, null, 2),
        )
        const { error: errorWithoutCreatedBy } = await supabaseInternal
          .from('employee_training_records')
          .insert(recordDataBase)

        if (errorWithoutCreatedBy) {
          console.error(
            'Error inserting record (final attempt):',
            JSON.stringify(errorWithoutCreatedBy, null, 2),
          )
          failCount++
        } else {
          console.log('Successfully inserted without created_by')
          successCount++
        }
      } else {
        console.log('Successfully inserted with created_by')
        successCount++
      }
    } catch (err) {
      console.error('Error processing row (exception):', err)
      failCount++
    }
  }

  // ปิด preview modal
  showImportPreview.value = false
  importPreviewData.value = []
  employeeAttachments.value = {}

  // แสดงผลลัพธ์
  await Swal.fire({
    title: 'นำเข้าข้อมูลเสร็จสิ้น',
    text: `นำเข้าสำเร็จ ${successCount} รายการ\nไม่สำเร็จ ${failCount} รายการ`,
    icon: successCount > 0 ? 'success' : 'error',
    customClass: {
      popup: '!p-3 !max-w-md',
      title: '!text-base',
      htmlContainer: '!text-xs',
      confirmButton: '!px-3 !py-1.5 !text-xs',
      icon: '!scale-75',
    },
  })

  // โหลดข้อมูลใหม่
  fetchRecords()
}

// ตรวจสอบว่าเป็นหลักสูตรซ้ำหรือไม่ (สำหรับ preview)
const isPreviewDuplicateCourse = (course, employee) => {
  if (!course.course_name) return false

  // ค้นหาพนักงานคนนี้ใน records.value
  const existingEmployee = records.value.find(
    (r) =>
      (employee['รหัส TDL'] && r.id_tdl === employee['รหัส TDL']) ||
      (!employee['รหัส TDL'] &&
        r.first_name === employee['ชื่อ'] &&
        r.last_name === employee['นามสกุล']),
  )

  if (!existingEmployee) return false

  // ตรวจสอบว่ามีหลักสูตรนี้อยู่แล้วหรือไม่
  return existingEmployee.courses.some(
    (c) => c.course_name && c.course_name.trim() === course.course_name.trim(),
  )
}

// ลบหลักสูตรจาก preview
const removePreviewCourse = (employee, courseOriginalIndex, empIndex) => {
  // ลบ course ออกจาก importPreviewData (ไฟล์แนบ _attachment_file อยู่ใน row object จะถูกลบอัตโนมัติ)
  importPreviewData.value.splice(courseOriginalIndex, 1)

  // ถ้าลบ course ที่เป็นคนสุดท้ายของพนักงานนี้
  const remainingEmployeeRows = importPreviewData.value.filter((row) => {
    const key = `${row['ชื่อ'] || ''}-${row['นามสกุล'] || ''}-${row['รหัส TDL'] || ''}`
    const employeeKey = `${employee['ชื่อ'] || ''}-${employee['นามสกุล'] || ''}-${employee['รหัส TDL'] || ''}`
    return key === employeeKey
  })

  if (remainingEmployeeRows.length === 0) {
    // ถ้าเป็น row ที่กำลัง expand อยู่ ให้ปิด
    if (expandedPreviewRow.value === empIndex) {
      expandedPreviewRow.value = null
    }
  }
}

// จัดการไฟล์แนบสำหรับแต่ละหลักสูตร (เก็บลงใน row object โดยตรง เพื่อไม่พลาดเมื่อ splice)
const handlePreviewAttachmentChange = (event, courseOriginalIndex) => {
  const file = event.target.files?.[0]
  if (file && importPreviewData.value[courseOriginalIndex]) {
    importPreviewData.value[courseOriginalIndex]._attachment_file = file
  }
}

const removePreviewAttachment = (courseOriginalIndex) => {
  if (importPreviewData.value[courseOriginalIndex]) {
    delete importPreviewData.value[courseOriginalIndex]._attachment_file
  }
  if (previewFileInputRefs.value[courseOriginalIndex]) {
    previewFileInputRefs.value[courseOriginalIndex].value = ''
  }
}

// ฟังก์ชันแปลงวันที่จาก Excel ให้เป็นรูปแบบ ISO YYYY-MM-DD
const parseExcelDate = (dateValue) => {
  if (!dateValue) return null

  // ถ้าเป็น Date object แล้ว
  if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
    const year = dateValue.getFullYear()
    const month = String(dateValue.getMonth() + 1).padStart(2, '0')
    const day = String(dateValue.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // ถ้าเป็น string
  const dateStr = String(dateValue).trim()
  if (!dateStr) return null

  // ถ้าเป็นรูปแบบ DD/MM/YYYY หรือ DD-MM-YYYY
  const slashMatch = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (slashMatch) {
    const day = String(slashMatch[1]).padStart(2, '0')
    const month = String(slashMatch[2]).padStart(2, '0')
    const year = slashMatch[3]
    return `${year}-${month}-${day}`
  }

  // ถ้าเป็นรูปแบบ YYYY-MM-DD อยู่แล้ว
  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) {
    const year = isoMatch[1]
    const month = String(isoMatch[2]).padStart(2, '0')
    const day = String(isoMatch[3]).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // ถ้าเป็น serial number ของ Excel
  const serialNum = parseFloat(dateStr)
  if (!isNaN(serialNum) && serialNum > 0) {
    // Excel epoch is 1899-12-30, but there's a bug with leap year 1900
    const excelEpoch = new Date(Date.UTC(1899, 11, 30))
    const date = new Date(excelEpoch.getTime() + serialNum * 24 * 60 * 60 * 1000)

    // Adjust for the 1900 leap year bug (Excel thinks 1900 is a leap year)
    if (serialNum >= 60) {
      date.setDate(date.getDate() - 1)
    }

    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return null
}

// ฟังก์ชันปิด preview modal
const closeImportPreview = () => {
  showImportPreview.value = false
  importPreviewData.value = []
  expandedPreviewRow.value = null
  employeeAttachments.value = {}
}

// ฟังก์ชันดาวน์โหลด Excel Template
const downloadExcelTemplate = () => {
  // สร้างข้อมูลตัวอย่าง
  const templateData = [
    {
      กลุ่ม: 'A',
      'รหัส TDL': 'TDL001',
      รหัสล้านช้าง: 'LXML001',
      ชื่อ: 'สมศักดิ์',
      นามสกุล: 'ใจดี',
      เพศ: 'ชาย',
      ตำแหน่ง: 'พนักงาน',
      แผนก: 'ขาย',
      สัญชาติ: 'ไทย',
      สถานะ: 'สำเร็จ',
      ชื่อหลักสูตร: 'คอร์สปลอดภัย',
      วันที่ฝึกอบรม: '2024-01-01',
      REหลักสูตร: '2025-01-01',
      สถานะหลักสูตร: 'ผ่านแล้ว',
      วันที่ตรวจสุขภาพ: '2024-01-01',
      วันหมดอายุสุขภาพ: '2025-01-01',
    },
  ]

  // สร้าง worksheet
  const worksheet = XLSX.utils.json_to_sheet(templateData)

  // ปรับความกว้างคอลัมน์
  worksheet['!cols'] = [
    { wch: 15 }, // กลุ่ม
    { wch: 15 }, // รหัส TDL
    { wch: 15 }, // รหัสล้านช้าง
    { wch: 20 }, // ชื่อ
    { wch: 20 }, // นามสกุล
    { wch: 10 }, // เพศ
    { wch: 20 }, // ตำแหน่ง
    { wch: 20 }, // แผนก
    { wch: 15 }, // สัญชาติ
    { wch: 15 }, // สถานะ
    { wch: 40 }, // ชื่อหลักสูตร
    { wch: 20 }, // วันที่ฝึกอบรม
    { wch: 20 }, // REหลักสูตร
    { wch: 20 }, // สถานะหลักสูตร
    { wch: 20 }, // วันที่ตรวจสุขภาพ
    { wch: 20 }, // วันหมดอายุสุขภาพ
  ]

  // สร้าง workbook
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Template')

  // ดาวน์โหลดไฟล์
  const fileName = `training_records_template.xlsx`
  XLSX.writeFile(workbook, fileName)
}

// ฟังก์ชันส่งออกข้อมูลเป็น Excel
const exportToExcel = () => {
  if (filteredRecords().length === 0) {
    Swal.fire({
      title: 'ไม่มีข้อมูล',
      text: 'ไม่มีข้อมูลให้ส่งออก',
      icon: 'warning',
      customClass: {
        popup: '!p-3 !max-w-md',
        title: '!text-base',
        htmlContainer: '!text-xs',
        confirmButton: '!px-3 !py-1.5 !text-xs',
        icon: '!scale-75',
      },
    })
    return
  }

  // แปลงข้อมูลให้ตรงกับรูปแบบ Template
  const exportData = []

  filteredRecords().forEach((record) => {
    // ถ้ามีหลายหลักสูตร ให้สร้างแถวแยกกัน
    if (record.courses && record.courses.length > 0) {
      record.courses.forEach((course) => {
        exportData.push({
          กลุ่ม: record.group || '',
          'รหัส TDL': record.id_tdl || '',
          รหัสล้านช้าง: record.employee_id || '',
          ชื่อ: record.first_name || '',
          นามสกุล: record.last_name || '',
          เพศ: record.gender || '',
          ตำแหน่ง: record.position || '',
          แผนก: record.department || '',
          สัญชาติ: record.nationality || '',
          สถานะ: 'พนักงาน',
          ชื่อหลักสูตร: course.course_name || '',
          วันที่ฝึกอบรม: course.training_date ? formatDate(course.training_date) : '',
          REหลักสูตร: course.re_date ? formatDate(course.re_date) : '',
          สถานะหลักสูตร: course.status || '',
          ไฟล์แนบหลักสูตร: course.attachment_url || '',
          วันที่ตรวจสุขภาพ: record.date_health_check ? formatDate(record.date_health_check) : '',
          วันหมดอายุสุขภาพ: record.date_health_expiry ? formatDate(record.date_health_expiry) : '',
        })
      })
    } else {
      // ถ้าไม่มีหลักสูตร ให้สร้างแถวเดียว
      exportData.push({
        กลุ่ม: record.group || '',
        'รหัส TDL': record.id_tdl || '',
        รหัสล้านช้าง: record.employee_id || '',
        ชื่อ: record.first_name || '',
        นามสกุล: record.last_name || '',
        เพศ: record.gender || '',
        ตำแหน่ง: record.position || '',
        แผนก: record.department || '',
        สัญชาติ: record.nationality || '',
        สถานะ: 'พนักงาน',
        ชื่อหลักสูตร: '',
        วันที่ฝึกอบรม: '',
        REหลักสูตร: '',
        สถานะหลักสูตร: '',
        ไฟล์แนบหลักสูตร: record.attachment_url || '',
        วันที่ตรวจสุขภาพ: record.date_health_check ? formatDate(record.date_health_check) : '',
        วันหมดอายุสุขภาพ: record.date_health_expiry ? formatDate(record.date_health_expiry) : '',
      })
    }
  })

  // สร้าง worksheet
  const worksheet = XLSX.utils.json_to_sheet(exportData)

  // ปรับความกว้างคอลัมน์
  worksheet['!cols'] = [
    { wch: 15 }, // กลุ่ม
    { wch: 15 }, // รหัส TDL
    { wch: 15 }, // รหัสล้านช้าง
    { wch: 20 }, // ชื่อ
    { wch: 20 }, // นามสกุล
    { wch: 10 }, // เพศ
    { wch: 20 }, // ตำแหน่ง
    { wch: 20 }, // แผนก
    { wch: 15 }, // สัญชาติ
    { wch: 15 }, // สถานะ
    { wch: 40 }, // ชื่อหลักสูตร
    { wch: 20 }, // วันที่ฝึกอบรม
    { wch: 20 }, // REหลักสูตร
    { wch: 20 }, // สถานะหลักสูตร
    { wch: 20 }, // วันที่ตรวจสุขภาพ
    { wch: 20 }, // วันหมดอายุสุขภาพ
  ]

  // สร้าง workbook
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Records')

  // ดาวน์โหลดไฟล์
  const today = new Date()
  const dateStr = today.toISOString().split('T')[0]
  const fileName = `training_records_${dateStr}.xlsx`
  XLSX.writeFile(workbook, fileName)
}

const isHealthCheckExpired = (expireDateStr) => {
  if (!expireDateStr) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expireDate = new Date(expireDateStr)
  expireDate.setHours(0, 0, 0, 0)
  return expireDate <= today
}

const toggleExpand = (recordId) => {
  if (expandedRecordId.value === recordId) {
    expandedRecordId.value = null
  } else {
    expandedRecordId.value = recordId
  }
}

onMounted(() => {
  fetchCourses()
  fetchEmployees()
  fetchRecords()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// ฟังก์ชันwatch id_tdl เมื่อเปลี่ยนค่าให้เติมข้อมูลพนักงาน
watch(
  () => formData.value.id_tdl,
  (newVal) => {
    if (newVal && !isEditingSingleCourse.value) {
      fillEmployeeData(newVal)
    }
  },
)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div class="overflow-y-auto p-6 space-y-5"></div>
      <div class="text-sm text-gray-500 dark:text-gray-400">
        รายการทั้งหมด:
        <span class="font-bold text-indigo-600 dark:text-indigo-400"
          >{{ filteredRecords().length }} รายการ</span
        >
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
            placeholder="ค้นหาชื่อ, นามสกุล, รหัสล้านช้าง..."
            class="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="openAddSidebar"
          class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
        >
          <PlusIcon class="h-5 w-5" />
          เพิ่มบันทึก
        </button>
        <button
          @click="exportToExcel"
          class="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
        >
          <ArrowDownTrayIcon class="h-5 w-5" />
          Export
        </button>

        <!-- Dump File Dropdown -->
        <div class="relative" ref="dumpFileDropdownRef">
          <button
            @click="showDumpFileDropdown = !showDumpFileDropdown"
            class="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
          >
            <DocumentIcon class="h-5 w-5" />
            Dump File
          </button>

          <div
            v-if="showDumpFileDropdown"
            class="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden z-10"
          >
            <button
              @click="
                (e) => {
                  e.stopPropagation()
                  downloadExcelTemplate()
                  showDumpFileDropdown = false
                }
              "
              class="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <ArrowDownTrayIcon class="h-4 w-4 text-red-600" />
              Template
            </button>
            <button
              @click="
                (e) => {
                  e.stopPropagation()
                  fileInputRef?.click()
                  showDumpFileDropdown = false
                }
              "
              class="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <ArrowUpTrayIcon class="h-4 w-4 text-green-600" />
              Import
            </button>
          </div>
        </div>

        <input
          ref="fileInputRef"
          type="file"
          accept=".xlsx, .xls, .csv"
          style="display: none"
          @change="importFromExcel"
        />
        <input
          ref="tableAttachmentInputRef"
          type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          style="display: none"
          @change="handleTableAttachmentChange"
        />
      </div>
    </div>

    <div
      class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr
              class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800"
            >
              <th
                class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10"
              ></th>
              <th
                class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                กลุ่ม
              </th>
              <th
                class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                รหัส TDL
              </th>
              <th
                class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                รหัสล้านช้าง
              </th>
              <th
                class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                ชื่อ-นามสกุล
              </th>
              <th
                class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                เพศ
              </th>
              <th
                class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                ตำแหน่ง
              </th>
              <th
                class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                แผนก
              </th>
              <th
                class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                สัญชาติ
              </th>
              <th
                class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                สถานะ
              </th>
              <th
                class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                ผู้บันทึก
              </th>
              <th
                class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24"
              >
                จัดการ
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <template v-if="loading">
              <tr v-for="i in 3" :key="i" class="animate-pulse">
                <td colspan="11" class="px-3 py-4">
                  <div class="h-10 bg-gray-100 dark:bg-gray-900 rounded-lg w-full"></div>
                </td>
              </tr>
            </template>
            <tr v-else-if="filteredRecords().length === 0" class="text-center">
              <td colspan="11" class="px-3 py-12 text-gray-500 dark:text-gray-400 italic">
                ไม่พบข้อมูล
              </td>
            </tr>
            <template v-else>
              <template v-for="record in filteredRecords()" :key="record.id">
                <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors group">
                  <td class="px-3 py-4 whitespace-nowrap">
                    <button
                      class="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                      @click.stop="toggleExpand(record.id)"
                    >
                      <ChevronRightIcon
                        class="h-5 w-5 text-gray-400 transition-transform"
                        :class="{ 'rotate-90': expandedRecordId === record.id }"
                      />
                    </button>
                  </td>
                  <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ record.group || '-' }}
                  </td>
                  <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ record.id_tdl || '-' }}
                  </td>
                  <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ record.employee_id || '-' }}
                  </td>
                  <td class="px-3 py-4 break-words">
                    <div class="text-sm font-bold text-gray-900 dark:text-white">
                      {{ record.first_name }} {{ record.last_name }}
                    </div>
                  </td>
                  <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ record.gender || '-' }}
                  </td>
                  <td
                    class="px-3 py-4 break-words align-top text-sm text-gray-600 dark:text-gray-400 max-w-[180px]"
                  >
                    {{ record.position || '-' }}
                  </td>
                  <td
                    class="px-3 py-4 break-words align-top text-sm text-gray-600 dark:text-gray-400 max-w-[160px]"
                  >
                    {{ record.department || '-' }}
                  </td>
                  <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ record.nationality || '-' }}
                  </td>
                  <td class="px-3 py-4 whitespace-nowrap">
                    <span
                      :class="[
                        'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                        record.status === 'สำเร็จ'
                          ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                          : record.status === 'กำลังดำเนินการ'
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                            : 'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400',
                      ]"
                    >
                      {{ record.status || '-' }}
                    </span>
                  </td>
                  <td class="px-3 py-4 break-words align-top max-w-[140px]">
                    <div class="text-sm font-medium text-gray-900 dark:text-white">
                      {{ record.created_by || '-' }}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 whitespace-nowrap">
                      {{ record.created_at ? formatDate(record.created_at) : '-' }}
                    </div>
                  </td>
                  <td class="px-3 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                      <button
                        @click.stop="openEditSidebar(record)"
                        class="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                        title="แก้ไขข้อมูลทั้งหมด (พนักงาน + หลักสูตร)"
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
                <!-- ส่วนขยาย แสดงหลักสูตร -->
                <tr v-if="expandedRecordId === record.id" class="bg-gray-50/30 dark:bg-gray-900/30">
                  <td colspan="11" class="px-6 py-4">
                    <div class="space-y-2">
                      <div class="flex items-center justify-between mb-3">
                        <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          หลักสูตรที่เข้าฝึก ({{ record.courses?.length || 0 }} รายการ)
                        </h4>
                        <div class="flex items-center gap-6 text-sm">
                          <div class="flex items-center gap-2">
                            <span class="font-semibold text-gray-700 dark:text-gray-300"
                              >ตรวจสุขภาพ:</span
                            >
                            <span class="text-gray-500 dark:text-gray-400">วันที่:</span>
                            <span
                              :class="[
                                'font-medium',
                                isHealthCheckExpired(record.date_health_expiry)
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-gray-900 dark:text-white',
                              ]"
                              >{{ formatDate(record.date_health_check) || '-' }}</span
                            >
                            <span class="text-gray-500 dark:text-gray-400 ml-3">หมดอายุ:</span>
                            <span
                              :class="[
                                'font-medium',
                                isHealthCheckExpired(record.date_health_expiry)
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-gray-900 dark:text-white',
                              ]"
                              >{{ formatDate(record.date_health_expiry) || '-' }}</span
                            >
                          </div>
                        </div>
                      </div>
                      <div
                        v-if="record.courses && record.courses.length > 0"
                        class="overflow-x-auto"
                      >
                        <table class="w-full text-left border-collapse">
                          <thead>
                            <tr
                              class="bg-red-500 dark:bg-red-700 border-b border-gray-200 dark:border-gray-800"
                            >
                              <th
                                class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider"
                              >
                                หลักสูตร
                              </th>
                              <th
                                class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider"
                              >
                                วันที่อบรม
                              </th>
                              <th
                                class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider"
                              >
                                สถานะ
                              </th>
                              <th
                                class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider"
                              >
                                REหลักสูตร
                              </th>
                              <th
                                class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider"
                              >
                                สถานะ RE
                              </th>
                              <th
                                class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider"
                              >
                                ไฟล์แนบ
                              </th>
                              <th
                                class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider"
                              >
                                จัดการ
                              </th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                            <tr
                              v-for="(course, index) in record.courses"
                              :key="course.record_id || index"
                              class="bg-white dark:bg-gray-950 hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors"
                            >
                              <td
                                class="px-4 py-3 break-words align-top text-sm text-gray-900 dark:text-white max-w-[240px]"
                              >
                                {{ course.course_name || '-' }}
                              </td>
                              <td
                                class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400"
                              >
                                <div class="relative inline-block group min-w-[130px]">
                                  <button
                                    type="button"
                                    @click.stop="openExpandTrainingDatePicker(record.id, course)"
                                    :disabled="expandDateEditLoading[`${record.id}_${course.record_id || course.course_name}_training`]"
                                    class="inline-flex items-center gap-1.5 px-3 py-1.5 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 rounded-md bg-white dark:bg-gray-950 hover:bg-indigo-50/60 dark:hover:bg-indigo-900/20 transition-all text-left disabled:opacity-50"
                                    title="คลิกเพื่อแก้ไขวันที่ฝึกอบรม"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke-width="1.8"
                                      stroke="currentColor"
                                      class="w-4 h-4 text-indigo-500 flex-shrink-0"
                                    >
                                      <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                                      />
                                    </svg>
                                    <span class="font-medium text-gray-900 dark:text-white">
                                      {{ formatDate(course.training_date) }}
                                    </span>
                                    <span
                                      v-if="expandDateEditLoading[`${record.id}_${course.record_id || course.course_name}_training`]"
                                      class="text-[10px] text-indigo-500 animate-pulse"
                                    >
                                      ...กำลังบันทึก
                                    </span>
                                  </button>
                                  <input
                                    type="date"
                                    :ref="(el) => setExpandHiddenTrainingDateRef(`${record.id}_${course.record_id || course.course_name}_training`, el)"
                                    @change="(e) => updateCourseDateInline(record, course, 'training_date', e.target.value)"
                                    class="absolute inset-0 opacity-0 cursor-pointer w-full h-full pointer-events-none"
                                    :class="{ 'pointer-events-auto': expandedRecordId === record.id }"
                                  />
                                </div>
                              </td>
                              <td class="px-4 py-3 whitespace-nowrap">
                                <span
                                  :class="[
                                    'text-xs font-bold uppercase',
                                    course.status === 'สำเร็จ' || course.status === 'ผ่านแล้ว'
                                      ? 'text-green-600 dark:text-green-400'
                                      : 'text-yellow-600 dark:text-yellow-400',
                                  ]"
                                >
                                  {{
                                    course.status === 'กำลังดำเนินการ'
                                      ? 'ยังไม่ผ่าน'
                                      : course.status || 'ผ่านแล้ว'
                                  }}
                                </span>
                              </td>
                              <td
                                class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400"
                              >
                                <div class="relative inline-block group min-w-[130px]">
                                  <button
                                    type="button"
                                    @click.stop="openExpandReDatePicker(record.id, course)"
                                    :disabled="expandDateEditLoading[`${record.id}_${course.record_id || course.course_name}_re`]"
                                    class="inline-flex items-center gap-1.5 px-3 py-1.5 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 rounded-md bg-white dark:bg-gray-950 hover:bg-indigo-50/60 dark:hover:bg-indigo-900/20 transition-all text-left disabled:opacity-50"
                                    title="คลิกเพื่อแก้ไข REหลักสูตร"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke-width="1.8"
                                      stroke="currentColor"
                                      class="w-4 h-4 text-indigo-500 flex-shrink-0"
                                    >
                                      <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                                      />
                                    </svg>
                                    <span class="font-medium text-gray-900 dark:text-white">
                                      {{ course.re_date ? formatDate(course.re_date) : '-' }}
                                    </span>
                                    <span
                                      v-if="expandDateEditLoading[`${record.id}_${course.record_id || course.course_name}_re`]"
                                      class="text-[10px] text-indigo-500 animate-pulse"
                                    >
                                      ...กำลังบันทึก
                                    </span>
                                  </button>
                                  <input
                                    type="date"
                                    :ref="(el) => setExpandHiddenReDateRef(`${record.id}_${course.record_id || course.course_name}_re`, el)"
                                    @change="(e) => updateCourseDateInline(record, course, 're_date', e.target.value)"
                                    class="absolute inset-0 opacity-0 cursor-pointer w-full h-full pointer-events-none"
                                    :class="{ 'pointer-events-auto': expandedRecordId === record.id }"
                                  />
                                </div>
                              </td>
                              <td class="px-4 py-3 whitespace-nowrap">
                                <span
                                  :class="[
                                    'text-xs font-bold uppercase',
                                    course.status_re === 'Reแล้ว'
                                      ? 'text-blue-600 dark:text-blue-400'
                                      : 'text-gray-500 dark:text-gray-400',
                                  ]"
                                >
                                  {{ course.status_re || 'ยังไม่Re' }}
                                </span>
                              </td>
                              <td class="px-4 py-3 break-all align-top text-sm max-w-[200px] min-w-0">
                                <div class="flex flex-col gap-2 w-full min-w-0">
                                  <a
                                    v-if="course.attachment_url"
                                    :href="course.attachment_url"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="inline-flex items-start gap-1.5 px-2 py-1.5 rounded-md border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-xs font-medium transition-colors w-full min-w-0 overflow-hidden"
                                    @click.stop
                                    :title="getAttachmentFileName(course.attachment_url)"
                                  >
                                    <PaperClipIcon class="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                                    <span class="break-all whitespace-normal align-top text-left inline-block w-full leading-relaxed">
                                      {{ getAttachmentFileName(course.attachment_url) }}
                                    </span>
                                  </a>
                                  <a
                                    v-else-if="
                                      record.attachment_url &&
                                      !record.courses.some((c) => c.attachment_url)
                                    "
                                    :href="record.attachment_url"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="inline-flex items-start gap-1.5 px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-400 text-xs font-medium transition-colors w-full min-w-0 overflow-hidden"
                                    @click.stop
                                    title="ไฟล์แนบพนักงาน (เก่า)"
                                  >
                                    <PaperClipIcon class="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                                    <span class="break-all whitespace-normal align-top text-left inline-block w-full leading-relaxed">
                                      {{ getAttachmentFileName(record.attachment_url) }}
                                    </span>
                                  </a>
                                  <span v-else class="text-xs text-gray-400">-</span>
                                </div>
                              </td>
                              <td class="px-4 py-3">
                                <div class="flex items-center gap-1.5">
                                  <button
                                    @click.stop="openEditSidebar(record, course)"
                                    type="button"
                                    class="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                                    title="แก้ไขรายละเอียดหลักสูตรนี้"
                                  >
                                    <PencilSquareIcon class="h-4 w-4" />
                                  </button>
                                  <button
                                    @click.stop="deleteCourse(record, course)"
                                    class="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                  >
                                    <TrashIcon class="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div v-else class="text-sm text-gray-500 dark:text-gray-400 italic">
                        ยังไม่มีข้อมูลหลักสูตร
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </div>

      <div
        class="px-4 py-4 bg-gray-50/30 dark:bg-gray-900/30 border-t border-gray-200 dark:border-gray-800"
      >
        <p class="text-xs text-gray-500 dark:text-gray-400">
          แสดงข้อมูลทั้งหมด {{ filteredRecords().length }} รายการ
        </p>
      </div>
    </div>

    <div v-if="isSidebarOpen" class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/50" @click="closeSidebar"></div>
      <div
        class="absolute right-0 top-0 h-full w-full max-w-5xl bg-white dark:bg-gray-950 shadow-xl transform transition-transform duration-300 flex flex-col"
      >
        <div
          class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 bg-white dark:bg-gray-950"
        >
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">
            {{
              isEditingRow
                ? 'แก้ไขข้อมูล'
                : isEditingSingleCourse
                  ? 'แก้ไขหลักสูตร'
                  : editingRecord
                    ? 'แก้ไขบันทึก'
                    : 'เพิ่มบันทึก'
            }}
          </h3>
          <button
            @click="closeSidebar"
            class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900"
          >
            <XMarkIcon class="h-6 w-6" />
          </button>
        </div>

        <div class="p-6 space-y-4 flex-1 overflow-y-auto max-h-[calc(100vh-80px)] pb-24">
          <!-- แบบฟอร์มสำหรับแก้ไข row (employee_id และ status_card) -->
          <template v-if="isEditingRow">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >รหัสล้านช้าง</label
              >
              <input
                v-model="editingRowRecord.employee_id"
                type="text"
                class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="กรอกรหัสล้านช้าง"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >สถานะ</label
              >
              <select
                v-model="editingRowRecord.status_card"
                class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              >
                <option value="">เลือกสถานะ</option>
                <option value="ยังไม่ได้รับ">ยังไม่ได้รับ</option>
                <option value="ได้รับแล้ว">ได้รับแล้ว</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >ตรวจสุขภาพ</label
                >
                <input
                  v-model="editingRowRecord.date_health_check"
                  type="date"
                  class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >วันที่หมดอายุ</label
                >
                <input
                  v-model="editingRowRecord.date_health_expiry"
                  type="date"
                  class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>
          </template>

          <!-- แบบฟอร์มสำหรับแก้ไข single course -->
          <template v-else-if="isEditingSingleCourse">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >ชื่อหลักสูตร</label
              >
              <select
                v-model="formData.courses[0].course_name"
                class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              >
                <option value="">เลือกหลักสูตร</option>
                <option v-for="c in courses" :key="c.id" :value="c.course_name">
                  {{ c.course_name }}
                </option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >วันที่ฝึกอบรม</label
                >
                <input
                  v-model="formData.courses[0].training_date"
                  type="date"
                  class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >REหลักสูตร</label
                >
                <input
                  v-model="formData.courses[0].re_date"
                  type="date"
                  class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >สถานะ</label
              >
              <select
                v-model="formData.courses[0].status"
                class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              >
                <option value="ผ่านแล้ว">ผ่านแล้ว</option>
                <option value="ผ่านแล้ว">ผ่านแล้ว</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >ไฟล์แนบ (ของหลักสูตรนี้)</label
              >
              <input
                :ref="
                  (el) => {
                    if (el) courseAttachmentInputRefs[0] = el
                  }
                "
                type="file"
                class="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                @change="(e) => handleCourseAttachmentChange(e, 0)"
              />
              <div v-if="courseAttachmentFiles[0]" class="flex items-start gap-2 w-full min-w-0 mb-2">
                <div
                  class="flex-1 flex items-start gap-2 min-w-0 overflow-hidden px-3 py-2 border border-indigo-200 dark:border-indigo-800 rounded-xl bg-indigo-50/70 dark:bg-indigo-900/20 w-full"
                >
                  <DocumentIcon class="h-5 w-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <span
                    class="text-sm text-gray-700 dark:text-gray-300 break-all whitespace-normal align-top text-left flex-1 min-w-0 leading-relaxed"
                    :title="courseAttachmentFiles[0].name"
                    >{{ courseAttachmentFiles[0].name }}</span
                  >
                  <span class="text-xs text-indigo-500 flex-shrink-0">(ใหม่)</span>
                </div>
                <button
                  @click.stop="removeAttachment(0)"
                  type="button"
                  class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl flex-shrink-0"
                  title="ลบไฟล์แนบ"
                >
                  <TrashIcon class="h-5 w-5" />
                </button>
              </div>
              <div
                v-else-if="formData.courses[0].attachment_url"
                class="flex items-start gap-2 w-full min-w-0 mb-2"
              >
                <a
                  :href="formData.courses[0].attachment_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  @click.stop
                  class="flex-1 flex items-start gap-2 min-w-0 overflow-hidden px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all w-full"
                >
                  <PaperClipIcon class="h-5 w-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <span
                    class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline break-all whitespace-normal align-top text-left inline-block w-full leading-relaxed"
                    :title="getAttachmentFileName(formData.courses[0].attachment_url)"
                  >
                    {{ getAttachmentFileName(formData.courses[0].attachment_url) }}
                  </span>
                </a>
                <button
                  @click.stop="removeAttachment(0)"
                  type="button"
                  class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl flex-shrink-0"
                  title="ลบไฟล์แนบ"
                >
                  <TrashIcon class="h-5 w-5" />
                </button>
              </div>
              <button
                v-else
                @click.stop="openCourseAttachmentPicker(0)"
                type="button"
                class="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
              >
                <PaperClipIcon class="h-5 w-5 flex-shrink-0" />
                <span class="text-sm">เพิ่มไฟล์แนบ (เฉพาะหลักสูตรนี้)</span>
              </button>
              <p v-if="courseAttachmentUploading[0]" class="text-xs text-indigo-500 mt-1.5">
                กำลังอัปโหลด...
              </p>
            </div>
          </template>

          <!-- แบบฟอร์มสำหรับเพิ่ม/แก้ไขข้อมูลพนักงานทั้งหมด -->
          <template v-else>
            <input v-model="formData.employee_id" type="hidden" />

            <!-- แถวที่ 1: รหัส TDL + ชื่อ-นามสกุล (2 คอลัมน์) -->
            <div class="grid grid-cols-2 gap-4">
              <div class="relative" ref="tdlDropdownRef">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >รหัส TDL</label
                >
                <input
                  v-model="tdlSearchQuery"
                  type="text"
                  @click="handleTdlInputClick"
                  @input="showTdlDropdown = true"
                  placeholder="ค้นหารหัส TDL หรือ id_lxml..."
                  class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
                <!-- Dropdown list -->
                <div
                  v-if="showTdlDropdown"
                  class="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg max-h-60 overflow-y-auto"
                >
                  <div
                    v-for="emp in filteredEmployees"
                    :key="emp.id"
                    @click="selectEmployee(emp)"
                    class="px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                  >
                    <div class="flex flex-col">
                      <div class="flex items-center justify-between">
                        <span class="text-sm font-medium text-gray-900 dark:text-white">{{
                          emp.employee_code
                        }}</span>
                        <span v-if="emp.id_lxml" class="text-xs text-gray-500 dark:text-gray-400">{{
                          emp.id_lxml
                        }}</span>
                      </div>
                      <span class="text-sm text-gray-500 dark:text-gray-400">{{
                        emp.fullname || `${emp.firstname} ${emp.lastname}`
                      }}</span>
                    </div>
                  </div>
                  <div
                    v-if="filteredEmployees.length === 0"
                    class="px-4 py-2 text-sm text-gray-500 dark:text-gray-400"
                  >
                    ไม่พบข้อมูลพนักงาน
                  </div>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >ชื่อ-นามสกุล <span class="text-red-500">*</span></label
                >
                <input
                  v-model="fullNameInput"
                  type="text"
                  @input="updateNameFromInput"
                  readonly
                  class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="กรอกชื่อ-นามสกุล"
                />
              </div>
            </div>

            <!-- แถวที่ 2: ตำแหน่ง + แผนก + สัญชาติ (3 คอลัมน์) -->
            <div class="grid grid-cols-3 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >ตำแหน่ง</label
                >
                <input
                  v-model="formData.position"
                  type="text"
                  readonly
                  class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="กรอกตำแหน่ง"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >แผนก</label
                >
                <input
                  v-model="formData.department"
                  type="text"
                  readonly
                  class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="กรอกแผนก"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >สัญชาติ</label
                >
                <select
                  v-model="formData.nationality"
                  class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="">เลือกสัญชาติ</option>
                  <option value="Thai">Thai</option>
                  <option value="Laos">Laos</option>
                </select>
              </div>
            </div>

            <!-- แถวที่ 3: กลุ่ม + เพศ + สถานะ (3 คอลัมน์) -->
            <div class="grid grid-cols-3 gap-4">
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >กลุ่ม</label
                  >
                  <button
                    @click="formData.group = getNextGroupNumber()"
                    type="button"
                    class="text-[10px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium flex items-center gap-1"
                    title="สร้างเลขกลุ่มใหม่อัตโนมัติ"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-3 w-3"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    สร้างใหม่
                  </button>
                </div>
                <input
                  v-model="formData.group"
                  type="text"
                  class="w-full px-4 py-2.5 border border-indigo-200 dark:border-indigo-800 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/20 text-sm font-medium text-indigo-700 dark:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="กรอกกลุ่ม"
                />
                <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                  * ระบบสร้างเลขอัตโนมัติ สามารถแก้ไขได้
                </p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >เพศ</label
                >
                <select
                  v-model="formData.gender"
                  class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="">เลือกเพศ</option>
                  <option value="ชาย">ชาย</option>
                  <option value="หญิง">หญิง</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >สถานะ</label
                >
                <input
                  v-model="formData.status"
                  type="text"
                  readonly
                  class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="สถานะจะถูกตั้งค่าอัตโนมัติ"
                />
              </div>
            </div>

            <!-- แถวที่ 4: ตรวจสุขภาพ + วันที่หมดอายุ (2 คอลัมน์) -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >ตรวจสุขภาพ</label
                >
                <input
                  v-model="formData.date_health_check"
                  type="date"
                  class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >วันที่หมดอายุ</label
                >
                <input
                  v-model="formData.date_health_expiry"
                  type="date"
                  class="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <!-- หลักสูตร -->
            <div
              v-if="!isEditingSingleCourse"
              class="pt-4 border-t border-gray-200 dark:border-gray-800"
            >
              <div class="flex items-start justify-between gap-3 mb-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >หลักสูตร ({{ formData.courses.length }} รายการ)</label
                  >
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    คลิกชื่อหลักสูตรเพื่อเลือกหรือแก้ไขรายการ
                  </p>
                </div>
                <div v-if="!editingRecord" class="flex items-center gap-2">
                  <div
                    v-if="formData.courses.length > 0"
                    class="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5"
                  >
                    <button
                      @click="showCoursesAsTable = true"
                      type="button"
                      :class="[
                        'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
                        showCoursesAsTable
                          ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                      ]"
                      title="มุมมองแบบตาราง"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 5v-.5A1.5 1.5 0 015.5 7h1a1.5 1.5 0 011.5 1.5v.5H4zm1 4.5A1.5 1.5 0 006.5 15h1a1.5 1.5 0 001.5-1.5V11H4v2.5zM10 7.5A1.5 1.5 0 0111.5 6h1A1.5 1.5 0 0114 7.5v.5h-4v-.5zm0 1v.5h4v-1.5A1.5 1.5 0 0012.5 6h-1A1.5 1.5 0 0010 7.5v1zm0 2.5v1.5A1.5 1.5 0 0011.5 14h1a1.5 1.5 0 001.5-1.5V11h-4z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                  <button
                    @click="addCourse"
                    type="button"
                    class="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-sm font-medium rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
                  >
                    <PlusIcon class="h-4 w-4" />
                    เพิ่มหลักสูตร
                  </button>
                </div>
              </div>

              <!-- มุมมองแบบตาราง -->
              <div
                v-if="showCoursesAsTable"
                class="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800"
              >
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr
                      class="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800"
                    >
                      <th
                        class="px-3 py-3 text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider"
                      >
                        ชื่อหลักสูตร
                      </th>
                      <th
                        class="px-3 py-3 text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-44"
                      >
                        วันที่ฝึกอบรม
                      </th>
                      <th
                        class="px-3 py-3 text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-44"
                      >
                        REหลักสูตร
                      </th>
                      <th
                        class="px-3 py-3 text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-56"
                      >
                        ไฟล์แนบ
                      </th>
                      <th
                        class="px-3 py-3 text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider w-16 text-center"
                      >
                        จัดการ
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                    <tr
                      v-for="(course, index) in formData.courses"
                      :key="index"
                      :class="[
                        isDuplicateCourse(course, index)
                          ? 'bg-red-50/60 dark:bg-red-900/10'
                          : 'hover:bg-gray-50/50 dark:hover:bg-gray-900/30',
                      ]"
                    >
                      <td class="px-3 py-2 break-all align-top min-w-[280px] max-w-[400px]">
                        <div
                          class="relative"
                          :ref="
                            (el) => {
                              if (el) setCourseWrapperRef(index, el)
                            }
                          "
                        >
                          <div
                            class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-sm font-medium text-gray-900 dark:text-white cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-all break-all whitespace-normal align-top min-h-[56px] leading-relaxed"
                            @click="openCourseSelectorModal(index)"
                          >
                            <span class="break-all whitespace-normal align-top leading-relaxed block text-left">{{
                              course.course_name || 'คลิกเพื่อเลือกหรือเพิ่มหลักสูตร...'
                            }}</span>
                          </div>
                          <div
                            v-if="showCourseDropdowns[index]"
                            @click.stop
                            class="absolute z-50 w-[540px] max-w-[calc(100vw-10rem)] min-w-[420px] mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg flex flex-col"
                          >
                            <div
                              v-if="getFilteredCourses(courseSearchQueries[index]).length > 0"
                              class="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/60 rounded-t-lg"
                            >
                              <span class="text-xs font-medium text-gray-600 dark:text-gray-400">
                                เลือกแล้ว {{ selectedCourses[index]?.length || 0 }} รายการ
                              </span>
                              <button
                                v-if="(selectedCourses[index]?.length || 0) > 0"
                                @click.stop="clearCourseSelection(index)"
                                type="button"
                                class="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                              >
                                เคลียร์ทั้งหมด
                              </button>
                            </div>
                            <div
                              class="px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-900/40"
                            >
                              <input
                                :value="courseSearchQueries[index] || ''"
                                @input="
                                  (e) => {
                                    setCourseSearchQuery(index, e.target.value)
                                    setCourseDropdownOpen(index, true)
                                  }
                                "
                                @focus="
                                  () => {
                                    setCourseDropdownOpen(index, true)
                                  }
                                "
                                placeholder="ค้นหาหลักสูตร..."
                                class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                              />
                            </div>
                            <div class="overflow-y-auto max-h-72">
                              <div
                                v-for="c in getFilteredCourses(courseSearchQueries[index])"
                                :key="c.id"
                                @click.stop="toggleCourseSelection(index, c.course_name)"
                                class="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors text-sm select-none"
                              >
                                <div
                                  class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all"
                                  :class="
                                    isCourseSelected(index, c.course_name)
                                      ? 'bg-indigo-600 border-indigo-600 text-white'
                                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-transparent'
                                  "
                                >
                                  <svg
                                    v-if="isCourseSelected(index, c.course_name)"
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-3.5 w-3.5"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                  >
                                    <path
                                      fill-rule="evenodd"
                                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                      clip-rule="evenodd"
                                    />
                                  </svg>
                                </div>
                                <span
                                  class="flex-1 text-gray-800 dark:text-gray-200 break-words align-top"
                                  >{{ c.course_name }}</span
                                >
                              </div>
                              <div
                                v-if="getFilteredCourses(courseSearchQueries[index]).length === 0"
                                class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400"
                              >
                                ไม่พบหลักสูตร
                              </div>
                            </div>
                            <div
                              v-if="true"
                              @click.stop
                              class="space-y-3 px-4 py-3.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/60 rounded-b-lg"
                            >
                              <div class="grid grid-cols-2 gap-3">
                                <div>
                                  <label
                                    class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5"
                                    >วันที่ฝึกอบรม <span class="text-red-500">*</span></label
                                  >
                                  <input
                                    v-model="multiSelectTrainingDates[index]"
                                    type="date"
                                    @click.stop
                                    @focus.stop
                                    @mousedown.stop
                                    class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                  />
                                </div>
                                <div>
                                  <label
                                    class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5"
                                    >REหลักสูตร</label
                                  >
                                  <input
                                    v-model="multiSelectReDates[index]"
                                    type="date"
                                    @click.stop
                                    @focus.stop
                                    @mousedown.stop
                                    class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                  />
                                </div>
                              </div>
                              <button
                                @click.stop="confirmMultiCourseSelection(index)"
                                :disabled="
                                  (selectedCourses[index]?.length || 0) === 0 ||
                                  !multiSelectTrainingDates[index]
                                "
                                type="button"
                                class="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:dark:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                              >
                                {{
                                  (selectedCourses[index]?.length || 0) === 0
                                    ? 'โปรดเลือกอย่างน้อย 1 รายการ'
                                    : !multiSelectTrainingDates[index]
                                      ? 'กรุณาเลือกวันที่ฝึกอบรม'
                                      : `ยืนยันการเลือก (${selectedCourses[index].length})`
                                }}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td class="px-3 py-2 align-top w-44">
                        <div class="relative w-full group">
                          <input
                            type="text"
                            :value="cardTrainingDateDisplay(index)"
                            @input="(e) => handleCardTrainingDateInput(index, e)"
                            @click.stop="openCardTrainingDatePicker(index)"
                            :ref="(el) => {}"
                            class="w-full pl-3 pr-10 py-2 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-sm font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer select-none"
                            :placeholder="'เลือกวันที่ฝึกอบรม'"
                            readonly
                          />
                          <div
                            class="pointer-events-none absolute inset-y-0 right-0 pr-3 flex items-center text-indigo-500 opacity-70 group-hover:opacity-100 transition-opacity"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke-width="1.8"
                              stroke="currentColor"
                              class="w-4.5 h-4.5"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                              />
                            </svg>
                          </div>
                          <input
                            type="date"
                            :ref="(el) => setHiddenTrainingDateRef(index, el)"
                            @change="(e) => handleCardTrainingDatePickerChange(index, e)"
                            class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                        </div>
                      </td>
                      <td class="px-3 py-2 align-top w-44">
                        <div class="relative w-full group">
                          <input
                            type="text"
                            :value="cardReDateDisplay(index)"
                            @input="(e) => handleCardReDateInput(index, e)"
                            @click.stop="openCardReDatePicker(index)"
                            :ref="(el) => {}"
                            class="w-full pl-3 pr-10 py-2 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-sm font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer select-none"
                            :placeholder="'เลือกวัน REหลักสูตร'"
                            readonly
                          />
                          <div
                            class="pointer-events-none absolute inset-y-0 right-0 pr-3 flex items-center text-indigo-500 opacity-70 group-hover:opacity-100 transition-opacity"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke-width="1.8"
                              stroke="currentColor"
                              class="w-4.5 h-4.5"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                              />
                            </svg>
                          </div>
                          <input
                            type="date"
                            :ref="(el) => setHiddenReDateRef(index, el)"
                            @change="(e) => handleCardReDatePickerChange(index, e)"
                            class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                        </div>
                      </td>
                      <td class="px-3 py-2 break-all align-top w-56 min-w-0">
                        <input
                          :ref="
                            (el) => {
                              if (el) courseAttachmentInputRefs[index] = el
                            }
                          "
                          type="file"
                          class="hidden"
                          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                          @change="(e) => handleCourseAttachmentChange(e, index)"
                        />
                        <div
                          v-if="courseAttachmentFiles[index]"
                          class="flex items-start gap-1.5 w-full min-w-0"
                        >
                          <div class="flex-1 flex items-start gap-2 min-w-0 overflow-hidden px-2.5 py-1.5 border border-indigo-200 dark:border-indigo-800 rounded-md bg-indigo-50/70 dark:bg-indigo-900/20 w-full">
                            <DocumentIcon class="h-3.5 w-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                            <span class="text-xs font-medium text-indigo-600 dark:text-indigo-400 break-all whitespace-normal align-top text-left flex-1 min-w-0 leading-relaxed" :title="courseAttachmentFiles[index].name">
                              {{ courseAttachmentFiles[index].name }}
                            </span>
                            <span class="text-[10px] text-indigo-500 flex-shrink-0">(ใหม่)</span>
                          </div>
                          <button
                            @click.stop="removeAttachment(index)"
                            type="button"
                            class="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded flex-shrink-0"
                            title="ลบไฟล์แนบ"
                          >
                            <TrashIcon class="h-4 w-4" />
                          </button>
                        </div>
                        <div
                          v-else-if="course.attachment_url"
                          class="flex items-start gap-1.5 w-full min-w-0"
                        >
                          <a
                            :href="course.attachment_url"
                            target="_blank"
                            rel="noopener noreferrer"
                            @click.stop
                            class="flex-1 flex items-start gap-2 min-w-0 overflow-hidden px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all w-full"
                            :title="getAttachmentFileName(course.attachment_url)"
                          >
                            <PaperClipIcon class="h-3.5 w-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                            <span class="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline break-all whitespace-normal align-top text-left inline-block w-full leading-relaxed">
                              {{ getAttachmentFileName(course.attachment_url) }}
                            </span>
                          </a>
                          <button
                            @click.stop="removeAttachment(index)"
                            type="button"
                            class="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded flex-shrink-0"
                            title="ลบไฟล์แนบ"
                          >
                            <TrashIcon class="h-4 w-4" />
                          </button>
                        </div>
                        <button
                          v-else
                          @click.stop="openCourseAttachmentPicker(index)"
                          type="button"
                          class="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 border border-dashed border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                          title="เพิ่มไฟล์แนบ"
                        >
                          <PaperClipIcon class="h-4 w-4 flex-shrink-0" />
                          <span class="text-xs">ไฟล์แนบ</span>
                        </button>
                        <p
                          v-if="courseAttachmentUploading[index]"
                          class="text-[10px] text-indigo-500 mt-1"
                        >
                          กำลังอัปโหลด...
                        </p>
                      </td>
                      <td class="px-3 py-2 align-top w-16 text-center">
                        <button
                          @click.stop="removeCourse(index)"
                          type="button"
                          class="inline-flex items-center justify-center p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                          title="ลบรายการหลักสูตรนี้"
                        >
                          <TrashIcon class="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                    <tr v-if="formData.courses.length === 0">
                      <td
                        colspan="5"
                        class="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500"
                      >
                        ยังไม่มีหลักสูตร กดปุ่ม "เพิ่มหลักสูตร" ด้านบน หรือคลิกที่แถวเพื่อเลือก
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- มุมมองแบบแยกแถว (Card) - แสดงเฉพาะฟอร์มเพิ่มเท่านั้น -->
              <div v-if="!editingRecord && !showCoursesAsTable" class="space-y-3">
                <div
                  v-for="(course, index) in formData.courses"
                  :key="index"
                  :class="[
                    'rounded-xl p-4 transition-all',
                    isDuplicateCourse(course, index)
                      ? 'bg-red-50/50 dark:bg-red-900/10 border-2 border-red-300 dark:border-red-800'
                      : 'bg-gray-50/50 dark:bg-gray-900/30',
                  ]"
                >
                  <div class="flex items-start justify-between gap-2 mb-3">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-xs font-medium text-gray-500 dark:text-gray-400"
                        >หลักสูตร {{ index + 1 }}</span
                      >
                      <span
                        v-if="isDuplicateCourse(course, index)"
                        class="text-xs text-red-600 dark:text-red-400 font-bold flex items-center gap-1"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-3 w-3"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                            clip-rule="evenodd"
                          />
                        </svg>
                        ซ้ำแล้ว
                      </span>
                      <span
                        v-if="course.training_date"
                        class="text-[11px] px-2 py-0.5 bg-gray-200/60 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300"
                      >
                        วันที่: {{ formatDate(course.training_date) }}
                      </span>
                      <span
                        v-if="course.re_date"
                        class="text-[11px] px-2 py-0.5 bg-indigo-100/60 dark:bg-indigo-900/30 rounded-full text-indigo-600 dark:text-indigo-400"
                      >
                        RE: {{ formatDate(course.re_date) }}
                      </span>
                    </div>
                    <button
                      v-if="formData.courses.length > 1 || isDuplicateCourse(course, index)"
                      @click="removeCourse(index)"
                      type="button"
                      class="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded flex-shrink-0"
                    >
                      <TrashIcon class="h-4 w-4" />
                    </button>
                  </div>
                  <div class="space-y-3">
                    <div>
                      <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1.5"
                        >ชื่อหลักสูตร</label
                      >
                      <div
                        class="relative"
                        :ref="
                          (el) => {
                            if (el) setCourseWrapperRef(index, el)
                          }
                        "
                      >
                        <div
                          class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm font-medium text-gray-900 dark:text-white cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                          @click="openCourseSelectorModal(index)"
                        >
                          <span class="truncate break-words">{{
                            course.course_name || 'คลิกเพื่อเลือกหรือเพิ่มหลักสูตร...'
                          }}</span>
                        </div>
                        <div
                          v-if="showCourseDropdowns[index]"
                          @click.stop
                          class="absolute z-50 w-[540px] max-w-[calc(100vw-10rem)] min-w-[420px] mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg flex flex-col"
                        >
                          <div
                            v-if="getFilteredCourses(courseSearchQueries[index]).length > 0"
                            class="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/60 rounded-t-lg"
                          >
                            <span class="text-xs font-medium text-gray-600 dark:text-gray-400">
                              เลือกแล้ว {{ selectedCourses[index]?.length || 0 }} รายการ
                            </span>
                            <button
                              v-if="(selectedCourses[index]?.length || 0) > 0"
                              @click.stop="clearCourseSelection(index)"
                              type="button"
                              class="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                            >
                              เคลียร์ทั้งหมด
                            </button>
                          </div>
                          <div
                            class="px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-900/40"
                          >
                            <input
                              :value="courseSearchQueries[index] || ''"
                              @input="
                                (e) => {
                                  setCourseSearchQuery(index, e.target.value)
                                  setCourseDropdownOpen(index, true)
                                }
                              "
                              @focus="
                                () => {
                                  setCourseDropdownOpen(index, true)
                                }
                              "
                              placeholder="ค้นหาหลักสูตร..."
                              class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            />
                          </div>
                          <div class="overflow-y-auto max-h-72">
                            <div
                              v-for="c in getFilteredCourses(courseSearchQueries[index])"
                              :key="c.id"
                              @click.stop="toggleCourseSelection(index, c.course_name)"
                              class="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors text-sm select-none"
                            >
                              <div
                                class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all"
                                :class="
                                  isCourseSelected(index, c.course_name)
                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                    : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-transparent'
                                "
                              >
                                <svg
                                  v-if="isCourseSelected(index, c.course_name)"
                                  xmlns="http://www.w3.org/2000/svg"
                                  class="h-3.5 w-3.5"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    fill-rule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clip-rule="evenodd"
                                  />
                                </svg>
                              </div>
                              <span
                                class="flex-1 text-gray-800 dark:text-gray-200 break-words align-top"
                                >{{ c.course_name }}</span
                              >
                            </div>
                            <div
                              v-if="getFilteredCourses(courseSearchQueries[index]).length === 0"
                              class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400"
                            >
                              ไม่พบหลักสูตร
                            </div>
                          </div>
                          <div
                            v-if="true"
                            @click.stop
                            class="space-y-3 px-4 py-3.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/60 rounded-b-lg"
                          >
                            <div class="grid grid-cols-2 gap-3">
                              <div>
                                <label
                                  class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5"
                                  >วันที่ฝึกอบรม <span class="text-red-500">*</span></label
                                >
                                <input
                                  v-model="multiSelectTrainingDates[index]"
                                  type="date"
                                  @click.stop
                                  @focus.stop
                                  @mousedown.stop
                                  class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                />
                              </div>
                              <div>
                                <label
                                  class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5"
                                  >REหลักสูตร</label
                                >
                                <input
                                  v-model="multiSelectReDates[index]"
                                  type="date"
                                  @click.stop
                                  @focus.stop
                                  @mousedown.stop
                                  class="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                />
                              </div>
                            </div>
                            <button
                              @click.stop="confirmMultiCourseSelection(index)"
                              :disabled="
                                (selectedCourses[index]?.length || 0) === 0 ||
                                !multiSelectTrainingDates[index]
                              "
                              type="button"
                              class="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:dark:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                            >
                              {{
                                (selectedCourses[index]?.length || 0) === 0
                                  ? 'โปรดเลือกอย่างน้อย 1 รายการ'
                                  : !multiSelectTrainingDates[index]
                                    ? 'กรุณาเลือกวันที่ฝึกอบรม'
                                    : `ยืนยันการเลือก (${selectedCourses[index].length})`
                              }}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <div
          class="px-6 pt-2 pb-2 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex-shrink-0"
        >
          <div class="flex items-center gap-3">
            <button
              @click="closeSidebar"
              class="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-colors border border-gray-200 dark:border-gray-800"
            >
              ยกเลิก
            </button>
            <button
              @click="isEditingRow ? saveEditRow() : saveRecord()"
              :disabled="attachmentUploading"
              class="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
            >
              {{
                attachmentUploading
                  ? 'กำลังอัปโหลด...'
                  : isEditingRow
                    ? 'บันทึก'
                    : editingRecord
                      ? 'บันทึกการแก้ไข'
                      : 'เพิ่มบันทึก'
              }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Course Selector Modal -->
    <div
      v-if="showCourseSelectorModal"
      class="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <div class="absolute inset-0 bg-black/50" @click="closeCourseSelectorModal"></div>
      <div
        class="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-gray-950 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div
          class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800"
        >
          <div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">เลือกหลักสูตร</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              เลือกแล้ว {{ modalSelectedCourses.length }} รายการ
            </p>
          </div>
          <button
            @click="closeCourseSelectorModal"
            type="button"
            class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900"
            title="ปิด"
          >
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>

        <div class="p-5 space-y-4 overflow-y-auto">
          <div v-if="modalSelectedCourses.length > 0" class="flex flex-wrap gap-2">
            <span
              v-for="courseName in modalSelectedCourses"
              :key="courseName"
              class="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm"
            >
              <span class="break-words">{{ courseName }}</span>
              <button
                @click="toggleModalCourse(courseName)"
                type="button"
                class="text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200"
                title="นำออก"
              >
                <XMarkIcon class="h-4 w-4" />
              </button>
            </span>
          </div>

          <input
            v-model="modalSearchQuery"
            type="search"
            placeholder="ค้นหาหลักสูตร..."
            class="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <div class="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
            <div class="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
              <button
                v-for="courseOption in getModalFilteredCourses()"
                :key="courseOption.id"
                @click="toggleModalCourse(courseOption.course_name)"
                type="button"
                class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
              >
                <span
                  class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0"
                  :class="
                    isModalCourseSelected(courseOption.course_name)
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-gray-300 dark:border-gray-600'
                  "
                >
                  <svg
                    v-if="isModalCourseSelected(courseOption.course_name)"
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3.5 w-3.5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </span>
                <span class="text-sm text-gray-800 dark:text-gray-200 break-words">{{
                  courseOption.course_name
                }}</span>
              </button>
              <div
                v-if="getModalFilteredCourses().length === 0"
                class="px-4 py-5 text-sm text-center text-gray-500 dark:text-gray-400"
              >
                ไม่พบหลักสูตร
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400">
              วันที่ฝึกอบรม <span class="text-red-500">*</span>
              <input
                v-model="modalTrainingDate"
                type="date"
                class="mt-1.5 w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400">
              REหลักสูตร
              <input
                v-model="modalReDate"
                type="date"
                class="mt-1.5 w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
          </div>
        </div>

        <div
          class="flex items-center gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-800"
        >
          <button
            @click="clearModalCourseSelection"
            type="button"
            class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            เคลียร์รายการ
          </button>
          <div class="flex-1"></div>
          <button
            @click="closeCourseSelectorModal"
            type="button"
            class="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900"
          >
            ยกเลิก
          </button>
          <button
            @click="confirmModalCourseSelection"
            type="button"
            class="px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
          >
            ยืนยันการเลือก
          </button>
        </div>
      </div>
    </div>

    <!-- Import Preview Modal -->
    <div v-if="showImportPreview" class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/50" @click="closeImportPreview"></div>
      <div
        class="absolute inset-4 md:inset-8 bg-white dark:bg-gray-950 rounded-2xl shadow-xl overflow-hidden flex flex-col"
      >
        <div
          class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800"
        >
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">
            ตรวจสอบข้อมูลก่อนนำเข้า ({{ importPreviewData.length }} รายการ)
          </h3>
          <button
            @click="closeImportPreview"
            class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900"
          >
            <XMarkIcon class="h-6 w-6" />
          </button>
        </div>

        <div class="flex-1 overflow-auto p-6">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr
                  class="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800"
                >
                  <th
                    class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10"
                  ></th>
                  <th
                    class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    กลุ่ม
                  </th>
                  <th
                    class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    รหัส TDL
                  </th>
                  <th
                    class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    รหัสล้านช้าง
                  </th>
                  <th
                    class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    ชื่อ-นามสกุล
                  </th>
                  <th
                    class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    เพศ
                  </th>
                  <th
                    class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    ตำแหน่ง
                  </th>
                  <th
                    class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    แผนก
                  </th>
                  <th
                    class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    สัญชาติ
                  </th>
                  <th
                    class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    สถานะ
                  </th>
                  <th
                    class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    ผู้บันทึก
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                <template v-for="(employee, empIndex) in groupedImportPreview" :key="empIndex">
                  <tr class="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors group">
                    <td class="px-3 py-4 whitespace-nowrap">
                      <button
                        v-if="employee.courses.length > 0"
                        class="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                        @click.stop="
                          expandedPreviewRow = expandedPreviewRow === empIndex ? null : empIndex
                        "
                      >
                        <ChevronRightIcon
                          class="h-5 w-5 text-gray-400 transition-transform"
                          :class="{ 'rotate-90': expandedPreviewRow === empIndex }"
                        />
                      </button>
                    </td>
                    <td
                      class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400"
                    >
                      {{ employee['กลุ่ม'] || '-' }}
                    </td>
                    <td
                      class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400"
                    >
                      {{ employee['รหัส TDL'] || '-' }}
                    </td>
                    <td
                      class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400"
                    >
                      {{ employee['รหัสล้านช้าง'] || '-' }}
                    </td>
                    <td class="px-3 py-4 whitespace-nowrap">
                      <div class="text-sm font-bold text-gray-900 dark:text-white">
                        {{ employee['ชื่อ'] || '-' }} {{ employee['นามสกุล'] || '-' }}
                      </div>
                    </td>
                    <td
                      class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400"
                    >
                      {{ employee['เพศ'] || '-' }}
                    </td>
                    <td
                      class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400"
                    >
                      {{ employee['ตำแหน่ง'] || '-' }}
                    </td>
                    <td
                      class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400"
                    >
                      {{ employee['แผนก'] || '-' }}
                    </td>
                    <td
                      class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400"
                    >
                      {{ employee['สัญชาติ'] || '-' }}
                    </td>
                    <td class="px-3 py-4 whitespace-nowrap">
                      <span
                        :class="[
                          'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                          employee['สถานะ'] === 'สำเร็จ'
                            ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                            : employee['สถานะ'] === 'กำลังดำเนินการ'
                              ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                              : 'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400',
                        ]"
                      >
                        {{ employee['สถานะ'] || '-' }}
                      </span>
                    </td>
                    <td class="px-3 py-4 whitespace-nowrap">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        {{
                          auth.user?.fullname || auth.user?.name || auth.user?.username || 'Import'
                        }}
                      </div>
                    </td>
                  </tr>
                  <!-- ส่วนขยาย แสดงหลักสูตร -->
                  <tr
                    v-if="expandedPreviewRow === empIndex && employee.courses.length > 0"
                    class="bg-gray-50/30 dark:bg-gray-900/30"
                  >
                    <td colspan="11" class="px-6 py-4">
                      <div class="space-y-2">
                        <div class="flex items-center justify-between mb-3">
                          <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            หลักสูตรที่เข้าฝึก ({{ employee.courses.length }} รายการ)
                          </h4>
                          <div class="flex items-center gap-6 text-sm">
                            <div class="flex items-center gap-2">
                              <span class="font-semibold text-gray-700 dark:text-gray-300"
                                >ตรวจสุขภาพ:</span
                              >
                              <span class="text-gray-500 dark:text-gray-400">วันที่:</span>
                              <span class="font-medium text-gray-900 dark:text-white">{{
                                employee['วันที่ตรวจสุขภาพ'] || '-'
                              }}</span>
                              <span class="text-gray-500 dark:text-gray-400 ml-3">หมดอายุ:</span>
                              <span class="font-medium text-gray-900 dark:text-white">{{
                                employee['วันหมดอายุสุขภาพ'] || '-'
                              }}</span>
                            </div>
                          </div>
                        </div>
                        <div v-if="employee.courses.length > 0" class="overflow-x-auto">
                          <table class="w-full text-left border-collapse">
                            <thead>
                              <tr
                                class="bg-red-500 dark:bg-red-700 border-b border-gray-200 dark:border-gray-800"
                              >
                                <th
                                  class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider"
                                >
                                  หลักสูตร
                                </th>
                                <th
                                  class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider"
                                >
                                  วันที่อบรม
                                </th>
                                <th
                                  class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider"
                                >
                                  สถานะ
                                </th>
                                <th
                                  class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider"
                                >
                                  REหลักสูตร
                                </th>
                                <th
                                  class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider"
                                >
                                  สถานะ RE
                                </th>
                                <th
                                  class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider"
                                >
                                  ไฟล์แนบ
                                </th>
                                <th
                                  class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider w-12"
                                ></th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                              <tr
                                v-for="(course, courseIndex) in employee.courses"
                                :key="course.originalIndex"
                                :class="[
                                  'bg-white dark:bg-gray-950 hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors',
                                  isPreviewDuplicateCourse(course, employee)
                                    ? 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500'
                                    : '',
                                ]"
                              >
                                <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                  <div class="flex items-center gap-2">
                                    <span
                                      v-if="isPreviewDuplicateCourse(course, employee)"
                                      class="text-red-600 dark:text-red-400"
                                    >
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="h-4 w-4"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                      >
                                        <path
                                          fill-rule="evenodd"
                                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                          clip-rule="evenodd"
                                        />
                                      </svg>
                                    </span>
                                    {{ course.course_name || '-' }}
                                  </div>
                                </td>
                                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                  {{ course.training_date || '-' }}
                                </td>
                                <td class="px-4 py-3">
                                  <span
                                    :class="[
                                      'text-xs font-bold uppercase',
                                      course.status_courses === 'ผ่านแล้ว' ||
                                      course.status_courses === 'สำเร็จ'
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-yellow-600 dark:text-yellow-400',
                                    ]"
                                  >
                                    {{
                                      course.status_courses === 'กำลังดำเนินการ'
                                        ? 'ผ่านแล้ว'
                                        : course.status_courses || 'ผ่านแล้ว'
                                    }}
                                  </span>
                                </td>
                                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                  {{ course.re_date || '-' }}
                                </td>
                                <td class="px-4 py-3">
                                  <span
                                    :class="[
                                      'text-xs font-bold uppercase',
                                      'text-gray-500 dark:text-gray-400',
                                    ]"
                                  >
                                    ยังไม่Re
                                  </span>
                                </td>
                                <td class="px-4 py-3 break-all align-top max-w-[220px] min-w-0">
                                  <!-- Hidden input file สำหรับแต่ละหลักสูตร (แยกตาม course.originalIndex) -->
                                  <input
                                    :ref="
                                      (el) => {
                                        if (el) previewFileInputRefs[course.originalIndex] = el
                                      }
                                    "
                                    type="file"
                                    class="hidden"
                                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                                    @change="(e) => handlePreviewAttachmentChange(e, course.originalIndex)"
                                  />
                                  <div class="flex items-start gap-1.5 w-full min-w-0">
                                    <a
                                      v-if="
                                        importPreviewData[course.originalIndex] &&
                                        importPreviewData[course.originalIndex]._attachment_file
                                      "
                                      href="#"
                                      @click.prevent
                                      class="flex-1 flex items-start gap-2 min-w-0 overflow-hidden px-2.5 py-1.5 border border-indigo-200 dark:border-indigo-800 rounded-md bg-indigo-50/70 dark:bg-indigo-900/20 w-full"
                                      :title="importPreviewData[course.originalIndex]._attachment_file.name"
                                    >
                                      <PaperClipIcon class="h-3.5 w-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                                      <span class="text-xs font-medium text-indigo-600 dark:text-indigo-400 break-all whitespace-normal align-top text-left flex-1 min-w-0 leading-relaxed">
                                        {{
                                          importPreviewData[course.originalIndex]._attachment_file
                                            .name
                                        }}
                                      </span>
                                      <span class="text-[10px] text-indigo-500 flex-shrink-0">(ใหม่)</span>
                                    </a>
                                    <span
                                      v-else
                                      class="flex-1 px-2.5 py-1.5 text-xs text-gray-400 border border-gray-100 dark:border-gray-800 rounded-md"
                                    >
                                      -
                                    </span>
                                    <button
                                      v-if="
                                        !(
                                          importPreviewData[course.originalIndex] &&
                                          importPreviewData[course.originalIndex]._attachment_file
                                        )
                                      "
                                      @click.stop="previewFileInputRefs[course.originalIndex]?.click()"
                                      class="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors flex-shrink-0"
                                      title="เพิ่มไฟล์แนบ"
                                      type="button"
                                    >
                                      <PlusIcon class="h-4 w-4" />
                                    </button>
                                    <button
                                      v-else
                                      @click.stop="removePreviewAttachment(course.originalIndex)"
                                      class="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                                      title="ลบไฟล์แนบ"
                                      type="button"
                                    >
                                      <XMarkIcon class="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                                <td class="px-4 py-3 text-center">
                                  <button
                                    @click.stop="
                                      removePreviewCourse(employee, course.originalIndex, empIndex)
                                    "
                                    class="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                                    type="button"
                                  >
                                    <TrashIcon class="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <div class="p-6 border-t border-gray-200 dark:border-gray-800">
          <div class="flex items-center gap-3">
            <button
              @click="closeImportPreview"
              class="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-colors"
            >
              ยกเลิก
            </button>
            <button
              @click="confirmImportData"
              class="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
            >
              ยืนยันนำเข้า
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
ห