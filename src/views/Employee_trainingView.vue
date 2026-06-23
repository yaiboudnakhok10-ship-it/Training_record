<script setup>
import { ref, onMounted, watch, computed, onUnmounted } from 'vue'
import { supabaseInternal } from '../server/supabase'
import { supabaseExternal } from '../server/supabase_data'
import { useAuth } from '../stores/auth'
import { MagnifyingGlassIcon, PlusIcon, PencilIcon, PencilSquareIcon, TrashIcon, XMarkIcon, ChevronDownIcon, ChevronRightIcon, HeartIcon, PaperClipIcon, DocumentIcon } from '@heroicons/vue/24/outline'
import Swal from 'sweetalert2'

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

// อัปโหลดไฟล์แนบ
const attachmentFile = ref(null) // ไฟล์ที่เลือกไว้ (ยังไม่อัปโหลด)
const attachmentUploading = ref(false)
const attachmentInputRef = ref(null)

// คอมพิวท์สำหรับกรองพนักงานตามคำค้นหา
const filteredEmployees = computed(() => {
  if (!tdlSearchQuery.value) return employees.value
  const query = tdlSearchQuery.value.toLowerCase()
  return employees.value.filter(emp => 
    emp.employee_code?.toLowerCase().includes(query) ||
    emp.fullname?.toLowerCase().includes(query) ||
    emp.firstname?.toLowerCase().includes(query) ||
    emp.lastname?.toLowerCase().includes(query)
  )
})

