<script setup>
import { ref, onMounted, watch, computed, onUnmounted } from 'vue'
import { supabaseInternal } from '../server/supabase'
import { supabaseExternal } from '../server/supabase_data'
import { useAuth } from '../stores/auth'
import { MagnifyingGlassIcon, PlusIcon, PencilIcon, PencilSquareIcon, TrashIcon, XMarkIcon, ChevronDownIcon, ChevronRightIcon, HeartIcon, PaperClipIcon, DocumentIcon, ArrowUpTrayIcon, ArrowDownTrayIcon } from '@heroicons/vue/24/outline'
import Swal from 'sweetalert2'
import * as XLSX from 'xlsx'

const auth = useAuth()
const records = ref([])
const courses = ref([])
const employees = ref([])
const loading = ref(true)
const searchQuery = ref('')
const isSidebarOpen = ref(false)
const editingRecord = ref(null)
const expandedRecordId = ref(null)
const isEditingSingleCourse = ref(false)
const tdlSearchQuery = ref('')
const showTdlDropdown = ref(false)
const tdlDropdownRef = ref(null)
const isEditingRow = ref(false)
const editingRowRecord = ref(null)
const openDropdownId = ref(null)
const originalEmployeeId = ref(null)
const courseSearchQueries = ref({}) // To hold search query per course index
const showCourseDropdowns = ref([]) // To track which course index is open

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
        courses: []
      }
    }
    if (row['ชื่อหลักสูตร']) {
      grouped[key].courses.push({
        course_name: row['ชื่อหลักสูตร'],
        training_date: row['วันที่ฝึกอบรม'],
        re_date: row['REหลักสูตร'],
        status_courses: row['สถานะหลักสูตร'],
        originalIndex: index // เก็บ index ดั้งเดิมของ row ใน importPreviewData
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
const attachmentFile = ref(null) // ไฟล์ที่เลือกไว้ (ยังไม่อัปโหลด)
const attachmentUploading = ref(false)
const attachmentInputRef = ref(null)
// สำหรับอัปโหลดไฟล์แนบจากตาราง
const currentRecordForAttachment = ref(null)
const tableAttachmentInputRef = ref(null)

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

// ฟังก์ชันสำหรับกรองหลักสูตรตามคำค้นหา
const getFilteredCourses = (query) => {
  if (!query) return courses.value
  const q = query.toLowerCase()
  return courses.value.filter(c => 
    c.course_name?.toLowerCase().includes(q)
  )
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
  courses: []
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
  const existingEmployee = records.value.find(r => 
    (formData.value.id_tdl && r.id_tdl === formData.value.id_tdl) ||
    (!formData.value.id_tdl && r.first_name === formData.value.first_name && r.last_name === formData.value.last_name)
  )
  
  if (!existingEmployee) return false
  
  // ตรวจสอบว่ามีหลักสูตรนี้อยู่แล้วหรือไม่ (ยกเว้นถ้าเป็น course ที่มี record_id เดิม)
  const isExisting = existingEmployee.courses.some(c => 
    c.course_name && c.course_name.trim() === course.course_name.trim() && (!course.record_id || c.record_id !== course.record_id)
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

// ลบไฟล์แนบที่เลือกไว้ (ก่อนบันทึก) หรือลบ URL เดิม (ถ้าไม่มีไฟล์ใหม่)
const removeAttachment = () => {
  attachmentFile.value = null
  formData.value.attachment_url = ''
  if (attachmentInputRef.value) {
    attachmentInputRef.value.value = ''
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
            updated_by: auth.user?.fullname || auth.user?.name || auth.user?.username || 'Unknown'
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
          icon: '!scale-75'
        }
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
        icon: '!scale-75'
      }
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
        upsert: false
      })

    if (uploadError) throw uploadError

    const { data: publicUrlData } = supabaseInternal.storage
      .from('imge')
      .getPublicUrl(filePath)

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
    last_name: parts.slice(1).join(' ')
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
    console.log('Fetched employees, first one:', allData[0])
    if (allData.length > 0) {
      console.log('All keys in employee object:', Object.keys(allData[0]))
    }
  } catch (error) {
    console.error('Error fetching employees:', error.message)
  }
}

// ฟังก์ชันเติมข้อมูลพนักงานอัตโนมัติเมื่อเลือกรหัส TDL หรือ id_lxml
const fillEmployeeData = (code) => {
  const employee = employees.value.find(emp => emp.employee_code === code || emp.id_lxml === code)
  console.log('fillEmployeeData called with code:', code)
  console.log('Found employee:', employee)
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
    
    formData.value.nationality = employee.nationality || ''
    
    console.log('Employee status from DB:', employee.status)
    
    // ใช้ค่าสถานะจากฐานข้อมูลตรงๆ เลย
    formData.value.status = employee.status || ''
    
    console.log('Set formData.status to:', formData.value.status)
    console.log('Gender determined from pn:', genderFromPn, 'Employee pn:', employee.pn)
  }
}

// ฟังก์ชันแยกชื่อและนามสกุล
const parseFullname = (fullname) => {
  if (!fullname) return { first_name: '', last_name: '' }
  const parts = fullname.trim().split(' ')
  if (parts.length === 1) return { first_name: parts[0], last_name: '' }
  return { 
    first_name: parts[0], 
    last_name: parts.slice(1).join(' ') 
  }
}

