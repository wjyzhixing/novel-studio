import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_OPTIONS = Object.freeze({ port: 5173, rendererHost: '127.0.0.1' })

export function listeningPids(port = DEFAULT_OPTIONS.port) {
  try {
    const output = execFileSync('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return output.split(/\r?\n/).map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0)
  } catch { return [] }
}

export function isNovelDevProcess(pid) {
  try {
    const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return command.includes('electron-vite/bin/electron-vite.js dev') || command.includes('vite.stable.config.ts')
  } catch { return false }
}

export function stopExistingNovelDevProcesses(port = DEFAULT_OPTIONS.port) {
  for (const pid of listeningPids(port)) if (isNovelDevProcess(pid)) process.kill(pid, 'SIGTERM')
}

export async function waitForRenderer(rendererUrl, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { const response = await fetch(rendererUrl); if (response.ok) return } catch { /* server still starting */ }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error(`稳定 Renderer 未能在 ${rendererUrl} 启动 (${timeoutMs}ms)`)
}

export async function startStableElectron(options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options }
  const rendererUrl = `http://${config.rendererHost}:${config.port}`
  const electronBinary = resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
  const mainEntry = resolve('out/main/index.js')
  const preloadEntry = resolve('out/preload/index.cjs')
  if (![electronBinary, mainEntry, preloadEntry].every(existsSync)) throw new Error('稳定 Electron 入口缺少 out 产物，请先使用开发入口生成主进程/preload产物')
  stopExistingNovelDevProcesses(config.port)
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.stable.config.ts', '--host', config.rendererHost, '--port', String(config.port)], { stdio: 'inherit' })
  let electron
  let stopping = false
  const stop = () => {
    if (stopping) return
    stopping = true
    vite.kill('SIGTERM')
    electron?.kill('SIGTERM')
  }
  try {
    await waitForRenderer(rendererUrl, config.timeoutMs ?? 8_000)
    const electronArgs = config.remoteDebuggingPort ? [`--remote-debugging-port=${config.remoteDebuggingPort}`, mainEntry] : [mainEntry]
    electron = spawn(electronBinary, electronArgs, { env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrl }, stdio: 'inherit' })
    electron.on('exit', () => stop())
    return Object.freeze({ rendererUrl, electron, vite, stop })
  } catch (error) {
    stop()
    throw new Error(`稳定 Electron 启动失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  const handle = await startStableElectron()
  const stop = (code) => { handle.stop(); process.exit(code) }
  process.on('SIGINT', () => stop(130))
  process.on('SIGTERM', () => stop(143))
  handle.electron.on('exit', (code) => process.exit(code ?? 0))
}
