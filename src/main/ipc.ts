import { BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'
import { IPC, type CreateProjectInput, type ProjectInfo } from '../shared/ipc'
import { ok, type Result } from '../shared/result'
import { DomainError, toAppError } from './services/errors'
import type { ProjectService } from './services/project-service'
import type { RecentProjectsStore } from './services/recent-projects'
import type { ChapterService } from './services/chapter-service'
import type { StoryService } from './services/story-service'
import { entityInputSchema, entityKindSchema, timelineEventInputSchema, storyArtifactInputSchema, storyArtifactKindSchema, storyRelationInputSchema } from '../shared/story'
import type { AiService } from './services/ai-service'
import { agentIdSchema, providerProfileSchema } from '../shared/ai'
import { extensionPermissionSchema } from '../shared/extensions'
import { randomUUID } from 'node:crypto'
import type { AiEditService } from './services/ai-edit-service'
import type { ContextService } from './services/context-service'
import { contextRecipeSchema } from '../shared/context'
import type { CanonService } from './services/canon-service'
import { factInputSchema } from '../shared/canon'
import type { WorkflowService } from './services/workflow-service'
import { workflowSchema } from '../shared/workflow'
import type { ImageService } from './services/image-service'
import { imageRequestSchema } from '../shared/image'
import type { BackupService } from './services/backup-service'
import type { WorkflowRuntimeService } from './services/workflow-runtime-service'
import type { MemoryService } from './services/memory-service'
import type { RevisionService } from './services/revision-service'
import type { CheckpointService } from './services/checkpoint-service'
import { exportFormats } from '../shared/chapter'
import type { DiagnosticsService } from './services/diagnostics-service'
import type { SceneService } from './services/scene-service'
import { sceneCreateInputSchema, sceneRemoveInputSchema, sceneReorderInputSchema, sceneUpdateInputSchema } from '../shared/scene'
import { volumeChapterInputSchema, volumeCreateInputSchema, volumeIdSchema, volumeReorderInputSchema, volumeUpdateInputSchema } from '../shared/volume'
import type { VolumeService } from './services/volume-service'
import type { ExtensionRegistry } from './services/extension-registry'
import type { ExtensionPackageStore } from './services/extension-package-store'
import type { TelemetryService } from './services/telemetry-service'
import type { CommunityWorkflowService } from './services/community-workflow-service'
import type { UpdateService } from './services/update-service'
import { openProjectAndSyncChapterIndex, syncChapterIndex } from './services/project-open-service'
import { authoringFoundationInputSchema, authoringInitializeInputSchema, authoringProgressSchema } from '../shared/authoring'
import type { AuthoringProgressService } from './services/authoring-progress-service'
import type { AuthoringReviewService } from './services/authoring-review-service'
import type { FullRevisionService } from './services/full-revision-service'

/**
 * IPC boundary (blueprint §5): the only privileged entry into Main.
 * Every handler returns Result<T> and never rejects; params are zod-validated.
 */

const createInputSchema = z.object({
  rootPath: z.string().min(1),
  title: z.string().min(1).max(200),
  language: z.string().min(2).max(20).optional()
})

const chapterCreateSchema = z.object({
  title: z.string().min(1).max(100)
})
const chapterRenameSchema = chapterCreateSchema.extend({ relPath: z.string().min(1) })

const chapterSaveSchema = z.object({
  relPath: z.string().min(1),
  markdown: z.string().max(2_000_000)
})

const chapterMoveSchema = z.object({
  relPath: z.string().min(1),
  toIndex: z.number().int().min(0)
})

const searchSchema = z.object({
  query: z.string().min(1).max(200)
})

function parseOrThrow<S extends z.ZodType>(schema: S, payload: unknown): z.output<S> {
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new DomainError('VALIDATION_FAILED', 'IPC 参数校验失败', {
      details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    })
  }
  return parsed.data
}

