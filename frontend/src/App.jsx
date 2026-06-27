import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/shared/ProtectedRoute'
import AppShell from './AppShell'
import Login from './pages/Login/Login'
import Register from './pages/Register/Register'

// Redirect authenticated users away from auth pages
function AuthRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/" replace />
  return children
}

function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={<AuthRoute><Login /></AuthRoute>}
      />
      <Route
        path="/register"
        element={<AuthRoute><Register /></AuthRoute>}
      />
      <Route
        path="/*"
        element={<ProtectedRoute><AppShell /></ProtectedRoute>}
      />
    </Routes>
  )
}

export default App
