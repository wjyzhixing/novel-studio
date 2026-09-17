const DEFAULT_HOST = '127.0.0.1'

async function getPageWebSocketUrl(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${host}:${port}/json/list`)
      if (response.ok) {
        const pages = await response.json()
        const page = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
        if (page) return page.webSocketDebuggerUrl
      }
    } catch { /* CDP server still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`CDP 页面未能在 ${host}:${port} 启动 (${timeoutMs}ms)`)
}

export async function connectCdp(options = {}) {
  const host = options.host ?? DEFAULT_HOST
  const port = options.port ?? 9222
  const timeoutMs = options.timeoutMs ?? 8_000
  const socket = new WebSocket(await getPageWebSocketUrl(host, port, timeoutMs))
  const pending = new Map()
  let nextId = 1
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error('CDP WebSocket 连接失败')), { once: true })
  })
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    const callback = pending.get(message.id)
    if (!callback) return
    pending.delete(message.id)
    if (message.error) callback.reject(new Error(message.error.message ?? 'CDP 调用失败'))
    else callback.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? '页面表达式执行失败')
    return result.result?.value
  }
  const waitFor = async (expression, waitTimeoutMs = timeoutMs) => {
    const deadline = Date.now() + waitTimeoutMs
    while (Date.now() < deadline) {
      try {
        if (await evaluate(expression)) return true
      } catch { /* renderer navigation can recreate the execution context */ }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`页面条件超时 (${waitTimeoutMs}ms)`)
  }
  const click = async (selector) => Boolean(await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true })()`))
  const fill = async (selector, value) => Boolean(await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value')?.set; if (!setter) return false; setter.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); return true })()`))
  const drag = async (from, to, steps = 8) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 })
    for (let index = 1; index <= steps; index += 1) {
      const progress = index / steps
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress, button: 'left', buttons: 1 })
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 })
    return true
  }
  const close = async () => {
    for (const callback of pending.values()) callback.reject(new Error('CDP 已关闭'))
    pending.clear()
    if (socket.readyState === WebSocket.CLOSED) return
    socket.close()
    await Promise.race([
      new Promise((resolveClose) => socket.addEventListener('close', resolveClose, { once: true })),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1_000))
    ])
  }
  return Object.freeze({ evaluate, waitFor, click, fill, drag, close })
}
