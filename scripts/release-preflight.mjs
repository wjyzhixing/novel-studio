import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const checks = []
const pass = (name, value, detail = '') => checks.push({ name, ok: Boolean(value), detail })
const read = async (file) => { try { return await readFile(join(root, file), 'utf8') } catch { return '' } }
const exists = async (file) => { try { await access(join(root, file)); return true } catch { return false } }

const packageJson = JSON.parse(await read('package.json'))
const main = await read('src/main/index.ts')
const schema = await read('src/shared/project-schema.ts')
const project = await read('src/main/services/project-service.ts')
const errors = await read('src/main/services/errors.ts')
const html = await read('src/renderer/index.html')

pass('package main points to out/main/index.js', packageJson.main === './out/main/index.js', packageJson.main)
pass('BrowserWindow isolates renderer', main.includes('contextIsolation: true') && main.includes('nodeIntegration: false') && main.includes('sandbox: true'))
pass('navigation/window/webview guards', main.includes('setWindowOpenHandler') && main.includes("on('will-navigate'") && main.includes("on('will-redirect'") && main.includes("on('will-attach-webview'"))
pass('production strict CSP header', main.includes("script-src 'self'") && main.includes("style-src 'self'") && main.includes("frame-src 'none'") && main.includes("object-src 'none'"))
pass('renderer avoids inline style attributes', !await read('src/renderer/src/components/Sidebar.tsx').then((value) => value.includes('style={{')))
pass('manifest schema is version gated', schema.includes('NOVEL_SCHEMA_VERSION') && project.includes('PROJECT_TOO_NEW'))
pass('project cache/logs are ignored', schema.includes("'.novel/cache'") && schema.includes("'.novel/logs'") && schema.includes("'.novel/\\n"))
pass('secret redaction exists', errors.includes('redactSensitive') && errors.includes('Bearer'))
pass('renderer has no Node access', html.includes('Content-Security-Policy') && !html.includes('nodeIntegration'))
pass('compiled entrypoints exist locally', await exists('out/main/index.js') && await exists('out/preload/index.cjs') && await exists('out/renderer/index.html'), 'local artifact presence only; not rebuilt by this preflight')

const failed = checks.filter((check) => !check.ok)
console.log(JSON.stringify({ ok: failed.length === 0, checks, note: 'This preflight does not replace signing, notarization, CI, test/build, or platform installation verification.' }, null, 2))
if (failed.length > 0) process.exitCode = 1
