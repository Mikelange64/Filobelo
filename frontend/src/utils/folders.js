// Flat list -> depth-first order with a depth per folder, for the indented
// "Move to folder" picker. A folder whose parent isn't in the list is shown
// at the top level, and the visited set guards against a cyclic parent chain,
// so no folder can ever be silently dropped or loop forever.
export function flattenFolderTree(folders) {
  const ids = new Set(folders.map((f) => f.id))
  const childrenOf = new Map()
  for (const f of folders) {
    const key = f.parent_id != null && ids.has(f.parent_id) ? f.parent_id : null
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key).push(f)
  }
  const out = []
  const visited = new Set()
  function walk(parentKey, depth) {
    for (const f of childrenOf.get(parentKey) ?? []) {
      if (visited.has(f.id)) continue
      visited.add(f.id)
      out.push({ folder: f, depth })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  for (const f of folders) {
    if (!visited.has(f.id)) out.push({ folder: f, depth: 0 })
  }
  return out
}
