import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_OPTIONS = Object.freeze({ port: 5173, rendererHost: '127.0.0.1' })

export function getStableElectronPaths(projectRoot = process.cwd(), platform = process.platform) {
  const electronRoot = resolve(projectRoot, 'node_modules/electron')
  const nativeRelativePath = platform === 'darwin'
    ? 'dist/Electron.app/Contents/MacOS/Electron'
    : platform === 'win32'
      ? 'dist/electron.exe'
      : 'dist/electron'
  return Object.freeze({
    electronBinary: resolve(electronRoot, nativeRelativePath),
    mainEntry: resolve(projectRoot, 'out/main/index.js'),
    preloadEntry: resolve(projectRoot, 'out/preload/index.cjs')
  })
}

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

export async function waitForProcessExit(child, timeoutMs = 5_000) {
  if (!child || child.exitCode !== null) return
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit))
  await Promise.race([
    exited,
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, timeoutMs))
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await Promise.race([exited, new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1_000))])
  }
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
  const paths = getStableElectronPaths(process.cwd())
  const { electronBinary, mainEntry, preloadEntry } = paths
  if (![mainEntry, preloadEntry].every(existsSync)) throw new Error('稳定 Electron 入口缺少 out 主进程或 preload 产物，请先执行 npm run build')
  if (!existsSync(electronBinary)) throw new Error(`Electron 原生运行时未安装：${electronBinary}。请执行 pnpm rebuild electron 后重试`)
  stopExistingNovelDevProcesses(config.port)
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.stable.config.ts', '--host', config.rendererHost, '--port', String(config.port)], { stdio: 'inherit' })
  let electron
  let stopPromise
  const stop = async () => {
    if (stopPromise) return stopPromise
    stopPromise = (async () => {
      vite.kill('SIGTERM')
      electron?.kill('SIGTERM')
      await Promise.all([waitForProcessExit(vite), waitForProcessExit(electron)])
    })()
    return stopPromise
  }
  try {
    await waitForRenderer(rendererUrl, config.timeoutMs ?? 8_000)
    const electronArgs = config.remoteDebuggingPort ? [`--remote-debugging-port=${config.remoteDebuggingPort}`, mainEntry] : [mainEntry]
    electron = spawn(electronBinary, electronArgs, { env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrl }, stdio: 'inherit' })
    electron.on('exit', () => { void stop() })
    return Object.freeze({ rendererUrl, electron, vite, stop })
  } catch (error) {
    await stop()
    throw new Error(`稳定 Electron 启动失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  const handle = await startStableElectron()
  const stop = async (code) => { await handle.stop(); process.exit(code) }
  process.on('SIGINT', () => { void stop(130) })
  process.on('SIGTERM', () => { void stop(143) })
  handle.electron.on('exit', (code) => process.exit(code ?? 0))
}
