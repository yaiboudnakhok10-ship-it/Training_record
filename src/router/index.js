import { createRouter, createWebHistory } from 'vue-router'
import LayoutMenu from '../components/components/LayoutMenu.vue'
import LoginView from '../views/LoginView.vue'
import EmployeeView from '../views/EmployeeView.vue'
import CoursesView from '../views/CoursesView.vue'
import UserSystemView from '../views/UserSystemView.vue'
import EmployeeTrainingView from '../views/Employee_trainingView.vue'
import Status_cardView from '../views/Status_cardView.vue'
import Status_coursesView from '../views/Status_coursesView.vue'
import DashboardView from '../views/dashboardView.vue'
import StudentView from '../views/StudentView.vue'
import EmployeeCoursesView from '../views/employee_coursesView.vue'
import LogView from '../views/LogView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView
    },
    {
      path: '/',
      component: LayoutMenu,
      children: [
        {
          path: '',
          name: 'dashboard',
          component: DashboardView
        },
        {
          path: 'training-record',
          name: 'training-record',
          component: StudentView
        },
        {
          path: 'employee-courses',
          name: 'employee-courses',
          component: EmployeeCoursesView
        },
        {
          path: 'employees',
          name: 'employee-info',
          component: EmployeeView
        },
        {
          path: 'courses',
          name: 'course-list',
          component: CoursesView
        },
        {
          path: 'register-course',
          name: 'register-course',
          component: EmployeeTrainingView
        },
        {
          path: 'search',
          name: 'search',
          component: Status_cardView
        },
        {
          path: 'register-employee',
          name: 'register-employee',
          component: Status_coursesView
        },
        {
          path: 'system-users',
          name: 'system-users',
          component: UserSystemView
        },
        {
          path: 'usage-logs',
          name: 'usage-logs',
          component: LogView
        }
      ]
    }
  ]
})

// Navigation guard สำหรับตรวจสอบการล็อกอิน
router.beforeEach((to, from, next) => {
  // ตรวจสอบว่ามีข้อมูลผู้ใช้ใน localStorage หรือไม่
  const user = localStorage.getItem('auth_user')
  
  // ถ้าไปที่หน้า login และมีข้อมูลผู้ใช้แล้ว ให้กลับไปหน้าแรก
  if (to.name === 'login' && user) {
    next('/')
  }
  // ถ้าไปที่หน้าอื่นและไม่มีข้อมูลผู้ใช้ ให้ไปหน้า login
  else if (to.name !== 'login' && !user) {
    next('/login')
  }
  // ถ้าไม่ใช่กรณีข้างต้น ให้ดำเนินการต่อ
  else {
    next()
  }
})

export default router
