import { Outlet, useLocation } from 'react-router-dom'
import FloatingNav from './FloatingNav'
import Toasts from '../common/Toasts'

export default function AppShell() {
  const location = useLocation()

  return (
    <div className="relative h-full w-full bg-surface overflow-hidden">
      <FloatingNav />
      <main key={location.pathname} className="absolute inset-0 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
      <Toasts />
    </div>
  )
}
