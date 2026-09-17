const SENSITIVE_KEY = /(prompt|content|body|authorization|secret|token|key|dataurl|data_url|payload|markdown|text)/i
const SENSITIVE_VALUE = /(Bearer\s+|sk_[A-Za-z0-9_-]+|data:image\/[a-z0-9.+-]+;base64,)/i

function safePrimitive(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value !== 'string') return undefined
  return SENSITIVE_VALUE.test(value) ? '[redacted]' : value.slice(0, 240)
}

export function sanitizeEvidence(input = {}) {
  const output = {}
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY.test(key)) continue
    const safe = safePrimitive(value)
    if (safe !== undefined) output[key] = safe
  }
  return Object.freeze(output)
}

export async function runStep({ id, label, run, timeoutMs = 10_000 }) {
  const started = Date.now()
  let timeoutHandle
  try {
    const result = await Promise.race([
      Promise.resolve().then(run),
      new Promise((_, reject) => { timeoutHandle = setTimeout(() => reject(new Error(`步骤超时 (${timeoutMs}ms)`)), timeoutMs) })
    ])
    return Object.freeze({ id, label, status: 'passed', durationMs: Date.now() - started, evidence: sanitizeEvidence(result) })
  } catch (error) {
    return Object.freeze({ id, label, status: 'failed', durationMs: Date.now() - started, evidence: {}, error: String(error instanceof Error ? error.message : error).slice(0, 240) })
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

export async function runGoldenPath({ steps, evidencePath, cleanup = async () => {} }) {
  const results = []
  try {
    for (const step of steps) {
      if (results.some((result) => result.status === 'failed')) {
        results.push(Object.freeze({ id: step.id, label: step.label, status: 'skipped', durationMs: 0, evidence: {}, error: '前置步骤失败' }))
        continue
      }
      results.push(await runStep(step))
    }
    const report = Object.freeze({ ok: results.every((result) => result.status === 'passed'), steps: Object.freeze(results) })
    if (evidencePath) {
      const { writeFile } = await import('node:fs/promises')
      await writeFile(evidencePath, JSON.stringify(report, null, 2) + '\n', 'utf8')
    }
    return report
  } finally {
    await cleanup()
  }
}

if (process.argv[1] && process.argv[1].endsWith('golden-path-runner.mjs')) {
  const report = await runGoldenPath({ steps: [{ id: 'runner-self-check', label: 'Runner 协议自检', run: async () => ({ runnerReady: true, prompt: 'redacted' }) }] })
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}
