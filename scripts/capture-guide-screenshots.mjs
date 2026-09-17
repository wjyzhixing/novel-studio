import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { connectCdp } from './cdp-driver.mjs'

const port = Number(process.env.NOVEL_STUDIO_CDP_PORT ?? 9223)
const outputDir = resolve(process.cwd(), 'docs/assets/novel-studio-guide')
await mkdir(outputDir, { recursive: true })

async function pageWebSocketUrl() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  const pages = await response.json()
  const page = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
  if (!page) throw new Error('找不到 Novel Studio 页面')
  return page.webSocketDebuggerUrl
}

async function rawCdp() {
  const socket = new WebSocket(await pageWebSocketUrl())
  let nextId = 1
  const pending = new Map()
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', () => reject(new Error('截图 CDP 连接失败')), { once: true })
  })
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    const callback = pending.get(message.id)
    if (!callback) return
    pending.delete(message.id)
    if (message.error) callback.reject(new Error(message.error.message ?? 'CDP 调用失败'))
    else callback.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolveCall, rejectCall) => {
    const id = nextId++
    pending.set(id, { resolve: resolveCall, reject: rejectCall })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const close = () => {
    if (socket.readyState === WebSocket.OPEN) socket.close()
  }
  return Object.freeze({ send, close })
}

const driver = await connectCdp({ port, timeoutMs: 15_000 })
const raw = await rawCdp()
await driver.waitFor('document.readyState !== "loading" && Boolean(window.novelAPI)', 15_000)

export async function capture(name) {
  const result = await raw.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  const path = resolve(outputDir, `${name}.png`)
  await writeFile(path, Buffer.from(result.data, 'base64'))
  console.log(path)
  return path
}

export { driver, outputDir }

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  try {
    await capture(process.argv[2] ?? '00-current')
  } finally {
    raw.close()
    await driver.close()
  }
}
