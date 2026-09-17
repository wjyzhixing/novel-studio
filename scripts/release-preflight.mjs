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
const update = await read('src/shared/update.ts')
const updateVerification = await read('src/main/services/update-verification.ts')
const updateSigner = await read('scripts/sign-update-manifest.mjs')
const extractZipPatch = await read('patches/extract-zip@2.0.1.patch')

const packageScripts = packageJson.scripts ?? {}

pass('package main points to out/main/index.js', packageJson.main === './out/main/index.js', packageJson.main)
pass('BrowserWindow isolates renderer', main.includes('contextIsolation: true') && main.includes('nodeIntegration: false') && main.includes('sandbox: true'))
pass('navigation/window/webview guards', main.includes('setWindowOpenHandler') && main.includes("on('will-navigate'") && main.includes("on('will-redirect'") && main.includes("on('will-attach-webview'"))
pass('production strict CSP header', main.includes("script-src 'self'") && main.includes("style-src 'self'") && main.includes("frame-src 'none'") && main.includes("object-src 'none'"))
pass('renderer avoids inline style attributes', !await read('src/renderer/src/components/Sidebar.tsx').then((value) => value.includes('style={{')))
pass('manifest schema is version gated', schema.includes('NOVEL_SCHEMA_VERSION') && project.includes('PROJECT_TOO_NEW'))
pass('project cache/logs are ignored', schema.includes("'.novel/cache'") && schema.includes("'.novel/logs'") && schema.includes("'.novel/\\n"))
pass('secret redaction exists', errors.includes('redactSensitive') && errors.includes('Bearer'))
pass('renderer has no Node access', html.includes('Content-Security-Policy') && !html.includes('nodeIntegration'))
pass('update manifest requires HTTPS, publisher signature, and SHA-512 integrity', update.includes("format: z.literal('novel-studio.update-manifest')") && update.includes('https:') && update.includes('sha512') && update.includes('signature:') && updateVerification.includes("createHash('sha512')") && updateVerification.includes('verifyUpdateManifestSignature'), 'manifest schema and Main-side signature/artifact verifiers present')
pass('publisher signing command is available without embedding private keys', packageScripts['sign:update-manifest'] && updateSigner.includes('createPrivateKey') && updateSigner.includes('签名私钥') && updateSigner.includes('privateKey'), 'private key is supplied as an external file')
pass('Electron archive extraction has symlink traversal hardening', packageJson.pnpm?.patchedDependencies?.['extract-zip@2.0.1'] === 'patches/extract-zip@2.0.1.patch' && extractZipPatch.includes('Symlink entries are not supported'), 'extract-zip is pinned to the repository patch')
pass('compiled entrypoints exist locally', await exists('out/main/index.js') && await exists('out/preload/index.cjs') && await exists('out/renderer/index.html'), 'local artifact presence only; not rebuilt by this preflight')
pass('packaging commands and artifact gate are wired', packageScripts['dist:win'] && packageScripts['dist:mac'] && packageScripts['verify:packaging'] && packageScripts['verify:artifacts'], 'commands are configured; this preflight does not build installers')
pass('migration fixtures are wired into release verification', packageScripts['verify:fixtures'] && packageScripts['verify:release']?.includes('verify:fixtures'), 'v0 and v1 fixtures are generated in a temporary directory')

const failed = checks.filter((check) => !check.ok)
console.log(JSON.stringify({ ok: failed.length === 0, checks, note: 'This preflight does not replace signing, notarization, CI, test/build, or platform installation verification.' }, null, 2))
if (failed.length > 0) process.exitCode = 1
