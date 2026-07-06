import { createRouter, createWebHistory } from 'vue-router'
import LayoutMenu from '../components/components/LayoutMenu.vue'
import LoginView from '../views/LoginView.vue'
import EmployeeView from '../views/EmployeeView.vue'
import CoursesView from '../views/CoursesView.vue'
import UserSystemView from '../views/UserSystemView.vue'
import EmployeeTrainingView from '../views/Employee_trainingView.vue'
import EmployeeTrainingRecordsView from '../views/employee_training_records.vue'
import Status_cardView from '../views/Status_cardView.vue'
import Status_coursesView from '../views/Status_coursesView.vue'
import DashboardView from '../views/dashboardView.vue'
import EvaluationTopicsView from '../views/evaluation_topicsView.vue'
import EvaluationsView from '../views/evaluationsView.vue'
import LogView from '../views/LogView.vue'
import EmployeeCourseRegistrationView from '../views/employee_course_registration.vue'
import RegistrationView from '../views/registrationView.vue'
import HealthCheckView from '../views/health_checkView.vue'
import EmployeeOneView from '../views/employee_one.vue'
import AccidentRetrainingRecordsView from '../views/accident_retraining_recordsView.vue'

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
          path: 'employee_training_records',
          name: 'employee_training_records',
          component: EmployeeTrainingRecordsView
        },
        {
          path: 'training-record',
          name: 'training-record',
          component: EvaluationsView
        },
        {
          path: 'employee-courses',
          name: 'employee-courses',
          component: EvaluationTopicsView
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
              path: 'employee-training',
              name: 'employee-training',
              component: AccidentRetrainingRecordsView
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
        },
        {
          path: 'employee-course-registration',
          name: 'employee-course-registration',
          component: EmployeeCourseRegistrationView
        },
        {
          path: 'registration-view',
          name: 'registration-view',
          component: RegistrationView
        },
        {
          path: 'health-check',
          name: 'health-check',
          component: HealthCheckView
        },
        {
          path: 'employee-one',
          name: 'employee-one',
          component: EmployeeOneView
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
