const subs = new Map<string, Set<Function>>()

export const bus = {
  on(event: string, fn: Function) {
    if (!subs.has(event)) subs.set(event, new Set())
    subs.get(event)!.add(fn)
    return () => { subs.get(event)?.delete(fn) }
  },
  emit(event: string, payload?: unknown) {
    const set = subs.get(event)
    if (!set) return
    for (const fn of set) {
      try { fn(payload) } catch (e) { console.error(`[bus:${event}]`, e) }
    }
  },
  clear(event?: string) {
    if (event) subs.delete(event)
    else subs.clear()
  },
}
