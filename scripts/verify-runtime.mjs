import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'vite'

const run = promisify(execFile)
const root = await mkdtemp(join(tmpdir(), 'novel-studio-runtime-'))
const recentFile = join(root, 'recents.json')
const includeLong = process.argv.includes('--long')
const report = {}
let server
const hashValue = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const { createGoldenFixture } = await import('./golden-path-fixture.mjs')

try {
  const goldenFixture = await createGoldenFixture(root)
  const goldenEvidenceText = await readFile(goldenFixture.evidencePath, 'utf8')
  await goldenFixture.cleanup()
  let fixtureCleaned = false
  try { await readFile(goldenFixture.evidencePath, 'utf8') } catch (error) { fixtureCleaned = error?.code === 'ENOENT' }
  report.goldenFixture = {
    created: goldenEvidenceText.includes('"projectCreated": true'),
    temporary: goldenEvidenceText.includes('"sourceRoot": "[temporary]"'),
    noSensitiveEvidence: !/(prompt|content|authorization|sk_|data:image|secret)/i.test(goldenEvidenceText),
    cleaned: fixtureCleaned
  }
  const fixtureArgs = ['scripts/generate-fixtures.mjs', root]
  if (includeLong) fixtureArgs.push('--long')
  await run(process.execPath, fixtureArgs, { cwd: process.cwd() })
  server = await createServer({ root: process.cwd(), server: { middlewareMode: 'ssr', hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
  const [{ ProjectService }, { RecentProjectsStore }, { ChapterService }, { SceneService }, { StoryService }, { RevisionService }, { DatabaseService, MIGRATIONS }, { providerProfileSchema }, { redactSensitive }, { TaskQueue }, { WorkflowRunStore }, { executeWorkflow }, { builtinNovelFlow }, { OpenAICompatibleImageProvider, ImageService }, { CheckpointService }, { CanonService }, { ContextService }, { OpenAICompatibleProvider, AnthropicProvider, GeminiProvider }, { AiService }, { DiagnosticsService }, { AgentService }, { storyArtifactInputSchema }, { EmbeddingIndexService }, { WorkflowRuntimeService }, { VolumeService }, { BackupService }] = await Promise.all([
    server.ssrLoadModule('/src/main/services/project-service.ts'),
    server.ssrLoadModule('/src/main/services/recent-projects.ts'),
    server.ssrLoadModule('/src/main/services/chapter-service.ts'),
    server.ssrLoadModule('/src/main/services/scene-service.ts'),
    server.ssrLoadModule('/src/main/services/story-service.ts'),
    server.ssrLoadModule('/src/main/services/revision-service.ts'),
    server.ssrLoadModule('/src/main/services/database.ts'),
    server.ssrLoadModule('/src/shared/ai.ts'),
    server.ssrLoadModule('/src/main/services/errors.ts'),
    server.ssrLoadModule('/src/main/services/task-queue.ts'),
    server.ssrLoadModule('/src/main/services/workflow-run-store.ts'),
    server.ssrLoadModule('/src/main/services/workflow-runtime.ts'),
    server.ssrLoadModule('/src/shared/builtin-workflow.ts'),
    server.ssrLoadModule('/src/main/services/image-service.ts'),
    server.ssrLoadModule('/src/main/services/checkpoint-service.ts'),
    server.ssrLoadModule('/src/main/services/canon-service.ts'),
    server.ssrLoadModule('/src/main/services/context-service.ts'),
    server.ssrLoadModule('/src/main/services/ai-provider.ts'),
    server.ssrLoadModule('/src/main/services/ai-service.ts'),
    server.ssrLoadModule('/src/main/services/diagnostics-service.ts'),
    server.ssrLoadModule('/src/main/services/agent-service.ts'),
    server.ssrLoadModule('/src/shared/story.ts'),
    server.ssrLoadModule('/src/main/services/embedding-index-service.ts'),
    server.ssrLoadModule('/src/main/services/workflow-runtime-service.ts'),
    server.ssrLoadModule('/src/main/services/volume-service.ts'),
    server.ssrLoadModule('/src/main/services/backup-service.ts')
  ])

  const safeProfile = providerProfileSchema.safeParse({ id: 'profile_fixture', name: 'Fixture', kind: 'openai-compatible', baseURL: 'https://tokenrhythm.studio/v1', model: 'fixture-model', embeddingModel: 'fixture-embedding', imageBaseURL: 'https://tokenrhythm.studio/v1', imageModel: 'qwen-image-2.0' })
  const unsafeProfile = providerProfileSchema.safeParse({ id: 'profile_fixture', name: 'Fixture', kind: 'openai-compatible', baseURL: 'http://remote.example/v1', model: 'fixture-model' })
  const redacted = redactSensitive('Bearer sk_secret_123456789 and https://x.test/?token=abc')
  report.security = { safeProviderUrl: safeProfile.success, rejectsRemoteHttp: !unsafeProfile.success, redactsSecrets: !redacted.includes('sk_secret_123456789') && !redacted.includes('token=abc') }

  const imageBodies = []
  const imageProfile = { id: 'profile_image_fixture', name: 'Image Fixture', kind: 'openai-compatible', baseURL: 'https://tokenrhythm.studio/v1', model: 'fixture-text', imageBaseURL: 'https://tokenrhythm.studio/v1', imageModel: 'qwen-image-2.0', temperature: 0.7, maxOutputTokens: 4096 }
  const imageProject = { database: { getSetting: () => JSON.stringify([imageProfile]) }, getInfo: () => ({ manifest: { providerProfile: imageProfile.id } }) }
  const imageSecrets = { get: async () => 'fixture-secret' }
  const imageFetcher = async (_input, init) => {
    imageBodies.push(JSON.parse(init.body))
    return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('fixture-image').toString('base64') }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const imageProvider = new OpenAICompatibleImageProvider(imageProject, imageSecrets, imageFetcher)
  const generatedImages = await imageProvider.generate({ prompt: 'fixture scene', negativePrompt: 'text', variants: 2, aspectRatio: '16:9', references: [] })
  let imageMissingProfileRejected = false
  try { await imageProvider.generate({ prompt: 'must reject missing image profile', variants: 1 }, undefined, 'profile_image_missing') } catch (error) { imageMissingProfileRejected = String(error).includes('Provider profile 不存在') }
  report.imageProvider = { variants: generatedImages.length, requestBodies: imageBodies, strictBody: imageBodies.every((body) => Object.keys(body).sort().join(',') === 'model,prompt'), missingProfileRejected: imageMissingProfileRejected }

  const textProfile = { id: 'profile_text_fixture', name: 'Text Fixture', kind: 'openai-compatible', baseURL: 'https://fixture.example/v1', model: 'fixture-text', embeddingModel: 'fixture-embedding', temperature: 0.7, maxOutputTokens: 128, inputTokenCostPerMillion: 1, outputTokenCostPerMillion: 2 }
  const textProvider = new OpenAICompatibleProvider(textProfile, imageSecrets, async (input, init) => {
    if (String(input).endsWith('/embeddings')) return new Response(JSON.stringify({ id: 'req_embedding_fixture', model: 'fixture-embedding', data: [{ index: 0, embedding: [1, 0, 0] }, { index: 1, embedding: [0, 1, 0] }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    const request = JSON.parse(init.body)
    return new Response(JSON.stringify({ id: 'req_fixture', choices: [{ message: { content: `echo:${request.messages[0].content}` } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  const textResult = await textProvider.chat({ messages: [{ role: 'user', content: 'hello' }] })
  report.tokenCost = { usage: textResult.usage, estimatedUsd: textResult.usage ? (textResult.usage.inputTokens * textProfile.inputTokenCostPerMillion + textResult.usage.outputTokens * textProfile.outputTokenCostPerMillion) / 1_000_000 : null, noSecretInResult: !JSON.stringify(textResult).includes('fixture-secret') }
  const embeddingResult = await textProvider.embed(['hello', '世界'])
  report.embeddingProvider = { vectors: embeddingResult.vectors.length, dimensions: embeddingResult.vectors[0]?.length ?? 0, model: embeddingResult.model, requestId: embeddingResult.requestId }
  const { resolveContextBudget, resolveOutputBudget } = await import('../src/shared/ai.ts')
  report.contextWindow = { capped: resolveContextBudget(5000, 4096, 1024), outputCapped: resolveOutputBudget(5000, 4096), fallback: resolveContextBudget(5000, undefined, 1024), leavesSafetyMargin: resolveContextBudget(5000, 4096, 1024) <= 4096 - 1024 - 256 }
  const structuredProvider = new OpenAICompatibleProvider({ ...textProfile, inputTokenCostPerMillion: undefined, outputTokenCostPerMillion: undefined }, imageSecrets, async () => new Response(JSON.stringify({ id: 'req_structured_fixture', choices: [{ message: { content: '{"facts":[]}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
  const structuredResult = await structuredProvider.structured({ request: { messages: [{ role: 'user', content: 'structured fixture' }] }, parse: (value) => { const parsed = JSON.parse(value); if (!Array.isArray(parsed.facts)) throw new Error('facts missing'); return parsed } })
  report.structuredOutput = { valid: Array.isArray(structuredResult.facts) }
  const modelFetcher = async (input) => {
    const url = String(input)
    if (url.includes('anthropic')) return new Response(JSON.stringify({ data: [{ id: 'claude-fixture', display_name: 'Claude Fixture' }] }), { status: 200 })
    if (url.includes('gemini')) return new Response(JSON.stringify({ models: [{ name: 'models/gemini-fixture', displayName: 'Gemini Fixture', inputTokenLimit: 32768 }] }), { status: 200 })
    return new Response(JSON.stringify({ data: [{ id: 'openai-fixture', display_name: 'OpenAI Fixture', context_window: 16384 }] }), { status: 200 })
  }
  const modelSecret = { get: async () => 'fixture-secret' }
  const discoveredModels = await Promise.all([
    new OpenAICompatibleProvider({ ...textProfile, baseURL: 'https://openai.example/v1' }, modelSecret, modelFetcher).listModels(),
    new AnthropicProvider({ ...textProfile, baseURL: 'https://anthropic.example/v1' }, modelSecret, modelFetcher).listModels(),
    new GeminiProvider({ ...textProfile, baseURL: 'https://gemini.example/v1beta' }, modelSecret, modelFetcher).listModels()
  ])
  report.modelDiscovery = { ids: discoveredModels.map((models) => models[0]?.id), contextWindows: discoveredModels.map((models) => models[0]?.contextWindow), allDiscovered: discoveredModels.every((models) => models.length === 1) }

  const recent = new RecentProjectsStore(recentFile)
  const legacyArchive = join(root, 'migration-v1-legacy.zip')
  const legacyRestoreRoot = join(root, 'migration-v1-restored')
  await run('zip', ['-rq', legacyArchive, '.'], { cwd: join(root, 'migration-v1') })
  await mkdir(legacyRestoreRoot, { recursive: true })
  const legacyBackupProject = new ProjectService(recent)
  const legacyBackupService = new BackupService(legacyBackupProject)
  await legacyBackupService.restoreArchive(legacyArchive, legacyRestoreRoot)
  const legacyInfo = await legacyBackupProject.open(legacyRestoreRoot)
  const legacyVersion = legacyBackupProject.database.raw.prepare('PRAGMA user_version').get().user_version
  report.legacyBackupMigration = { restored: legacyInfo.manifest.title === 'Migration v1', migratedTo: legacyVersion, fromVersion: legacyBackupProject.database.migrationReport.fromVersion, status: legacyBackupProject.database.migrationReport.status }
  await legacyBackupProject.close()

  const migrationDb = new DatabaseService(join(root, 'migration-v1/.novel/project.db'))
  report.migration = migrationDb.migrationReport
  report.migrationUserVersion = migrationDb.raw.prepare('PRAGMA user_version').get().user_version
  migrationDb.close()

  const preSchemaDb = new DatabaseService(join(root, 'migration-v0/.novel/project.db'))
  report.preSchemaMigration = {
    ...preSchemaDb.migrationReport,
    userVersion: preSchemaDb.raw.prepare('PRAGMA user_version').get().user_version
  }
  preSchemaDb.close()

  const staleManifestPath = join(root, 'tiny-cn/novel.yaml')
  const staleManifest = await readFile(staleManifestPath, 'utf8')
  await writeFile(staleManifestPath, staleManifest.replace('providerProfile: null', 'providerProfile: profile_missing'))
  const staleProject = new ProjectService(recent)
  const staleInfo = await staleProject.open(join(root, 'tiny-cn'))
  report.providerProfileReconciliation = { staleProfileCleared: staleInfo.manifest.providerProfile === null }
  await staleProject.close()
  const broken = new ProjectService(recent)
  await broken.open(join(root, 'broken-project'))
  const before = await broken.checkIntegrity()
  const repaired = await broken.repairIndexes()
  const after = await broken.checkIntegrity()
  report.repair = { beforeWarnings: before.warnings, repaired, afterWarnings: after.warnings, chaptersIndexed: after.chaptersIndexed, entitiesIndexed: after.entitiesIndexed }
  report.integrityPanel = {
    detectsMismatch: before.warnings.some((warning) => warning.includes('索引')),
    reportsMissingSource: before.missingFiles.includes('story/relations.yaml'),
    reportsRestoredSource: repaired.restoredSources.includes('story/relations.yaml'),
    cleanAfterRepair: after.warnings.length === 0 && after.missingFiles.length === 0
  }
  await broken.close()

  const malformedSourceRoot = join(root, 'malformed-source-project')
  await mkdir(malformedSourceRoot, { recursive: true })
  const malformedSourceProject = new ProjectService(recent)
  await malformedSourceProject.create(malformedSourceRoot, 'Malformed source fixture')
  const malformedEntityPath = join(malformedSourceRoot, 'characters/entity-broken.yaml')
  const malformedEntityText = 'id: ent_broken\nname: [无法闭合\n'
  await writeFile(malformedEntityPath, malformedEntityText)
  await writeFile(join(malformedSourceRoot, 'story/relations.yaml'), 'relations:\n  - id: rel_broken\n    metadata: [\n')
  await writeFile(join(malformedSourceRoot, 'story/timeline.yaml'), 'events:\n  - id: evt_broken\n    title: [\n')
  const malformedBefore = await malformedSourceProject.checkIntegrity()
  const malformedRepair = await malformedSourceProject.repairIndexes()
  const malformedEntityPreserved = await readFile(malformedEntityPath, 'utf8') === malformedEntityText
  report.sourceRecovery = {
    detected: ['characters/entity-broken.yaml', 'story/relations.yaml', 'story/timeline.yaml'].every((path) => malformedBefore.invalidSourceFiles.includes(path)),
    repairCompleted: true,
    reportedDuringRepair: ['characters/entity-broken.yaml', 'story/relations.yaml', 'story/timeline.yaml'].every((path) => malformedRepair.invalidSourceFiles.includes(path)),
    originalEntityPreserved: malformedEntityPreserved,
    validIndexesRemainUsable: malformedRepair.documents === 1 && malformedRepair.entities === 0
  }
  await malformedSourceProject.close()

  const project = new ProjectService(recent)
  await project.open(join(root, 'tiny-cn'))
  project.database.setSetting('ai.providerProfiles', JSON.stringify([{ id: 'profile_mock', name: 'Fixture Mock', kind: 'mock', model: 'fixture-mock', embeddingModel: 'fixture-embedding', contextWindow: 4096, temperature: 0, maxOutputTokens: 128 }]))
  await project.setProviderProfile('profile_mock')
  const auditAi = new AiService(project, { has: async () => false, set: async () => {}, get: async () => null, remove: async () => {} })
  const defaultBeforeProfileSave = project.getInfo()?.manifest.providerProfile
  await auditAi.saveProfile({ id: 'profile_second_fixture', name: 'Second Fixture', kind: 'mock', model: 'fixture-second', temperature: 0, maxOutputTokens: 128 })
  const defaultAfterProfileSave = project.getInfo()?.manifest.providerProfile
  await auditAi.selectProfile('profile_second_fixture')
  const defaultAfterExplicitSelect = project.getInfo()?.manifest.providerProfile
  await auditAi.selectProfile('profile_mock')
  let missingProfileRejected = false
  try { await auditAi.chat('profile_missing', { messages: [{ role: 'user', content: 'must reject missing provider' }] }) } catch { missingProfileRejected = true }
  report.providerProfileSaveSemantics = { savePreservesDefault: defaultBeforeProfileSave === defaultAfterProfileSave, explicitSelectChangesDefault: defaultAfterExplicitSelect === 'profile_second_fixture', missingProfileRejected }
  report.contextWindow.runtime = await auditAi.contextBudget('profile_mock', 5000, 1024)
  await auditAi.chat('profile_mock', { messages: [{ role: 'user', content: 'audit fixture prompt' }] })
  const assetsBeforeEmbeddingConnection = Number(project.database.raw.prepare('SELECT COUNT(*) AS count FROM assets').get().count)
  const embeddingConnection = await auditAi.testEmbedding('profile_mock')
  report.embeddingConnection = { ...embeddingConnection, doesNotPersistAsset: Number(project.database.raw.prepare('SELECT COUNT(*) AS count FROM assets').get().count) === assetsBeforeEmbeddingConnection }
  const diagnosticsPath = join(root, 'diagnostics.json')
  const diagnosticsResult = await new DiagnosticsService(project, new WorkflowRunStore(project)).export(diagnosticsPath)
  const diagnosticsText = await readFile(diagnosticsPath, 'utf8')
  const diagnosticsBundle = JSON.parse(diagnosticsText)
  report.diagnostics = { exported: diagnosticsResult.invocationCount > 0, invocationCount: diagnosticsResult.invocationCount, noPrompt: !diagnosticsText.includes('audit fixture prompt'), noNodePayloads: !diagnosticsText.includes('"input":') && !diagnosticsText.includes('"output":') }
  let revisions
  const volumes = new VolumeService(project)
  const chapters = new ChapterService(project, (input) => revisions.create(input), volumes)
  revisions = new RevisionService(project, chapters)
  const imported = await chapters.importFile(join(root, 'tiny-cn/chapters/001-fixture.md'))
  const scenes = new SceneService(project)
  const sceneSourceMarkdown = (await chapters.read(imported.relPath)).markdown
  const sceneParagraphs = sceneSourceMarkdown.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).length
  const createdScene = await scenes.create({ chapterRelPath: imported.relPath, title: '开场场景', startParagraph: 0, endParagraph: Math.max(0, sceneParagraphs - 1), summary: '场景元数据 fixture' })
  const updatedScene = await scenes.update({ chapterRelPath: imported.relPath, id: createdScene.id, title: '开场场景（已编辑）', startParagraph: 0, endParagraph: Math.max(0, sceneParagraphs - 1), summary: '更新后的场景摘要' })
  const listedScenes = await scenes.list(imported.relPath)
  const sidecarPersisted = (await readFile(join(project.getInfo().rootPath, `${imported.relPath.slice(0, -3)}.scenes.yaml`), 'utf8')).includes(updatedScene.id)
  const sceneProposal = await new ImageService(project, chapters, undefined, undefined, undefined, scenes).proposeScene(imported.relPath, updatedScene.id)
  let invalidSceneRangeRejected = false
  try { await scenes.create({ chapterRelPath: imported.relPath, title: '非法范围', startParagraph: 0, endParagraph: sceneParagraphs + 1, summary: '' }) } catch { invalidSceneRangeRejected = true }
  const sceneMarkdownBeforeCrud = (await chapters.read(imported.relPath)).markdown
  await scenes.reorder(imported.relPath, [updatedScene.id])
  await scenes.remove(imported.relPath, updatedScene.id)
  const listedAfterDelete = await scenes.list(imported.relPath)
  report.sceneStructure = { created: createdScene.id.startsWith('scene_'), persisted: listedScenes[0]?.title === '开场场景（已编辑）', sidecarPersisted, invalidRangeRejected: invalidSceneRangeRejected, sceneProposalScoped: sceneProposal.sceneId === updatedScene.id && sceneProposal.title === '开场场景（已编辑）', unchangedMarkdown: (await chapters.read(imported.relPath)).markdown === sceneMarkdownBeforeCrud, deleted: listedAfterDelete.length === 0 }
  const exportAssetPath = join(project.getInfo().rootPath, 'assets/scenes/export_fixture.png')
  await writeFile(exportAssetPath, Buffer.from([137, 80, 78, 71]))
  await chapters.save(imported.relPath, `${(await chapters.read(imported.relPath)).markdown.trimEnd()}\n\n![导出插图](../assets/scenes/export_fixture.png "asset_export_fixture")\n`)
  const exported = await chapters.exportAll('html', join(root, 'export.html'))
  const html = await readFile(join(root, 'export.html'), 'utf8')
  let blockedProjectOverwrite = false
  try { await chapters.exportAll('html', join(project.getInfo().rootPath, 'inside.html')) } catch { blockedProjectOverwrite = true }
  report.importExport = { imported: imported.relPath, chapterCount: exported.chapterCount, validHtml: html.startsWith('<!doctype html>'), htmlEmbedsImage: html.includes('<img') && html.includes('data:image/png;base64,iVBORw=='), blockedProjectOverwrite }
  const backupService = new BackupService(project)
  const backupBase = join(root, 'fixture-full.zip')
  const backupIncrement = join(root, 'fixture-incremental.zip')
  const backupRestoreRoot = join(root, 'fixture-restored')
  const projectArchiveRestoreRoot = join(root, 'fixture-project-archive-restored')
  const backupSource = (await chapters.read(imported.relPath)).markdown
  await backupService.createArchive(backupBase)
  await mkdir(projectArchiveRestoreRoot, { recursive: true })
  await backupService.restoreArchive(backupBase, projectArchiveRestoreRoot)
  const restoredProjectArchiveText = await readFile(join(projectArchiveRestoreRoot, imported.relPath), 'utf8')
  const restoredProjectArchiveManifest = await readFile(join(projectArchiveRestoreRoot, 'novel.yaml'), 'utf8')
  report.projectArchive = { exported: true, imported: restoredProjectArchiveText === backupSource, projectManifestValid: restoredProjectArchiveManifest.includes('projectId:'), excludesManifestFromProject: !(await readdir(projectArchiveRestoreRoot)).includes('backup-manifest.json') }
  await chapters.save(imported.relPath, `${backupSource.trimEnd()}\n\n增量备份变更\n`)
  await backupService.createIncrementalArchive(backupIncrement, backupBase)
  await mkdir(backupRestoreRoot, { recursive: true })
  await backupService.restoreIncrementalArchive(backupBase, backupIncrement, backupRestoreRoot)
  const restoredBackupText = await readFile(join(backupRestoreRoot, imported.relPath), 'utf8')
  await chapters.save(imported.relPath, backupSource)
  report.incrementalBackup = { fullCreated: true, incrementalCreated: true, restoredChangedFile: restoredBackupText.includes('增量备份变更'), excludesManifestFromProject: !(await readdir(backupRestoreRoot)).includes('backup-manifest.json') }
  const checkpoint = new CheckpointService(project)
  const checkpointSource = (await chapters.read(imported.relPath)).markdown
  const checkpointCreated = await checkpoint.create('fixture checkpoint')
  await chapters.save(imported.relPath, `${checkpointSource}\n\n临时修改`)
  await checkpoint.restore(checkpointCreated.id)
  const checkpointRestored = (await chapters.read(imported.relPath)).markdown
  const checkpointList = await checkpoint.list()
  report.checkpoint = { created: checkpointCreated.fileCount > 0, listed: checkpointList.some((item) => item.id === checkpointCreated.id), restored: checkpointRestored === checkpointSource }
  const assetsBeforeConnectionTest = Number(project.database.raw.prepare('SELECT COUNT(*) AS count FROM assets').get().count)
  const testImageService = new ImageService(project, chapters, { generate: async () => [{ assetId: 'asset_connection_test', relPath: '', mimeType: 'image/png', provider: 'fixture', model: 'fixture-image', prompt: 'test', references: [], createdAt: new Date().toISOString(), data: new Uint8Array([1]) }] })
  const defaultProfileBeforeImageTest = project.getInfo()?.manifest.providerProfile
  const imageTest = await testImageService.testConnection('profile_mock')
  const assetsAfterConnectionTest = Number(project.database.raw.prepare('SELECT COUNT(*) AS count FROM assets').get().count)
  report.imageConnectionTest = { provider: imageTest.provider, model: imageTest.model, doesNotPersistAsset: assetsBeforeConnectionTest === assetsAfterConnectionTest, preservesDefaultProfile: defaultProfileBeforeImageTest === project.getInfo()?.manifest.providerProfile }
  const canon = new CanonService(project)
  const temporalBase = { subjectId: 'ent_lan', predicate: 'status.locationId', object: 'place_a', validFrom: 'chapter:1', validTo: 'chapter:3', confidence: 1, source: { documentId: 'ch01', range: [1, 2] } }
  const temporalProposal = await canon.proposeFact(temporalBase)
  await canon.applyProposal(temporalProposal.id)
  const nonOverlapping = await canon.check({ ...temporalBase, object: 'place_b', validFrom: 'chapter:4', validTo: null, source: { documentId: 'ch04', range: [1, 2] } })
  const overlapping = await canon.check({ ...temporalBase, object: 'place_c', validFrom: 'chapter:2', validTo: null, source: { documentId: 'ch02', range: [1, 2] } })
  report.canonTemporal = { nonOverlappingConflicts: nonOverlapping.length, overlappingKinds: overlapping.map((item) => item.kind) }
  const story = new StoryService(project)
  project.database.raw.prepare("INSERT INTO story_artifacts(id, kind, title, fields_json, notes, updated_at) VALUES(?, 'foreshadowing', ?, ?, ?, ?)").run('art_invalid_fixture', '损坏伏笔 fixture', '{}', '', new Date().toISOString())
  const invalidStoryIntegrity = await project.checkIntegrity()
  const invalidStoryIndex = await story.listForeshadowing()
  report.invalidStoryData = { reported: invalidStoryIntegrity.invalidStoryArtifacts === 1, excludedFromLifecycleIndex: !invalidStoryIndex.some((item) => item.id === 'art_invalid_fixture') }
  project.database.raw.prepare('DELETE FROM story_artifacts WHERE id = ?').run('art_invalid_fixture')
  const foreshadowingArtifact = await story.saveArtifact({ kind: 'foreshadowing', title: '生命周期 fixture', fields: { setup: '第一章出现', target: '终章回收', status: 'planted', payoffDeadline: 'chapter:10', evidence: 'ch04', evidenceItems: [{ chapterRelPath: imported.relPath, quote: '芯片在月光下闪烁', note: '首次出现' }], relatedChapters: [imported.relPath] }, notes: '' })
  const indexedForeshadowing = await story.listForeshadowing('planted')
  const persistedForeshadowing = (await story.listArtifacts('foreshadowing')).find((item) => item.id === foreshadowingArtifact.id)
  report.foreshadowingIndex = { saved: Boolean(foreshadowingArtifact.id), queryByStatus: indexedForeshadowing.some((item) => item.id === foreshadowingArtifact.id), hasStructuredFields: indexedForeshadowing[0]?.setup === '第一章出现' && indexedForeshadowing[0]?.target === '终章回收', chapterLink: indexedForeshadowing[0]?.relatedChapters.includes(imported.relPath), evidencePersisted: Array.isArray(persistedForeshadowing?.fields.evidenceItems) && persistedForeshadowing.fields.evidenceItems[0]?.chapterRelPath === imported.relPath, evidenceReturned: indexedForeshadowing[0]?.evidenceItems[0]?.quote === '芯片在月光下闪烁' }
  const embeddingIndex = new EmbeddingIndexService(project, chapters, auditAi)
  const contextScene = await scenes.create({ chapterRelPath: imported.relPath, title: 'Context 场景', startParagraph: 0, endParagraph: 0, summary: '' })
  const context = new ContextService(project, chapters, story, canon, embeddingIndex, scenes)
  const scopedContext = await context.build({ relPath: imported.relPath, sceneId: contextScene.id, selection: null, query: '', recipe: { id: 'scene-scope-fixture', maxTokens: 500, includeSelection: false, entityLimit: 0, semanticLimit: 0 } })
  const budgetContext = await context.build({ relPath: imported.relPath, sceneId: contextScene.id, selection: '选区内容'.repeat(500), query: 'fixture', recipe: { id: 'budget-fixture', maxTokens: 10, includeSelection: true, entityLimit: 20, semanticLimit: 5 } })
  report.contextBudget = { withinBudget: budgetContext.manifest.totalTokens <= budgetContext.manifest.budgetTokens, budgetTokens: budgetContext.manifest.budgetTokens, totalTokens: budgetContext.manifest.totalTokens, hasTruncationRecord: budgetContext.manifest.items.some((item) => item.truncated === true), omittedSources: budgetContext.manifest.omittedSources, retrievalTrace: budgetContext.manifest.retrieval, sceneScoped: scopedContext.manifest.items.some((item) => item.source === `chapter:${imported.relPath}#${contextScene.id}`) }
  const sceneWorkflow = {
    schemaVersion: 1, id: 'flow_scene_fixture', name: 'Scene Fixture', cyclePolicy: 'reject', variables: [],
    nodes: [
      { id: 'chapter', type: 'input.chapter', label: 'Chapter', position: { x: 0, y: 0 }, inputs: [], outputs: [{ id: 'out', type: 'chapter', required: false }], config: {} },
      { id: 'context', type: 'context.load', label: 'Context', position: { x: 0, y: 0 }, inputs: [{ id: 'in', type: 'chapter', required: true }], outputs: [{ id: 'out', type: 'context', required: false }], config: {} },
      { id: 'proposal', type: 'image.propose', label: 'Proposal', position: { x: 0, y: 0 }, inputs: [{ id: 'in', type: 'any', required: true }], outputs: [{ id: 'out', type: 'scene', required: false }], config: {} }
    ],
    edges: [{ id: 'edge-chapter-context', source: 'chapter', sourcePort: 'out', target: 'context', targetPort: 'in' }, { id: 'edge-context-proposal', source: 'context', sourcePort: 'out', target: 'proposal', targetPort: 'in' }]
  }
  const sceneWorkflowRuntime = new WorkflowRuntimeService({ list: async () => [{ id: sceneWorkflow.id, name: sceneWorkflow.name, relPath: 'workflows/flow_scene_fixture.novelflow.json' }], read: async () => sceneWorkflow }, new WorkflowRunStore(project), auditAi, chapters, context, { extractFromChapter: async () => [] }, new ImageService(project, chapters, undefined, story, revisions, scenes))
  const sceneWorkflowRun = await sceneWorkflowRuntime.run(sceneWorkflow.id, imported.relPath, contextScene.id)
  const sceneWorkflowContext = sceneWorkflowRun.outputs.context
  const sceneWorkflowProposal = sceneWorkflowRun.outputs.proposal
  report.workflowSceneScope = { persisted: sceneWorkflowRun.sceneId === contextScene.id, contextScoped: sceneWorkflowContext?.manifest?.items?.some((item) => item.source === `chapter:${imported.relPath}#${contextScene.id}`) === true, proposalScoped: sceneWorkflowProposal?.sceneId === contextScene.id }
  const embeddingBefore = project.database.raw.prepare('SELECT content_hash FROM embeddings WHERE rel_path = ?').get(imported.relPath)?.content_hash
  await chapters.save(imported.relPath, `${(await chapters.read(imported.relPath)).markdown}\n\nembedding 增量 fixture`)
  await embeddingIndex.sync()
  const embeddingAfter = project.database.raw.prepare('SELECT content_hash FROM embeddings WHERE rel_path = ?').get(imported.relPath)?.content_hash
  await chapters.save(imported.relPath, (await chapters.read(imported.relPath)).markdown.replace(/\n\nembedding 增量 fixture$/, ''))
  await embeddingIndex.sync()
  report.embeddingIndex = { method: budgetContext.manifest.retrieval.method, rows: Number(project.database.raw.prepare('SELECT COUNT(*) AS count FROM embeddings').get().count), locatedSources: [...budgetContext.manifest.retrieval.selectedSources, ...budgetContext.manifest.retrieval.omittedSources].some((source) => source.startsWith('embedding:')), incrementalReindex: embeddingBefore !== embeddingAfter }
  project.database.raw.prepare('UPDATE embeddings SET content_hash = ? WHERE rel_path = ?').run('stale-fixture-hash', imported.relPath)
  project.database.raw.prepare('INSERT INTO embeddings(rel_path, model, dimensions, vector_json, content_hash, title, preview, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)').run('chapters/999-missing.md', 'fixture-embedding', 3, '[1,0,0]', 'dangling-fixture-hash', '悬空', '', new Date().toISOString())
  const embeddingIntegrityBefore = await project.checkIntegrity()
  const embeddingRepair = await project.repairIndexes()
  const embeddingIntegrityAfter = await project.checkIntegrity()
  report.embeddingIntegrity = { stale: embeddingIntegrityBefore.staleEmbeddings, dangling: embeddingIntegrityBefore.danglingEmbeddings, removed: embeddingRepair.embeddingsRemoved, clean: embeddingIntegrityAfter.staleEmbeddings === 0 && embeddingIntegrityAfter.danglingEmbeddings === 0 }
  for (let index = 0; index < 101; index++) await context.build({ relPath: imported.relPath, selection: null, query: `retention-${index}`, recipe: { id: 'retention-fixture', maxTokens: 100, includeSelection: false, entityLimit: 1, semanticLimit: 0 } })
  const retainedSnapshotRows = Number(project.database.raw.prepare('SELECT COUNT(*) AS count FROM context_snapshots WHERE rel_path = ? AND recipe_id = ?').get(imported.relPath, 'retention-fixture').count)
  report.snapshotRetention = { retained: retainedSnapshotRows, listed: (await context.listSnapshots(imported.relPath)).length }
  await context.build({ relPath: imported.relPath, selection: null, query: 'fixture', recipe: { id: 'replay-fixture', maxTokens: 1000, includeSelection: false, entityLimit: 20, semanticLimit: 5 } })
  const contextSnapshots = await context.listSnapshots(imported.relPath)
  const contextSnapshot = contextSnapshots[0] ? await context.readSnapshot(contextSnapshots[0].id) : null
  const replayStable = contextSnapshot ? await context.replaySnapshot(contextSnapshot.id) : null
  const originalContextMarkdown = (await chapters.read(imported.relPath)).markdown
  await chapters.save(imported.relPath, `回放差异 fixture\n${originalContextMarkdown}`)
  const replayChanged = contextSnapshot ? await context.replaySnapshot(contextSnapshot.id) : null
  await chapters.save(imported.relPath, originalContextMarkdown)
  const snapshotFileRow = contextSnapshot ? project.database.raw.prepare('SELECT file_path FROM context_snapshots WHERE id = ?').get(contextSnapshot.id) : null
  let legacySnapshotReadable = false
  let futureSnapshotRejected = false
  if (snapshotFileRow?.file_path) {
    const snapshotFile = join(project.getInfo().rootPath, snapshotFileRow.file_path)
    const currentSnapshotJson = JSON.parse(await readFile(snapshotFile, 'utf8'))
    const legacySnapshotJson = JSON.parse(JSON.stringify(currentSnapshotJson))
    legacySnapshotJson.formatVersion = 0
    legacySnapshotJson.projectSchemaVersion = 0
    legacySnapshotJson.retrievalVersion = 0
    delete legacySnapshotJson.result.manifest.retrievalVersion
    const legacyResultHash = hashValue({ text: legacySnapshotJson.result.text, manifest: { ...legacySnapshotJson.result.manifest, generatedAt: undefined } })
    legacySnapshotJson.resultHash = legacyResultHash
    await writeFile(snapshotFile, JSON.stringify(legacySnapshotJson))
    project.database.raw.prepare('UPDATE context_snapshots SET result_hash = ? WHERE id = ?').run(legacyResultHash, contextSnapshot.id)
    const legacyRead = await context.readSnapshot(contextSnapshot.id)
    const legacyReplay = await context.replaySnapshot(contextSnapshot.id)
    legacySnapshotReadable = legacyRead.formatVersion === 1 && legacyRead.retrievalVersion === 1 && legacyRead.result.manifest.retrievalVersion === 1 && legacyReplay.compatibility.migrated && legacyReplay.compatibility.fromRetrievalVersion === 0 && legacyReplay.compatibility.fromProjectSchemaVersion === 0 && legacyReplay.compatibility.resultStrategy === 'recompute' && legacyReplay.compatibility.sourceResultReusable === false && legacyReplay.compatibility.notes.some((note) => note.includes('重新计算来源与预算'))
    await writeFile(snapshotFile, JSON.stringify({ ...currentSnapshotJson, formatVersion: 999 }))
    try { await context.readSnapshot(contextSnapshot.id) } catch { futureSnapshotRejected = true }
    await writeFile(snapshotFile, JSON.stringify(currentSnapshotJson))
    project.database.raw.prepare('UPDATE context_snapshots SET result_hash = ? WHERE id = ?').run(currentSnapshotJson.resultHash, contextSnapshot.id)
  }
  report.snapshotVersions = { legacyReadable: legacySnapshotReadable, futureRejected: futureSnapshotRejected, legacyResultStrategy: contextSnapshot ? (await context.replaySnapshot(contextSnapshot.id)).compatibility.resultStrategy : null }
  report.contextReplay = { listed: contextSnapshots.length > 0, readable: Boolean(contextSnapshot?.result.manifest), stable: replayStable?.changed === false, detectsChange: replayChanged?.changed === true, hasDifferences: (replayChanged?.differences.length ?? 0) > 0, hasHashes: Boolean(contextSnapshot?.requestHash && contextSnapshot?.resultHash) }
  const validForeshadowing = storyArtifactInputSchema.safeParse({ kind: 'foreshadowing', title: '伏笔 fixture', fields: { setup: '黑色芯片出现', target: '终章揭示', status: 'planned' }, notes: '' })
  const validForeshadowingEvidence = storyArtifactInputSchema.safeParse({ kind: 'foreshadowing', title: '带证据伏笔', fields: { setup: '第一章埋设', target: '终章回收', evidenceItems: [{ chapterRelPath: 'chapters/001-fixture.md', quote: '黑色芯片在月光下闪烁', note: '首次明确出现' }] }, notes: '' })
  const invalidForeshadowingEvidence = storyArtifactInputSchema.safeParse({ kind: 'foreshadowing', title: '非法证据', fields: { setup: '第一章埋设', target: '终章回收', evidenceItems: [{ chapterRelPath: 'notes/not-a-chapter.md', quote: '越界' }] }, notes: '' })
  const invalidForeshadowing = storyArtifactInputSchema.safeParse({ kind: 'foreshadowing', title: '非法伏笔', fields: { setup: '缺少目标', status: 'unknown' }, notes: '' })
  const invalidLore = storyArtifactInputSchema.safeParse({ kind: 'lore', title: '非法规则', fields: { scope: '全世界' }, notes: '' })
  const loreSourceArtifact = await story.saveArtifact({ kind: 'lore', title: '独立规则 fixture', fields: { scope: '全世界', rule: '月光会显露芯片纹理' }, notes: '这是一条独立 Markdown 源。' })
  const loreSourcePath = join(project.getInfo().rootPath, `world/lore/${loreSourceArtifact.id}.md`)
  const loreSourceText = await readFile(loreSourcePath, 'utf8')
  const invalidLoreSource = 'world/lore/art_invalid_source.md'
  await writeFile(join(project.getInfo().rootPath, invalidLoreSource), '---\nid: art_invalid_source\nkind: lore\ntitle: 损坏 Lore\nfields:\n  scope: 全世界\n---\n')
  const invalidEntitySource = 'world/places/entity_invalid_source.yaml'
  const invalidTimelineSource = 'story/timeline.yaml'
  const invalidRelationSource = 'story/relations.yaml'
  await writeFile(join(project.getInfo().rootPath, invalidEntitySource), 'id: ent_invalid_source\naliases: []\nnotes: 缺少名称\n')
  await writeFile(join(project.getInfo().rootPath, invalidTimelineSource), 'events:\n  - id: evt_invalid_source\n    description: 缺少标题\n')
  await writeFile(join(project.getInfo().rootPath, invalidRelationSource), 'relations:\n  - id: rel_invalid_source\n    fromId: ent_su\n    relationType: 缺少终点\n')
  const invalidAssetSource = 'assets/scenes/asset_invalid_source.yaml'
  await writeFile(join(project.getInfo().rootPath, invalidAssetSource), 'assetId: invalid\nrelPath: ../outside.png\nmimeType: text/plain\nprovider: ""\nmodel: ""\nprompt: ""\nreferences: []\ncreatedAt: now\n')
  const invalidSourceIntegrity = await project.checkIntegrity()
  await rm(join(project.getInfo().rootPath, 'story/artifacts.yaml'))
  const repairedLore = await project.repairIndexes()
  const repairedLoreList = await story.listArtifacts('lore')
  report.storySchema = { validForeshadowing: validForeshadowing.success, validForeshadowingEvidence: validForeshadowingEvidence.success, rejectsInvalidEvidenceChapter: !invalidForeshadowingEvidence.success, rejectsInvalidStatusAndMissingTarget: !invalidForeshadowing.success, rejectsIncompleteLore: !invalidLore.success, loreMarkdownSource: loreSourceText.includes(`id: ${loreSourceArtifact.id}`) && loreSourceText.includes('这是一条独立 Markdown 源。'), loreRebuiltFromSource: repairedLore.restoredSources.includes('story/artifacts.yaml') && repairedLoreList.some((artifact) => artifact.id === loreSourceArtifact.id && artifact.notes.includes('独立 Markdown 源')), sourceSchemaReported: invalidSourceIntegrity.invalidSourceFiles.includes(invalidLoreSource) && invalidSourceIntegrity.invalidSourceFiles.includes(invalidEntitySource) && invalidSourceIntegrity.invalidSourceFiles.some((file) => file.startsWith(`${invalidTimelineSource}#events`)) && invalidSourceIntegrity.invalidSourceFiles.some((file) => file.startsWith(`${invalidRelationSource}#relations`)) && invalidSourceIntegrity.invalidSourceFiles.includes(invalidAssetSource) && repairedLore.invalidSourceFiles.includes(invalidLoreSource) && repairedLore.invalidSourceFiles.includes(invalidAssetSource) }
  await story.saveTimelineEvent({ id: 'evt_delete_fixture', title: '实体删除回链', at: null, description: '', chapterRelPath: imported.relPath, entityIds: ['ent_su'], locationId: null, causes: '删除前因', effects: '删除后果' })
  let canonDeleteBlocked = false
  try { await story.deleteEntity('ent_lan') } catch (error) { canonDeleteBlocked = error?.code === 'VALIDATION_FAILED' }
  await story.deleteEntity('ent_su')
  const timelineAfterEntityDelete = (await story.listTimeline()).find((event) => event.id === 'evt_delete_fixture')
  report.referenceIntegrity = { canonDeleteBlocked, timelineEntityRefsCleaned: timelineAfterEntityDelete?.entityIds.length === 0, eventStructurePersisted: timelineAfterEntityDelete?.causes === '删除前因' && timelineAfterEntityDelete?.effects === '删除后果' }
  const moveCandidate = await chapters.create('路径迁移章节')
  const volume = await volumes.create({ title: '第一卷' })
  await volumes.assignChapter(volume.id, moveCandidate.relPath)
  const moveScene = await scenes.create({ chapterRelPath: moveCandidate.relPath, title: '迁移场景', startParagraph: 0, endParagraph: 0, summary: '' })
  await chapters.saveNote(moveCandidate.relPath, '迁移前笔记')
  const moveRevision = await revisions.create({ relPath: moveCandidate.relPath, actor: 'human', source: 'move-fixture', original: '# old', replacement: '# new' })
  await story.saveTimelineEvent({ id: 'evt_chapter_move', title: '路径迁移回链', at: null, description: '', chapterRelPath: moveCandidate.relPath, entityIds: [] })
  const moveRunState = { id: 'run_move_fixture', workflowId: 'flow_fixture', status: 'failed', relPath: moveCandidate.relPath, nodes: {}, outputs: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  project.database.raw.prepare('INSERT INTO workflow_runs(id, workflow_id, status, state_json, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?)').run(moveRunState.id, moveRunState.workflowId, moveRunState.status, JSON.stringify(moveRunState), moveRunState.createdAt, moveRunState.updatedAt)
  const movedBefore = moveCandidate.relPath
  await chapters.move(moveCandidate.relPath, 0)
  const movedCandidate = (await chapters.list()).find((item) => item.title === moveCandidate.title)
  const movedTimeline = (await story.listTimeline()).find((event) => event.id === 'evt_chapter_move')
  const movedNote = movedCandidate ? await chapters.readNote(movedCandidate.relPath) : ''
  const movedRevision = movedCandidate ? (await revisions.list(movedCandidate.relPath)).find((item) => item.id === moveRevision.id) : undefined
  const movedVolume = (await volumes.list()).find((item) => item.id === volume.id)
  const movedRun = project.database.raw.prepare('SELECT state_json FROM workflow_runs WHERE id = ?').get(moveRunState.id)
  const movedScenes = movedCandidate ? await scenes.list(movedCandidate.relPath) : []
  let movedRunPath = ''
  try { movedRunPath = JSON.parse(movedRun.state_json).relPath } catch { movedRunPath = '' }
  report.chapterMove = { pathChanged: Boolean(movedCandidate && movedCandidate.relPath !== movedBefore), timelineRemapped: movedTimeline?.chapterRelPath === movedCandidate?.relPath, notesRemapped: movedNote === '迁移前笔记', revisionRemapped: movedRevision?.relPath === movedCandidate?.relPath, workflowRemapped: movedRunPath === movedCandidate?.relPath, sceneRemapped: movedScenes.some((scene) => scene.id === moveScene.id && scene.chapterRelPath === movedCandidate?.relPath), volumeRemapped: movedVolume?.chapterRelPaths.includes(movedCandidate?.relPath ?? '') === true }
  report.volumeTree = { created: volume.id.startsWith('volume_'), assigned: (await volumes.list()).some((item) => item.id === volume.id && item.chapterRelPaths.includes(movedCandidate?.relPath ?? '')), remapped: movedVolume?.chapterRelPaths.includes(movedCandidate?.relPath ?? '') === true, sourcePersisted: (await readFile(join(project.getInfo().rootPath, 'story/volumes.yaml'), 'utf8')).includes(volume.id) }
  const chapterToDelete = await chapters.create('删除完整性章节')
  const deleteScene = await scenes.create({ chapterRelPath: chapterToDelete.relPath, title: '删除场景', startParagraph: 0, endParagraph: 0, summary: '' })
  await chapters.saveNote(chapterToDelete.relPath, '删除前笔记')
  await story.saveTimelineEvent({ id: 'evt_chapter_delete', title: '删除回链', at: null, description: '', chapterRelPath: chapterToDelete.relPath, entityIds: [] })
  const beforeDeleteFacts = Number(project.database.raw.prepare('SELECT COUNT(*) AS count FROM facts').get().count)
  await chapters.remove(chapterToDelete.relPath)
  const afterDeleteIntegrity = await project.checkIntegrity()
  const timelineAfterChapterDelete = (await story.listTimeline()).find((event) => event.id === 'evt_chapter_delete')
  const deleteRevision = (await revisions.list(chapterToDelete.relPath)).find((item) => item.source === `chapter-delete:${chapterToDelete.relPath}`)
  let noteAfterDelete = ''
  try { noteAfterDelete = await chapters.readNote(chapterToDelete.relPath) } catch { noteAfterDelete = '' }
  let chapterStillExists = true
  try { await chapters.read(chapterToDelete.relPath) } catch { chapterStillExists = false }
  let deletedSceneStillExists = true
  try { deletedSceneStillExists = (await scenes.list(chapterToDelete.relPath)).some((scene) => scene.id === deleteScene.id) } catch { deletedSceneStillExists = false }
  const afterDeleteFacts = Number(project.database.raw.prepare('SELECT COUNT(*) AS count FROM facts').get().count)
  report.chapterDelete = {
    chapterRemoved: !chapterStillExists,
    timelineDetached: timelineAfterChapterDelete?.chapterRelPath === null,
    noDanglingChapterRefs: afterDeleteIntegrity.danglingTimelineChapterRefs === 0,
    notesRemoved: noteAfterDelete === '',
    revisionCaptured: Boolean(deleteRevision?.original && deleteRevision.replacement === ''),
    factsPreserved: beforeDeleteFacts === afterDeleteFacts,
    sceneRemoved: !deletedSceneStillExists
  }
  const queue = new TaskQueue(2)
  let active = 0
  let maxActive = 0
  const order = []
  await Promise.all([0, 1, 2, 3].map((index) => queue.enqueue(async () => {
    active += 1; maxActive = Math.max(maxActive, active); await new Promise((resolve) => setTimeout(resolve, 5)); order.push(index); active -= 1; return index
  })))
  report.queue = { maxActive, fifo: order.join(',') === '0,1,2,3', pendingAfterDrain: queue.pendingCount }
  const timeoutWorkflow = { schemaVersion: 1, id: 'flow_timeout_fixture', name: 'Timeout Fixture', cyclePolicy: 'reject', nodes: [{ id: 'slow', type: 'utility.transform', label: 'Slow', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: { timeoutMs: 5 } }], edges: [], variables: [] }
  const timeoutRun = await executeWorkflow(timeoutWorkflow, async () => { await new Promise((resolve) => setTimeout(resolve, 20)); return { status: 'succeeded', output: 'late' } })
  report.timeout = { status: timeoutRun.state.status, error: timeoutRun.state.nodes.slow.error ?? '', errorCategory: timeoutRun.state.nodes.slow.diagnostics?.errorCategory ?? '' }
  const retryWorkflow = { schemaVersion: 1, id: 'flow_retry_fixture', name: 'Retry Fixture', cyclePolicy: 'reject', nodes: [{ id: 'flaky', type: 'utility.transform', label: 'Flaky', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: { retry: 1 } }], edges: [], variables: [] }
  let retryAttempts = 0
  const retryRun = await executeWorkflow(retryWorkflow, async () => { retryAttempts += 1; if (retryAttempts === 1) throw new Error('fixture transient failure'); return { status: 'succeeded', output: 'recovered' } })
  report.nodeRetry = { attempts: retryAttempts, status: retryRun.state.status, nodeStatus: retryRun.state.nodes.flaky.status }
  const variableWorkflow = {
    schemaVersion: 1,
    id: 'flow_variable_fixture',
    name: 'Variable Fixture',
    cyclePolicy: 'reject',
    variables: [{ name: 'tone', type: 'text', defaultValue: '冷峻' }, { name: 'count', type: 'number', defaultValue: 2 }],
    nodes: [{ id: 'variable-node', type: 'utility.transform', label: 'Variable', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: { prompt: '风格={{tone}}，次数={{count}}' } }],
    edges: []
  }
  const variableRun = await executeWorkflow(variableWorkflow, async ({ config }) => ({ status: 'succeeded', output: config.prompt }), { variables: { tone: '明亮' } })
  let unknownVariableRejected = false
  try {
    await executeWorkflow({ ...variableWorkflow, id: 'flow_unknown_variable_fixture', nodes: [{ ...variableWorkflow.nodes[0], config: { prompt: '{{missing}}' } }] }, async () => ({ status: 'succeeded' }))
  } catch (error) { unknownVariableRejected = String(error).includes('missing') }
  report.workflowVariables = { resolved: variableRun.state.outputs['variable-node'] === '风格=明亮，次数=2', unknownVariableRejected }
  let idempotentImageCalls = 0
  project.database.setSetting('ai.providerProfiles', JSON.stringify([{ id: 'profile_image_runtime', name: 'Image Runtime Fixture', kind: 'openai-compatible', baseURL: 'https://fixture.example/v1', model: 'fixture-text', imageBaseURL: 'https://fixture.example/v1', imageModel: 'fixture-image' }]))
  await project.setProviderProfile('profile_image_runtime')
  const idempotentImageService = new ImageService(project, chapters, { generate: async (request) => {
    idempotentImageCalls += 1
    return [{ assetId: 'asset_idempotent_fixture', relPath: '', mimeType: 'image/png', provider: 'fixture', model: 'fixture-image', prompt: request.prompt, references: [], createdAt: new Date().toISOString(), data: new Uint8Array([1, 2, 3]) }]
  } })
  const idempotentRequest = { prompt: 'idempotent fixture', negativePrompt: '', references: [], aspectRatio: '1:1', variants: 1, sceneId: 'scene_idempotent_fixture', idempotencyKey: 'run_fixture:image-generate' }
  const firstIdempotentAssets = await idempotentImageService.generate(idempotentRequest)
  const secondIdempotentAssets = await idempotentImageService.generate(idempotentRequest)
  const idempotentChapter = await chapters.create('图片幂等章节')
  await idempotentImageService.insertIntoChapter(idempotentChapter.relPath, firstIdempotentAssets[0].assetId, '幂等插图', 'run_fixture:image-insert')
  const idempotentInserted = await idempotentImageService.insertIntoChapter(idempotentChapter.relPath, firstIdempotentAssets[0].assetId, '幂等插图', 'run_fixture:image-insert')
  report.imageIdempotency = { providerCalls: idempotentImageCalls, sameAsset: firstIdempotentAssets[0]?.assetId === secondIdempotentAssets[0]?.assetId, sceneIdPersisted: firstIdempotentAssets[0]?.sceneId === 'scene_idempotent_fixture', insertedOnce: (idempotentInserted.markdown.match(/!\[[^\]]*\]\([^)]*asset_idempotent_fixture[^)]*\)/g) ?? []).length === 1 }
  const writerPolicy = new AgentService().policy('writer')
  let policyAttempts = 0
  const policyRetryRun = await executeWorkflow({ ...retryWorkflow, id: 'flow_policy_retry_fixture', nodes: [{ ...retryWorkflow.nodes[0], type: 'ai.prompt', config: { agent: 'writer' } }] }, async () => { policyAttempts += 1; if (policyAttempts === 1) throw new Error('fixture policy failure'); return { status: 'succeeded', output: 'policy recovered' } }, { retryForNode: () => writerPolicy.maxRetries })
  report.agentPolicy = { agentId: writerPolicy.agentId, temperature: writerPolicy.temperature, maxOutputTokens: writerPolicy.maxOutputTokens, recipe: writerPolicy.contextRecipeId, maxRetries: writerPolicy.maxRetries, attempts: policyAttempts, status: policyRetryRun.state.status }
  const runStore = new WorkflowRunStore(project)
  await runStore.ensureJob('run_queued_fixture', 'flow_fixture')
  const queuedJob = (await runStore.listJobs()).find((job) => job.refId === 'run_queued_fixture')
  const now = new Date().toISOString()
  await runStore.save({ id: 'run_recovery_fixture', workflowId: 'flow_fixture', status: 'running', relPath: imported.relPath, nodes: { writer: { nodeId: 'writer', status: 'running', input: { fixture: true }, attempts: 1, log: [] } }, outputs: {}, createdAt: now, updatedAt: now })
  const recovered = await runStore.recoverInterrupted()
  const recoveredState = await runStore.get('run_recovery_fixture')
  report.recovery = { recovered, status: recoveredState?.status, nodeStatus: recoveredState?.nodes.writer?.status, retryableMessage: recoveredState?.nodes.writer?.error ?? '' }
  let recoveredJob
  try { recoveredJob = project.database.raw.prepare('SELECT status, attempts, error FROM jobs WHERE ref_id = ?').get('run_recovery_fixture') } catch { recoveredJob = undefined }
  report.jobsPersistence = { present: Boolean(recoveredJob), status: recoveredJob?.status, attempts: recoveredJob?.attempts, hasError: Boolean(recoveredJob?.error), queuedVisible: queuedJob?.status === 'queued' }

  // Exercise the built-in authoring flow through both human gates without
  // contacting a real provider. This is a runtime smoke, not a test runner.
  const builtIn = builtinNovelFlow()
  const executeBuiltIn = async (initialState, resumeInput) => executeWorkflow(builtIn, async ({ nodeId }) => {
    if (nodeId === 'review') return { status: 'waiting_human', output: { review: true }, log: ['waiting for review'] }
    if (nodeId === 'image-propose') return { status: 'succeeded', output: { id: 'scene_fixture', suggestedPrompt: 'fixture scene', negativePrompt: '' } }
    if (nodeId === 'image-generate') return { status: 'succeeded', output: [{ assetId: 'asset_fixture', relPath: 'assets/scenes/asset_fixture.png' }] }
    if (nodeId === 'image-select') return { status: 'waiting_human', output: [{ assetId: 'asset_fixture', relPath: 'assets/scenes/asset_fixture.png' }], log: ['waiting for image selection'] }
    if (nodeId === 'image-insert') return { status: 'succeeded', output: { markdown: '![fixture](assets/scenes/asset_fixture.png "asset_fixture")' } }
    return { status: 'succeeded', output: { nodeId } }
  }, { initialState, resumeInput })
  const reviewPaused = await executeBuiltIn(undefined, undefined)
  const imagePaused = await executeBuiltIn(reviewPaused.state, { approved: true })
  const completed = await executeBuiltIn(imagePaused.state, { assetId: 'asset_fixture' })
  const imageInsertState = completed.state.nodes['image-insert']
  report.builtInWorkflow = {
    hasImageNodes: ['image-propose', 'image-generate', 'image-select', 'image-insert'].every((id) => builtIn.nodes.some((node) => node.id === id)),
    pausesAtReview: reviewPaused.state.status === 'waiting_human',
    pausesAtImageSelection: imagePaused.state.status === 'waiting_human' && imagePaused.state.nodes['image-select']?.status === 'waiting_human',
    resumesToInsert: completed.state.status === 'succeeded' && imageInsertState?.status === 'succeeded' && String(imageInsertState.output?.markdown ?? '').includes('asset_fixture')
  }
  report.inspector = {
    inputSummary: Boolean(reviewPaused.state.nodes['chapter-input']?.inputSummary),
    outputSummary: Boolean(reviewPaused.state.nodes.review?.outputSummary),
    timeoutCategory: report.timeout.errorCategory
  }
  await project.close()

  if (includeLong) {
    const scale = new ProjectService(recent)
    await scale.open(join(root, 'long-cn'))
    const beforeScale = await scale.checkIntegrity()
    const repairStarted = performance.now()
    const repairedScale = await scale.repairIndexes()
    const repairMs = Math.round(performance.now() - repairStarted)
    const listStarted = performance.now()
    const scaleChapterList = await new ChapterService(scale).list()
    const listMs = Math.round(performance.now() - listStarted)
    const integrityStarted = performance.now()
    const afterScale = await scale.checkIntegrity()
    const integrityMs = Math.round(performance.now() - integrityStarted)
    const factCount = scale.database.raw.prepare('SELECT COUNT(*) AS count FROM facts').get().count
    report.scale = { beforeWarnings: beforeScale.warnings, repaired: repairedScale, chaptersListed: scaleChapterList.length, chaptersIndexed: afterScale.chaptersIndexed, entitiesIndexed: afterScale.entitiesIndexed, facts: factCount, timingsMs: { repair: repairMs, chapterList: listMs, integrity: integrityMs } }
    await scale.close()
  }

  const latestMigrationVersion = MIGRATIONS.at(-1)?.version ?? 0
  if (report.migrationUserVersion !== latestMigrationVersion) throw new Error(`migration 未升级到 v${latestMigrationVersion}: ${report.migrationUserVersion}`)
  if (report.migration.fromVersion !== 2 || report.migration.toVersion !== latestMigrationVersion || report.migration.status !== 'migrated' || report.migration.applied.length !== latestMigrationVersion - 2 || report.migration.applied[0]?.version !== 3 || report.migration.applied.at(-1)?.version !== latestMigrationVersion) throw new Error(`migration report 不符合预期: ${JSON.stringify(report.migration)}`)
  if (report.preSchemaMigration.userVersion !== latestMigrationVersion || report.preSchemaMigration.fromVersion !== 0 || report.preSchemaMigration.toVersion !== latestMigrationVersion || report.preSchemaMigration.status !== 'migrated' || report.preSchemaMigration.applied.length !== latestMigrationVersion) throw new Error(`pre-schema migration report 不符合预期: ${JSON.stringify(report.preSchemaMigration)}`)
  if (report.repair.chaptersIndexed !== 1 || report.repair.entitiesIndexed !== 1 || !report.repair.repaired.restoredSources.includes('story/relations.yaml') || report.repair.afterWarnings.some((warning) => warning.includes('relations.yaml'))) throw new Error('损坏项目修复后的索引或源文件恢复结果不符合预期')
  if (!report.integrityPanel.detectsMismatch || !report.integrityPanel.reportsMissingSource || !report.integrityPanel.reportsRestoredSource || !report.integrityPanel.cleanAfterRepair) throw new Error(`完整性面板验收不符合预期: ${JSON.stringify(report.integrityPanel)}`)
  if (!report.sourceRecovery.detected || !report.sourceRecovery.repairCompleted || !report.sourceRecovery.reportedDuringRepair || !report.sourceRecovery.originalEntityPreserved || !report.sourceRecovery.validIndexesRemainUsable) throw new Error(`损坏源文件恢复验收不符合预期: ${JSON.stringify(report.sourceRecovery)}`)
  if (!report.importExport.validHtml || !report.importExport.htmlEmbedsImage || report.importExport.chapterCount !== 4 || !report.importExport.blockedProjectOverwrite) throw new Error('导入导出结果或路径安全校验不符合预期')
  if (!report.projectArchive.exported || !report.projectArchive.imported || !report.projectArchive.projectManifestValid || !report.projectArchive.excludesManifestFromProject) throw new Error(`项目归档导入导出结果不符合预期: ${JSON.stringify(report.projectArchive)}`)
  if (!report.incrementalBackup.fullCreated || !report.incrementalBackup.incrementalCreated || !report.incrementalBackup.restoredChangedFile || !report.incrementalBackup.excludesManifestFromProject) throw new Error(`增量备份结果不符合预期: ${JSON.stringify(report.incrementalBackup)}`)
  if (!report.checkpoint.created || !report.checkpoint.listed || !report.checkpoint.restored) throw new Error('Checkpoint 创建、列表或恢复语义不符合预期')
  if (!report.imageConnectionTest.doesNotPersistAsset) throw new Error('图片连接测试不应持久化资产')
  if (!Object.values(report.sceneStructure).every(Boolean)) throw new Error(`章节场景结构结果不符合预期: ${JSON.stringify(report.sceneStructure)}`)
  if (!report.workflowSceneScope.persisted || !report.workflowSceneScope.contextScoped || !report.workflowSceneScope.proposalScoped) throw new Error(`Workflow 场景范围未贯通: ${JSON.stringify(report.workflowSceneScope)}`)
  if (!report.contextBudget.withinBudget || !report.contextBudget.hasTruncationRecord || report.contextBudget.omittedSources.length === 0 || !report.contextBudget.sceneScoped) throw new Error('Context 预算裁剪或场景范围没有留下可复现的决策记录')
  if (report.contextBudget.retrievalTrace.query !== 'fixture' || report.contextBudget.retrievalTrace.candidateCounts.pinned < 1 || report.contextBudget.retrievalTrace.selectedSources.length === 0) throw new Error('Context 检索决策记录不完整')
  if (report.embeddingIndex.method !== 'embedding' || report.embeddingIndex.rows < 1 || !report.embeddingIndex.locatedSources || !report.embeddingIndex.incrementalReindex) throw new Error(`Embedding 索引或 Context 接入不符合预期: ${JSON.stringify(report.embeddingIndex)}`)
  if (report.embeddingIntegrity.stale !== 1 || report.embeddingIntegrity.dangling !== 1 || report.embeddingIntegrity.removed !== 2 || !report.embeddingIntegrity.clean) throw new Error(`Embedding 完整性检查或修复结果不符合预期: ${JSON.stringify(report.embeddingIntegrity)}`)
  if (report.snapshotRetention.retained !== 100 || report.snapshotRetention.listed !== 100) throw new Error(`Context Snapshot 清理策略不符合预期: ${JSON.stringify(report.snapshotRetention)}`)
  if (!report.contextReplay.listed || !report.contextReplay.readable || !report.contextReplay.stable || !report.contextReplay.detectsChange || !report.contextReplay.hasDifferences || !report.contextReplay.hasHashes) throw new Error(`Context Snapshot 回放结果不符合预期: ${JSON.stringify(report.contextReplay)}`)
  if (!report.snapshotVersions.legacyReadable || !report.snapshotVersions.futureRejected) throw new Error(`Context Snapshot 版本兼容性不符合预期: ${JSON.stringify(report.snapshotVersions)}`)
  if (!report.storySchema.validForeshadowing || !report.storySchema.validForeshadowingEvidence || !report.storySchema.rejectsInvalidEvidenceChapter || !report.storySchema.rejectsInvalidStatusAndMissingTarget || !report.storySchema.rejectsIncompleteLore || !report.storySchema.loreMarkdownSource || !report.storySchema.loreRebuiltFromSource) throw new Error(`Story Bible 结构化 schema 结果不符合预期: ${JSON.stringify(report.storySchema)}`)
  if (!report.foreshadowingIndex.saved || !report.foreshadowingIndex.queryByStatus || !report.foreshadowingIndex.hasStructuredFields || !report.foreshadowingIndex.chapterLink || !report.foreshadowingIndex.evidencePersisted || !report.foreshadowingIndex.evidenceReturned) throw new Error(`Foreshadowing 生命周期索引结果不符合预期: ${JSON.stringify(report.foreshadowingIndex)}`)
  if (!report.invalidStoryData.reported || !report.invalidStoryData.excludedFromLifecycleIndex) throw new Error(`异常 Story Bible 数据未被报告或错误进入索引: ${JSON.stringify(report.invalidStoryData)}`)
  if (report.canonTemporal.nonOverlappingConflicts !== 0 || !report.canonTemporal.overlappingKinds.includes('temporal')) throw new Error('Canon temporal scope 冲突规则不符合预期')
  if (!report.referenceIntegrity.canonDeleteBlocked || !report.referenceIntegrity.timelineEntityRefsCleaned || !report.referenceIntegrity.eventStructurePersisted) throw new Error('实体删除后的 Canon 保护、时间线结构字段或引用清理不符合预期')
  if (!Object.values(report.chapterMove).every(Boolean)) throw new Error(`章节移动引用迁移不符合预期: ${JSON.stringify(report.chapterMove)}`)
  if (!report.volumeTree.created || !report.volumeTree.assigned || !report.volumeTree.remapped || !report.volumeTree.sourcePersisted) throw new Error(`卷树或章节归属回链不符合预期: ${JSON.stringify(report.volumeTree)}`)
  if (!Object.values(report.chapterDelete).every(Boolean)) throw new Error(`章节删除完整性不符合预期: ${JSON.stringify(report.chapterDelete)}`)
  if (!report.security.safeProviderUrl || !report.security.rejectsRemoteHttp || !report.security.redactsSecrets) throw new Error('Provider URL 或错误脱敏安全规则不符合预期')
  if (!report.providerProfileReconciliation.staleProfileCleared) throw new Error('失效 Provider profile 未收敛为未配置状态')
  if (!report.providerProfileSaveSemantics.savePreservesDefault || !report.providerProfileSaveSemantics.explicitSelectChangesDefault || !report.providerProfileSaveSemantics.missingProfileRejected) throw new Error(`Provider 保存/显式选择/失效 profile 行为不符合预期: ${JSON.stringify(report.providerProfileSaveSemantics)}`)
  if (!report.goldenFixture.created || !report.goldenFixture.temporary || !report.goldenFixture.noSensitiveEvidence || !report.goldenFixture.cleaned) throw new Error(`黄金路径 fixture 工厂未满足临时目录或证据脱敏契约: ${JSON.stringify(report.goldenFixture)}`)
  if (report.imageProvider.variants !== 2 || !report.imageProvider.strictBody || !report.imageProvider.missingProfileRejected) throw new Error(`Image Provider 严格请求体、变体循环或失效 profile 行为不符合预期: ${JSON.stringify(report.imageProvider)}`)
  if (report.tokenCost.usage?.inputTokens !== 10 || report.tokenCost.usage?.outputTokens !== 5 || report.tokenCost.usage?.totalTokens !== 15 || report.tokenCost.estimatedUsd !== 0.00002 || !report.tokenCost.noSecretInResult) throw new Error('Provider token usage 或费用估算结果不符合预期')
  if (report.embeddingProvider.vectors !== 2 || report.embeddingProvider.dimensions !== 3 || report.embeddingProvider.model !== 'fixture-embedding') throw new Error('Embedding Provider 契约或向量返回结果不符合预期')
  if (report.contextWindow.capped !== 2816 || report.contextWindow.outputCapped !== 3840 || report.contextWindow.fallback !== 5000 || !report.contextWindow.leavesSafetyMargin) throw new Error(`动态 Context Window 预算不符合预期: ${JSON.stringify(report.contextWindow)}`)
  if (report.embeddingConnection.dimensions <= 0 || !report.embeddingConnection.doesNotPersistAsset) throw new Error('Embedding 连接测试未返回向量或错误持久化了资产')
  if (!report.structuredOutput.valid) throw new Error('Provider structured output 契约未实际执行 parser')
  if (!report.modelDiscovery.allDiscovered || report.modelDiscovery.ids.join(',') !== 'openai-fixture,claude-fixture,gemini-fixture' || report.modelDiscovery.contextWindows[0] !== 16384 || report.modelDiscovery.contextWindows[2] !== 32768) throw new Error('Provider 模型发现或 context window 解析不符合预期')
  if (!report.diagnostics.exported || !report.diagnostics.noPrompt || !report.diagnostics.noNodePayloads) throw new Error('诊断包未按元数据-only 规则导出')
  if (report.queue.maxActive !== 2 || !report.queue.fifo || report.queue.pendingAfterDrain !== 0) throw new Error('任务队列并发或 FIFO 语义不符合预期')
  if (report.timeout.status !== 'failed' || !report.timeout.error.includes('节点超时') || report.timeout.errorCategory !== 'timeout') throw new Error('Workflow 节点 timeout 语义不符合预期')
  if (report.nodeRetry.attempts !== 2 || report.nodeRetry.status !== 'succeeded' || report.nodeRetry.nodeStatus !== 'succeeded') throw new Error('Workflow 节点级 retry 语义不符合预期')
  if (!report.workflowVariables.resolved || !report.workflowVariables.unknownVariableRejected) throw new Error(`Workflow 变量解析结果不符合预期: ${JSON.stringify(report.workflowVariables)}`)
  if (report.imageIdempotency.providerCalls !== 1 || !report.imageIdempotency.sameAsset || !report.imageIdempotency.insertedOnce) throw new Error(`图片幂等执行结果不符合预期: ${JSON.stringify(report.imageIdempotency)}`)
  if (report.agentPolicy.agentId !== 'writer' || report.agentPolicy.maxOutputTokens <= 0 || report.agentPolicy.maxRetries < 1 || report.agentPolicy.attempts !== 2 || report.agentPolicy.status !== 'succeeded') throw new Error('Agent policy 默认配置或 Runtime retry resolver 不符合预期')
  if (!report.inspector.inputSummary || !report.inspector.outputSummary) throw new Error('Workflow 节点输入输出摘要未持久化')
  if (report.recovery.recovered !== 1 || report.recovery.status !== 'failed' || report.recovery.nodeStatus !== 'failed') throw new Error('Workflow 崩溃恢复语义不符合预期')
  if (!report.jobsPersistence.present || report.jobsPersistence.status !== 'failed' || report.jobsPersistence.attempts !== 1 || !report.jobsPersistence.hasError || !report.jobsPersistence.queuedVisible) throw new Error(`Workflow jobs 持久化结果不符合预期: ${JSON.stringify(report.jobsPersistence)}`)
  if (!report.builtInWorkflow.hasImageNodes || !report.builtInWorkflow.pausesAtReview || !report.builtInWorkflow.pausesAtImageSelection || !report.builtInWorkflow.resumesToInsert) throw new Error('内置 Workflow 图片节点或 Human Resume 语义不符合预期')
  if (includeLong && (report.scale.chaptersIndexed !== 1000 || report.scale.entitiesIndexed !== 1000 || report.scale.facts !== 100000 || report.scale.repaired.documents !== 1000)) throw new Error('长篇规模核验结果不符合预期')
  console.log(JSON.stringify({ ok: true, root, ...report }, null, 2))
} finally {
  await server?.close()
  await rm(root, { recursive: true, force: true })
}