export function registerIpc(
  projectService: ProjectService,
  recents: RecentProjectsStore,
  chapterService: ChapterService,
  storyService: StoryService,
  aiService: AiService,
  aiEditService: AiEditService,
  contextService: ContextService,
  canonService: CanonService,
  workflowService: WorkflowService,
  workflowRuntime: WorkflowRuntimeService,
  memoryService: MemoryService,
  imageService: ImageService,
  backupService: BackupService,
  revisionService: RevisionService,
  checkpointService: CheckpointService,
  diagnosticsService: DiagnosticsService,
  sceneService: SceneService,
  volumeService: VolumeService,
  authoringProgressService: AuthoringProgressService,
  authoringReviewService: AuthoringReviewService,
  fullRevisionService: FullRevisionService,
  extensionRegistry: ExtensionRegistry,
  extensionPackageStore: ExtensionPackageStore,
  telemetryService: TelemetryService,
  communityWorkflowService: CommunityWorkflowService,
  updateService: UpdateService,
  deps: { pickDirectory(): Promise<string | null>; pickArchiveSave(): Promise<string | null>; pickArchiveOpen(): Promise<string | null>; pickTextImport(extensions?: readonly string[]): Promise<string | null>; pickImageImport(): Promise<string | null>; pickExtensionPackage(): Promise<string | null>; pickCommunityWorkflowOpen(): Promise<string | null>; pickCommunityWorkflowSave(): Promise<string | null>; pickExportSave(format: import('../shared/chapter').ExportFormat): Promise<string | null>; pickDiagnosticsSave(): Promise<string | null> }
): void {
  const handle = <P, R>(channel: string, fn: (payload: P) => R | Promise<R>): void => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (_event, payload: P): Promise<Result<Awaited<R>>> => {
      try {
        return ok(await fn(payload))
      } catch (e) {
        return { ok: false, error: toAppError(e) }
      }
    })
  }

  handle(IPC.projectPickDirectory, () => deps.pickDirectory())

  handle<CreateProjectInput, ProjectInfo>(IPC.projectCreate, async (input) => {
    const v = parseOrThrow(createInputSchema, input)
    const info = await projectService.create(v.rootPath, v.title, v.language ?? 'zh-CN')
    await syncChapterIndex(chapterService)
    void telemetryService.record('project_opened', { source: 'create' }).catch(() => { /* optional telemetry must never block project creation */ })
    return info
  })

  handle<string, ProjectInfo>(IPC.projectOpen, async (rootPath) => {
    const v = parseOrThrow(z.string().min(1), rootPath)
    const info = await openProjectAndSyncChapterIndex(projectService, chapterService, v)
    void telemetryService.record('project_opened', { source: 'open' }).catch(() => { /* optional telemetry must never block project opening */ })
    return info
  })

  handle(IPC.projectClose, () => projectService.close())
  handle(IPC.projectGetInfo, () => projectService.getInfo())
  handle(IPC.projectSetArtDirection, (value) => projectService.setArtDirection(parseOrThrow(z.string().max(20_000), value)))
  handle(IPC.projectRepairIndexes, () => projectService.repairIndexes())
  handle(IPC.projectRecentList, () => recents.list())
  handle<string, void>(IPC.projectRemoveRecent, (path) => {
    const v = parseOrThrow(z.string().min(1), path)
    return recents.remove(v)
  })
  handle(IPC.projectSeedMockStory, () => projectService.seedMockStory())
  handle(IPC.projectReadText, (relPath) => projectService.readText(parseOrThrow(z.string().min(1).max(120), relPath)))
  handle(IPC.authoringGet, () => authoringProgressService.get())
  handle(IPC.authoringInitialize, (input) => authoringProgressService.initialize(parseOrThrow(authoringInitializeInputSchema, input)))
  handle(IPC.authoringRefresh, () => authoringProgressService.refresh())
  handle(IPC.authoringSave, (input) => authoringProgressService.save(parseOrThrow(authoringProgressSchema, input)))
  handle(IPC.authoringSaveFoundation, (input) => authoringProgressService.saveFoundation(parseOrThrow(authoringFoundationInputSchema, input)))
  handle(IPC.authoringMarkExported, (destination) => authoringProgressService.markExported(parseOrThrow(z.string().trim().min(1).max(4_000), destination)))
  handle(IPC.authoringReview, () => authoringReviewService.review())
  handle(IPC.fullRevisionPrepare, () => fullRevisionService.prepare())
  handle(IPC.fullRevisionApprove, (reportId) => fullRevisionService.approve(parseOrThrow(z.string().regex(/^fullrev_[a-zA-Z0-9_-]{1,200}$/), reportId)))
  handle(IPC.projectPickArchiveSave, () => deps.pickArchiveSave())
  handle(IPC.projectPickArchiveOpen, () => deps.pickArchiveOpen())
  handle(IPC.projectPickTextImport, (extensions) => {
    const requested = parseOrThrow(z.array(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9+.-]{0,31}$/)).max(100).optional(), extensions)
    const registered = extensionRegistry.snapshot().importers.flatMap((importer) => importer.extensions)
    const allowed = requested === undefined ? registered : requested.filter((extension) => registered.includes(extension))
    return deps.pickTextImport(allowed)
  })
  handle(IPC.projectPickExtensionPackage, () => deps.pickExtensionPackage())
  handle(IPC.projectPickCommunityWorkflowOpen, () => deps.pickCommunityWorkflowOpen())
  handle(IPC.projectPickCommunityWorkflowSave, () => deps.pickCommunityWorkflowSave())
  handle(IPC.projectPickExportSave, (format) => {
    const value = parseOrThrow(z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/), format)
    const builtin = (exportFormats as readonly string[]).includes(value)
    const registered = extensionRegistry.snapshot().exporters.some((exporter) => exporter.format === value)
    if (!builtin && !registered) throw new DomainError('VALIDATION_FAILED', `没有支持 ${value} 的导出器`)
    return deps.pickExportSave(value)
  })
  handle(IPC.projectCheckIntegrity, () => projectService.checkIntegrity())
  handle(IPC.telemetryGetStatus, () => telemetryService.getStatus())
  handle(IPC.telemetrySetConsent, (enabled) => telemetryService.setConsent(parseOrThrow(z.boolean(), enabled)))
  const settingKeySchema = z.string().regex(/^[a-zA-Z0-9_.-]{1,120}$/)
  handle(IPC.settingsGet, (key) => projectService.database.getSetting(parseOrThrow(settingKeySchema, key)))
  handle(IPC.settingsSet, (input) => {
    const value = parseOrThrow(z.object({ key: settingKeySchema, value: z.string().max(1_000_000) }), input)
    projectService.database.setSetting(value.key, value.value)
    return null
  })
  const secretKeySchema = z.string().regex(/^[a-zA-Z0-9_.:-]{1,200}$/)
  handle(IPC.secretHas, (key) => aiService.hasSecret(parseOrThrow(secretKeySchema, key)))
  handle(IPC.secretSet, (input) => {
    const value = parseOrThrow(z.object({ key: secretKeySchema, value: z.string().min(1).max(10_000) }), input)
    return aiService.setSecret(value.key, value.value)
  })
  handle(IPC.secretRemove, (key) => aiService.removeSecret(parseOrThrow(secretKeySchema, key)))

  // Sprint 2: Chapter Authoring
  handle(IPC.chapterList, () => chapterService.list())
  handle<string, ReturnType<ChapterService['read']>>(IPC.chapterRead, (relPath) => {
    const v = parseOrThrow(z.string().min(1), relPath)
    return chapterService.read(v)
  })
  handle<{ title: string }, ReturnType<ChapterService['create']>>(IPC.chapterCreate, (input) => {
    const v = parseOrThrow(chapterCreateSchema, input)
    return chapterService.create(v.title)
  })
  handle<{ relPath: string; title: string }, ReturnType<ChapterService['rename']>>(IPC.chapterRename, (input) => {
    const v = parseOrThrow(chapterRenameSchema, input)
    return chapterService.rename(v.relPath, v.title)
  })
  handle<{ relPath: string; markdown: string }, ReturnType<ChapterService['save']>>(
    IPC.chapterSave,
    (input) => {
      const v = parseOrThrow(chapterSaveSchema, input)
      return chapterService.save(v.relPath, v.markdown)
    }
  )
  handle<{ relPath: string; toIndex: number }, ReturnType<ChapterService['move']>>(
    IPC.chapterMove,
    (input) => {
      const v = parseOrThrow(chapterMoveSchema, input)
      return chapterService.move(v.relPath, v.toIndex)
    }
  )
  handle<string, void>(IPC.chapterRemove, (relPath) => {
    const v = parseOrThrow(z.string().min(1), relPath)
    return chapterService.remove(v)
  })
  handle<string, ReturnType<ChapterService['readNote']>>(IPC.chapterReadNote, (relPath) => chapterService.readNote(parseOrThrow(z.string().startsWith('chapters/'), relPath)))
  handle<{ relPath: string; notes: string }, ReturnType<ChapterService['saveNote']>>(IPC.chapterSaveNote, (input) => { const value = parseOrThrow(z.object({ relPath: z.string().startsWith('chapters/'), notes: z.string().max(500_000) }), input); return chapterService.saveNote(value.relPath, value.notes) })
  handle(IPC.chapterImport, (input) => { const value = parseOrThrow(z.object({ sourcePath: z.string().min(1).max(4_000), title: z.string().max(100).optional() }), input); return chapterService.importFile(value.sourcePath, value.title) })
  handle(IPC.chapterExport, (input) => {
    const value = parseOrThrow(z.object({ format: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/), destination: z.string().min(1).max(4_000), options: z.object({ cleanImageMetadata: z.boolean().optional() }).optional() }), input)
    const builtin = (exportFormats as readonly string[]).includes(value.format)
    const registered = extensionRegistry.snapshot().exporters.some((exporter) => exporter.format === value.format)
    if (!builtin && !registered) throw new DomainError('VALIDATION_FAILED', `没有支持 ${value.format} 的导出器`)
    return chapterService.exportAll(value.format, value.destination, value.options)
  })
  handle(IPC.sceneList, (chapterRelPath) => sceneService.list(parseOrThrow(z.string().startsWith('chapters/').endsWith('.md'), chapterRelPath)))
  handle(IPC.sceneCreate, (input) => sceneService.create(parseOrThrow(sceneCreateInputSchema, input)))
  handle(IPC.sceneUpdate, (input) => sceneService.update(parseOrThrow(sceneUpdateInputSchema, input)))
  handle(IPC.sceneRemove, (input) => { const value = parseOrThrow(sceneRemoveInputSchema, input); return sceneService.remove(value.chapterRelPath, value.sceneId) })
  handle(IPC.sceneReorder, (input) => { const value = parseOrThrow(sceneReorderInputSchema, input); return sceneService.reorder(value.chapterRelPath, value.sceneIds) })
  handle(IPC.volumeList, () => volumeService.list())
  handle(IPC.volumeCreate, (input) => volumeService.create(parseOrThrow(volumeCreateInputSchema, input)))
  handle(IPC.volumeUpdate, (input) => volumeService.update(parseOrThrow(volumeUpdateInputSchema, input)))
  handle(IPC.volumeRemove, (id) => volumeService.remove(parseOrThrow(volumeIdSchema, id)))
  handle(IPC.volumeAssignChapter, (input) => { const value = parseOrThrow(volumeChapterInputSchema, input); return volumeService.assignChapter(value.volumeId, value.chapterRelPath) })
  handle(IPC.volumeUnassignChapter, (path) => volumeService.unassignChapter(parseOrThrow(volumeChapterInputSchema.shape.chapterRelPath, path)))
  handle(IPC.volumeReorder, (input) => { const value = parseOrThrow(volumeReorderInputSchema, input); return volumeService.reorder(value.volumeIds) })
  handle<{ query: string }, ReturnType<ChapterService['search']>>(IPC.searchProject, (input) => {
    const v = parseOrThrow(searchSchema, input)
    return chapterService.search(v.query)
  })

  handle(IPC.storyListEntities, (kind: unknown) => {
    const v = kind === undefined ? undefined : parseOrThrow(entityKindSchema, kind)
    return storyService.listEntities(v)
  })
  handle<string, ReturnType<StoryService['getEntity']>>(IPC.storyGetEntity, (id) => {
    return storyService.getEntity(parseOrThrow(z.string().regex(/^ent_[a-zA-Z0-9_-]+$/), id))
  })
  handle(IPC.storySaveEntity, (input) => storyService.saveEntity(parseOrThrow(entityInputSchema, input)))
  handle<string, ReturnType<StoryService['deleteEntity']>>(IPC.storyDeleteEntity, (id) => {
    return storyService.deleteEntity(parseOrThrow(z.string().regex(/^ent_[a-zA-Z0-9_-]+$/), id))
  })
  handle(IPC.storyListTimeline, () => storyService.listTimeline())
  handle(IPC.storySaveTimelineEvent, (input) => storyService.saveTimelineEvent(parseOrThrow(timelineEventInputSchema, input)))
  handle<string, ReturnType<StoryService['deleteTimelineEvent']>>(IPC.storyDeleteTimelineEvent, (id) => storyService.deleteTimelineEvent(parseOrThrow(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.storyListRelations, () => storyService.listRelations())
  handle(IPC.storySaveRelation, (input) => storyService.saveRelation(parseOrThrow(storyRelationInputSchema, input)))
  handle<string, ReturnType<StoryService['deleteRelation']>>(IPC.storyDeleteRelation, (id) => storyService.deleteRelation(parseOrThrow(z.string().regex(/^rel_[a-zA-Z0-9_-]+$/), id)))
  handle<string, ReturnType<StoryService['search']>>(IPC.storySearch, (query) => {
    return storyService.search(parseOrThrow(z.string().min(1).max(200), query))
  })
  handle<string, ReturnType<StoryService['searchAll']>>(IPC.storySearchAll, (query) => {
    return storyService.searchAll(parseOrThrow(z.string().min(1).max(200), query))
  })
  handle(IPC.storyListArtifacts, (kind) => storyService.listArtifacts(kind === undefined ? undefined : parseOrThrow(storyArtifactKindSchema, kind)))
  handle(IPC.storySaveArtifact, (input) => storyService.saveArtifact(parseOrThrow(storyArtifactInputSchema, input)))
  handle(IPC.storyDeleteArtifact, (id) => storyService.deleteArtifact(parseOrThrow(z.string().regex(/^art_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.storyListForeshadowing, (status) => storyService.listForeshadowing(status === undefined ? undefined : parseOrThrow(z.enum(['planned', 'planted', 'echoed', 'resolved', 'abandoned']), status)))

  handle(IPC.aiListProfiles, () => aiService.listProfiles())
  handle(IPC.aiSaveProfile, (profile) => aiService.saveProfile(parseOrThrow(providerProfileSchema, profile)))
  handle(IPC.aiSelectProfile, (id) => aiService.selectProfile(parseOrThrow(z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.aiDeleteProfile, (id) => aiService.deleteProfile(parseOrThrow(z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.aiHasSecret, (id) => aiService.hasSecret(parseOrThrow(z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.aiSetSecret, (input) => {
    const value = parseOrThrow(z.object({ profileId: z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), secret: z.string().min(1).max(10_000) }), input)
    return aiService.setSecret(value.profileId, value.secret)
  })
  handle(IPC.aiRemoveSecret, (id) => aiService.removeSecret(parseOrThrow(z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.aiHasImageSecret, (id) => aiService.hasImageSecret(parseOrThrow(z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.aiSetImageSecret, (input) => {
    const value = parseOrThrow(z.object({ profileId: z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), secret: z.string().min(1).max(10_000) }), input)
    return aiService.setImageSecret(value.profileId, value.secret)
  })
  handle(IPC.aiRemoveImageSecret, (id) => aiService.removeImageSecret(parseOrThrow(z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.aiTestProfile, (id) => aiService.testProfile(parseOrThrow(z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.aiTestEmbedding, (id) => aiService.testEmbedding(parseOrThrow(z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.aiChat, (input) => {
    const v = parseOrThrow(z.object({
      profileId: z.string().regex(/^profile_[a-zA-Z0-9_-]+$/),
      request: z.object({
        messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string().max(500_000) })).min(1),
        temperature: z.number().min(0).max(2).optional(), maxOutputTokens: z.number().int().positive().max(100_000).optional()
      })
    }), input)
    return aiService.chat(v.profileId, v.request)
  })
  ipcMain.on(IPC.aiStreamStart, async (event, input: unknown) => {
    const jobId = randomUUID()
    try {
      const v = parseOrThrow(z.object({
        jobId: z.string().uuid(), profileId: z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), agentId: agentIdSchema.optional(), contextRequest: z.object({ relPath: z.string().startsWith('chapters/'), sceneId: z.string().regex(/^scene_[a-zA-Z0-9_-]+$/).optional(), selection: z.string().max(500_000).nullable().optional(), query: z.string().max(200).optional(), recipe: contextRecipeSchema }).optional(),
        request: z.object({ messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string().max(500_000) })).min(1), temperature: z.number().min(0).max(2).optional(), maxOutputTokens: z.number().int().positive().max(100_000).optional() })
      }), input)
      const contextRequest = v.contextRequest ? { ...v.contextRequest, recipe: { ...v.contextRequest.recipe, maxTokens: await aiService.contextBudget(v.profileId, v.contextRequest.recipe.maxTokens, v.request.maxOutputTokens ?? 0) } } : undefined
      const context = contextRequest ? await contextService.build(contextRequest) : undefined
      await (v.agentId ? aiService.streamWithAgent(v.profileId, v.request, v.agentId, context, (streamEvent) => event.sender.send(IPC.aiStreamEvent, { jobId: v.jobId, event: streamEvent }), v.jobId) : aiService.stream(v.profileId, v.request, (streamEvent) => event.sender.send(IPC.aiStreamEvent, { jobId: v.jobId, event: streamEvent }), v.jobId))
    } catch (error) {
      // The renderer subscribes with the caller-provided job ID. The local
      // fallback ID is intentionally not used here, otherwise provider and
      // validation errors disappear from the chat UI.
      const failedJobId = (() => {
        const candidate = (input as { jobId?: unknown } | null)?.jobId
        return typeof candidate === 'string' ? candidate : jobId
      })()
      event.sender.send(IPC.aiStreamEvent, { jobId: failedJobId, event: { type: 'error', message: error instanceof Error ? error.message : String(error) } })
    }
  })
  ipcMain.on(IPC.aiStreamCancel, (_event, input: unknown) => {
    const jobId = parseOrThrow(z.string().uuid(), input)
    aiService.cancelStream(jobId)
  })
  handle(IPC.aiEditListPending, (relPath) => aiEditService.listPending(relPath ? parseOrThrow(z.string().startsWith('chapters/'), relPath) : undefined))
  handle(IPC.aiEditRun, (input) => {
    const v = parseOrThrow(z.object({ profileId: z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), relPath: z.string().startsWith('chapters/'), prompt: z.string().min(1).max(20_000), selection: z.string().max(500_000).nullable().optional() }), input)
    return aiEditService.run(v)
  })
  handle(IPC.aiEditCreateFromText, (input) => {
    const v = parseOrThrow(z.object({ profileId: z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), relPath: z.string().startsWith('chapters/'), prompt: z.string().min(1).max(20_000), selection: z.string().max(500_000).nullable().optional(), suggested: z.string().min(1).max(2_000_000) }), input)
    return aiEditService.createFromText(v)
  })
  handle(IPC.aiEditAccept, (id) => aiEditService.accept(parseOrThrow(z.string().regex(/^sug_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.aiEditReject, (id) => aiEditService.reject(parseOrThrow(z.string().regex(/^sug_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.aiEditCancel, (id) => aiEditService.cancel(parseOrThrow(z.string().min(1).max(200), id)))
  handle(IPC.aiEditRetry, (id) => aiEditService.retry(parseOrThrow(z.string().regex(/^sug_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.contextBuild, (input) => {
    const v = parseOrThrow(z.object({ relPath: z.string().startsWith('chapters/'), sceneId: z.string().regex(/^scene_[a-zA-Z0-9_-]+$/).optional(), selection: z.string().max(500_000).nullable().optional(), query: z.string().max(200).optional(), recipe: contextRecipeSchema }), input)
    return contextService.build(v)
  })
  handle(IPC.contextSummarize, (relPath) => contextService.summarize(parseOrThrow(z.string().startsWith('chapters/'), relPath)))
  handle(IPC.contextSnapshotList, (relPath) => contextService.listSnapshots(relPath === undefined ? undefined : parseOrThrow(z.string().startsWith('chapters/'), relPath)))
  handle(IPC.contextSnapshotRead, (id) => contextService.readSnapshot(parseOrThrow(z.string().regex(/^ctxsnap_[a-zA-Z0-9-]+$/), id)))
  handle(IPC.contextSnapshotReplay, (id) => contextService.replaySnapshot(parseOrThrow(z.string().regex(/^ctxsnap_[a-zA-Z0-9-]+$/), id)))
  handle(IPC.memoryExtractFromChapter, (input) => {
    const value = parseOrThrow(z.object({ profileId: z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), relPath: z.string().startsWith('chapters/') }), input)
    return memoryService.extractFromChapter(value.profileId, value.relPath)
  })
  handle(IPC.canonListFacts, (input) => {
    const value = parseOrThrow(z.object({ subjectId: z.string().min(1).optional(), limit: z.number().int().positive().max(10_000).optional(), offset: z.number().int().nonnegative().optional() }), input)
    return canonService.listFacts(value.subjectId, value.limit, value.offset)
  })
  handle(IPC.canonCountFacts, (subjectId) => canonService.countFacts(subjectId ? parseOrThrow(z.string().min(1), subjectId) : undefined))
  handle(IPC.canonCheck, (input) => canonService.check(parseOrThrow(factInputSchema, input)))
  handle(IPC.canonListProposals, () => canonService.listProposals())
  handle(IPC.canonProposeFact, (input) => canonService.proposeFact(parseOrThrow(factInputSchema, input)))
  handle(IPC.canonProposeFactUpdate, (input) => canonService.proposeFactUpdate(parseOrThrow(factInputSchema.required({ id: true }), input)))
  handle(IPC.canonProposeTimeline, (input) => canonService.proposeTimelineAdd(parseOrThrow(timelineEventInputSchema, input)))
  handle(IPC.canonProposeForeshadowing, (input) => canonService.proposeForeshadowingAdd(parseOrThrow(storyArtifactInputSchema, input)))
  handle(IPC.canonProposeRelation, (input) => canonService.proposeRelationUpdate(parseOrThrow(storyRelationInputSchema, input)))
  handle(IPC.canonReject, (id) => canonService.rejectProposal(parseOrThrow(z.string().regex(/^prop_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.canonApply, (id) => canonService.applyProposal(parseOrThrow(z.string().regex(/^prop_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.canonRevert, (id) => canonService.revertProposal(parseOrThrow(z.string().regex(/^prop_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.workflowList, () => workflowService.list())
  handle(IPC.workflowRead, (relPath) => workflowService.read(parseOrThrow(z.string().startsWith('workflows/'), relPath)))
  handle(IPC.workflowSave, (workflow) => workflowService.save(parseOrThrow(workflowSchema, workflow)))
  handle(IPC.workflowValidate, (workflow) => workflowService.validate(parseOrThrow(workflowSchema, workflow)))
  handle(IPC.communityWorkflowPreview, (sourcePath) => communityWorkflowService.preview(parseOrThrow(z.string().min(1).max(4_000), sourcePath)))
  handle(IPC.communityWorkflowInstall, (input) => {
    const value = parseOrThrow(z.object({ sourcePath: z.string().min(1).max(4_000), approvedPermissions: z.array(extensionPermissionSchema).max(20).default([]) }).strict(), input)
    return communityWorkflowService.install(value.sourcePath, value.approvedPermissions)
  })
  handle(IPC.communityWorkflowExport, (input) => {
    const value = parseOrThrow(z.object({ workflow: workflowSchema, destination: z.string().min(1).max(4_000) }), input)
    return communityWorkflowService.export(value.workflow, value.destination)
  })
  handle(IPC.workflowRuntimeRun, (input) => {
    const value = parseOrThrow(z.object({ workflowId: z.string().min(1).max(200), relPath: z.string().startsWith('chapters/'), sceneId: z.string().regex(/^scene_[a-zA-Z0-9_-]+$/).optional() }), input)
    return workflowRuntime.run(value.workflowId, value.relPath, value.sceneId)
  })
  handle(IPC.workflowRuntimeStart, (input) => {
    const value = parseOrThrow(z.object({ workflowId: z.string().min(1).max(200), relPath: z.string().startsWith('chapters/'), sceneId: z.string().regex(/^scene_[a-zA-Z0-9_-]+$/).optional() }), input)
    return workflowRuntime.start(value.workflowId, value.relPath, value.sceneId)
  })
  handle(IPC.workflowRuntimeCancel, (id) => workflowRuntime.cancel(parseOrThrow(z.string().min(1).max(200), id)))
  handle(IPC.workflowRuntimeRetry, (input) => {
    const value = parseOrThrow(z.object({ runId: z.string().min(1).max(200), relPath: z.string().startsWith('chapters/') }), input)
    return workflowRuntime.retry(value.runId, value.relPath)
  })
  handle(IPC.workflowRuntimeResume, (input) => { const value = parseOrThrow(z.object({ runId: z.string().min(1).max(200), resumeInput: z.unknown().optional() }), input); return workflowRuntime.resume(value.runId, value.resumeInput) })
  handle(IPC.workflowRuntimeList, (input = true) => {
    const value = typeof input === 'boolean' ? { recover: input, summaries: false } : parseOrThrow(z.object({ recover: z.boolean().optional(), summaries: z.boolean().optional() }), input)
    return workflowRuntime.listRuns(value.recover !== false, value.summaries === true)
  })
  handle(IPC.jobsList, (recover = true) => workflowRuntime.listJobs(recover !== false))
  handle(IPC.jobsCancel, (jobId) => workflowRuntime.cancelJob(parseOrThrow(z.string().regex(/^job_[a-zA-Z0-9_-]+$/), jobId)))
  handle(IPC.jobsRetry, (jobId) => workflowRuntime.retryJob(parseOrThrow(z.string().regex(/^job_[a-zA-Z0-9_-]+$/), jobId)))
  handle(IPC.imageProposeScene, (input) => {
    const value = typeof input === 'string' ? { relPath: input } : parseOrThrow(z.object({ relPath: z.string().startsWith('chapters/'), sceneId: z.string().regex(/^scene_[a-zA-Z0-9_-]+$/).optional() }), input)
    return imageService.proposeScene(parseOrThrow(z.string().startsWith('chapters/'), value.relPath), value.sceneId)
  })
  handle(IPC.imageGenerate, (input) => imageService.generate(parseOrThrow(imageRequestSchema, input)))
  handle(IPC.imageImport, (input) => { const value = parseOrThrow(z.object({ sourcePath: z.string().min(1).max(4_000), prompt: z.string().max(20_000).optional() }), input); return imageService.importFile(value.sourcePath, value.prompt) })
  handle(IPC.imageTestConnection, (id) => imageService.testConnection(parseOrThrow(z.string().regex(/^profile_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.imageReadAsset, (id) => imageService.readAsset(parseOrThrow(z.string().regex(/^asset_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.imageListAssets, () => imageService.listAssets())
  handle(IPC.imageDeleteAsset, (id) => imageService.deleteAsset(parseOrThrow(z.string().regex(/^asset_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.imageInsert, (input) => { const value = parseOrThrow(z.object({ relPath: z.string().startsWith('chapters/'), assetId: z.string().regex(/^asset_[a-zA-Z0-9_-]+$/), caption: z.string().max(200).default('Illustration') }), input); return imageService.insertIntoChapter(value.relPath, value.assetId, value.caption) })
  handle(IPC.revisionList, (relPath) => revisionService.list(relPath ? parseOrThrow(z.string().startsWith('chapters/'), relPath) : undefined))
  handle(IPC.revisionGet, (id) => revisionService.get(parseOrThrow(z.string().regex(/^rev_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.revisionRevert, (id) => revisionService.revert(parseOrThrow(z.string().regex(/^rev_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.backupCreate, (destination) => backupService.createArchive(parseOrThrow(z.string().min(1).max(1000), destination)))
  handle(IPC.backupRestore, (input) => { const value = parseOrThrow(z.object({ archive: z.string().min(1).max(1000), destination: z.string().min(1).max(1000) }), input); return backupService.restoreArchive(value.archive, value.destination) })
  handle(IPC.backupCreateIncremental, (input) => { const value = parseOrThrow(z.object({ destination: z.string().min(1).max(1000), baseArchive: z.string().min(1).max(1000) }), input); return backupService.createIncrementalArchive(value.destination, value.baseArchive) })
  handle(IPC.backupRestoreIncremental, (input) => { const value = parseOrThrow(z.object({ baseArchive: z.string().min(1).max(1000), incrementalArchive: z.string().min(1).max(1000), destination: z.string().min(1).max(1000) }), input); return backupService.restoreIncrementalArchive(value.baseArchive, value.incrementalArchive, value.destination) })
  handle(IPC.checkpointList, () => checkpointService.list())
  handle(IPC.checkpointCreate, (name) => checkpointService.create(parseOrThrow(z.string().min(1).max(120), name)))
  handle(IPC.checkpointRestore, (id) => checkpointService.restore(parseOrThrow(z.string().regex(/^checkpoint_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.diagnosticsExport, (destination) => diagnosticsService.export(parseOrThrow(z.string().min(1).max(1000), destination)))
  handle(IPC.diagnosticsExportCompressed, (destination) => diagnosticsService.exportCompressed(parseOrThrow(z.string().min(1).max(1000), destination)))
  handle(IPC.extensionList, () => extensionRegistry.snapshot())
  handle(IPC.extensionPermissionPreview, (id) => extensionRegistry.permissionPreview(parseOrThrow(z.string().regex(/^ext_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.extensionPreview, (sourcePath) => extensionPackageStore.preview(parseOrThrow(z.string().min(1).max(4_000), sourcePath)))
  handle(IPC.extensionInstall, async (sourcePath) => {
    const value = parseOrThrow(z.object({ sourcePath: z.string().min(1).max(4_000), approvedPermissions: z.array(extensionPermissionSchema).max(20).default([]) }).strict(), sourcePath)
    return extensionPackageStore.install(value.sourcePath, value.approvedPermissions)
  })
  handle(IPC.extensionUninstall, async (id) => {
    await extensionPackageStore.uninstall(parseOrThrow(z.string().regex(/^ext_[a-zA-Z0-9_-]+$/), id))
    return null
  })
  handle(IPC.extensionRollback, (id) => extensionPackageStore.rollback(parseOrThrow(z.string().regex(/^ext_[a-zA-Z0-9_-]+$/), id)))
  handle(IPC.extensionTrustStatus, () => extensionPackageStore.trustStatus())
  updateService.onEvent((event) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.updateEvent, event)
  })
  handle(IPC.updateCheck, () => updateService.check())
  handle(IPC.updateDownload, () => updateService.download())
  handle(IPC.updateInstall, () => updateService.install())
  handle(IPC.updateCancel, () => updateService.cancel())
}
