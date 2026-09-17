import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'

const run = promisify(execFile)
const requested = process.argv.find((value) => value.startsWith('--iterations='))?.slice('--iterations='.length)
const parsed = Number(requested ?? 3)
const iterations = Number.isFinite(parsed) ? Math.min(10, Math.max(1, Math.trunc(parsed))) : 3
const samples = []
const keys = ['repair', 'chapterList', 'integrity']

const readBudget = (key) => {
  const value = process.argv.find((argument) => argument.startsWith(`--budget-${key}=`))?.slice(`--budget-${key}=`.length)
  if (value === undefined || value === '') return undefined
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : undefined
}

const budgets = Object.fromEntries(keys.map((key) => [key, readBudget(key)]))

for (let index = 0; index < iterations; index += 1) {
  const { stdout } = await run(process.execPath, ['scripts/verify-runtime.mjs', '--long'], { cwd: process.cwd(), maxBuffer: 20 * 1024 * 1024 })
  const start = stdout.indexOf('{\n  "ok"')
  if (start < 0) throw new Error('verify-runtime 未返回 JSON 报告')
  const report = JSON.parse(stdout.slice(start))
  if (!report.ok || !report.scale?.timingsMs) throw new Error('verify-runtime 长篇规模核验未通过')
  samples.push({ iteration: index + 1, timingsMs: report.scale.timingsMs })
}

const averageMs = Object.fromEntries(keys.map((key) => [key, Math.round(samples.reduce((sum, sample) => sum + sample.timingsMs[key], 0) / samples.length)]))
const percentile = (key, ratio) => {
  const values = samples.map((sample) => sample.timingsMs[key]).sort((a, b) => a - b)
  return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1))]
}
const statisticsMs = Object.fromEntries(keys.map((key) => [key, {
  min: Math.min(...samples.map((sample) => sample.timingsMs[key])),
  p50: percentile(key, 0.5),
  p95: percentile(key, 0.95),
  max: Math.max(...samples.map((sample) => sample.timingsMs[key])),
  average: averageMs[key]
}]))
const budgetPassed = keys.every((key) => budgets[key] === undefined || statisticsMs[key].p95 <= budgets[key])
const report = {
  iterations,
  environment: { platform: process.platform, arch: process.arch, node: process.version, cpuCount: os.cpus().length, memoryGiB: Math.round(os.totalmem() / (1024 ** 3) * 10) / 10 },
  samples,
  averageMs,
  statisticsMs,
  budgets,
  budgetPassed,
  note: '临时 fixture；统计用于跨机器对比，不代表低端设备或发布级 UI 基线'
}
console.log(JSON.stringify(report, null, 2))
if (!budgetPassed) process.exitCode = 1
