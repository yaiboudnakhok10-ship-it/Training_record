<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { supabaseInternal } from '../server/supabase'
import { supabaseExternal } from '../server/supabase_data'
import { useAuth } from '../stores/auth'
import { MagnifyingGlassIcon, PlusIcon, PencilSquareIcon, TrashIcon, XMarkIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, DocumentIcon } from '@heroicons/vue/24/solid'
import Swal from 'sweetalert2'
import * as XLSX from 'xlsx'

const auth = useAuth()
const accidentRetrainingRecords = ref([])
const employees = ref([])
const loading = ref(true)
const searchQuery = ref('')
const isSidebarOpen = ref(false)
const editingRecord = ref(null)
const tdlSearchQuery = ref('')
const showTdlDropdown = ref(false)
const tdlDropdownRef = ref(null)
const selectedDepartment = ref('')
const startDate = ref('')
const endDate = ref('')
const showDumpFileDropdown = ref(false)
const dumpFileDropdownRef = ref(null)
const fileInputRef = ref(null)

const uniqueDepartments = computed(() => {
  const departments = new Set()
  accidentRetrainingRecords.value.forEach(record => {
    if (record.department) {
      departments.add(record.department)
    }
  })
  return Array.from(departments).sort()
})

const filteredRecords = computed(() => {
  let filtered = accidentRetrainingRecords.value

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(record => 
      record.full_name?.toLowerCase().includes(query) ||
      record.employee_code?.toLowerCase().includes(query) ||
      record.id_lxml?.toLowerCase().includes(query) ||
      record.department?.toLowerCase().includes(query) ||
      record.retrain_date?.toLowerCase().includes(query)
    )
  }

  // Filter by selected department
  if (selectedDepartment.value) {
    filtered = filtered.filter(record => 
      record.department === selectedDepartment.value
    )
  }

  // Filter by start date
  if (startDate.value) {
    filtered = filtered.filter(record => 
      record.retrain_date && record.retrain_date >= startDate.value
    )
  }

  // Filter by end date
  if (endDate.value) {
    filtered = filtered.filter(record => 
      record.retrain_date && record.retrain_date <= endDate.value
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
  accident_detail: '',
  retrain_date: '',
  status: '',
  remark: '',
  id_lxml: ''
})

const fetchAccidentRetrainingRecords = async () => {
  try {
    loading.value = true
    const { data, error } = await supabaseInternal
      .from('accident_retraining_records')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    accidentRetrainingRecords.value = data
  } catch (error) {
    console.error('Error fetching accident retraining records:', error.message)
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
  if (dumpFileDropdownRef.value && !dumpFileDropdownRef.value.contains(event.target)) {
    showDumpFileDropdown.value = false
  }
}

const openAddSidebar = () => {
  editingRecord.value = null
  formData.value = {
    employee_code: '',
    full_name: '',
    position: '',
    department: '',
    accident_detail: '',
    retrain_date: '',
    status: '',
    remark: ''
    ,
    id_lxml: ''
  }
  tdlSearchQuery.value = ''
  isSidebarOpen.value = true
}

const openEditSidebar = (record) => {
  editingRecord.value = record
  formData.value = { ...record }
  tdlSearchQuery.value = record.full_name || record.employee_code
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
  editingRecord.value = null
  formData.value = {
    employee_code: '',
    full_name: '',
    position: '',
    department: '',
    accident_detail: '',
    retrain_date: '',
    status: '',
    remark: ''
    ,
    id_lxml: ''
  }
}

const normalizeExcelDateToISO = (value) => {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().split('T')[0]
  if (typeof value === 'number' && !isNaN(value) && value > 0) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30))
    const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000)
    if (value >= 60) date.setUTCDate(date.getUTCDate() - 1)
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const str = String(value).trim()
  if (!str) return ''

  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) return str

  const dmySlash = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmySlash) {
    const day = String(dmySlash[1]).padStart(2, '0')
    const month = String(dmySlash[2]).padStart(2, '0')
    const year = dmySlash[3]
    return `${year}-${month}-${day}`
  }

  const dmyDash = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dmyDash) {
    const day = String(dmyDash[1]).padStart(2, '0')
    const month = String(dmyDash[2]).padStart(2, '0')
    const year = dmyDash[3]
    return `${year}-${month}-${day}`
  }

  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0]
  return ''
}

