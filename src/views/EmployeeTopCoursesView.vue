<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabaseInternal } from '../server/supabase'
import { MagnifyingGlassIcon, ChevronRightIcon, ChevronDownIcon } from '@heroicons/vue/24/outline'

const records = ref([])
const loading = ref(true)
const searchQuery = ref('')
const expandedRecordId = ref(null)

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
    data.forEach((record) => {
      const key = `${record.first_name}-${record.last_name}-${record.id_tdl || 'no-id'}`
      if (!grouped[key]) {
        grouped[key] = {
          id: record.id,
          group: record.group,
          id_tdl: record.id_tdl,
          first_name: record.first_name,
          last_name: record.last_name,
          position: record.position,
          department: record.department,
          gender: record.gender,
          nationality: record.nationality,
          status: record.status,
          courses: [],
        }
      }
      if (record.course_name) {
        grouped[key].courses.push({
          course_name: record.course_name,
          training_date: record.training_date,
          record_id: record.id,
          status: record.status_courses || 'ยังไม่ผ่าน',
        })
      }
    })

    // เรียงลำดับตามจำนวนหลักสูตรที่ผ่าน มากสุดก่อน
    let sorted = Object.values(grouped)
    sorted.sort((a, b) => {
      const passedA = a.courses.filter((c) => c.status === 'ผ่านแล้ว').length
      const passedB = b.courses.filter((c) => c.status === 'ผ่านแล้ว').length
      return passedB - passedA
    })

    records.value = sorted
  } catch (error) {
    console.error('Error fetching records:', error.message)
  } finally {
    loading.value = false
  }
}

const filteredRecords = computed(() => {
  if (!searchQuery.value) return records.value

  const query = searchQuery.value.toLowerCase()
  return records.value.filter(
    (rec) =>
      rec.first_name?.toLowerCase().includes(query) ||
      rec.last_name?.toLowerCase().includes(query) ||
      rec.id_tdl?.toLowerCase().includes(query) ||
      rec.position?.toLowerCase().includes(query) ||
      rec.department?.toLowerCase().includes(query),
  )
})

const toggleExpand = (recordId) => {
  if (expandedRecordId.value === recordId) {
    expandedRecordId.value = null
  } else {
    expandedRecordId.value = recordId
  }
}

onMounted(() => {
  fetchRecords()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          พนักงานที่จบหลักสูตรมากที่สุด
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          เรียงลำดับตามจำนวนหลักสูตรที่ผ่าน มากสุดก่อน
        </p>
      </div>
      <div class="text-sm text-gray-500 dark:text-gray-400">
        ทั้งหมด:
        <span class="font-bold text-indigo-600 dark:text-indigo-400">{{
          filteredRecords.length
        }}</span>
        คน
      </div>
    </div>

    <!-- Search -->
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

    <!-- Table Container -->
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
                class="px-4 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-12"
              ></th>
              <th
                class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                อันดับ
              </th>
              <th
                class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                กลุ่ม
              </th>
              <th
                class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                รหัส TDL
              </th>
              <th
                class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                ชื่อ-นามสกุล
              </th>
              <th
                class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                เพศ
              </th>
              <th
                class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                ตำแหน่ง
              </th>
              <th
                class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                แผนก
              </th>
              <th
                class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                สัญชาติ
              </th>
              <th
                class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                ทั้งหมด
              </th>
              <th
                class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                ผ่านแล้ว
              </th>
              <th
                class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                ยังไม่ผ่าน
              </th>
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
              <template v-for="(record, index) in filteredRecords" :key="record.id">
                <tr
                  class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors cursor-pointer"
                  @click="toggleExpand(record.id)"
                >
                  <td class="px-4 py-4 whitespace-nowrap">
                    <button class="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                      <ChevronRightIcon
                        v-if="expandedRecordId !== record.id"
                        class="h-5 w-5 text-gray-400 transition-transform"
                      />
                      <ChevronDownIcon v-else class="h-5 w-5 text-gray-400 transition-transform" />
                    </button>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span
                      :class="[
                        'px-3 py-1 rounded-full text-xs font-bold',
                        index === 0
                          ? 'bg-yellow-400 text-yellow-900'
                          : index === 1
                            ? 'bg-gray-300 text-gray-900'
                            : index === 2
                              ? 'bg-orange-300 text-orange-900'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
                      ]"
                    >
                      {{ index + 1 }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ record.group || '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {{ record.id_tdl || '-' }}
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
                  <td
                    class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-700 dark:text-gray-300"
                  >
                    {{ record.courses.length }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span
                      class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    >
                      {{ record.courses.filter((c) => c.status === 'ผ่านแล้ว').length }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span
                      class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                    >
                      {{ record.courses.filter((c) => c.status !== 'ผ่านแล้ว').length }}
                    </span>
                  </td>
                </tr>
                <!-- Expandable Section - Course Details -->
                <tr v-if="expandedRecordId === record.id" class="bg-gray-50/30 dark:bg-gray-900/30">
                  <td colspan="12" class="px-6 py-4">
                    <div class="space-y-3">
                      <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                        รายการหลักสูตร
                      </h4>
                      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div
                          v-for="course in record.courses"
                          :key="course.record_id"
                          class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-4"
                        >
                          <div class="flex items-start justify-between gap-3">
                            <div class="flex-1">
                              <div class="text-sm font-bold text-gray-900 dark:text-white">
                                {{ course.course_name || '-' }}
                              </div>
                              <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                วันที่:
                                {{
                                  course.training_date
                                    ? new Date(course.training_date).toLocaleDateString('en-GB')
                                    : '-'
                                }}
                              </div>
                            </div>
                            <span
                              :class="[
                                'px-2.5 py-1 rounded-full text-xs font-bold uppercase flex-shrink-0',
                                course.status === 'ผ่านแล้ว'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
                              ]"
                            >
                              {{ course.status === 'ผ่านแล้ว' ? 'ผ่านแล้ว' : 'ยังไม่ผ่าน' }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
