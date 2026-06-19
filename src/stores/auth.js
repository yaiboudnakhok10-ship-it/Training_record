import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useAuth = defineStore('auth', () => {
  // โหลดข้อมูลผู้ใช้จาก localStorage เมื่อเริ่มต้น
  const savedUser = localStorage.getItem('auth_user')
  const user = ref(savedUser ? JSON.parse(savedUser) : null)

  // เก็บข้อมูลผู้ใช้ลง localStorage เมื่อมีการเปลี่ยนแปลง
  watch(user, (newValue) => {
    if (newValue) {
      localStorage.setItem('auth_user', JSON.stringify(newValue))
    } else {
      localStorage.removeItem('auth_user')
    }
  }, { deep: true })

  const logout = () => {
    console.log('Logging out...')
    user.value = null
  }

  return {
    user,
    logout
  }
})
