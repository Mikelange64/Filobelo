import { QueryClient } from '@tanstack/react-query'

// How the cache behaves, in one place:
//
// - staleTime: for this long after a fetch, the cached copy is trusted as-is
//   and no request is made. After it, the cached copy is still shown
//   immediately, but a refetch runs in the background and swaps in the fresh
//   data when it lands ("stale-while-revalidate").
// - gcTime: how long an entry nobody is currently displaying stays in memory
//   before it is dropped. This is what makes going back to a workspace you
//   opened a few minutes ago instant.
// - retry: only failures that could plausibly succeed on a second try (server
//   unreachable = status 0, or a 5xx). A 403/404 is a real answer, and a 401
//   has already been through authFetch's own refresh-and-retry.

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: (failureCount, error) =>
        failureCount < 1 && (error?.status === 0 || error?.status >= 500),
    },
  },
})

// Every cached read is identified by a key. Keeping them here means the
// component that reads an entry and the handler that updates it can't drift
// apart on spelling.
export const keys = {
  workspaces: ['workspaces'],
  folders: ['folders'],
  completedCount: ['completed-workspaces', 'count'],
  recentConversations: ['conversations', 'recent'],
  workspace: (id) => ['workspace', id],
  members: (id) => ['workspace', id, 'members'],
  conversations: (id) => ['workspace', id, 'conversations'],
}

// Drop-in replacement for a useState setter, backed by the cache: accepts a
// new value or an updater function.
//
// If a background refetch for this entry is in flight, it is cancelled first.
// That refetch was started before this write, so its response would describe
// the server as it was *before* the change and would overwrite an optimistic
// update when it landed. The entry stays marked stale, so it simply refetches
// at the next natural trigger. An initial load (nothing cached yet) is left
// alone - there is nothing to protect, and cancelling it would leave the
// screen empty.
export function writeCache(key, updater) {
  if (queryClient.getQueryData(key) !== undefined) {
    // exact: keys are matched by prefix by default, so cancelling
    // ['workspace', 5] would also cancel ['workspace', 5, 'members'].
    queryClient.cancelQueries({ queryKey: key, exact: true })
  }
  queryClient.setQueryData(key, (old) =>
    typeof updater === 'function' ? updater(old) : updater
  )
}