const formData = ref({
  group: '',
  id_tdl: '',
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

// ฟังก์ชันเติมข้อมูลพนักงานอัตโนมัติเมื่อเลือกรหัส TDL
const fillEmployeeData = (tdlCode) => {
  const employee = employees.value.find(emp => emp.employee_code === tdlCode)
  console.log('fillEmployeeData called with tdlCode:', tdlCode)
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
    formData.value.employee_id = employee.employee_code || ''
    formData.value.gender = employee.gender || ''
    formData.value.nationality = employee.nationality || ''
    
    console.log('Employee status from DB:', employee.status)
    
    // ใช้ค่าสถานะจากฐานข้อมูลตรงๆ เลย
    formData.value.status = employee.status || ''
    
    console.log('Set formData.status to:', formData.value.status)
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
    
    // จัดกลุ่มข้อมูลตามพนักงาน
    const grouped = {}
    remainingData.forEach(record => {
      const key = `${record.first_name}-${record.last_name}-${record.employee_id || record.id_tdl || 'no-id'}`
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
    record.department?.toLowerCase().includes(query)
  )
}

const openAddSidebar = () => {
  editingRecord.value = null
  tdlSearchQuery.value = ''
  fullNameInput.value = ''
  attachmentFile.value = null
  formData.value = {
    group: '',
    id_tdl: '',
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
  formData.value = {
    group: record.group || '',
    id_tdl: record.id_tdl || '',
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
    courses: course 
      ? [{ course_name: course.course_name, training_date: course.training_date, re_date: course.re_date, status_re: course.status_re, record_id: course.record_id, status: course.status }]
      : (record.courses && record.courses.length > 0 
        ? record.courses.map(c => ({ course_name: c.course_name, training_date: c.training_date, re_date: c.re_date, status_re: c.status_re, status: c.status }))
        : [{ course_name: '', training_date: '', re_date: '', status_re: '', status: '' }])
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
    // Update all records for this employee
    let query = supabaseInternal
      .from('employee_training_records')
      .update({
        employee_id: editingRowRecord.value.employee_id || null,
        status_card: editingRowRecord.value.status_card,
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
    
    const { data, error } = await query.select()
    
    console.log('Update result:', data, error)
    
    if (error) throw error
    
    closeSidebar()
    fetchRecords()
    Swal.fire({
      title: 'บันทึกสำเร็จ!',
      text: 'บันทึกข้อมูลเรียบร้อยแล้ว',
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
  formData.value = {
    group: '',
    id_tdl: '',
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
}

const removeCourse = (index) => {
  if (formData.value.courses.length > 1) {
    formData.value.courses.splice(index, 1)
  }
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
  // ตรวจสอบเฉพาะเมื่อไม่ใช่การแก้ไข单个 course
  if (!isEditingSingleCourse.value) {
    // อัปเดต first_name และ last_name ก่อนบันทึก
    updateNameFromInput()

    const missingFields = validateForm()
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
        gender: formData.value.gender.trim() || null,
        nationality: formData.value.nationality.trim() || null,
        employee_id: formData.value.employee_id || null,
        status: formData.value.status || null,
        status_card: formData.value.status_card || null,
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
      
      if (validCourses.length === 0) {
        // ถ้าไม่มี course ให้เพิ่มแค่ข้อมูลพนักงาน
        const dataToInsertBase = {
            group: formData.value.group.trim() || null,
            id_tdl: formData.value.id_tdl.trim() || null,
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
            course_name: null,
            training_date: null
          };
        const dataToInsertWithCreatedBy = {
            ...dataToInsertBase,
            created_by: username
        };
        let { error } = await supabaseInternal
          .from('employee_training_records')
          .insert(dataToInsertWithCreatedBy);
        
        // If error, try without created_by
        if (error) {
            console.log('Error inserting with created_by, trying without...', error);
            const { error: errorWithoutCreatedBy } = await supabaseInternal
                .from('employee_training_records')
                .insert(dataToInsertBase);
            if (errorWithoutCreatedBy) throw errorWithoutCreatedBy;
        }
      } else {
        // เพิ่มทุก course
        for (const course of validCourses) {
            const dataToInsertBase = {
              group: formData.value.group.trim() || null,
              id_tdl: formData.value.id_tdl.trim() || null,
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
              status_courses: course.status || 'ยังไม่ผ่าน',
              course_name: course.course_name,
              training_date: course.training_date || null,
              re_date: course.re_date || null,
              status_re: course.status_re || null
            };
            const dataToInsertWithCreatedBy = {
                ...dataToInsertBase,
                created_by: username
            };
          let { error } = await supabaseInternal
            .from('employee_training_records')
            .insert(dataToInsertWithCreatedBy);
          
          // If error, try without created_by
          if (error) {
              console.log('Error inserting course with created_by, trying without...', error);
              const { error: errorWithoutCreatedBy } = await supabaseInternal
                  .from('employee_training_records')
                  .insert(dataToInsertBase);
              if (errorWithoutCreatedBy) throw errorWithoutCreatedBy;
          }
        }
      }
    }

    closeSidebar()
    fetchRecords()
    Swal.fire({
      title: 'บันทึกสำเร็จ!',
      text: 'บันทึกข้อมูลเรียบร้อยแล้ว',
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

      <button
        @click="openAddSidebar"
        class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
      >
        <PlusIcon class="h-5 w-5" />
        เพิ่มบันทึก
      </button>
    </div>

    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10"></th>
              <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">กลุ่ม</th>
              <th class="px-3 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัส TDL</th>
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
              placeholder="ค้นหารหัสล้านช้าง..."
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
                class="bg-gray-50/50 dark:bg-gray-900/30 rounded-xl p-4"
              >
                <div class="flex items-start justify-between gap-2 mb-3">
                  <span class="text-xs font-medium text-gray-500 dark:text-gray-400">หลักสูตร {{ index + 1 }}</span>
                  <button
                    v-if="formData.courses.length > 1 && !course.record_id"
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
                    <select
                      v-model="course.course_name"
                      class="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    >
                      <option value="">เลือกหลักสูตร</option>
                      <option v-for="c in courses" :key="c.id" :value="c.course_name">
                        {{ c.course_name }}
                      </option>
                    </select>
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
  </div>
</template>

