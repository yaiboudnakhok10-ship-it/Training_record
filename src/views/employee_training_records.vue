<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabaseInternal } from '../server/supabase'
import { MagnifyingGlassIcon, PencilSquareIcon, TrashIcon, EllipsisVerticalIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import Swal from 'sweetalert2'

const router = useRouter()

const searchQuery = ref('') // ช่องค้นหาเดียว
const allData = ref([]) // เก็บข้อมูลทั้งหมด
const results = ref([])
const loading = ref(false)
const openDropdownId = ref(null)
const editingCourse = ref(null)
const isEditingCourse = ref(false)
const courseFormData = ref({
  course_name: '',
  training_date: '',
  re_date: '',
  status_re: '',
  status: '',
  record_id: null
})

const autoCheckReDate = async (record, course) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const reDate = course.re_date ? new Date(course.re_date) : null
  if (reDate) {
    reDate.setHours(0, 0, 0, 0)
  }
  
  // ตรวจสอบทั้ง re_status === 'Reแล้ว' และ re_date <= วันนี้ (ถ้ามี)
  const shouldArchive = course.status_re === 'Reแล้ว' || (reDate && reDate <= today)
  
  if (shouldArchive) {
    try {
      console.log('Auto-archiving course:', course.course_name, 'for record:', course.record_id)
      console.log('Reason:', course.status_re === 'Reแล้ว' ? 'Status is Reแล้ว' : 'Re date is today or past')
      
      // 1. ดึงข้อมูลเต็มจาก employee_training_records
      const { data: originalData, error: fetchError } = await supabaseInternal
        .from('employee_training_records')
        .select('*')
        .eq('id', course.record_id)
        .single()
      
      if (fetchError) throw fetchError
      
      console.log('Original data for auto-archive:', originalData)
      
      // 2. เตรียมข้อมูลสำหรับ re_courses (ใช้ originalData)
      const fullName = originalData.first_name && originalData.last_name 
        ? `${originalData.first_name} ${originalData.last_name}` 
        : originalData.first_name || originalData.last_name || ''
      
      const reCourseData = {
        group_name: originalData.group,
        tdl_code: originalData.id_tdl,
        full_name: fullName,
        gender: originalData.gender,
        position: originalData.position,
        department: originalData.department,
        nationality: originalData.nationality,
        status: originalData.status,
        course_name: originalData.course_name,
        training_date: originalData.training_date,
        re_date: originalData.re_date,
        re_status: 'Reแล้ว'
      }
      
      console.log('Inserting auto-archive data:', reCourseData)
      
      // 3. บันทึกลง re_courses
      const { data: insertedData, error: insertError } = await supabaseInternal
        .from('re_courses')
        .insert(reCourseData)
        .select()
      
      if (insertError) throw insertError
      
      console.log('Auto-archived successfully:', insertedData)
      
      // 4. ลบข้อมูลออกจาก employee_training_records
      const { error: deleteError } = await supabaseInternal
        .from('employee_training_records')
        .delete()
        .eq('id', course.record_id)
      
      if (deleteError) throw deleteError
      
    } catch (error) {
      console.error('Error auto-archiving course:', error)
    }
  }
}

