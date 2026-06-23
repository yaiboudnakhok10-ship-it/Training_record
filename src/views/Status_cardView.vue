<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { supabaseInternal } from '../server/supabase'
import { MagnifyingGlassIcon, PencilSquareIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { useAuth } from '../stores/auth'
import Swal from 'sweetalert2'

const route = useRoute()
const auth = useAuth()

const records = ref([])
const loading = ref(true)
const searchQuery = ref('')
const statusFilter = ref('all')
const isSidebarOpen = ref(false)
const editingRecord = ref(null)
const remarkForm = ref('')

// Set default filter based on route name
const setDefaultFilter = () => {
  if (route.name === 'search') {
    statusFilter.value = 'ได้รับแล้ว'
  } else {
    statusFilter.value = 'all'
  }
}

// Call on mount and when route changes
onMounted(() => {
  setDefaultFilter()
  fetchRecords()
})

watch(() => route.name, () => {
  setDefaultFilter()
})

const pageTitle = computed(() => {
  if (route.name === 'search') {
    return 'พนักงานที่ได้บัตแล้ว'
  } else if (route.name === 'register-employee') {
    return 'พนักงานที่จบทุกหลักสูตร'
  }
  return 'รายการพนักงานสถานะบัตร'
})

const pageDescription = computed(() => {
  if (route.name === 'search') {
    return 'แสดงข้อมูลพนักงานที่ได้รับบัตรแล้ว'
  } else if (route.name === 'register-employee') {
    return 'แสดงข้อมูลพนักงานที่จบทุกหลักสูตร'
  }
  return 'แสดงข้อมูลพนักงานและสถานะการรับบัตร'
})

const openEditSidebar = (record) => {
  editingRecord.value = record
  remarkForm.value = record.remark || ''
  isSidebarOpen.value = true
}

const closeSidebar = () => {
  isSidebarOpen.value = false
  editingRecord.value = null
  remarkForm.value = ''
}

const saveRemark = async () => {
  if (!editingRecord.value) return
  
  try {
    const username = auth.user?.fullname || auth.user?.name || auth.user?.username || 'Unknown'
    
    // อัปเดตทุก record ที่ตรงกับพนักงานคนนี้
    const { error } = await supabaseInternal
      .from('employee_training_records')
      .update({ 
        remark: remarkForm.value,
        updated_by: username
      })
      .eq('first_name', editingRecord.value.first_name)
      .eq('last_name', editingRecord.value.last_name)
    
    if (error) throw error
    
    // อัปเดตข้อมูลใน frontend ด้วย
    const recordToUpdate = records.value.find(r => r.id === editingRecord.value.id)
    if (recordToUpdate) {
      recordToUpdate.remark = remarkForm.value
      recordToUpdate.updated_by = username
      recordToUpdate.updated_at = new Date().toISOString()
    }
    
    closeSidebar()
    
    Swal.fire({
      title: 'บันทึกสำเร็จ!',
      text: 'บันทึกหมายเหตุเรียบร้อยแล้ว',
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
    console.error('Error saving remark:', error.message)
    Swal.fire({
      title: 'เกิดข้อผิดพลาด!',
      text: 'เกิดข้อผิดพลาดในการบันทึกหมายเหตุ: ' + error.message,
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

const fetchRecords = async () => {
  try {
    loading.value = true
    const { data, error } = await supabaseInternal
      .from('employee_training_records')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    
    // จัดกลุ่มข้อมูลตามพนักงาน
    const grouped = {}
    data.forEach(record => {
      const key = `${record.first_name}-${record.last_name}-${record.id_tdl || 'no-id'}`
      if (!grouped[key]) {
        grouped[key] = {
          id: record.id,
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
          remark: record.remark,
          created_by: record.created_by,
          created_at: record.created_at,
          updated_by: record.updated_by,
          updated_at: record.updated_at
        }
      }
    })
    
    records.value = Object.values(grouped)
  } catch (error) {
    console.error('Error fetching records:', error.message)
  } finally {
    loading.value = false
  }
}

const filteredRecords = computed(() => {
  let result = records.value
  
  if (statusFilter.value !== 'all') {
    result = result.filter(rec => rec.status_card === statusFilter.value)
  }
  
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(rec => 
      rec.first_name?.toLowerCase().includes(query) ||
      rec.last_name?.toLowerCase().includes(query) ||
      rec.id_tdl?.toLowerCase().includes(query) ||
      rec.employee_id?.toLowerCase().includes(query) ||
      rec.position?.toLowerCase().includes(query) ||
      rec.department?.toLowerCase().includes(query)
    )
  }
  
  return result
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ pageTitle }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ pageDescription }}</p>
      </div>
      <div class="text-sm text-gray-500 dark:text-gray-400">
        ทั้งหมด: <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ filteredRecords.length }}</span> คน
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-col sm:flex-row sm:items-center gap-4">
      <div class="relative max-w-sm w-full">
        <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MagnifyingGlassIcon class="h-5 w-5 text-gray-400" />
        </span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="ค้นหาชื่อ, รหัส, ตำแหน่ง..."
          class="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
        />
      </div>
      <select
        v-model="statusFilter"
        class="block w-full sm:w-48 pl-3 pr-10 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
      >
        <option value="all">ทุกสถานะ</option>
        <option value="ยังไม่ได้รับ">ยังไม่ได้รับ</option>
        <option value="ได้รับแล้ว">ได้รับแล้ว</option>
      </select>
    </div>

    <!-- Table Container -->
    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">กลุ่ม</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัส TDL</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัสล้านช้าง</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เพศ</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ตำแหน่ง</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">แผนก</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สัญชาติ</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">หมายเหตุ</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ผู้อัปเดต</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">จัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <template v-if="loading">
              <tr v-for="i in 5" :key="i" class="animate-pulse">
                <td colspan="12" class="px-6 py-4">
                  <div class="h-10 bg-gray-100 dark:bg-gray-900 rounded-lg w-full"></div>
                </td>
              </tr>
            </template>
            <tr v-else-if="filteredRecords.length === 0" class="text-center">
              <td colspan="12" class="px-6 py-12 text-gray-500 dark:text-gray-400 italic">
                ไม่พบข้อมูล
              </td>
            </tr>
            <template v-else>
              <tr
                v-for="record in filteredRecords"
                :key="record.id"
                class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors"
              >
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ record.group || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ record.id_tdl || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ record.employee_id || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-bold text-gray-900 dark:text-white">
                    {{ record.first_name }} {{ record.last_name }}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ record.gender || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ record.position || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ record.department || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {{ record.nationality || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span
                    :class="[
                      'px-2.5 py-1 rounded-full text-xs font-bold uppercase',
                      record.status_card === 'ได้รับแล้ว'
                        ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                        : record.status_card === 'ยังไม่ได้รับ'
                        ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400'
                        : 'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
                    ]"
                  >
                    {{ record.status_card || '-' }}
                  </span>
                </td>
                <td class="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {{ record.status_card === 'ยังไม่ได้รับ' ? (record.remark || '-') : '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900 dark:text-white">
                    <span class="font-medium">อัปเดต:</span> {{ record.updated_by || record.created_by || '-' }}
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    {{ (record.updated_at || record.created_at) ? new Date(record.updated_at || record.created_at).toLocaleDateString('en-US') : '-' }}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <button
                    v-if="record.status_card === 'ยังไม่ได้รับ'"
                    @click="openEditSidebar(record)"
                    class="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                  >
                    <PencilSquareIcon class="h-4 w-4" />
                  </button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit Sidebar -->
    <div v-if="isSidebarOpen" class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/50" @click="closeSidebar"></div>
      <div class="absolute right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-gray-950 shadow-xl transform transition-transform duration-300 overflow-y-auto">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-950 z-10">
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">
            แก้ไขหมายเหตุ
          </h3>
          <button @click="closeSidebar" class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900">
            <XMarkIcon class="h-6 w-6" />
          </button>
        </div>

        <div class="p-6 space-y-4">
          <div class="mb-4">
            <div class="text-sm font-bold text-gray-900 dark:text-white">
              {{ editingRecord?.first_name }} {{ editingRecord?.last_name }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              รหัส TDL: {{ editingRecord?.id_tdl || '-' }}
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">หมายเหตุ</label>
            <textarea
              v-model="remarkForm"
              rows="6"
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="กรอกหมายเหตุ..."
            ></textarea>
          </div>

          <div class="flex gap-3 pt-4">
            <button
              @click="closeSidebar"
              class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              @click="saveRemark"
              class="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              บันทึก
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