// ฟังก์ชันเลือกรหัส TDL จาก dropdown
const selectEmployee = (employee) => {
  formData.value.id_tdl = employee.employee_code
  tdlSearchQuery.value = employee.fullname || `${employee.firstname} ${employee.lastname}` || employee.employee_code
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

// ฟังก์ชันเมื่อคลิกนอก dropdown ให้ปิด
const handleClickOutside = (event) => {
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
}

const fetchRecords = async () => {
  try {
    loading.value = true
    const { data, error } = await supabaseInternal
      .from('employee_training_records')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    
    console.log('Raw data from database:', data)
    
    // ตรวจสอบและอัปเดต status_re สำหรับ course ที่ถึงวัน re_date แล้ว
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    console.log('Today (for auto-archive):', today.toISOString())
    
    const updates = []
    const toArchive = []
    const toHealthCheck = []
    const processedIds = new Set()
    data.forEach(record => {
      let shouldArchive = false
      let shouldUpdateStatus = false
      
      // Check if should update status_re
      if (record.re_date && record.status_re !== 'Reแล้ว') {
        const reDate = new Date(record.re_date)
        reDate.setHours(0, 0, 0, 0)
        console.log('Checking record:', record.id, 're_date:', reDate.toISOString(), 'today:', today.toISOString(), 'reDate <= today:', reDate <= today)
        
        if (reDate <= today) {
          shouldUpdateStatus = true
          shouldArchive = true
        }
      }
      
      // Also check if status_re is already Reแล้ว
      if (record.status_re === 'Reแล้ว') {
        shouldArchive = true
      }
      
      // Check if health check is expired
      if (record.date_health_expiry) {
        const expireDate = new Date(record.date_health_expiry)
        expireDate.setHours(0, 0, 0, 0)
        
        if (expireDate <= today) {
          toHealthCheck.push(record)
        }
      }
      
      if (shouldUpdateStatus) {
        updates.push({
          id: record.id,
          status_re: 'Reแล้ว'
        })
      }
      
      if (shouldArchive) {
        toArchive.push(record)
      }
    })
    console.log('Records to archive:', toArchive)
    
    // ทำการอัปเดตทีละรายการ
    for (const update of updates) {
      try {
        await supabaseInternal
          .from('employee_training_records')
          .update({ status_re: 'Reแล้ว' })
          .eq('id', update.id)
        // อัปเดตข้อมูลใน array data ด้วย
        const recordToUpdate = data.find(r => r.id === update.id)
        if (recordToUpdate) {
          recordToUpdate.status_re = 'Reแล้ว'
        }
      } catch (updateError) {
        console.error('Error updating status_re:', updateError)
      }
    }
    
    // Archive records to re_courses
    for (const record of toArchive) {
      try {
        console.log('Auto-archiving record:', record)
        const fullName = record.first_name && record.last_name 
          ? `${record.first_name} ${record.last_name}` 
          : record.first_name || record.last_name || ''
        
        const reCourseData = {
          group_name: record.group,
          tdl_code: record.id_tdl,
          full_name: fullName,
          gender: record.gender,
          position: record.position,
          department: record.department,
          nationality: record.nationality,
          status: record.status,
          course_name: record.course_name,
          training_date: record.training_date,
          re_date: record.re_date,
          re_status: 'Reแล้ว'
        }
        
        console.log('Inserting into re_courses:', reCourseData)
        
        const { data: insertedData, error: insertError } = await supabaseInternal
          .from('re_courses')
          .insert(reCourseData)
          .select()
        
        if (insertError) {
          console.error('Error inserting into re_courses:', insertError)
          throw insertError
        }
        
        console.log('Inserted successfully:', insertedData)
        
        // Delete from employee_training_records
        const { error: deleteError } = await supabaseInternal
          .from('employee_training_records')
          .delete()
          .eq('id', record.id)
        
        if (deleteError) {
          console.error('Error deleting from employee_training_records:', deleteError)
          throw deleteError
        }
      } catch (archiveError) {
        console.error('Error archiving record:', archiveError)
      }
    }
    
    // Auto-save expired health check to health_check table
    for (const record of toHealthCheck) {
      try {
        // Check if already exists in health_check
        const { data: existingData, error: checkError } = await supabaseInternal
          .from('health_check')
          .select('id')
          .eq('group_name', record.group)
          .eq('tdl_code', record.id_tdl)
          .eq('checkup_date', record.date_health_check)
          .eq('checkup_expire_date', record.date_health_expiry)
          .limit(1)
        
        if (checkError) throw checkError
        
        if (existingData && existingData.length > 0) {
          continue // Skip if already exists
        }
        
        const fullName = record.first_name && record.last_name 
          ? `${record.first_name} ${record.last_name}` 
          : record.first_name || record.last_name || ''
        
        const healthCheckData = {
          group_name: record.group,
          tdl_code: record.id_tdl,
          full_name: fullName,
          gender: record.gender,
          position: record.position,
          department: record.department,
          nationality: record.nationality,
          status: record.status,
          checkup_date: record.date_health_check,
          checkup_expire_date: record.date_health_expiry
        }
        
        const { error: insertError } = await supabaseInternal
          .from('health_check')
          .insert(healthCheckData)
        
        if (insertError) throw insertError
      } catch (healthError) {
        console.error('Error saving health check:', healthError)
      }
    }
    
    // Remove archived records from data array
    const remainingData = data.filter(record => {
      return !toArchive.find(ar => ar.id === record.id)
    })
    
    // จัดกลุ่มข้อมูลตามพนักงาน (ใช้รหัส TDL เป็นหลัก)
    const grouped = {}
    remainingData.forEach(record => {
      // ใช้ id_tdl เป็นหลัก ถ้าไม่มีใช้ชื่อ-นามสกุล
      const key = record.id_tdl ? `tdl-${record.id_tdl}` : `${record.first_name}-${record.last_name}-${record.employee_id || 'no-id'}`
      if (!grouped[key]) {
        grouped[key] = {
          id: record.id, // ใช้ id ล่าสุด
          record_ids: [record.id], // เก็บทุก id ของ record ในกลุ่มนี้
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
          attachment_url: record.attachment_url,
          created_by: record.created_by,
          created_at: record.created_at,
          courses: []
        }
      } else {
        grouped[key].record_ids.push(record.id)
        // ถ้า record นี้มี attachment_url และตัวที่เก็บไว้ยังไม่มี ให้เติมเข้าไป
        if (!grouped[key].attachment_url && record.attachment_url) {
          grouped[key].attachment_url = record.attachment_url
        }
      }
      if (record.course_name || record.training_date) {
        grouped[key].courses.push({
          course_name: record.course_name,
          training_date: record.training_date,
          re_date: record.re_date,
          status_re: record.status_re,
          record_id: record.id,
          status: record.status_courses || record.status
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
  return records.value.filter(record => 
    record.first_name?.toLowerCase().includes(query) ||
    record.last_name?.toLowerCase().includes(query) ||
    record.employee_id?.toLowerCase().includes(query) ||
    record.id_tdl?.toLowerCase().includes(query) ||
    record.department?.toLowerCase().includes(query)
  )
}

const openAddSidebar = () => {
  editingRecord.value = null
  tdlSearchQuery.value = ''
  fullNameInput.value = ''
  attachmentFile.value = null
  courseSearchQueries.value = {}
  showCourseDropdowns.value = [false]
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
    courses: [{ course_name: '', training_date: '', re_date: '', status: 'ผ่านแล้ว' }]
  }
  isSidebarOpen.value = true
}

const openEditSidebar = (record, course = null) => {
  isEditingRow.value = false
  editingRowRecord.value = null
  editingRecord.value = record
  isEditingSingleCourse.value = !!course
  attachmentFile.value = null
  originalEmployeeId.value = record.employee_id || null
  courseSearchQueries.value = {}
  const coursesForForm = course 
    ? [{ course_name: course.course_name, training_date: course.training_date, re_date: course.re_date, status_re: course.status_re, record_id: course.record_id, status: course.status }]
    : (record.courses && record.courses.length > 0 
      ? record.courses.map(c => ({ course_name: c.course_name, training_date: c.training_date, re_date: c.re_date, status_re: c.status_re, status: c.status }))
      : [{ course_name: '', training_date: '', re_date: '', status_re: '', status: '' }])
  
  showCourseDropdowns.value = new Array(coursesForForm.length).fill(false)
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
    attachment_url: record.attachment_url || '',
    courses: coursesForForm
  }
  // เติมค่า fullNameInput
  if (record.first_name || record.last_name) {
    fullNameInput.value = `${record.first_name || ''} ${record.last_name || ''}`.trim()
  } else {
    fullNameInput.value = ''
  }
  // เติมค่า search query สำหรับ dropdown
  if (record.id_tdl) {
    const employee = employees.value.find(emp => emp.employee_code === record.id_tdl)
    tdlSearchQuery.value = employee 
      ? (employee.fullname || `${employee.firstname} ${employee.lastname}` || employee.employee_code)
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
    date_health_expiry: record.date_health_expiry || ''
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
    const autoStatusCard = editingRowRecord.value.employee_id && editingRowRecord.value.employee_id.trim() !== '' ? 'ได้รับแล้ว' : 'ยังไม่ได้รับ'
    console.log('Auto-set status_card to:', autoStatusCard)
    
    // Update all records for this employee
    let query = supabaseInternal
      .from('employee_training_records')
      .update({
        id_tdl: editingRowRecord.value.id_tdl || null,
        employee_id: editingRowRecord.value.employee_id || null,
        status_card: autoStatusCard,
        date_health_check: editingRowRecord.value.date_health_check || null,
        date_health_expiry: editingRowRecord.value.date_health_expiry || null
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
        icon: '!scale-75'
      }
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
        icon: '!scale-75'
      }
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
      icon: '!scale-75'
    }
  })

  if (result.isConfirmed) {
    try {
      if (course.record_id) {
        const { error } = await supabaseInternal
          .from('employee_training_records')
          .delete()
          .eq('id', course.record_id)
        
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
          icon: '!scale-75'
        }
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
          icon: '!scale-75'
        }
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
      icon: '!scale-75'
    }
  })

  if (result.isConfirmed) {
    try {
      const fullName = record.first_name && record.last_name 
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
          full_name: fullName,
          gender: originalData.gender,
          position: originalData.position,
          department: originalData.department,
          nationality: originalData.nationality,
          status: originalData.status,
          checkup_date: originalData.date_health_check,
          checkup_expire_date: originalData.date_health_expiry
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
          icon: '!scale-75'
        }
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
          icon: '!scale-75'
        }
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
  originalEmployeeId.value = null
  courseSearchQueries.value = {}
  showCourseDropdowns.value = [false]
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
    courses: [{ course_name: '', training_date: '', re_date: '', status: 'ผ่านแล้ว' }]
  }
}