const fetchAllData = async () => {
  try {
    console.log('Fetching data from employee_training_records...')
    const { data, error } = await supabaseInternal
      .from('employee_training_records')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Supabase error:', error)
      throw error
    }
    
    console.log('Raw data from database:', data)
    
    // จัดกลุ่มข้อมูลเหมือน Employee_trainingView.vue
    const grouped = {}
    data.forEach(record => {
      const key = `${record.first_name}-${record.last_name}-${record.employee_id || record.id_tdl || 'no-id'}`
      if (!grouped[key]) {
        grouped[key] = {
          id: record.id,
          record_ids: [record.id],
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
          created_by: record.created_by,
          created_at: record.created_at,
          courses: []
        }
      } else {
        grouped[key].record_ids.push(record.id)
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
    
    console.log('Grouped data:', Object.values(grouped))
    allData.value = Object.values(grouped)
    results.value = [] // ไม่แสดงข้อมูลจนกว่าจะค้นหา
    
    // ตรวจสอบวันที่ re_date อัตโนมัติ
    for (const record of allData.value) {
      for (const course of record.courses) {
        await autoCheckReDate(record, course)
      }
    }
    
    // Refresh อีกครั้งถ้ามีข้อมูลถูกย้าย
    if (allData.value.some(r => r.courses.some(c => c.re_date))) {
      const { data: newData } = await supabaseInternal
        .from('employee_training_records')
        .select('*')
        .order('created_at', { ascending: false })
      
      const newGrouped = {}
      newData.forEach(record => {
        const key = `${record.first_name}-${record.last_name}-${record.employee_id || record.id_tdl || 'no-id'}`
        if (!newGrouped[key]) {
          newGrouped[key] = {
            id: record.id,
            record_ids: [record.id],
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
            created_by: record.created_by,
            created_at: record.created_at,
            courses: []
          }
        } else {
          newGrouped[key].record_ids.push(record.id)
        }
        if (record.course_name || record.training_date) {
          newGrouped[key].courses.push({
            course_name: record.course_name,
            training_date: record.training_date,
            re_date: record.re_date,
            status_re: record.status_re,
            record_id: record.id,
            status: record.status_courses || record.status
          })
        }
      })
      
      allData.value = Object.values(newGrouped)
      results.value = []
    }
  } catch (error) {
    console.error('Error fetching data:', error.message)
  }
}

const searchData = async () => {
  console.log('searchData called with query:', searchQuery.value)
  loading.value = true
  
  // ถ้ายังไม่ได้โหลดข้อมูล ให้โหลดก่อน
  if (allData.value.length === 0) {
    console.log('allData is empty, fetching...')
    await fetchAllData()
  }
  
  console.log('allData:', allData.value)
  
  // ถ้าไม่มีอะไรใส่ก็แสดงว่าง
  const query = (searchQuery.value || '').trim()
  if (!query) {
    results.value = []
    loading.value = false
    return
  }
  
  // ค้นหา (ตรงกันที่ไหนก็ได้)
  const searchLower = query.toLowerCase()
  console.log('Searching for:', searchLower)
  const filtered = allData.value.filter(record => {
    const matches = (
      (record.employee_id || '').toLowerCase().includes(searchLower) ||
      (record.id_tdl || '').toLowerCase().includes(searchLower) ||
      (record.first_name || '').toLowerCase().includes(searchLower) ||
      (record.last_name || '').toLowerCase().includes(searchLower)
    )
    console.log('Checking record:', { employee_id: record.employee_id, id_tdl: record.id_tdl, first_name: record.first_name, last_name: record.last_name }, 'matches:', matches)
    return matches
  })
  
  console.log('Filtered results:', filtered)
  results.value = filtered
  loading.value = false
}

const clearSearch = () => {
  searchQuery.value = ''
  results.value = []
}

const toggleDropdown = (e, id) => {
  e.stopPropagation()
  openDropdownId.value = openDropdownId.value === id ? null : id
}

const openEditCourse = (course) => {
  editingCourse.value = course
  courseFormData.value = {
    course_name: course.course_name || '',
    training_date: course.training_date || '',
    re_date: course.re_date || '',
    status_re: course.status_re || '',
    status: course.status || '',
    record_id: course.record_id
  }
  isEditingCourse.value = true
}

const saveCourse = async () => {
  try {
    loading.value = true
    const { error } = await supabaseInternal
      .from('employee_training_records')
      .update({
        course_name: courseFormData.value.course_name,
        training_date: courseFormData.value.training_date,
        re_date: courseFormData.value.re_date,
        status_re: courseFormData.value.status_re,
        status_courses: courseFormData.value.status
      })
      .eq('id', courseFormData.value.record_id)
    
    if (error) throw error
    
    Swal.fire({
      title: 'บันทึกสำเร็จ!',
      text: 'ข้อมูลหลักสูตรถูกบันทึกเรียบร้อยแล้ว',
      icon: 'success',
      customClass: {
        popup: '!p-3 !max-w-md',
        title: '!text-base',
        htmlContainer: '!text-xs',
        confirmButton: '!px-3 !py-1.5 !text-xs',
        icon: '!scale-75'
      }
    })
    
    // Refresh data and search results
    await fetchAllData()
    if ((searchQuery.value || '').trim()) {
      await searchData()
    }
    cancelEditCourse()
  } catch (error) {
    console.error('Error saving course:', error.message)
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
  } finally {
    loading.value = false
  }
}

const cancelEditCourse = () => {
  editingCourse.value = null
  isEditingCourse.value = false
  courseFormData.value = {
    course_name: '',
    training_date: '',
    re_date: '',
    status: '',
    record_id: null
  }
}

const deleteRecord = async (record) => {
  const result = await Swal.fire({
    title: 'คุณแน่ใจหรือไม่?',
    text: `คุณต้องการลบข้อมูล "${record.first_name || ''} ${record.last_name || ''}" ใช่หรือไม่?`,
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
      
      // Refresh data and search results
      await fetchAllData()
      if ((searchQuery.value || '').trim()) {
        await searchData()
      }
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

const saveStatusRe = async (course, record) => {
  const result = await Swal.fire({
    title: 'บันทึก REหลักสูตร',
    text: 'คุณต้องการบันทึก REหลักสูตรใช่หรือไม่?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    confirmButtonText: 'ใช่, บันทึก!',
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
      loading.value = true
      
      // 1. ดึงข้อมูลเต็มจาก employee_training_records
      console.log('Fetching original data for record:', course.record_id)
      const { data: originalData, error: fetchError } = await supabaseInternal
        .from('employee_training_records')
        .select('*')
        .eq('id', course.record_id)
        .single()
      
      if (fetchError) {
        console.error('Fetch error:', fetchError)
        throw fetchError
      }
      
      console.log('Original data:', originalData)
      
      // 2. เตรียมข้อมูลสำหรับ re_courses (ใช้ originalData แทน record)
      const fullName = originalData.first_name && originalData.last_name 
        ? `${originalData.first_name} ${originalData.last_name}` 
        : originalData.first_name || originalData.last_name || ''
      
      const reCourseData = {
        group_name: originalData.group,
        tdl_code: originalData.id_tdl,
        full_name: fullName,
        gender: originalData.gender,
        position: originalData.position,
        department: originalData.department,
        nationality: originalData.nationality,
        status: originalData.status,
        course_name: originalData.course_name,
        training_date: originalData.training_date,
        re_date: originalData.re_date,
        re_status: 'Reแล้ว'
      }
      
      console.log('Inserting into re_courses:', reCourseData)
      
      // 3. บันทึกลง re_courses
      const { data: insertedData, error: insertError } = await supabaseInternal
        .from('re_courses')
        .insert(reCourseData)
        .select()
      
      if (insertError) {
        console.error('Insert error:', insertError)
        throw insertError
      }
      
      console.log('Inserted successfully:', insertedData)
      
      // 4. ลบข้อมูลออกจาก employee_training_records
      const { error: deleteError } = await supabaseInternal
        .from('employee_training_records')
        .delete()
        .eq('id', course.record_id)
      
      if (deleteError) {
        console.error('Delete error:', deleteError)
        throw deleteError
      }
      
      Swal.fire({
        title: 'บันทึกสำเร็จ!',
        text: 'บันทึก REหลักสูตรเรียบร้อยแล้ว',
        icon: 'success',
        customClass: {
          popup: '!p-3 !max-w-md',
          title: '!text-base',
          htmlContainer: '!text-xs',
          confirmButton: '!px-3 !py-1.5 !text-xs',
          icon: '!scale-75'
        }
      })
      
      // Refresh data and search results
      await fetchAllData()
      if ((searchQuery.value || '').trim()) {
        await searchData()
      }
    } catch (error) {
      console.error('Error saving status_re:', error)
      Swal.fire({
        title: 'เกิดข้อผิดพลาด!',
        text: 'เกิดข้อผิดพลาดในการบันทึก: ' + (error.message || JSON.stringify(error)),
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
      loading.value = false
    }
  }
}

const deleteCourse = async (course) => {
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
      
      // Refresh data and search results
      await fetchAllData()
      if ((searchQuery.value || '').trim()) {
        await searchData()
      }
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

const handleClickOutside = () => {
  openDropdownId.value = null
}

onMounted(() => {
  fetchAllData()
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
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">สรุปข้อมูลการอบรม</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">ค้นหาข้อมูลพนักงานและหลักสูตร</p>
      </div>
    </div>

    <!-- Search Section -->
    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ค้นหา</label>
        <div class="relative">
          <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon class="h-5 w-5 text-gray-400" />
          </span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="ค้นหา: รหัสล้านช้าง, ชื่อ, นามสกุล..."
            class="block w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            @keyup.enter="searchData"
          />
        </div>
      </div>
      <div class="flex gap-3">
        <button
          @click="searchData"
          class="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
        >
          <MagnifyingGlassIcon class="h-5 w-5" />
          ค้นหา
        </button>
        <button
          @click="clearSearch"
          class="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl transition-all"
        >
          ล้าง
        </button>
      </div>
    </div>

    <!-- Results -->
    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div v-if="loading" class="p-12 text-center">
        <div class="animate-pulse text-gray-500 dark:text-gray-400">กำลังโหลด...</div>
      </div>
      <div v-else-if="!(searchQuery.value || '').trim() && results.length === 0" class="p-12 text-center">
        <p class="text-gray-500 dark:text-gray-400 italic">กรุณาค้นหาข้อมูล</p>
      </div>
      <div v-else-if="results.length === 0" class="p-12 text-center">
        <p class="text-gray-500 dark:text-gray-400 italic">ไม่พบข้อมูล</p>
      </div>
      <div v-else class="divide-y divide-gray-200 dark:divide-gray-800">
        <div v-for="record in results" :key="record.id" class="p-6">
          <!-- Employee Info -->
          <div class="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <h3 class="text-lg font-bold text-gray-900 dark:text-white">
                {{ record.first_name || '' }} {{ record.last_name || '' }}
              </h3>
              <div class="mt-1 flex flex-wrap gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span v-if="record.employee_id">รหัสล้านช้าง: {{ record.employee_id }}</span>
                <span v-if="record.id_tdl">รหัส TDL: {{ record.id_tdl }}</span>
                <span v-if="record.position">ตำแหน่ง: {{ record.position }}</span>
                <span v-if="record.department">แผนก: {{ record.department }}</span>
              </div>
            </div>
            <div class="flex gap-2 items-center">
              <span v-if="record.status" :class="[
                'px-3 py-1 rounded-full text-xs font-bold uppercase',
                record.status === 'สำเร็จ' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                record.status === 'กำลังดำเนินการ' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' :
                'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
              ]">
                {{ record.status }}
              </span>
            </div>
          </div>
          
          <!-- Courses Section -->
          <div class="mt-4">
            <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">หลักสูตร</h4>
            <!-- Courses Table -->
            <div v-if="record.courses.length > 0" class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-red-500 dark:bg-red-700 border-b border-gray-200 dark:border-gray-800">
                    <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">หลักสูตร</th>
                    <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">วันที่อบรม</th>
                    <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">REหลักสูตร</th>
                    <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">สถานะ</th>
                    <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">สถานะ RE</th>
                    <th class="px-4 py-3 text-xs font-bold text-black dark:text-white uppercase tracking-wider">จัดการ</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                  <tr v-for="(course, index) in record.courses" :key="index" class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors">
                    <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">{{ course.course_name || '-' }}</td>
                    <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {{ course.training_date ? new Date(course.training_date).toLocaleDateString('en-GB') : '-' }}
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {{ course.re_date ? new Date(course.re_date).toLocaleDateString('en-GB') : '-' }}
                    </td>
                    <td class="px-4 py-3">
                      <span :class="[
                        'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                        course.status === 'สำเร็จ' || course.status === 'ผ่านแล้ว' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                        'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                      ]">
                        {{ (course.status === 'สำเร็จ' || course.status === 'ผ่านแล้ว') ? 'ผ่านแล้ว' : 'ยังไม่ผ่าน' }}
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <span v-if="course.status_re === 'Reแล้ว'" :class="[
                        'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                        'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                      ]">
                        Reแล้ว
                      </span>
                      <span v-else :class="[
                        'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                        'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                      ]">
                        ยังไม่Re
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-2">
                        <button
                          @click.stop="saveStatusRe(course, record)"
                          class="px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                        >
                          Re
                        </button>
                        <button
                          @click.stop="openEditCourse(course)"
                          class="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                        >
                          <PencilSquareIcon class="h-4 w-4" />
                        </button>
                        <button
                          @click.stop="deleteCourse(course)"
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
            <div v-else class="p-4 text-center text-sm text-gray-500 dark:text-gray-400 italic">
              ไม่มีข้อมูลหลักสูตร
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
    <!-- Edit Course Sidebar -->
    <div v-if="isEditingCourse" class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black bg-opacity-50" @click="cancelEditCourse"></div>
      <div class="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-950 shadow-xl overflow-y-auto">
        <div class="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white">แก้ไขข้อมูลหลักสูตร</h2>
          <button @click="cancelEditCourse" class="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <XMarkIcon class="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">หลักสูตร</label>
            <input
              v-model="courseFormData.course_name"
              type="text"
              class="block w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">วันที่อบรม</label>
            <input
              v-model="courseFormData.training_date"
              type="date"
              class="block w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">REหลักสูตร</label>
            <input
              v-model="courseFormData.re_date"
              type="date"
              class="block w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">สถานะ RE</label>
            <input
              v-model="courseFormData.status_re"
              type="text"
              class="block w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">สถานะ</label>
            <select
              v-model="courseFormData.status"
              class="block w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              <option value="">เลือกสถานะ</option>
              <option value="ยังไม่ผ่าน">ยังไม่ผ่าน</option>
              <option value="ผ่านแล้ว">ผ่านแล้ว</option>
            </select>
          </div>
        </div>
        <div class="p-6 border-t border-gray-200 dark:border-gray-800 flex gap-3">
          <button
            @click="cancelEditCourse"
            class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
          >
            ยกเลิก
          </button>
          <button
            @click="saveCourse"
            :disabled="loading"
            class="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all disabled:opacity-50"
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
</template>