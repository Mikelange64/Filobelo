const BASE_URL = import.meta.env.VITE_API_URL

const STORAGE_KEYS = {
  access: 'filobelo_access_token',
  refresh: 'filobelo_refresh_token',
}

export function getTokens() {
  return {
    access: localStorage.getItem(STORAGE_KEYS.access),
    refresh: localStorage.getItem(STORAGE_KEYS.refresh),
  }
}

export function setTokens(access, refresh) {
  localStorage.setItem(STORAGE_KEYS.access, access)
  localStorage.setItem(STORAGE_KEYS.refresh, refresh)
}

export function clearTokens() {
  localStorage.removeItem(STORAGE_KEYS.access)
  localStorage.removeItem(STORAGE_KEYS.refresh)
}

// Refresh tokens rotate on use (the server deletes the old one and issues a
// new one atomically), so concurrent callers must not each fire their own
// refresh - only the first would succeed and the rest would 401, clearing
// the session that first call just established. This makes every caller
// share a single in-flight refresh instead.
let refreshPromise = null

async function attemptRefresh() {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const { refresh } = getTokens()
    if (!refresh) throw new Error('No refresh token')

    let res
    try {
      res = await fetch(`${BASE_URL}/users/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      })
    } catch {
      // Network/connection failure (e.g. backend momentarily unreachable) -
      // not a verdict on the refresh token itself, so don't wipe a session
      // that may still be perfectly valid.
      throw new NetworkError('Could not reach server')
    }

    if (!res.ok) {
      // Only a genuine 401 means the server is telling us this refresh token
      // is actually invalid/expired - anything else (502/503 from a proxy
      // hiccup, a transient 500) is a backend blip, not a verdict on the
      // token, so treat it like a network error rather than wiping an
      // otherwise-valid session over it.
      if (res.status !== 401) throw new NetworkError('Refresh service unavailable')
      throw new Error('Refresh failed')
    }

    const data = await res.json()
    setTokens(data.access_token, data.refresh_token)
    return data.access_token
  })()

  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

// Authenticated fetch — adds Bearer header, retries once after a 401 via refresh.
// On a second 401 or refresh failure, clears tokens and redirects to /login.
// A network failure during that retry does NOT clear tokens - it means the
// server was briefly unreachable, not that the session is actually invalid.
export async function authFetch(path, options = {}) {
  const { access } = getTokens()

  // A FormData body (file uploads) must NOT get a Content-Type from us: the
  // browser sets multipart/form-data itself, including the boundary string
  // the server needs to split the parts. Everything else is JSON.
  const isFormData = options.body instanceof FormData

  const makeHeaders = (token) => ({
    ...(!isFormData && { 'Content-Type': 'application/json' }),
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  })

  let res = await fetch(`${BASE_URL}${path}`, { ...options, headers: makeHeaders(access) })

  if (res.status === 401) {
    try {
      const newToken = await attemptRefresh()
      res = await fetch(`${BASE_URL}${path}`, { ...options, headers: makeHeaders(newToken) })
    } catch (err) {
      if (err instanceof NetworkError) {
        throw new ApiError(0, 'Could not reach server - please try again')
      }
      clearTokens()
      window.dispatchEvent(new CustomEvent('auth:expired'))
      throw new ApiError(401, 'Session expired')
    }
  }

  return parseResponse(res)
}

async function parseResponse(res) {
  if (res.status === 204) return null
  if (res.ok) return res.json()

  let detail = 'Request failed'
  try {
    const body = await res.json()
    detail = body.message ?? body.detail ?? detail
  } catch { /* non-JSON error body */ }
  throw new ApiError(res.status, detail)
}

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

class NetworkError extends Error {}

// Login uses OAuth2PasswordRequestForm — must send application/x-www-form-urlencoded.
// The `username` field accepts either email or username (see backend router).
export async function loginRequest(emailOrUsername, password) {
  const body = new URLSearchParams({ username: emailOrUsername, password })
  const res = await fetch(`${BASE_URL}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await parseResponse(res)
  setTokens(data.access_token, data.refresh_token)
  return data
}

// Register — JSON body, or a multipart form when a profile picture was chosen
// (the picture has to travel with the signup: a new account can't sign in to
// upload one until its email is verified).
export async function registerRequest(username, email, password, avatarFile = null) {
  if (avatarFile) {
    const form = new FormData()
    form.append('username', username)
    form.append('email', email)
    form.append('password', password)
    form.append('file', avatarFile)
    // No Content-Type header: the browser sets the multipart boundary itself.
    const res = await fetch(`${BASE_URL}/users/with-picture`, { method: 'POST', body: form })
    return parseResponse(res)
  }
  const res = await fetch(`${BASE_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  })
  return parseResponse(res)
}

// Logout — deletes server-side refresh token.
export function logoutRequest(refreshToken) {
  return authFetch('/users/logout', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
}

// Workspace mutations
export function createWorkspace(data) {
  return authFetch('/workspaces', { method: 'POST', body: JSON.stringify(data) })
}

export function patchWorkspace(id, data) {
  return authFetch(`/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

// Pin/archive/folder are the caller's own preferences for a shared
// workspace, not admin-only workspace fields - separate endpoint so any
// member can set them for themselves.
export function patchWorkspacePreferences(id, data) {
  return authFetch(`/workspaces/${id}/me`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function completeWorkspace(id) {
  return authFetch(`/workspaces/${id}/complete`, { method: 'PATCH' })
}

export function reopenWorkspace(id) {
  return authFetch(`/workspaces/${id}/reopen`, { method: 'PATCH' })
}

export function leaveWorkspace(id) {
  return authFetch(`/workspaces/${id}/members/me`, { method: 'DELETE' })
}

// Workspace lists

// The sidebar, search, calendar and home view all work off the full list held
// in AppShell, so this walks every page rather than stopping at the server's
// default page size (which silently hid everything past the first 20).
export async function getAllWorkspaces(pageSize = 100) {
  const all = []
  let skip = 0
  while (true) {
    const page = await authFetch(`/workspaces?skip=${skip}&limit=${pageSize}`)
    all.push(...page.workspaces)
    if (!page.has_more || page.workspaces.length === 0) break
    skip += page.workspaces.length
  }
  return all
}

export function getCompletedWorkspaces(skip = 0, limit = 20) {
  return authFetch(`/workspaces/completed?skip=${skip}&limit=${limit}`)
}

// Workspace detail
export function getWorkspace(id) {
  return authFetch(`/workspaces/${id}`)
}

export function getMembersWithRoles(workspaceId) {
  return authFetch(`/workspaces/${workspaceId}/members`)
}

export function inviteMember(workspaceId, userId) {
  return authFetch(`/workspaces/${workspaceId}/members/${userId}`, { method: 'PATCH' })
}

export function inviteExternal(workspaceId, email) {
  return authFetch(`/workspaces/${workspaceId}/invite/external`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function promoteToAdmin(workspaceId, userId) {
  return authFetch(`/workspaces/${workspaceId}/members/${userId}/admin`, { method: 'PATCH' })
}

export function removeMember(workspaceId, userId) {
  return authFetch(`/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' })
}

export function searchUser(q) {
  return authFetch(`/users/search?q=${encodeURIComponent(q)}`)
}

export function reassignTask(workspaceId, taskId, userId) {
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}/owner?user_id=${userId}`, { method: 'PATCH' })
}

// Task CRUD (scoped to a workspace)
export function createTask(workspaceId, data) {
  return authFetch(`/workspaces/${workspaceId}/tasks/`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function patchTask(workspaceId, taskId, data) {
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteTask(workspaceId, taskId) {
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}`, {
    method: 'DELETE',
  })
}

export function updateTaskStatus(workspaceId, taskId, status) {
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

// Folders
export function getFolders() {
  return authFetch('/folders')
}

export function createFolder(name, color, parentId = null) {
  return authFetch('/folders', { method: 'POST', body: JSON.stringify({ name, color, parent_id: parentId }) })
}

export function updateFolder(id, data) {
  return authFetch(`/folders/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteFolder(id) {
  return authFetch(`/folders/${id}`, { method: 'DELETE' })
}

// User self-management
export function updateUser(data) {
  return authFetch('/users/me', { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteAccount() {
  return authFetch('/users/me', { method: 'DELETE' })
}

export function changePassword(currentPassword, newPassword) {
  return authFetch('/users/me/password', {
    method: 'PATCH',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
}

export function removeAvatar() {
  return authFetch('/users/me/picture', { method: 'DELETE' })
}

export async function verifyEmail(token) {
  const res = await fetch(`${BASE_URL}/users/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  return parseResponse(res)
}

export async function resendVerification(identifier) {
  const res = await fetch(`${BASE_URL}/users/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  })
  return parseResponse(res)
}

export async function forgotPassword(email) {
  const res = await fetch(`${BASE_URL}/users/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  return parseResponse(res)
}

export async function resetPassword(token, newPassword) {
  const res = await fetch(`${BASE_URL}/users/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  })
  return parseResponse(res)
}

// Avatar upload — multipart. Goes through authFetch like every other
// authenticated call so an expired access token is refreshed and the upload
// retried, instead of failing after ~30 idle minutes.
export function uploadAvatarRequest(file) {
  const form = new FormData()
  form.append('file', file)
  return authFetch('/users/me/picture', { method: 'PATCH', body: form })
}

// Resources (scoped to a workspace + task)
export function listResources(workspaceId, taskId) {
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}/resource/`)
}

export function createLink(workspaceId, taskId, data) {
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}/resource/links`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function createNote(workspaceId, taskId, data) {
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}/resource/notes`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateLink(workspaceId, taskId, linkId, data) {
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}/resource/links/${linkId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function updateNote(workspaceId, taskId, noteId, data) {
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}/resource/notes/${noteId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteResource(workspaceId, taskId, resourceId) {
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}/resource/${resourceId}`, {
    method: 'DELETE',
  })
}

// File resource upload — multipart, same pattern as uploadAvatarRequest.
export function uploadResourceFile(workspaceId, taskId, file) {
  const form = new FormData()
  form.append('file', file)
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}/resource/files`, {
    method: 'POST',
    body: form,
  })
}

// Conversations (scoped to a workspace)
export function listConversations(workspaceId) {
  return authFetch(`/workspaces/${workspaceId}/conversations/`)
}

// Recent conversations across every workspace the user belongs to (Home page widget).
export function listRecentConversations(limit = 4) {
  return authFetch(`/conversations/recent?limit=${limit}`)
}

export function createConversation(workspaceId, data) {
  return authFetch(`/workspaces/${workspaceId}/conversations/`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateConversation(workspaceId, conversationId, data) {
  return authFetch(`/workspaces/${workspaceId}/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteConversation(workspaceId, conversationId) {
  return authFetch(`/workspaces/${workspaceId}/conversations/${conversationId}`, {
    method: 'DELETE',
  })
}

// Messages always come back oldest-first. With no cursor this is the newest
// `limit` messages; `beforeId` pages back to older ones, `afterId` fetches
// only what is newer (polling). `has_more` refers to the direction being read.
export function listMessages(workspaceId, conversationId, { limit = 50, beforeId, afterId } = {}) {
  const params = new URLSearchParams({ limit })
  if (beforeId != null) params.set('before_id', beforeId)
  if (afterId != null) params.set('after_id', afterId)
  return authFetch(`/workspaces/${workspaceId}/conversations/${conversationId}/messages?${params}`)
}

export function sendMessage(workspaceId, conversationId, data) {
  return authFetch(`/workspaces/${workspaceId}/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// Task comments. Each comes back with its reactions summarised for the caller:
// [{ emoji, count, reacted_by_me }]. Only the author can edit; the author or
// an admin can delete.
export function listComments(workspaceId, taskId) {
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}/comments`)
}

export function createComment(workspaceId, taskId, content) {
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export function updateComment(workspaceId, taskId, commentId, content) {
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  })
}

export function deleteComment(workspaceId, taskId, commentId) {
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}/comments/${commentId}`, {
    method: 'DELETE',
  })
}

// Adds the caller's reaction, or removes it if already there. Returns the
// comment's full reaction list.
export function toggleCommentReaction(workspaceId, taskId, commentId, emoji) {
  return authFetch(`/workspaces/${workspaceId}/tasks/${taskId}/comments/${commentId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  })
}