const toggleDropdown = (event, id) => {
  event.stopPropagation();
  openDropdownId.value = openDropdownId.value === id ? null : id
}

const addCourse = () => {
  formData.value.courses.push({ course_name: '', training_date: '', re_date: '', status: 'ผ่านแล้ว' })
  showCourseDropdowns.value.push(false)
}

const removeCourse = (index) => {
  if (formData.value.courses.length > 1) {
    formData.value.courses.splice(index, 1)
    showCourseDropdowns.value.splice(index, 1)
    delete courseSearchQueries.value[index]
  }
}

// ฟังก์ชันช่วยเปิด/ปิด dropdown หลักสูตร (ใช้ .value ให้ reactive ถูกต้อง)
const setCourseDropdownOpen = (index, isOpen) => {
  showCourseDropdowns.value[index] = isOpen
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
    if (course.record_id && (!course.status || !course.status.trim())) {
      missing.push(`หลักสูตร ${rowNumber} - สถานะ`)
    }
  })

  return missing
}

const saveRecord = async () => {
  console.log('auth.user value:', auth.user)
  console.log('formData.value:', formData.value)
  console.log('editingRecord.value:', editingRecord.value)
  console.log('isEditingSingleCourse.value:', isEditingSingleCourse.value)
  
  // ตรวจสอบว่ามีหลักสูตรซ้ำหรือไม่ (เฉพาะเมื่อเพิ่มใหม่ หรือเพิ่มหลักสูตรใหม่)
  if (!editingRecord.value || !isEditingSingleCourse.value) {
    for (const course of formData.value.courses) {
      if (course.course_name && !course.record_id) { // ตรวจสอบเฉพาะหลักสูตรที่มีชื่อและยังไม่มี record_id
        // ค้นหาพนักงานคนนี้ใน records.value
        const existingEmployee = records.value.find(r => 
          (formData.value.id_tdl && r.id_tdl === formData.value.id_tdl) ||
          (!formData.value.id_tdl && r.first_name === formData.value.first_name && r.last_name === formData.value.last_name)
        )
        
        if (existingEmployee) {
          // ตรวจสอบว่ามีหลักสูตรนี้อยู่แล้วหรือไม่
          const existingCourse = existingEmployee.courses.find(c => 
            c.course_name && c.course_name.trim() === course.course_name.trim()
          )
          
          if (existingCourse) {
            // สร้างรายการหลักสูตรทั้งหมด
            const allCoursesList = existingEmployee.courses
              .map(c => `<li>• ${c.course_name}</li>`)
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
                icon: '!scale-75'
              }
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
        html: 'ยังป้อนข้อมูลไม่ครบในช่องต่อไปนี้:<br><br>' +
          '<ul style="text-align:left; margin:0; padding-left:1.2em;">' +
          missingFields.map(f => `<li>${f}</li>`).join('') +
          '</ul>',
        icon: 'warning',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs !text-left',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          icon: '!scale-75'
        }
      })
      return
    }
  }

  // Get the correct username from auth.user
  const username = auth.user?.fullname || auth.user?.name || auth.user?.username || 'Unknown'
  console.log('Username to save:', username)
  
  // Auto-set status_card based on employee_id
  const autoStatusCard = formData.value.employee_id && formData.value.employee_id.trim() !== '' ? 'ได้รับแล้ว' : 'ยังไม่ได้รับ'
  console.log('Auto-set status_card to:', autoStatusCard)

  // อัปโหลดไฟล์แนบ (ถ้ามีการเลือกไฟล์ใหม่) ก่อนบันทึกข้อมูล
  if (!isEditingSingleCourse.value && attachmentFile.value) {
    try {
      const uploadedUrl = await uploadAttachment(attachmentFile.value)
      if (uploadedUrl) {
        formData.value.attachment_url = uploadedUrl
      }
    } catch (uploadError) {
      console.error('Error uploading attachment:', uploadError)
      Swal.fire({
        title: 'เกิดข้อผิดพลาด!',
        text: 'อัปโหลดไฟล์แนบไม่สำเร็จ: ' + uploadError.message,
        icon: 'error',
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
  }
  
  try {
    if (editingRecord.value && !isEditingSingleCourse.value) {
      // อัพเดทข้อมูลพนักงานทั่วไป ไม่แตะ course
      const dataToUpdateBase = {
        group: formData.value.group.trim() || null,
        id_tdl: formData.value.id_tdl.trim() || null,
        employee_id: formData.value.employee_id.trim() || null,
        gender: formData.value.gender.trim() || null,
        nationality: formData.value.nationality.trim() || null,
        status: formData.value.status || null,
        status_card: autoStatusCard,
        date_health_check: formData.value.date_health_check || null,
        date_health_expiry: formData.value.date_health_expiry || null,
        attachment_url: formData.value.attachment_url || null
      };
      const dataToUpdateWithUpdatedBy = {
        ...dataToUpdateBase,
        updated_by: username
      };
      let query = supabaseInternal
        .from('employee_training_records')
        .update(dataToUpdateWithUpdatedBy)
        .eq('first_name', formData.value.first_name)
        .eq('last_name', formData.value.last_name);
      
      if (originalEmployeeId.value) {
        query = query.eq('employee_id', originalEmployeeId.value);
      } else {
        query = query.is('employee_id', null);
      }
      
      let { error } = await query;
      if (error) {
        console.log('Error updating with updated_by, trying without...', error);
        query = supabaseInternal
          .from('employee_training_records')
          .update(dataToUpdateBase)
          .eq('first_name', formData.value.first_name)
          .eq('last_name', formData.value.last_name);
        if (originalEmployeeId.value) {
          query = query.eq('employee_id', originalEmployeeId.value);
        } else {
          query = query.is('employee_id', null);
        }
        const { error: errorWithoutUpdatedBy } = await query;
        if (errorWithoutUpdatedBy) throw errorWithoutUpdatedBy;
      }
    } else if (isEditingSingleCourse.value) {
      // อัพเดท单个 course
      const course = formData.value.courses[0];
      const dataToUpdateBase = {
        course_name: course.course_name,
        training_date: course.training_date || null,
        re_date: course.re_date || null,
        status_re: course.status_re || null,
        status_courses: course.status || 'ยังไม่ผ่าน'
      };
      const dataToUpdateWithUpdatedBy = {
        ...dataToUpdateBase,
        updated_by: username
      };
      let { error } = await supabaseInternal
        .from('employee_training_records')
        .update(dataToUpdateWithUpdatedBy)
        .eq('id', course.record_id);
      
      if (error) {
        console.log('Error updating course with updated_by, trying without...', error);
        const { error: errorWithoutUpdatedBy } = await supabaseInternal
          .from('employee_training_records')
          .update(dataToUpdateBase)
          .eq('id', course.record_id);
        if (errorWithoutUpdatedBy) throw errorWithoutUpdatedBy;
      }
      
      if (error) throw error;
    } else {
      // เพิ่มข้อมูลใหม่
      const validCourses = formData.value.courses.filter(c => c.course_name);
      console.log('validCourses:', validCourses);
      
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
            attachment_url: formData.value.attachment_url || null,
            status_card: autoStatusCard,
            course_name: null,
            training_date: null
          };
        console.log('dataToInsertBase (no course):', dataToInsertBase);
        const dataToInsertWithCreatedBy = {
            ...dataToInsertBase,
            created_by: username
        };
        console.log('dataToInsertWithCreatedBy (no course):', dataToInsertWithCreatedBy);
        let { data, error } = await supabaseInternal
          .from('employee_training_records')
          .insert(dataToInsertWithCreatedBy)
          .select();
        console.log('Insert result (no course):', data, error);
        
        // If error, try without created_by
        if (error) {
            console.log('Error inserting with created_by, trying without...', error);
            const { data: dataWithoutCreatedBy, error: errorWithoutCreatedBy } = await supabaseInternal
                .from('employee_training_records')
                .insert(dataToInsertBase)
                .select();
            console.log('Insert result without created_by (no course):', dataWithoutCreatedBy, errorWithoutCreatedBy);
            if (errorWithoutCreatedBy) throw errorWithoutCreatedBy;
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
              attachment_url: formData.value.attachment_url || null,
              status_card: autoStatusCard,
              status_courses: course.status || 'ยังไม่ผ่าน',
              course_name: course.course_name,
              training_date: course.training_date || null,
              re_date: course.re_date || null,
              status_re: course.status_re || null
            };
            console.log('dataToInsertBase (with course):', dataToInsertBase);
            const dataToInsertWithCreatedBy = {
                ...dataToInsertBase,
                created_by: username
            };
            console.log('dataToInsertWithCreatedBy (with course):', dataToInsertWithCreatedBy);
          let { data, error } = await supabaseInternal
            .from('employee_training_records')
            .insert(dataToInsertWithCreatedBy)
            .select();
          console.log('Insert result (with course):', data, error);
          
          // If error, try without created_by
          if (error) {
              console.log('Error inserting course with created_by, trying without...', error);
              const { data: dataWithoutCreatedBy, error: errorWithoutCreatedBy } = await supabaseInternal
                  .from('employee_training_records')
                  .insert(dataToInsertBase)
                  .select();
              console.log('Insert result without created_by (with course):', dataWithoutCreatedBy, errorWithoutCreatedBy);
              if (errorWithoutCreatedBy) throw errorWithoutCreatedBy;
          }
        }
      }
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
      icon: '!scale-75'
    }
  })

  if (result.isConfirmed) {
    try {
      // Delete all records using their actual database IDs
      const { error } = await supabaseInternal
        .from('employee_training_records')
        .delete()
        .in('id', record.record_ids)
      
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

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
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
            icon: '!scale-75'
          }
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
          icon: '!scale-75'
        }
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
      const existingEmployee = records.value.find(r => 
        (row['รหัส TDL'] && r.id_tdl === row['รหัส TDL']) ||
        (!row['รหัส TDL'] && r.first_name === firstName && r.last_name === lastName)
      )
      
      if (existingEmployee) {
        // ตรวจสอบว่ามีหลักสูตรนี้อยู่แล้วหรือไม่
        const existingCourse = existingEmployee.courses.find(c => 
          c.course_name && c.course_name.trim() === courseName.trim()
        )
        
        if (existingCourse) {
          // สร้างรายการหลักสูตรทั้งหมด
          const allCoursesList = existingEmployee.courses
            .map(c => `<li>• ${c.course_name}</li>`)
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
              icon: '!scale-75'
            }
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
          icon: '!scale-75'
        }
      })
      return
    }
    duplicateCheck[key] = true
  }
  
  // นำเข้าข้อมูลทีละรายการ
  let successCount = 0
  let failCount = 0
  
  // จัดกลุ่มข้อมูลตามพนักงานเพื่ออัปโหลดไฟล์แนบ
  const employeesMap = {}
  groupedImportPreview.value.forEach((employee, empIndex) => {
    const key = `${employee['ชื่อ'] || ''}-${employee['นามสกุล'] || ''}-${employee['รหัส TDL'] || ''}`
    employeesMap[key] = {
      employee,
      empIndex,
      attachment: employeeAttachments.value[empIndex]
    }
  })
  
  // สร้าง map สำหรับเก็บ record_id ที่บันทึกแล้ว
  const savedRecords = {}
  
  for (const row of importPreviewData.value) {
    try {
      console.log('Processing row:', row);
      
      // แปลงชื่อ-นามสกุล
      let firstName = row['ชื่อ'] || ''
      let lastName = row['นามสกุล'] || ''
      const key = `${firstName}-${lastName}-${row['รหัส TDL'] || ''}`
      
      // ตรวจสอบว่ามีไฟล์แนบหรือไม่
      let attachmentUrl = null
      const empData = employeesMap[key]
      
      // อัปโหลดไฟล์แนบเฉพาะครั้งแรกสำหรับพนักงานคนนี้
      if (empData && empData.attachment && !savedRecords[key]) {
        try {
          const fileExt = empData.attachment.name.split('.').pop()
          const safeName = empData.attachment.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
          const filePath = `training_record/${Date.now()}_${safeName}`
          
          const { error: uploadError } = await supabaseInternal.storage
            .from('imge')
            .upload(filePath, empData.attachment, {
              cacheControl: '3600',
              upsert: false
            })
          
          if (!uploadError) {
            const { data: publicUrlData } = supabaseInternal.storage
              .from('imge')
              .getPublicUrl(filePath)
            attachmentUrl = publicUrlData?.publicUrl || null
            console.log('Attachment uploaded:', attachmentUrl);
          } else {
            console.log('Attachment upload error:', uploadError);
          }
        } catch (uploadErr) {
          console.error('Error uploading attachment:', uploadErr)
        }
      } else if (savedRecords[key]) {
        // ถ้าบันทึกพนักงานคนนี้แล้ว ใช้ url เดิม
        attachmentUrl = savedRecords[key].attachmentUrl
      }
      
      // สร้างข้อมูลสำหรับบันทึก - รวมทุกฟิลด์
      const recordDataBase = {
        group: (row['กลุ่ม'] || '').trim() || null,
        id_tdl: (row['รหัส TDL'] || '').trim() || null,
        employee_id: (row['รหัสล้านช้าง'] || '').trim() || null,
        first_name: firstName.trim(), // ไม่มี || null ต้องมีค่า!
        last_name: lastName.trim(),   // ไม่มี || null ต้องมีค่า!
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
        attachment_url: attachmentUrl
      };
      
      console.log('Prepared record data:', recordDataBase);
      
      const username = auth.user?.fullname || auth.user?.name || auth.user?.username || 'Import'
      
      const recordDataWithCreatedBy = {
        ...recordDataBase,
        created_by: username
      };
      
      // บันทึกลงฐานข้อมูล
      let insertResult = await supabaseInternal
        .from('employee_training_records')
        .insert(recordDataWithCreatedBy)
      
      if (insertResult.error) {
        console.log('Error inserting with created_by, trying without...', JSON.stringify(insertResult.error, null, 2));
        const { error: errorWithoutCreatedBy } = await supabaseInternal
          .from('employee_training_records')
          .insert(recordDataBase);
        
        if (errorWithoutCreatedBy) {
          console.error('Error inserting record (final attempt):', JSON.stringify(errorWithoutCreatedBy, null, 2))
          failCount++
        } else {
          console.log('Successfully inserted without created_by');
          successCount++
          if (!savedRecords[key]) {
            savedRecords[key] = { attachmentUrl }
          }
        }
      } else {
        console.log('Successfully inserted with created_by');
        successCount++
        if (!savedRecords[key]) {
          savedRecords[key] = { attachmentUrl }
        }
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
      icon: '!scale-75'
    }
  })
  
  // โหลดข้อมูลใหม่
  fetchRecords()
}

