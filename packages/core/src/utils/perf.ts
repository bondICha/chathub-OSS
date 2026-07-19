const marks: { label: string; t: number }[] = []
const t0 = performance.now()

export function perfMark(label: string) {
  marks.push({ label, t: performance.now() - t0 })
}

export function getPerfReport(): string {
  let out = `⏱ Startup Performance\n`
  out += `${'─'.repeat(36)}\n`
  for (let i = 0; i < marks.length; i++) {
    const { label, t } = marks[i]
    const delta = i === 0 ? t : t - marks[i - 1].t
    out += `${label.padEnd(28)} ${t.toFixed(0).padStart(5)}ms  (+${delta.toFixed(0)}ms)\n`
  }
  return out
}
