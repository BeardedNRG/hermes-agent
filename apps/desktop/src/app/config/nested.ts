// Pure path-based getter/setter for nested config objects.
// Copied from web/src/lib/nested.ts so the desktop Config umbrella has no
// cross-package import.

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = obj

  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') {return undefined}
    cur = (cur as Record<string, unknown>)[p]
  }

  return cur
}

export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const clone = structuredClone(obj)
  const parts = path.split('.')
  let cur: Record<string, unknown> = clone

  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') {
      cur[parts[i]] = {}
    }

    cur = cur[parts[i]] as Record<string, unknown>
  }

  cur[parts[parts.length - 1]] = value

  return clone
}