// ตรวจสอบว่าเป็นหลักสูตรซ้ำหรือไม่ (สำหรับ preview)
const isPreviewDuplicateCourse = (course, employee) => {
  if (!course.course_name) return false
  
  // ค้นหาพนักงานคนนี้ใน records.value
  const existingEmployee = records.value.find(r => 
    (employee['รหัส TDL'] && r.id_tdl === employee['รหัส TDL']) ||
    (!employee['รหัส TDL'] && r.first_name === employee['ชื่อ'] && r.last_name === employee['นามสกุล'])
  )
  
  if (!existingEmployee) return false
  
  // ตรวจสอบว่ามีหลักสูตรนี้อยู่แล้วหรือไม่
  return existingEmployee.courses.some(c => 
    c.course_name && c.course_name.trim() === course.course_name.trim()
  )
}

// ลบหลักสูตรจาก preview
const removePreviewCourse = (employee, courseOriginalIndex, empIndex) => {
  // ลบ course ออกจาก importPreviewData
  importPreviewData.value.splice(courseOriginalIndex, 1)
  
  // ถ้าลบ course ที่เป็นคนสุดท้ายของพนักงานนี้ ให้ลบพนักงานนั้นออกจาก employeeAttachments ด้วย
  const remainingEmployeeRows = importPreviewData.value.filter(row => {
    const key = `${row['ชื่อ'] || ''}-${row['นามสกุล'] || ''}-${row['รหัส TDL'] || ''}`
    const employeeKey = `${employee['ชื่อ'] || ''}-${employee['นามสกุล'] || ''}-${employee['รหัส TDL'] || ''}`
    return key === employeeKey
  })
  
  if (remainingEmployeeRows.length === 0) {
    delete employeeAttachments.value[empIndex]
    // ถ้าเป็น row ที่กำลัง expand อยู่ ให้ปิด
    if (expandedPreviewRow.value === empIndex) {
      expandedPreviewRow.value = null
    }
  }
}

