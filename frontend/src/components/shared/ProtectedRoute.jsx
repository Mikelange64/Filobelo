import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

// Redirects to /login if not authenticated.
// Shows nothing (not a flash) while the initial token check is running.
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default ProtectedRoute
