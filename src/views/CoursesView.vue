<script setup>
import { ref, onMounted } from 'vue'
import { supabaseInternal } from '../server/supabase'
import { useAuth } from '../stores/auth'
import { MagnifyingGlassIcon, PlusIcon, PencilSquareIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/solid'
import Swal from 'sweetalert2'

const auth = useAuth()
const courses = ref([])
const loading = ref(true)
const searchQuery = ref('')
const isSidebarOpen = ref(false)
const editingCourse = ref(null)
const courseName = ref('')

const fetchCourses = async () => {
  try {
    loading.value = true
    const { data, error } = await supabaseInternal
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    courses.value = data
  } catch (error) {
    console.error('Error fetching courses:', error.message)
  } finally {
    loading.value = false
  }
}

const filteredCourses = () => {
  if (!searchQuery.value) return courses.value
  const query = searchQuery.value.toLowerCase()
  return courses.value.filter(course => 
    course.course_name?.toLowerCase().includes(query) ||
    course.created_by?.toLowerCase().includes(query)
  )
}

const openAddSidebar = () => {
  editingCourse.value = null
  courseName.value = ''
  isSidebarOpen.value = true
}

const openEditSidebar = (course) => {
  editingCourse.value = course
  courseName.value = course.course_name
  isSidebarOpen.value = true
}

const closeSidebar = () => {
  isSidebarOpen.value = false
  editingCourse.value = null
  courseName.value = ''
}

const saveCourse = async () => {
  if (!courseName.value.trim()) {
    Swal.fire({
      title: 'แจ้งเตือน!',
      text: 'กรุณากรอกชื่อหลักสูตร',
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
    if (editingCourse.value) {
      const { error } = await supabaseInternal
        .from('courses')
        .update({
          course_name: courseName.value.trim()
        })
        .eq('id', editingCourse.value.id)

      if (error) throw error
    } else {
      const { error } = await supabaseInternal
        .from('courses')
        .insert({
          course_name: courseName.value.trim(),
          created_by: auth.user?.fullname || 'Unknown'
        })

      if (error) throw error
    }

    closeSidebar()
    fetchCourses()
    
    Swal.fire({
      title: 'บันทึกสำเร็จ!',
      text: 'บันทึกข้อมูลหลักสูตรเรียบร้อยแล้ว',
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
    console.error('Error saving course:', error.message)
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
      const { error } = await supabaseInternal
        .from('courses')
        .delete()
        .eq('id', course.id)

      if (error) throw error
      fetchCourses()
      
      Swal.fire({
        title: 'ลบสำเร็จ!',
        text: 'ลบข้อมูลหลักสูตรเรียบร้อยแล้ว',
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
      console.error('Error deleting course:', error.message)
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
  fetchCourses()
})
</script>

<template>
  <div class="space-y-6">

    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">รายการหลักสูตร</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">จัดการข้อมูลหลักสูตรทั้งหมดในระบบ</p>
      </div>
      <div class="text-sm text-gray-500 dark:text-gray-400">
        หลักสูตรทั้งหมด: <span class="font-bold text-indigo-600 dark:text-indigo-400">{{ filteredCourses().length }} รายการ</span>
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
            placeholder="ค้นหาชื่อหลักสูตร, ผู้สร้าง..."
            class="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
      </div>

      <button
        @click="openAddSidebar"
        class="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
      >
        <PlusIcon class="h-5 w-5" />
        เพิ่มหลักสูตร
      </button>
    </div>

    <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อหลักสูตร</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ผู้สร้าง / วันที่</th>
              <th class="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">จัดการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
            <template v-if="loading">
              <tr v-for="i in 3" :key="i" class="animate-pulse">
                <td colspan="3" class="px-6 py-4">
                  <div class="h-10 bg-gray-100 dark:bg-gray-900 rounded-lg w-full"></div>
                </td>
              </tr>
            </template>
            <tr v-else-if="filteredCourses().length === 0" class="text-center">
              <td colspan="3" class="px-6 py-12 text-gray-500 dark:text-gray-400 italic">
                ไม่พบข้อมูลหลักสูตร
              </td>
            </tr>
            <tr 
              v-for="course in filteredCourses()" 
              :key="course.id"
              class="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors group"
            >
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-bold text-gray-900 dark:text-white">
                  {{ course.course_name }}
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  {{ course.created_by || '-' }}
                </div>
                <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {{ course.created_at ? new Date(course.created_at).toLocaleDateString('en-GB') : '-' }}
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center gap-2">
                  <button
                    @click="openEditSidebar(course)"
                    class="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                  >
                    <PencilSquareIcon class="h-4 w-4" />
                  </button>
                  <button
                    @click="deleteCourse(course)"
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
          แสดงข้อมูลหลักสูตรทั้งหมด {{ filteredCourses().length }} รายการ
        </p>
      </div>
    </div>

    <div v-if="isSidebarOpen" class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/50" @click="closeSidebar"></div>
      <div class="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-950 shadow-xl transform transition-transform duration-300">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">
            {{ editingCourse ? 'แก้ไขหลักสูตร' : 'เพิ่มหลักสูตร' }}
          </h3>
          <button @click="closeSidebar" class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900">
            <XMarkIcon class="h-6 w-6" />
          </button>
        </div>

        <div class="p-6 space-y-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ชื่อหลักสูตร</label>
            <input
              v-model="courseName"
              type="text"
              class="w-full px-4 py-3 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="กรอกชื่อหลักสูตร"
              @keyup.enter="saveCourse"
            />
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
              @click="saveCourse"
              class="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
            >
              {{ editingCourse ? 'บันทึกการแก้ไข' : 'เพิ่มหลักสูตร' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