// จัดการไฟล์แนบสำหรับพนักงานแต่ละคน
const handlePreviewAttachmentChange = (event, empIndex) => {
  const file = event.target.files?.[0]
  if (file) {
    employeeAttachments.value[empIndex] = file
  }
}

const removePreviewAttachment = (empIndex) => {
  delete employeeAttachments.value[empIndex]
}

// ฟังก์ชันแปลงวันที่จาก Excel ให้เป็นรูปแบบ ISO YYYY-MM-DD
const parseExcelDate = (dateValue) => {
  if (!dateValue) return null;
  
  // ถ้าเป็น Date object แล้ว
  if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // ถ้าเป็น string
  const dateStr = String(dateValue).trim();
  if (!dateStr) return null;
  
  // ถ้าเป็นรูปแบบ DD/MM/YYYY หรือ DD-MM-YYYY
  const slashMatch = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const day = String(slashMatch[1]).padStart(2, '0');
    const month = String(slashMatch[2]).padStart(2, '0');
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }
  
  // ถ้าเป็นรูปแบบ YYYY-MM-DD อยู่แล้ว
  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = String(isoMatch[2]).padStart(2, '0');
    const day = String(isoMatch[3]).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // ถ้าเป็น serial number ของ Excel
  const serialNum = parseFloat(dateStr);
  if (!isNaN(serialNum) && serialNum > 0) {
    // Excel epoch is 1899-12-30, but there's a bug with leap year 1900
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + serialNum * 24 * 60 * 60 * 1000);
    
    // Adjust for the 1900 leap year bug (Excel thinks 1900 is a leap year)
    if (serialNum >= 60) {
      date.setDate(date.getDate() - 1);
    }
    
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return null;
};

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
      'กลุ่ม': 'A',
      'รหัส TDL': 'TDL001',
      'รหัสล้านช้าง': 'LXML001',
      'ชื่อ': 'สมศักดิ์',
      'นามสกุล': 'ใจดี',
      'เพศ': 'ชาย',
      'ตำแหน่ง': 'พนักงาน',
      'แผนก': 'ขาย',
      'สัญชาติ': 'ไทย',
      'สถานะ': 'สำเร็จ',
      'ชื่อหลักสูตร': 'คอร์สปลอดภัย',
      'วันที่ฝึกอบรม': '2024-01-01',
      'REหลักสูตร': '2025-01-01',
      'สถานะหลักสูตร': 'ผ่านแล้ว',
      'วันที่ตรวจสุขภาพ': '2024-01-01',
      'วันหมดอายุสุขภาพ': '2025-01-01'
    }
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
    { wch: 20 }  // วันหมดอายุสุขภาพ
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
        icon: '!scale-75'
      }
    })
    return
  }
  
  // แปลงข้อมูลให้ตรงกับรูปแบบ Template
  const exportData = []
  
  filteredRecords().forEach(record => {
    // ถ้ามีหลายหลักสูตร ให้สร้างแถวแยกกัน
    if (record.courses && record.courses.length > 0) {
      record.courses.forEach(course => {
        exportData.push({
          'กลุ่ม': record.group || '',
          'รหัส TDL': record.id_tdl || '',
          'รหัสล้านช้าง': record.employee_id || '',
          'ชื่อ': record.first_name || '',
          'นามสกุล': record.last_name || '',
          'เพศ': record.gender || '',
          'ตำแหน่ง': record.position || '',
          'แผนก': record.department || '',
          'สัญชาติ': record.nationality || '',
          'สถานะ': 'พนักงาน',
          'ชื่อหลักสูตร': course.course_name || '',
          'วันที่ฝึกอบรม': course.training_date ? formatDate(course.training_date) : '',
          'REหลักสูตร': course.re_date ? formatDate(course.re_date) : '',
          'สถานะหลักสูตร': course.status || '',
          'วันที่ตรวจสุขภาพ': record.date_health_check ? formatDate(record.date_health_check) : '',
          'วันหมดอายุสุขภาพ': record.date_health_expiry ? formatDate(record.date_health_expiry) : ''
        })
      })
    } else {
      // ถ้าไม่มีหลักสูตร ให้สร้างแถวเดียว
      exportData.push({
        'กลุ่ม': record.group || '',
        'รหัส TDL': record.id_tdl || '',
        'ชื่อ': record.first_name || '',
        'นามสกุล': record.last_name || '',
        'เพศ': record.gender || '',
        'ตำแหน่ง': record.position || '',
        'แผนก': record.department || '',
        'สัญชาติ': record.nationality || '',
        'สถานะ': 'พนักงาน',
        'ชื่อหลักสูตร': '',
        'วันที่ฝึกอบรม': '',
        'REหลักสูตร': '',
        'สถานะหลักสูตร': '',
        'วันที่ตรวจสุขภาพ': record.date_health_check ? formatDate(record.date_health_check) : '',
        'วันหมดอายุสุขภาพ': record.date_health_expiry ? formatDate(record.date_health_expiry) : ''
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
    { wch: 20 }  // วันหมดอายุสุขภาพ
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
watch(() => formData.value.id_tdl, (newVal) => {
  if (newVal && !isEditingSingleCourse.value) {
    fillEmployeeData(newVal)
  }
})
</script>

<template>
  <div class="space-y-6">

    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">บันทึกการฝึกอบรมพนักงาน</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">จัดการข้อมูลบันทึกการฝึกอบรมพนักงานทั้งหมด</p>
      </div>
      <div class="text-sm text-gray-500 dark:text-gray-400">
        รายการทั้งหมด: <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ filteredRecords().length }} รายการ</span>
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
        
        <div v-if="showDumpFileDropdown" class="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden z-10">
          <button
            @click="(e) => { e.stopPropagation(); downloadExcelTemplate(); showDumpFileDropdown = false; }"
            class="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <ArrowDownTrayIcon class="h-4 w-4 text-red-600" />
            Template
          </button>
          <button
            @click="(e) => { e.stopPropagation(); fileInputRef?.click(); showDumpFileDropdown = false; }"
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

    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10"></th>
              <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">กลุ่ม</th>
          <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัส TDL</th>
          <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัสล้านช้าง</th>
          <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
              <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เพศ</th>
              <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตำแหน่ง</th>
              <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">แผนก</th>
              <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สัญชาติ</th>
              <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
              <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ไฟล์แนบ</th>
              <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ผู้บันทึก</th>
              <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">จัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <template v-if="loading">
              <tr v-for="i in 3" :key="i" class="animate-pulse">
                <td colspan="12" class="px-3 py-4">
                  <div class="h-10 bg-gray-100 dark:bg-gray-900 rounded-lg w-full"></div>
                </td>
              </tr>
            </template>
            <tr v-else-if="filteredRecords().length === 0" class="text-center">
              <td colspan="12" class="px-3 py-12 text-gray-500 dark:text-gray-400 italic">
                ไม่พบข้อมูล
              </td>
            </tr>
            <template v-else>
              <template v-for="record in filteredRecords()" :key="record.id">
                <tr 
                  class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors group"
                >
                  <td class="px-3 py-4 whitespace-nowrap">
                    <button class="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" @click.stop="toggleExpand(record.id)">
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
                  <td class="px-3 py-4 whitespace-nowrap">
                    <div class="text-sm font-bold text-gray-900 dark:text-white">
                      {{ record.first_name }} {{ record.last_name }}
                    </div>
                  </td>
                  <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ record.gender || '-' }}
                  </td>
                  <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ record.position || '-' }}
                  </td>
                  <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ record.department || '-' }}
                  </td>
                  <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ record.nationality || '-' }}
                  </td>
                  <td class="px-3 py-4 whitespace-nowrap">
                    <span :class="[
                      'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                      record.status === 'สำเร็จ' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                      record.status === 'กำลังดำเนินการ' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' :
                      'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
                    ]">
                      {{ record.status || '-' }}
                    </span>
                  </td>
                  <td class="px-3 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                      <a
                        v-if="record.attachment_url"
                        :href="record.attachment_url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline text-xs font-medium"
                        @click.stop
                      >
                        <PaperClipIcon class="h-4 w-4" />
                        เปิดไฟล์
                      </a>
                      <span v-else class="text-xs text-gray-400">-</span>
                      
                      <button
                        v-if="!record.attachment_url"
                        @click.stop="openTableAttachmentUpload(record)"
                        :disabled="attachmentUploading && currentRecordForAttachment === record"
                        class="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                        title="เพิ่มไฟล์แนบ"
                      >
                        <PlusIcon class="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td class="px-3 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-900 dark:text-white">
                      {{ record.created_by || '-' }}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                      {{ record.created_at ? formatDate(record.created_at) : '-' }}
                    </div>
                  </td>
                  <td class="px-3 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-2">
              <button
                                @click.stop="openEditRowSidebar(record)"
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
                <!-- ส่วนขยาย แสดงหลักสูตร -->
                <tr v-if="expandedRecordId === record.id" class="bg-gray-50/30 dark:bg-gray-900/30">
                  <td colspan="12" class="px-6 py-4">
                    <div class="space-y-2">
                      <div class="flex items-center justify-between mb-3">
                        <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          หลักสูตรที่เข้าฝึก ({{ record.courses?.length || 0 }} รายการ)
                        </h4>
                        <div class="flex items-center gap-6 text-sm">
                          <div class="flex items-center gap-2">
                            <span class="font-semibold text-gray-700 dark:text-gray-300">ตรวจสุขภาพ:</span>
                            <span class="text-gray-500 dark:text-gray-400">วันที่:</span>
                            <span :class="[
                              'font-medium',
                              isHealthCheckExpired(record.date_health_expiry) ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
                            ]">{{ formatDate(record.date_health_check) || '-' }}</span>
                            <span class="text-gray-500 dark:text-gray-400 ml-3">หมดอายุ:</span>
                            <span :class="[
                              'font-medium',
                              isHealthCheckExpired(record.date_health_expiry) ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
                            ]">{{ formatDate(record.date_health_expiry) || '-' }}</span>
                          </div>
                        </div>
                      </div>
                      <div v-if="record.courses && record.courses.length > 0" class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                          <thead>
                            <tr class="bg-red-500 dark:bg-red-700 border-b border-gray-200 dark:border-gray-800">
                              <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">หลักสูตร</th>
                              <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">วันที่อบรม</th>
                              <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">สถานะ</th>
                              <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">REหลักสูตร</th>
                              <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">สถานะ RE</th>
                              <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">จัดการ</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                            <tr
                              v-for="(course, index) in record.courses"
                              :key="course.record_id || index"
                              class="bg-white dark:bg-gray-950 hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors"
                            >
                              <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">{{ course.course_name || '-' }}</td>
                              <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                {{ formatDate(course.training_date) }}
                              </td>
                              <td class="px-4 py-3">
                                <span :class="[
                                  'text-xs font-bold uppercase',
                                  course.status === 'สำเร็จ' || course.status === 'ผ่านแล้ว' ? 'text-green-600 dark:text-green-400' :
                                  'text-yellow-600 dark:text-yellow-400'
                                ]">
                                  {{ course.status === 'กำลังดำเนินการ' ? 'ยังไม่ผ่าน' : (course.status || 'ยังไม่ผ่าน') }}
                                </span>
                              </td>
                              <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                {{ course.re_date ? formatDate(course.re_date) : '-' }}
                              </td>
                              <td class="px-4 py-3">
                                <span :class="[
                                  'text-xs font-bold uppercase',
                                  course.status_re === 'Reแล้ว' ? 'text-blue-600 dark:text-blue-400' :
                                  'text-gray-500 dark:text-gray-400'
                                ]">
                                  {{ course.status_re || 'ยังไม่Re' }}
                                </span>
                              </td>
                              <td class="px-4 py-3">
                                <div class="flex items-center gap-2">
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
      
      <div class="px-4 py-4 bg-gray-50/30 dark:bg-gray-900/30 border-t border-gray-200 dark:border-gray-800">
        <p class="text-xs text-gray-500 dark:text-gray-400">
          แสดงข้อมูลทั้งหมด {{ filteredRecords().length }} รายการ
        </p>
      </div>
    </div>

    <div v-if="isSidebarOpen" class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/50" @click="closeSidebar"></div>
      <div class="absolute right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-gray-950 shadow-xl transform transition-transform duration-300 overflow-y-auto">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-950 z-10">
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">
            {{ isEditingRow ? 'แก้ไขข้อมูล' : (isEditingSingleCourse ? 'แก้ไขหลักสูตร' : (editingRecord ? 'แก้ไขบันทึก' : 'เพิ่มบันทึก')) }}
          </h3>
          <button @click="closeSidebar" class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900">
            <XMarkIcon class="h-6 w-6" />
          </button>
        </div>

        <div class="p-6 space-y-4">
          <!-- แบบฟอร์มสำหรับแก้ไข row (employee_id และ status_card) -->
          <template v-if="isEditingRow">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รหัสล้านช้าง</label>
              <input
                v-model="editingRowRecord.employee_id"
                type="text"
                class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="กรอกรหัสล้านช้าง"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">สถานะ</label>
              <select
                v-model="editingRowRecord.status_card"
                class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              >
                <option value="">เลือกสถานะ</option>
                <option value="ยังไม่ได้รับ">ยังไม่ได้รับ</option>
                <option value="ได้รับแล้ว">ได้รับแล้ว</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ตรวจสุขภาพ</label>
              <input
                v-model="editingRowRecord.date_health_check"
                type="date"
                class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">วันที่หมดอายุ</label>
              <input
                v-model="editingRowRecord.date_health_expiry"
                type="date"
                class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
          </template>

          <!-- แบบฟอร์มสำหรับแก้ไข single course -->
          <template v-else-if="isEditingSingleCourse">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ชื่อหลักสูตร</label>
              <select
                v-model="formData.courses[0].course_name"
                class="w-full px-3 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              >
                <option value="">เลือกหลักสูตร</option>
                <option v-for="c in courses" :key="c.id" :value="c.course_name">
                  {{ c.course_name }}
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">วันที่ฝึกอบรม</label>
              <input
                v-model="formData.courses[0].training_date"
                type="date"
                class="w-full px-3 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">REหลักสูตร</label>
              <input
                v-model="formData.courses[0].re_date"
                type="date"
                class="w-full px-3 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">สถานะ</label>
              <select
                v-model="formData.courses[0].status"
                class="w-full px-3 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              >
                <option value="ผ่านแล้ว">ผ่านแล้ว</option>
                <option value="ยังไม่ผ่าน">ยังไม่ผ่าน</option>
              </select>
            </div>
          </template>

          <!-- แบบฟอร์มสำหรับเพิ่ม/แก้ไขข้อมูลพนักงานทั้งหมด -->
          <template v-else>
            <!-- รหัส TDL แสดงก่อน (searchable dropdown) -->
          <div class="relative" ref="tdlDropdownRef">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รหัส TDL</label>
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

          <input v-model="formData.employee_id" type="hidden" />

          <!-- กลุ่มและเพศคู่กัน -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">กลุ่ม</label>
              <input
                v-model="formData.group"
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

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ตรวจสุขภาพ</label>
                <input
                  v-model="formData.date_health_check"
                  type="date"
                  class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">วันที่หมดอายุ</label>
                <input
                  v-model="formData.date_health_expiry"
                  type="date"
                  class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <!-- ไฟล์แนบ (รองรับทั้งไฟล์และรูปภาพ) -->
            <div class="pt-2">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ไฟล์แนบ</label>

              <!-- ยังไม่มีไฟล์ -> แสดงปุ่มเลือกไฟล์ -->
              <div v-if="!attachmentFile && !formData.attachment_url">
                <label class="flex items-center justify-center gap-2 w-full px-4 py-3 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:border-indigo-400 hover:text-indigo-600 transition-all">
                  <PaperClipIcon class="h-5 w-5" />
                  <span>เลือกไฟล์หรือรูปภาพ</span>
                  <input
                    ref="attachmentInputRef"
                    type="file"
                    class="hidden"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    @change="handleAttachmentChange"
                  />
                </label>
              </div>

              <!-- เลือกไฟล์ใหม่ไว้แล้ว (ยังไม่อัปโหลด) -->
              <div v-else-if="attachmentFile" class="flex items-center justify-between gap-3 px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/50 dark:bg-gray-900/30">
                <div class="flex items-center gap-2 min-w-0">
                  <DocumentIcon class="h-5 w-5 text-indigo-500 flex-shrink-0" />
                  <span class="text-sm text-gray-700 dark:text-gray-300 truncate">{{ attachmentFile.name }}</span>
                  <span class="text-xs text-gray-400 flex-shrink-0">(ยังไม่อัปโหลด)</span>
                </div>
                <button
                  @click="removeAttachment"
                  type="button"
                  class="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded flex-shrink-0"
                >
                  <TrashIcon class="h-4 w-4" />
                </button>
              </div>

              <!-- มี attachment_url เดิมอยู่แล้ว (ตอนแก้ไข) -->
              <div v-else-if="formData.attachment_url" class="px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/50 dark:bg-gray-900/30">
                <div class="flex items-center justify-between gap-3">
                  <a
                    :href="formData.attachment_url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center gap-2 min-w-0 text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    <PaperClipIcon class="h-5 w-5 flex-shrink-0" />
                    <span class="text-sm truncate">{{ getAttachmentFileName(formData.attachment_url) }}</span>
                  </a>
                  <button
                    @click="removeAttachment"
                    type="button"
                    class="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded flex-shrink-0"
                  >
                    <TrashIcon class="h-4 w-4" />
                  </button>
                </div>
                <img
                  v-if="isImageAttachment(formData.attachment_url)"
                  :src="formData.attachment_url"
                  class="mt-3 max-h-40 rounded-lg border border-gray-200 dark:border-gray-800"
                />
              </div>

              <p v-if="attachmentUploading" class="text-xs text-indigo-500 mt-2">กำลังอัปโหลดไฟล์แนบ...</p>
            </div>

            <!-- หลักสูตร -->
            <div v-if="!editingRecord" class="pt-4 border-t border-gray-200 dark:border-gray-800">
            <div class="flex items-center justify-between mb-3">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">หลักสูตร</label>
              <button
                v-if="!formData.courses[0]?.record_id"
                @click="addCourse"
                type="button"
                class="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-sm font-medium rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
              >
                <PlusIcon class="h-4 w-4" />
                เพิ่มหลักสูตร
              </button>
            </div>

            <div class="space-y-3">
              <div 
                v-for="(course, index) in formData.courses" 
                :key="index"
                :class="[
                  'rounded-xl p-4 transition-all',
                  isDuplicateCourse(course, index) 
                    ? 'bg-red-50/50 dark:bg-red-900/10 border-2 border-red-300 dark:border-red-800' 
                    : 'bg-gray-50/50 dark:bg-gray-900/30'
                ]"
              >
                <div class="flex items-start justify-between gap-2 mb-3">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-medium text-gray-500 dark:text-gray-400">หลักสูตร {{ index + 1 }}</span>
                    <span v-if="isDuplicateCourse(course, index)" class="text-xs text-red-600 dark:text-red-400 font-bold flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                      </svg>
                      ซ้ำแล้ว
                    </span>
                  </div>
                  <button
                    v-if="(formData.courses.length > 1 && !course.record_id) || isDuplicateCourse(course, index)"
                    @click="removeCourse(index)"
                    type="button"
                    class="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  >
                    <TrashIcon class="h-4 w-4" />
                  </button>
                </div>
                <div class="space-y-3">
                  <div>
                    <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1.5">ชื่อหลักสูตร</label>
                    <div class="relative">
                     <input
  :value="course.course_name || courseSearchQueries[index] || ''"
  @focus="() => { setCourseDropdownOpen(index, true); }"
  @input="(e) => { setCourseSearchQuery(index, e.target.value); course.course_name = ''; setCourseDropdownOpen(index, true); }"
  @blur="handleCourseDropdownBlur(index)"
  placeholder="ค้นหาหรือเลือกหลักสูตร..."
  class="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
