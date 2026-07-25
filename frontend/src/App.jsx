import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AppShell from './AppShell'
import HomeView from './pages/Home/HomeView'
import WorkspaceDetail from './pages/WorkspaceDetail/WorkspaceDetail'
import Landing from './pages/Landing/Landing'
import Login from './pages/Login/Login'
import Register from './pages/Register/Register'
import ForgotPassword from './pages/ForgotPassword/ForgotPassword'
import ResetPassword from './pages/ResetPassword/ResetPassword'
import VerifyEmail from './pages/VerifyEmail/VerifyEmail'

function AuthRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/" replace />
  return children
}

// Signed-out visitors to "/" (and any nested path) see the marketing landing
// page instead of being bounced straight to /login; signed-in users get the
// normal app shell, unchanged.
function RootRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Landing />
  return children
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
      <Route path="/register" element={<AuthRoute><Register /></AuthRoute>} />
      <Route path="/forgot-password" element={<AuthRoute><ForgotPassword /></AuthRoute>} />
      <Route path="/reset-password" element={<AuthRoute><ResetPassword /></AuthRoute>} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/" element={<RootRoute><AppShell /></RootRoute>}>
        <Route index element={<HomeView />} />
        <Route path="workspaces/:id" element={<WorkspaceDetail />} />
      </Route>
    </Routes>
  )
}

export default App