const downloadExcelTemplate = () => {
  const templateData = [
    {
      'รหัสพนักงาน': 'TDL001',
      'รหัสล้านช้าง': 'LXML001',
      'ชื่อ-นามสกุล': 'สมศักดิ์ ใจดี',
      'ตำแหน่ง': 'พนักงาน',
      'แผนก': 'ขาย',
      'รายละเอียดอุบัติเหตุ': 'ลื่นล้มบริเวณคลังสินค้า',
      'วันที่ฝึกอบรม': '2026-01-01',
      'สถานะ': 'ผ่าน',
      'หมายเหตุ': 'ทบทวนการใช้อุปกรณ์ PPE'
    }
  ]

  const worksheet = XLSX.utils.json_to_sheet(templateData)
  worksheet['!cols'] = [
    { wch: 15 },
    { wch: 15 },
    { wch: 25 },
    { wch: 20 },
    { wch: 20 },
    { wch: 40 },
    { wch: 16 },
    { wch: 12 },
    { wch: 30 }
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Template')
  XLSX.writeFile(workbook, 'accident_retraining_template.xlsx')
}

const exportToExcel = () => {
  if (filteredRecords.value.length === 0) {
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

  const rows = filteredRecords.value.map(r => ({
    'รหัสพนักงาน': r.employee_code || '',
    'รหัสล้านช้าง': r.id_lxml || '',
    'ชื่อ-นามสกุล': r.full_name || '',
    'ตำแหน่ง': r.position || '',
    'แผนก': r.department || '',
    'รายละเอียดอุบัติเหตุ': r.accident_detail || '',
    'วันที่ฝึกอบรม': r.retrain_date || '',
    'สถานะ': r.status || '',
    'หมายเหตุ': r.remark || ''
  }))

  const worksheet = XLSX.utils.json_to_sheet(rows)
  worksheet['!cols'] = [
    { wch: 15 },
    { wch: 15 },
    { wch: 25 },
    { wch: 20 },
    { wch: 20 },
    { wch: 40 },
    { wch: 16 },
    { wch: 12 },
    { wch: 30 }
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Records')
  const dateStr = new Date().toISOString().split('T')[0]
  XLSX.writeFile(workbook, `accident_retraining_records_${dateStr}.xlsx`)
}

const importFromExcel = (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    ;(async () => {
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

        const getValue = (row, keys) => {
          for (const k of keys) {
            const v = row?.[k]
            if (v === 0) return 0
            if (v !== undefined && v !== null && String(v).trim() !== '') return v
          }
          return ''
        }

        const getEmployeeFullName = (emp) => {
          if (!emp) return ''
          if (emp.fullname) return emp.fullname
          return `${emp.firstname || ''} ${emp.lastname || ''}`.trim()
        }

        const findEmployee = (employeeCode, idLxml) =>
          employees.value.find(emp => (employeeCode && emp.employee_code === employeeCode) || (idLxml && emp.id_lxml === idLxml))

        const toInsert = []
        const errors = []
        const duplicates = []
        const seen = new Set()

        jsonData.forEach((row, idx) => {
          const rowNo = idx + 2
          const rawEmployeeCode = String(getValue(row, ['รหัสพนักงาน', 'รหัส TDL', 'employee_code', 'id_tdl'])).trim()
          const rawIdLxml = String(getValue(row, ['รหัสล้านช้าง', 'id_lxml', 'employee_id'])).trim()
          const rawFullName = String(getValue(row, ['ชื่อ-นามสกุล', 'fullname', 'full_name'])).trim()
          const rawPosition = String(getValue(row, ['ตำแหน่ง', 'position'])).trim()
          const rawDepartment = String(getValue(row, ['แผนก', 'department'])).trim()
          const rawAccidentDetail = String(getValue(row, ['รายละเอียดอุบัติเหตุ', 'accident_detail'])).trim()
          const rawRetrainDate = getValue(row, ['วันที่ฝึกอบรม', 'retrain_date', 'training_date', 'วันที่อบรม'])
          const rawStatus = String(getValue(row, ['สถานะ', 'status'])).trim()
          const rawRemark = String(getValue(row, ['หมายเหตุ', 'remark'])).trim()

          const employee = findEmployee(rawEmployeeCode, rawIdLxml)
          const employeeCode = rawEmployeeCode || employee?.employee_code || ''
          const idLxml = rawIdLxml || employee?.id_lxml || ''
          const fullName = rawFullName || getEmployeeFullName(employee)
          const position = rawPosition || employee?.position || ''
          const department = rawDepartment || employee?.department || ''
          const retrainDate = normalizeExcelDateToISO(rawRetrainDate)

          if (!employeeCode) {
            errors.push(`แถว ${rowNo}: ไม่พบ "รหัสพนักงาน" หรือจับคู่พนักงานไม่ได้`)
            return
          }
          if (!retrainDate) {
            errors.push(`แถว ${rowNo}: รูปแบบ "วันที่ฝึกอบรม" ไม่ถูกต้อง`)
            return
          }
          if (!rawStatus) {
            errors.push(`แถว ${rowNo}: กรุณาระบุ "สถานะ" (ผ่าน/ไม่ผ่าน)`)
            return
          }

          const key = `${employeeCode}__${retrainDate}`
          if (seen.has(key)) {
            duplicates.push(`แถว ${rowNo}: ข้อมูลซ้ำในไฟล์ (รหัส ${employeeCode}, วันที่ ${retrainDate})`)
            return
          }

          const hasExisting = accidentRetrainingRecords.value.some(r => r.employee_code === employeeCode && r.retrain_date === retrainDate)
          if (hasExisting) {
            duplicates.push(`แถว ${rowNo}: ข้อมูลซ้ำในระบบ (รหัส ${employeeCode}, วันที่ ${retrainDate})`)
            return
          }

          seen.add(key)
          toInsert.push({
            employee_code: employeeCode,
            id_lxml: idLxml,
            full_name: fullName,
            position,
            department,
            accident_detail: rawAccidentDetail,
            retrain_date: retrainDate,
            status: rawStatus,
            remark: rawRemark,
            created_by: auth.user?.fullname || 'Unknown'
          })
        })

        if (errors.length > 0) {
          const html = `<div style="text-align:left">${errors.slice(0, 12).map(e2 => `<div>• ${e2}</div>`).join('')}${errors.length > 12 ? `<div>…และอีก ${errors.length - 12} รายการ</div>` : ''}</div>`
          Swal.fire({
            title: 'นำเข้าไม่สำเร็จ',
            html,
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

        if (toInsert.length === 0) {
          Swal.fire({
            title: 'ไม่มีรายการนำเข้า',
            text: duplicates.length > 0 ? 'ไฟล์มีแต่ข้อมูลซ้ำกับระบบหรือซ้ำกันเอง' : 'ไม่พบข้อมูลที่นำเข้าได้',
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

        Swal.fire({
          title: 'กำลังนำเข้า...',
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
          customClass: {
            popup: '!p-3 !max-w-md',
            title: '!text-base',
            htmlContainer: '!text-xs',
            confirmButton: '!px-3 !py-1.5 !text-xs',
            icon: '!scale-75'
          }
        })

        const { error } = await supabaseInternal
          .from('accident_retraining_records')
          .insert(toInsert)

        if (error) throw error

        await fetchAccidentRetrainingRecords()

        const dupText = duplicates.length > 0 ? ` (ข้ามข้อมูลซ้ำ ${duplicates.length} แถว)` : ''
        Swal.fire({
          title: 'นำเข้าสำเร็จ!',
          text: `นำเข้าข้อมูล ${toInsert.length} รายการ${dupText}`,
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
        console.error('Error importing Excel:', error)
        Swal.fire({
          title: 'ข้อผิดพลาด',
          text: 'เกิดข้อผิดพลาดในการนำเข้าไฟล์ Excel',
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
        event.target.value = ''
      }
    })()
  }

  reader.readAsArrayBuffer(file)
}

const saveRecord = async () => {
  if (!formData.value.employee_code.trim() || !formData.value.retrain_date || !formData.value.status.trim()) {
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
    // Check for duplicate entry (same employee and same retrain_date)
    const duplicateCheck = accidentRetrainingRecords.value.find(record => 
      record.employee_code === formData.value.employee_code.trim() && 
      record.retrain_date === formData.value.retrain_date && 
      record.id !== (editingRecord.value?.id || '')
    )

    if (duplicateCheck) {
      Swal.fire({
        title: 'แจ้งเตือน!',
        text: `พนักงาน ${formData.value.full_name} มีบันทึกการฝึกอบรมวันที่ ${new Date(formData.value.retrain_date).toLocaleDateString('en-GB')} แล้ว`,
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

    if (editingRecord.value) {
      const { error } = await supabaseInternal
        .from('accident_retraining_records')
        .update({
          employee_code: formData.value.employee_code.trim(),
          id_lxml: formData.value.id_lxml.trim(),
          full_name: formData.value.full_name.trim(),
          position: formData.value.position.trim(),
          department: formData.value.department.trim(),
          accident_detail: formData.value.accident_detail.trim(),
          retrain_date: formData.value.retrain_date,
          status: formData.value.status.trim(),
          remark: formData.value.remark.trim(),
          updated_by: auth.user?.fullname || 'Unknown',
          updated_at: new Date().toISOString()
        })
        .eq('id', editingRecord.value.id)

      if (error) throw error
    } else {
      const { error } = await supabaseInternal
        .from('accident_retraining_records')
        .insert({
          employee_code: formData.value.employee_code.trim(),
          id_lxml: formData.value.id_lxml.trim(),
          full_name: formData.value.full_name.trim(),
          position: formData.value.position.trim(),
          department: formData.value.department.trim(),
          accident_detail: formData.value.accident_detail.trim(),
          retrain_date: formData.value.retrain_date,
          status: formData.value.status.trim(),
          remark: formData.value.remark.trim(),
          created_by: auth.user?.fullname || 'Unknown'
        })

      if (error) throw error
    }

    closeSidebar()
    fetchAccidentRetrainingRecords()
    
    Swal.fire({
      title: 'บันทึกสำเร็จ!',
      text: 'บันทึกข้อมูลอุบัติเหตุและการฝึกอบรมเรียบร้อยแล้ว',
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
    console.error('Error saving record:', error.message)
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

const deleteRecord = async (record) => {
  const result = await Swal.fire({
    title: 'คุณแน่ใจหรือไม่?',
    text: `คุณต้องการลบข้อมูลของ "${record.full_name}" ใช่หรือไม่?`,
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
        .from('accident_retraining_records')
        .delete()
        .eq('id', record.id)

      if (error) throw error
      fetchAccidentRetrainingRecords()
      
      Swal.fire({
        title: 'ลบสำเร็จ!',
        text: 'ลบข้อมูลอุบัติเหตุและการฝึกอบรมเรียบร้อยแล้ว',
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

onMounted(() => {
  fetchAccidentRetrainingRecords()
  fetchEmployees()
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
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">บันทึกอุบัติเหตุและการฝึกอบรม</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">จัดการข้อมูลอุบัติเหตุและการฝึกอบรมพนักงาน</p>
      </div>
      <div class="text-sm text-gray-500 dark:text-gray-400">
        รายการทั้งหมด: <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ filteredRecords.length }}</span>
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
          @click="exportToExcel"
          class="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
        >
          <ArrowDownTrayIcon class="h-5 w-5" />
          Export
        </button>
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
        <button
          @click="openAddSidebar"
          class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
        >
          <PlusIcon class="h-5 w-5" />
          เพิ่มรายการ
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
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รายละเอียดอุบัติเหตุ</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">วันที่ฝึกอบรม</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">หมายเหตุ</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ผู้สร้าง / วันที่</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">จัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <template v-if="loading">
              <tr v-for="i in 3" :key="i" class="animate-pulse">
                <td colspan="11" class="px-6 py-4">
                  <div class="h-10 bg-gray-100 dark:bg-gray-900 rounded-lg w-full"></div>
                </td>
              </tr>
            </template>
            <tr v-else-if="filteredRecords.length === 0" class="text-center">
              <td colspan="11" class="px-6 py-12 text-gray-500 dark:text-gray-400 italic">
                ไม่พบข้อมูลอุบัติเหตุและการฝึกอบรม
              </td>
            </tr>
            <tr 
              v-for="record in filteredRecords" 
              :key="record.id"
              class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors group"
            >
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                {{ record.employee_code }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                {{ record.id_lxml || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-bold">
                {{ record.full_name }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ record.position || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ record.department || '-' }}
              </td>
              <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                {{ record.accident_detail || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {{ record.retrain_date ? new Date(record.retrain_date).toLocaleDateString('en-GB') : '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span :class="record.status === 'ผ่าน' ? 'text-green-600 font-bold' : 'text-red-600 font-bold'">
                  {{ record.status || '-' }}
                </span>
              </td>
              <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                {{ record.remark || '-' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  {{ record.created_by || '-' }}
                </div>
                <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {{ record.created_at ? new Date(record.created_at).toLocaleDateString('en-GB') + ' ' + new Date(record.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-' }}
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center gap-2">
                  <button
                    @click="openEditSidebar(record)"
                    class="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                  >
                    <PencilSquareIcon class="h-4 w-4" />
                  </button>
                  <button
                    @click="deleteRecord(record)"
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
          แสดงข้อมูลอุบัติเหตุและการฝึกอบรมทั้งหมด {{ filteredRecords.length }} รายการ
        </p>
      </div>
    </div>

    <div v-if="isSidebarOpen" class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/50" @click="closeSidebar"></div>
      <div class="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-950 shadow-xl transform transition-transform duration-300">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">
            {{ editingRecord ? 'แก้ไขรายการ' : 'เพิ่มรายการ' }}
          </h3>
          <button @click="closeSidebar" class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900">
            <XMarkIcon class="h-6 w-6" />
          </button>
        </div>

        <div class="p-6 pb-24 space-y-4 overflow-y-auto max-h-[calc(100vh-80px)]">
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
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รายละเอียดอุบัติเหตุ</label>
            <textarea
              v-model="formData.accident_detail"
              rows="3"
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="รายละเอียดอุบัติเหตุ"
            ></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">วันที่ฝึกอบรม</label>
            <input
              v-model="formData.retrain_date"
              type="date"
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">สถานะ</label>
            <select
              v-model="formData.status"
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              <option value="">เลือกสถานะ</option>
              <option value="ผ่าน">ผ่าน</option>
              <option value="ไม่ผ่าน">ไม่ผ่าน</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">หมายเหตุ</label>
            <textarea
              v-model="formData.remark"
              rows="3"
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="หมายเหตุ"
            ></textarea>
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
              @click="saveRecord"
              class="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
            >
              {{ editingRecord ? 'บันทึกการแก้ไข' : 'บันทึก' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