/>
                  <button
  v-if="course.course_name || courseSearchQueries[index]"
  @mousedown.prevent="() => {
    course.course_name = '';
    setCourseSearchQuery(index, '');
  }"
  type="button"
  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                        </svg>
                      </button>
                      <div v-if="showCourseDropdowns[index]" class="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        <div
                          v-for="c in getFilteredCourses(courseSearchQueries[index])"
                          :key="c.id"
                          @mousedown.prevent="() => {
                            course.course_name = c.course_name;
                            courseSearchQueries[index] = c.course_name;
                            showCourseDropdowns[index] = false;
                          }"
                          class="px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors text-sm"
                        >
                          {{ c.course_name }}
                        </div>
                        <div v-if="getFilteredCourses(courseSearchQueries[index]).length === 0" class="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                          ไม่พบหลักสูตร
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1.5">วันที่ฝึกอบรม</label>
                    <input
                      v-model="course.training_date"
                      type="date"
                      class="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1.5">REหลักสูตร</label>
                    <input
                      v-model="course.re_date"
                      type="date"
                      class="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                  <div v-if="course.record_id">
                    <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1.5">สถานะ</label>
                    <select
                      v-model="course.status"
                      class="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    >
                      <option value="ผ่านแล้ว">ผ่านแล้ว</option>
                      <option value="ยังไม่ผ่าน">ยังไม่ผ่าน</option>
                      <option value="ไม่ผ่าน">ไม่ผ่าน</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </template>
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
              @click="isEditingRow ? saveEditRow() : saveRecord()"
              :disabled="attachmentUploading"
              class="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
            >
              {{ attachmentUploading ? 'กำลังอัปโหลด...' : (isEditingRow ? 'บันทึก' : (editingRecord ? 'บันทึกการแก้ไข' : 'เพิ่มบันทึก')) }}
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Import Preview Modal -->
    <div v-if="showImportPreview" class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/50" @click="closeImportPreview"></div>
      <div class="absolute inset-4 md:inset-8 bg-white dark:bg-gray-950 rounded-2xl shadow-xl overflow-hidden flex flex-col">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">
            ตรวจสอบข้อมูลก่อนนำเข้า ({{ importPreviewData.length }} รายการ)
          </h3>
          <button @click="closeImportPreview" class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900">
            <XMarkIcon class="h-6 w-6" />
          </button>
        </div>
        
        <div class="flex-1 overflow-auto p-6">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                  <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10"></th>
                  <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">กลุ่ม</th>
                  <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัส TDL</th>
                  <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัสล้านช้าง</th>
                  <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
                  <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เพศ</th>
                  <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตำแหน่ง</th>
                  <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">แผนก</th>
                  <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สัญชาติ</th>
                  <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
                  <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ไฟล์แนบ</th>
                  <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ผู้บันทึก</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                <template v-for="(employee, empIndex) in groupedImportPreview" :key="empIndex">
                  <tr class="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors group">
                    <td class="px-3 py-4 whitespace-nowrap">
                      <button v-if="employee.courses.length > 0" class="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" @click.stop="expandedPreviewRow = expandedPreviewRow === empIndex ? null : empIndex">
                        <ChevronRightIcon 
                          class="h-5 w-5 text-gray-400 transition-transform" 
                          :class="{ 'rotate-90': expandedPreviewRow === empIndex }" 
                        />
                      </button>
                    </td>
                    <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {{ employee['กลุ่ม'] || '-' }}
                    </td>
                    <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {{ employee['รหัส TDL'] || '-' }}
                    </td>
                    <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {{ employee['รหัสล้านช้าง'] || '-' }}
                    </td>
                    <td class="px-3 py-4 whitespace-nowrap">
                      <div class="text-sm font-bold text-gray-900 dark:text-white">
                        {{ employee['ชื่อ'] || '-' }} {{ employee['นามสกุล'] || '-' }}
                      </div>
                    </td>
                    <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {{ employee['เพศ'] || '-' }}
                    </td>
                    <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {{ employee['ตำแหน่ง'] || '-' }}
                    </td>
                    <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {{ employee['แผนก'] || '-' }}
                    </td>
                    <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {{ employee['สัญชาติ'] || '-' }}
                    </td>
                    <td class="px-3 py-4 whitespace-nowrap">
                      <span :class="[
                        'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                        employee['สถานะ'] === 'สำเร็จ' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                        employee['สถานะ'] === 'กำลังดำเนินการ' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' :
                        'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
                      ]">
                        {{ employee['สถานะ'] || '-' }}
                      </span>
                    </td>
                    <td class="px-3 py-4 whitespace-nowrap">
                      <div class="flex items-center gap-2">
                        <span v-if="employeeAttachments[empIndex]" class="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                          <PaperClipIcon class="h-4 w-4 inline mr-1" />
                          {{ employeeAttachments[empIndex].name }}
                        </span>
                        <span v-else class="text-xs text-gray-400">-</span>
                        <input 
                          type="file" 
                          :ref="el => { if (el) previewFileInputRefs[empIndex] = el }"
                          style="display: none" 
                          @change="handlePreviewAttachmentChange($event, empIndex)" 
                        />
                        <button 
                          v-if="!employeeAttachments[empIndex]"
                          @click="previewFileInputRefs[empIndex]?.click()"
                          class="p-1 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                        >
                          <ArrowUpTrayIcon class="h-4 w-4" />
                        </button>
                        <button 
                          v-else
                          @click="removePreviewAttachment(empIndex)"
                          class="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <XMarkIcon class="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                    <td class="px-3 py-4 whitespace-nowrap">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        {{ auth.user?.fullname || auth.user?.name || auth.user?.username || 'Import' }}
                      </div>
                    </td>
                  </tr>
                  <!-- ส่วนขยาย แสดงหลักสูตร -->
                  <tr v-if="expandedPreviewRow === empIndex && employee.courses.length > 0" class="bg-gray-50/30 dark:bg-gray-900/30">
                    <td colspan="12" class="px-6 py-4">
                      <div class="space-y-2">
                        <div class="flex items-center justify-between mb-3">
                          <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            หลักสูตรที่เข้าฝึก ({{ employee.courses.length }} รายการ)
                          </h4>
                          <div class="flex items-center gap-6 text-sm">
                            <div class="flex items-center gap-2">
                              <span class="font-semibold text-gray-700 dark:text-gray-300">ตรวจสุขภาพ:</span>
                              <span class="text-gray-500 dark:text-gray-400">วันที่:</span>
                              <span class="font-medium text-gray-900 dark:text-white">{{ employee['วันที่ตรวจสุขภาพ'] || '-' }}</span>
                              <span class="text-gray-500 dark:text-gray-400 ml-3">หมดอายุ:</span>
                              <span class="font-medium text-gray-900 dark:text-white">{{ employee['วันหมดอายุสุขภาพ'] || '-' }}</span>
                            </div>
                          </div>
                        </div>
                        <div v-if="employee.courses.length > 0" class="overflow-x-auto">
                          <table class="w-full text-left border-collapse">
                            <thead>
                              <tr class="bg-red-500 dark:bg-red-700 border-b border-gray-200 dark:border-gray-800">
                                <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">หลักสูตร</th>
                                <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">วันที่อบรม</th>
                                <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">สถานะ</th>
                                <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">REหลักสูตร</th>
                                <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">สถานะ RE</th>
                                <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider w-12"></th>
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
                                    : ''
                                ]"
                              >
                                <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                  <div class="flex items-center gap-2">
                                    <span v-if="isPreviewDuplicateCourse(course, employee)" class="text-red-600 dark:text-red-400">
                                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                                      </svg>
                                    </span>
                                    {{ course.course_name || '-' }}
                                  </div>
                                </td>
                                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ course.training_date || '-' }}</td>
                                <td class="px-4 py-3">
                                  <span :class="[
                                    'text-xs font-bold uppercase',
                                    course.status_courses === 'ผ่านแล้ว' || course.status_courses === 'สำเร็จ' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
                                  ]">
                                    {{ course.status_courses === 'กำลังดำเนินการ' ? 'ยังไม่ผ่าน' : (course.status_courses || 'ยังไม่ผ่าน') }}
                                  </span>
                                </td>
                                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ course.re_date || '-' }}</td>
                                <td class="px-4 py-3">
                                  <span :class="[
                                    'text-xs font-bold uppercase',
                                    'text-gray-500 dark:text-gray-400'
                                  ]">
                                    ยังไม่Re
                                  </span>
                                </td>
                                <td class="px-4 py-3 text-center">
                                  <button
                                    @click.stop="removePreviewCourse(employee, course.originalIndex, empIndex)"
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
