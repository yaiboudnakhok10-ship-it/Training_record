<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabaseInternal } from '../server/supabase'
import { MagnifyingGlassIcon, ExclamationTriangleIcon, ChevronDownIcon, ChevronRightIcon, TrashIcon } from '@heroicons/vue/24/outline'
import Swal from 'sweetalert2'

const router = useRouter()

const reRecords = ref([])
const filteredRecords = ref([])
const searchQuery = ref('')
const loading = ref(false)
const expandedRecordId = ref(null)

const fetchReRecords = async () => {
  try {
    loading.value = true
    const { data, error } = await supabaseInternal
      .from('re_courses')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    
    // จัดกลุ่มข้อมูลแบบเดียวกัน
    const grouped = {}
    data.forEach(record => {
      const key = `${record.full_name}-${record.tdl_code || 'no-id'}`
      if (!grouped[key]) {
        grouped[key] = {
          id: record.id,
          record_ids: [record.id],
          group: record.group_name,
          id_tdl: record.tdl_code,
          full_name: record.full_name,
          first_name: record.full_name?.split(' ')[0] || '',
          last_name: record.full_name?.split(' ').slice(1).join(' ') || '',
          position: record.position,
          department: record.department,
          gender: record.gender,
          nationality: record.nationality,
          status: record.status,
          courses: []
        }
      } else {
        grouped[key].record_ids.push(record.id)
      }
      // เพิ่ม course
      if (record.course_name) {
        grouped[key].courses.push({
          course_name: record.course_name,
          training_date: record.training_date,
          re_date: record.re_date,
          status_re: record.re_status,
          record_id: record.id,
          status: record.status
        })
      }
    })
    
    // กรองกลุ่มที่มี courses.length > 0
    reRecords.value = Object.values(grouped).filter(item => item.courses.length > 0)
    filteredRecords.value = reRecords.value
  } catch (error) {
    console.error('Error fetching Re records:', error.message)
  } finally {
    loading.value = false
  }
}

const deleteRecord = async (record) => {
  const result = await Swal.fire({
    title: 'คุณแน่ใจหรือไม่?',
    text: `คุณต้องการลบข้อมูลของ ${record.full_name} ใช่หรือไม่?`,
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
      for (const recordId of record.record_ids) {
        const { error } = await supabaseInternal
          .from('re_courses')
          .delete()
          .eq('id', recordId)
        
        if (error) throw error
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
          icon: '!scale-75'
        }
      })
      
      fetchReRecords()
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

const searchRecords = () => {
  const query = (searchQuery.value || '').toLowerCase().trim()
  if (!query) {
    filteredRecords.value = reRecords.value
    return
  }
  filteredRecords.value = reRecords.value.filter(record => {
    return (
      record.full_name?.toLowerCase().includes(query) ||
      record.id_tdl?.toLowerCase().includes(query)
    )
  })
}

const clearSearch = () => {
  searchQuery.value = ''
  filteredRecords.value = reRecords.value
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

onMounted(() => {
  fetchReRecords()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">REหลักสูตร</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">รายชื่อพนักงานที่ Reแล้ว</p>
      </div>
      <div
        @click="router.push('/health-check')"
        class="inline-flex items-center gap-2 px-6 py-3 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-all cursor-pointer border-b-2 border-red-500"
      >
        <ExclamationTriangleIcon class="h-5 w-5" />
        หมดอายุตรวจสุขภาพ
      </div>
    </div>

    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
      <div class="flex flex-col sm:flex-row gap-4">
        <div class="flex-1">
          <div class="relative">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon class="h-5 w-5 text-gray-400" />
            </span>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="ค้นหา: รหัส TDL, ชื่อ..."
              class="block w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              @keyup.enter="searchRecords"
            />
          </div>
        </div>
        <div class="flex gap-3">
          <button
            @click="searchRecords"
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
    </div>

    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div v-if="loading" class="p-12 text-center">
        <div class="animate-pulse text-gray-500 dark:text-gray-400">กำลังโหลด...</div>
      </div>
      <div v-else-if="filteredRecords.length === 0" class="p-12 text-center">
        <p class="text-gray-500 dark:text-gray-400 italic">ไม่มีข้อมูล</p>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10"></th>
              <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">กลุ่ม</th>
              <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัส TDL</th>
              <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
              <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เพศ</th>
              <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตำแหน่ง</th>
              <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">แผนก</th>
              <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สัญชาติ</th>
              <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
              <th class="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <template v-for="record in filteredRecords" :key="record.id">
              <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors">
                <td class="px-4 py-3">
                  <button
                    @click="expandedRecordId = expandedRecordId === record.id ? null : record.id"
                    class="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  >
                    <ChevronRightIcon
                      v-if="expandedRecordId !== record.id"
                      class="h-5 w-5 text-gray-400"
                    />
                    <ChevronDownIcon
                      v-else
                      class="h-5 w-5 text-gray-400"
                    />
                  </button>
                </td>
                <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">{{ record.group || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.id_tdl || '-' }}</td>
                <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{{ record.full_name || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.gender || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.position || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.department || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ record.nationality || '-' }}</td>
                <td class="px-4 py-3">
                  <span :class="[
                    'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                    record.status === 'สำเร็จ' || record.status === 'ผ่านแล้ว' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                    'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
                  ]">
                    {{ record.status || '-' }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <button
                    @click="deleteRecord(record)"
                    class="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <TrashIcon class="h-5 w-5" />
                  </button>
                </td>
              </tr>
              <tr v-if="expandedRecordId === record.id" class="bg-gray-50/30 dark:bg-gray-900/30">
                <td colspan="10" class="px-6 py-4">
                  <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                      <thead>
                        <tr class="bg-red-500 border-b border-gray-200 dark:border-gray-800">
                          <th class="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">หลักสูตร</th>
                          <th class="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">วันที่อบรม</th>
                          <th class="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">REหลักสูตร</th>
                          <th class="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">สถานะ RE</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                        <tr v-for="(course, index) in record.courses" :key="index" class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors">
                          <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">{{ course.course_name || '-' }}</td>
                          <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ formatDate(course.training_date) }}</td>
                          <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ formatDate(course.re_date) }}</td>
                          <td class="px-4 py-3">
                            <span class="px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400">
                              {{ course.status_re || 'Reแล้ว' }}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
