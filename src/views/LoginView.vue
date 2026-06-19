<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabaseInternal } from '../server/supabase'
import { useAuth } from '../stores/auth'
import { EyeIcon } from '@heroicons/vue/24/outline'
import Swal from 'sweetalert2'

const router = useRouter()
const auth = useAuth()

const formData = ref({
  username: '',
  password: ''
})
const showPassword = ref(false)
const loading = ref(false)

const handleLogin = async () => {
  if (!formData.value.username.trim()) {
    Swal.fire({
      icon: 'warning',
      title: 'ข้อมูลไม่ครบถ้วน',
      text: 'กรุณากรอกชื่อผู้ใช้'
    })
    return
  }
  
  if (!formData.value.password.trim()) {
    Swal.fire({
      icon: 'warning',
      title: 'ข้อมูลไม่ครบถ้วน',
      text: 'กรุณากรอกรหัสผ่าน'
    })
    return
  }

  try {
    loading.value = true

    // ค้นหาผู้ใช้จาก username
    const { data: users, error } = await supabaseInternal
      .from('system_users')
      .select('*')
      .eq('username', formData.value.username.trim())

    if (error) throw error

    if (!users || users.length === 0) {
      Swal.fire({
        icon: 'error',
        title: 'เข้าสู่ระบบไม่สำเร็จ',
        text: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
      })
      return
    }

    const user = users[0]

    // ตรวจสอบรหัสผ่าน (แบบไม่เข้ารหัสเพื่อทดสอบ)
    if (user.password !== formData.value.password) {
      Swal.fire({
        icon: 'error',
        title: 'เข้าสู่ระบบไม่สำเร็จ',
        text: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
      })
      return
    }

    // เข้าสู่ระบบสำเร็จ เก็บข้อมูลผู้ใช้ใน store
    auth.user = {
      id: user.id,
      emp_code: user.emp_code,
      fullname: user.fullname,
      fullName: user.fullname, // ใช้两个格式都存，保证兼容
      username: user.username,
      position: user.position,
      department: user.department,
      role: user.role
    }

    // 获取用户 IP 地址
    let userIp = null
    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json')
      const ipData = await ipResponse.json()
      userIp = ipData.ip
      console.log('Got user IP:', userIp)
      
      // 验证 IP 地址格式是否有效
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
      if (!ipRegex.test(userIp)) {
        console.log('Invalid IP format, using null')
        userIp = null
      }
    } catch (ipError) {
      console.log('Could not get IP address, using null')
    }
    
    // บันทึก log การเข้าสู่ระบบ
    try {
      console.log('Saving login log for user:', user.id)
      const logEntry = {
        system_user_id: user.id,
        action: 'login',
        user_agent: navigator.userAgent,
        ip_address: userIp,
        view_mode: 'web',
        old_value: {
          login_at: new Date().toISOString()
        }
      }
      console.log('Log entry:', logEntry)
      
      const { data: logData, error: logError } = await supabaseInternal
        .from('user_logs')
        .insert(logEntry)
        .select()
      
      if (logError) {
        console.error('Error saving login log:', logError)
      } else {
        console.log('Login log saved successfully:', logData)
      }
    } catch (logError) {
      console.error('Error logging login:', logError)
    }

    Swal.fire({
      icon: 'success',
      title: 'เข้าสู่ระบบสำเร็จ',
      text: 'ยินดีต้อนรับ, ' + user.fullname,
      timer: 1500,
      showConfirmButton: false
    })

    // นำทางไปที่หน้าหลัก
    setTimeout(() => {
      router.push('/')
    }, 1500)

  } catch (error) {
    console.error('Login error:', error)
    Swal.fire({
      icon: 'error',
      title: 'เกิดข้อผิดพลาด',
      text: 'ไม่สามารถเข้าสู่ระบบได้'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-full flex items-center justify-center bg-white p-4">
    <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-8 border border-gray-200">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          เข้าสู่ระบบ
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          Training Record System
        </p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-6">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            ชื่อผู้ใช้
          </label>
          <input
            v-model="formData.username"
            type="text"
            class="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            placeholder="กรุณากรอกชื่อผู้ใช้"
            autocomplete="username"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            รหัสผ่าน
          </label>
          <div class="relative">
            <input
              v-model="formData.password"
              :type="showPassword ? 'text' : 'password'"
              class="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="กรุณากรอกรหัสผ่าน"
              autocomplete="current-password"
            />
            <button
              type="button"
              @click="showPassword = !showPassword"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <EyeIcon class="h-5 w-5" :class="{ 'text-indigo-500': showPassword }" />
            </button>
          </div>
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-medium rounded-xl transition-all shadow-lg hover:shadow-xl"
        >
          <span v-if="loading">กำลังเข้าสู่ระบบ...</span>
          <span v-else>เข้าสู่ระบบ</span>
        </button>
      </form>
    </div>
  </div>
</template>
