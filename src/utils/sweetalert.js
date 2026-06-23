import Swal from 'sweetalert2'

// Default SweetAlert2 options with consistent styling
const defaultOptions = {
  customClass: {
    popup: '!p-3 !max-w-md',
    title: '!text-base',
    htmlContainer: '!text-xs',
    confirmButton: '!px-3 !py-1.5 !text-xs',
    cancelButton: '!px-3 !py-1.5 !text-xs',
    icon: '!scale-75'
  },
  buttonsStyling: false // Disable default styling so Tailwind classes work
}

// Show success alert
export const showSuccess = (title, text) => {
  return Swal.fire({
    ...defaultOptions,
    title,
    text,
    icon: 'success',
    confirmButtonColor: '#10b981', // Green
    confirmButtonText: 'ตกลง'
  })
}

// Show error alert
export const showError = (title, text) => {
  return Swal.fire({
    ...defaultOptions,
    title,
    text,
    icon: 'error',
    confirmButtonColor: '#ef4444', // Red
    confirmButtonText: 'ตกลง'
  })
}

// Show warning alert
export const showWarning = (title, text) => {
  return Swal.fire({
    ...defaultOptions,
    title,
    text,
    icon: 'warning',
    confirmButtonColor: '#f59e0b', // Amber
    confirmButtonText: 'ตกลง'
  })
}

// Show confirm dialog
export const showConfirm = (title, text, confirmText = 'ใช่', cancelText = 'ยกเลิก') => {
  return Swal.fire({
    ...defaultOptions,
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#3085d6', // Blue
    cancelButtonColor: '#d33', // Red
    confirmButtonText: confirmText,
    cancelButtonText: cancelText
  })
}
