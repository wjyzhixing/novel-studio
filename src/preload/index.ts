import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { ProjectApiContract } from '../shared/ipc'
import type { StoryApiContract } from '../shared/story'
import type { AiApiContract, AiStreamEnvelope, AiStreamOptions } from '../shared/ai'
import type { AiEditApiContract } from '../shared/ai-edit'
import type { MemoryApiContract } from '../shared/memory'
import type { WorkflowRuntimeEvent } from '../shared/runtime'
import type { RevisionApiContract } from '../shared/revision'
import type { ContextApiContract } from '../shared/context'
import type { CanonApiContract } from '../shared/canon'
import type { WorkflowApiContract } from '../shared/workflow'
import type { ImageApiContract } from '../shared/image'
import type { BackupApiContract } from '../shared/backup'
import type { CheckpointApiContract } from '../shared/checkpoint'
import type { SceneApiContract } from '../shared/scene'
import type { VolumeApiContract } from '../shared/volume'
import type { ExtensionApiContract } from '../shared/extensions'
import type { TelemetryApiContract, SettingsApiContract, SecretApiContract } from '../shared/ipc'
import type { CommunityWorkflowApiContract } from '../shared/community-workflow'
import type { UpdateApiContract } from '../shared/update'
import type { JobsApiContract } from '../shared/jobs'
import type { AuthoringApiContract } from '../shared/authoring'
import type { FullRevisionApiContract } from '../shared/authoring'

/**
 * Minimal whitelist bridge (blueprint §5): no ipcRenderer passthrough,
 * every call maps to one typed channel from the shared contract.
 */
const api = {
  project: {
    pickDirectory: () => ipcRenderer.invoke(IPC.projectPickDirectory),
    create: (input: Parameters<ProjectApiContract['create']>[0]) =>
      ipcRenderer.invoke(IPC.projectCreate, input),
    open: (rootPath: string) => ipcRenderer.invoke(IPC.projectOpen, rootPath),
      close: () => ipcRenderer.invoke(IPC.projectClose),
      getInfo: () => ipcRenderer.invoke(IPC.projectGetInfo),
    setArtDirection: (value: string) => ipcRenderer.invoke(IPC.projectSetArtDirection, value),
    repairIndexes: () => ipcRenderer.invoke(IPC.projectRepairIndexes),
    listRecent: () => ipcRenderer.invoke(IPC.projectRecentList),
    removeRecent: (path: string) => ipcRenderer.invoke(IPC.projectRemoveRecent, path),
    seedMockStory: () => ipcRenderer.invoke(IPC.projectSeedMockStory),
    readText: (relPath: string) => ipcRenderer.invoke(IPC.projectReadText, relPath)
    ,pickArchiveSave: () => ipcRenderer.invoke(IPC.projectPickArchiveSave)
    ,pickArchiveOpen: () => ipcRenderer.invoke(IPC.projectPickArchiveOpen)
    ,checkIntegrity: () => ipcRenderer.invoke(IPC.projectCheckIntegrity)
    ,pickTextImport: (extensions?: readonly string[]) => ipcRenderer.invoke(IPC.projectPickTextImport, extensions)
    ,pickExtensionPackage: () => ipcRenderer.invoke(IPC.projectPickExtensionPackage)
    ,pickCommunityWorkflowOpen: () => ipcRenderer.invoke(IPC.projectPickCommunityWorkflowOpen)
    ,pickCommunityWorkflowSave: () => ipcRenderer.invoke(IPC.projectPickCommunityWorkflowSave)
    ,pickExportSave: (format: import('../shared/chapter').ExportFormat) => ipcRenderer.invoke(IPC.projectPickExportSave, format)
    ,pickDiagnosticsSave: () => ipcRenderer.invoke(IPC.projectPickDiagnosticsSave)
  },
  chapter: {
    list: () => ipcRenderer.invoke(IPC.chapterList),
    read: (relPath: string) => ipcRenderer.invoke(IPC.chapterRead, relPath),
    create: (title: string) => ipcRenderer.invoke(IPC.chapterCreate, { title }),
    rename: (relPath: string, title: string) => ipcRenderer.invoke(IPC.chapterRename, { relPath, title }),
    save: (relPath: string, markdown: string) =>
      ipcRenderer.invoke(IPC.chapterSave, { relPath, markdown }),
    move: (relPath: string, toIndex: number) =>
      ipcRenderer.invoke(IPC.chapterMove, { relPath, toIndex }),
    remove: (relPath: string) => ipcRenderer.invoke(IPC.chapterRemove, relPath)
    ,readNote: (relPath: string) => ipcRenderer.invoke(IPC.chapterReadNote, relPath)
    ,saveNote: (relPath: string, notes: string) => ipcRenderer.invoke(IPC.chapterSaveNote, { relPath, notes })
    ,importFile: (sourcePath: string, title?: string) => ipcRenderer.invoke(IPC.chapterImport, { sourcePath, title })
    ,exportAll: (format: import('../shared/chapter').ExportFormat, destination: string, options?: import('../shared/chapter').ExportOptions) => ipcRenderer.invoke(IPC.chapterExport, { format, destination, options })
  },
  scene: {
    list: (chapterRelPath: string) => ipcRenderer.invoke(IPC.sceneList, chapterRelPath),
    create: (input: Parameters<SceneApiContract['create']>[0]) => ipcRenderer.invoke(IPC.sceneCreate, input),
    update: (input: Parameters<SceneApiContract['update']>[0]) => ipcRenderer.invoke(IPC.sceneUpdate, input),
    remove: (chapterRelPath: string, sceneId: string) => ipcRenderer.invoke(IPC.sceneRemove, { chapterRelPath, sceneId }),
    reorder: (chapterRelPath: string, sceneIds: string[]) => ipcRenderer.invoke(IPC.sceneReorder, { chapterRelPath, sceneIds })
  } satisfies SceneApiContract,
  volume: {
    list: () => ipcRenderer.invoke(IPC.volumeList),
    create: (input: Parameters<VolumeApiContract['create']>[0]) => ipcRenderer.invoke(IPC.volumeCreate, input),
    update: (input: Parameters<VolumeApiContract['update']>[0]) => ipcRenderer.invoke(IPC.volumeUpdate, input),
    remove: (id: string) => ipcRenderer.invoke(IPC.volumeRemove, id),
    assignChapter: (volumeId: string, chapterRelPath: string) => ipcRenderer.invoke(IPC.volumeAssignChapter, { volumeId, chapterRelPath }),
    unassignChapter: (chapterRelPath: string) => ipcRenderer.invoke(IPC.volumeUnassignChapter, chapterRelPath),
    reorder: (volumeIds: string[]) => ipcRenderer.invoke(IPC.volumeReorder, { volumeIds })
  } satisfies VolumeApiContract,
  authoring: {
    get: () => ipcRenderer.invoke(IPC.authoringGet),
    initialize: (input: Parameters<AuthoringApiContract['initialize']>[0]) => ipcRenderer.invoke(IPC.authoringInitialize, input),
    refresh: () => ipcRenderer.invoke(IPC.authoringRefresh),
    save: (progress: Parameters<AuthoringApiContract['save']>[0]) => ipcRenderer.invoke(IPC.authoringSave, progress),
    saveFoundation: (input: Parameters<AuthoringApiContract['saveFoundation']>[0]) => ipcRenderer.invoke(IPC.authoringSaveFoundation, input),
    markExported: (destination: Parameters<AuthoringApiContract['markExported']>[0]) => ipcRenderer.invoke(IPC.authoringMarkExported, destination),
    review: () => ipcRenderer.invoke(IPC.authoringReview)
  } satisfies AuthoringApiContract,
  fullRevision: {
    prepare: () => ipcRenderer.invoke(IPC.fullRevisionPrepare),
    approve: (reportId: Parameters<FullRevisionApiContract['approve']>[0]) => ipcRenderer.invoke(IPC.fullRevisionApprove, reportId)
  } satisfies FullRevisionApiContract,
  search: {
    project: (query: string) => ipcRenderer.invoke(IPC.searchProject, { query })
  },
  story: {
    listEntities: (kind?: Parameters<StoryApiContract['listEntities']>[0]) => ipcRenderer.invoke(IPC.storyListEntities, kind),
    getEntity: (id: string) => ipcRenderer.invoke(IPC.storyGetEntity, id),
    saveEntity: (input: Parameters<StoryApiContract['saveEntity']>[0]) => ipcRenderer.invoke(IPC.storySaveEntity, input),
    deleteEntity: (id: string) => ipcRenderer.invoke(IPC.storyDeleteEntity, id),
    listTimeline: () => ipcRenderer.invoke(IPC.storyListTimeline),
    saveTimelineEvent: (input: Parameters<StoryApiContract['saveTimelineEvent']>[0]) => ipcRenderer.invoke(IPC.storySaveTimelineEvent, input),
    deleteTimelineEvent: (id: string) => ipcRenderer.invoke(IPC.storyDeleteTimelineEvent, id),
    listRelations: () => ipcRenderer.invoke(IPC.storyListRelations),
    saveRelation: (input: Parameters<StoryApiContract['saveRelation']>[0]) => ipcRenderer.invoke(IPC.storySaveRelation, input),
    deleteRelation: (id: string) => ipcRenderer.invoke(IPC.storyDeleteRelation, id),
    search: (query: string) => ipcRenderer.invoke(IPC.storySearch, query),
    searchAll: (query: string) => ipcRenderer.invoke(IPC.storySearchAll, query),
    listArtifacts: (kind?: Parameters<StoryApiContract['listArtifacts']>[0]) => ipcRenderer.invoke(IPC.storyListArtifacts, kind),
    saveArtifact: (input: Parameters<StoryApiContract['saveArtifact']>[0]) => ipcRenderer.invoke(IPC.storySaveArtifact, input),
    deleteArtifact: (id: string) => ipcRenderer.invoke(IPC.storyDeleteArtifact, id),
    listForeshadowing: (status?: Parameters<StoryApiContract['listForeshadowing']>[0]) => ipcRenderer.invoke(IPC.storyListForeshadowing, status)
  },
  aiEdit: {
    listPending: (relPath?: string) => ipcRenderer.invoke(IPC.aiEditListPending, relPath),
    run: (request: Parameters<AiEditApiContract['run']>[0]) => ipcRenderer.invoke(IPC.aiEditRun, request),
    createFromText: (request: Parameters<AiEditApiContract['createFromText']>[0]) => ipcRenderer.invoke(IPC.aiEditCreateFromText, request),
    accept: (id: string) => ipcRenderer.invoke(IPC.aiEditAccept, id),
    reject: (id: string) => ipcRenderer.invoke(IPC.aiEditReject, id),
    cancel: (requestId: string) => ipcRenderer.invoke(IPC.aiEditCancel, requestId),
    retry: (id: string) => ipcRenderer.invoke(IPC.aiEditRetry, id)
  },
  context: {
    build: (request: Parameters<ContextApiContract['build']>[0]) => ipcRenderer.invoke(IPC.contextBuild, request),
    summarize: (relPath: string) => ipcRenderer.invoke(IPC.contextSummarize, relPath),
    listSnapshots: (relPath?: string) => ipcRenderer.invoke(IPC.contextSnapshotList, relPath),
    readSnapshot: (id: string) => ipcRenderer.invoke(IPC.contextSnapshotRead, id),
    replaySnapshot: (id: string) => ipcRenderer.invoke(IPC.contextSnapshotReplay, id)
  },
  memory: {
    extractFromChapter: (profileId: string, relPath: string) => ipcRenderer.invoke(IPC.memoryExtractFromChapter, { profileId, relPath })
  } satisfies MemoryApiContract,
  canon: {
    listFacts: (subjectId?: string, limit?: number, offset?: number) => ipcRenderer.invoke(IPC.canonListFacts, { subjectId, limit, offset }),
    countFacts: (subjectId?: string) => ipcRenderer.invoke(IPC.canonCountFacts, subjectId),
    check: (fact: Parameters<CanonApiContract['check']>[0]) => ipcRenderer.invoke(IPC.canonCheck, fact),
    listProposals: () => ipcRenderer.invoke(IPC.canonListProposals),
    proposeFact: (fact: Parameters<CanonApiContract['proposeFact']>[0]) => ipcRenderer.invoke(IPC.canonProposeFact, fact),
    proposeFactUpdate: (fact: Parameters<CanonApiContract['proposeFactUpdate']>[0]) => ipcRenderer.invoke(IPC.canonProposeFactUpdate, fact),
    proposeRelationUpdate: (relation: Parameters<CanonApiContract['proposeRelationUpdate']>[0]) => ipcRenderer.invoke(IPC.canonProposeRelation, relation),
    proposeTimelineAdd: (event: Parameters<CanonApiContract['proposeTimelineAdd']>[0]) => ipcRenderer.invoke(IPC.canonProposeTimeline, event),
    proposeForeshadowingAdd: (artifact: Parameters<CanonApiContract['proposeForeshadowingAdd']>[0]) => ipcRenderer.invoke(IPC.canonProposeForeshadowing, artifact),
    rejectProposal: (id: string) => ipcRenderer.invoke(IPC.canonReject, id),
    applyProposal: (id: string) => ipcRenderer.invoke(IPC.canonApply, id),
    revertProposal: (id: string) => ipcRenderer.invoke(IPC.canonRevert, id),
    // Compatibility alias for older development preload bundles.
    revert: (id: string) => ipcRenderer.invoke(IPC.canonRevert, id)
  },
  workflowEditor: {
    list: () => ipcRenderer.invoke(IPC.workflowList),
    read: (relPath: string) => ipcRenderer.invoke(IPC.workflowRead, relPath),
    save: (workflow: Parameters<WorkflowApiContract['save']>[0]) => ipcRenderer.invoke(IPC.workflowSave, workflow),
    validate: (workflow: Parameters<WorkflowApiContract['validate']>[0]) => ipcRenderer.invoke(IPC.workflowValidate, workflow)
  },
  communityWorkflow: {
    preview: (sourcePath: string) => ipcRenderer.invoke(IPC.communityWorkflowPreview, sourcePath),
    install: (sourcePath: string, approvedPermissions = []) => ipcRenderer.invoke(IPC.communityWorkflowInstall, { sourcePath, approvedPermissions }),
    export: (workflow: Parameters<CommunityWorkflowApiContract['export']>[0], destination: string) => ipcRenderer.invoke(IPC.communityWorkflowExport, { workflow, destination })
  } satisfies CommunityWorkflowApiContract,
  workflowRuntime: {
    start: (workflowId: string, relPath: string, sceneId?: string) => ipcRenderer.invoke(IPC.workflowRuntimeStart, { workflowId, relPath, sceneId }),
    run: (workflowId: string, relPath: string, sceneId?: string) => ipcRenderer.invoke(IPC.workflowRuntimeRun, { workflowId, relPath, sceneId }),
    cancel: (runId: string) => ipcRenderer.invoke(IPC.workflowRuntimeCancel, runId),
    retry: (runId: string, relPath: string) => ipcRenderer.invoke(IPC.workflowRuntimeRetry, { runId, relPath }),
    resume: (runId: string, resumeInput?: unknown) => ipcRenderer.invoke(IPC.workflowRuntimeResume, { runId, resumeInput }),
    listRuns: (recover = true, summaries = false) => ipcRenderer.invoke(IPC.workflowRuntimeList, { recover, summaries }),
    onEvent: (listener: (event: WorkflowRuntimeEvent) => void) => { const handler = (_event: Electron.IpcRendererEvent, value: WorkflowRuntimeEvent) => listener(value); ipcRenderer.on(IPC.workflowRuntimeEvent, handler); return () => ipcRenderer.removeListener(IPC.workflowRuntimeEvent, handler) }
  },
  jobs: {
    list: (recover = true) => ipcRenderer.invoke(IPC.jobsList, recover),
    cancel: (jobId: string) => ipcRenderer.invoke(IPC.jobsCancel, jobId),
    retry: (jobId: string) => ipcRenderer.invoke(IPC.jobsRetry, jobId),
    onEvent: (listener: Parameters<JobsApiContract['onEvent']>[0]) => {
      const handler = (_event: Electron.IpcRendererEvent, value: WorkflowRuntimeEvent) => listener(value)
      ipcRenderer.on(IPC.jobsEvent, handler)
      return () => ipcRenderer.removeListener(IPC.jobsEvent, handler)
    }
  } satisfies JobsApiContract,
  image: {
    proposeScene: (relPath: string, sceneId?: string) => ipcRenderer.invoke(IPC.imageProposeScene, { relPath, sceneId }),
    generate: (request: Parameters<ImageApiContract['generate']>[0]) => ipcRenderer.invoke(IPC.imageGenerate, request),
    importFile: (sourcePath: string, prompt?: string) => ipcRenderer.invoke(IPC.imageImport, { sourcePath, prompt }),
    testConnection: (profileId: string) => ipcRenderer.invoke(IPC.imageTestConnection, profileId),
    listAssets: () => ipcRenderer.invoke(IPC.imageListAssets),
    deleteAsset: (id: string) => ipcRenderer.invoke(IPC.imageDeleteAsset, id),
    readAsset: (id: string) => ipcRenderer.invoke(IPC.imageReadAsset, id),
    insertIntoChapter: (relPath: string, assetId: string, caption: string) => ipcRenderer.invoke(IPC.imageInsert, { relPath, assetId, caption })
  },
  backup: {
    createArchive: (destination: string) => ipcRenderer.invoke(IPC.backupCreate, destination),
    restoreArchive: (archive: string, destination: string) => ipcRenderer.invoke(IPC.backupRestore, { archive, destination }),
    createIncrementalArchive: (destination: string, baseArchive: string) => ipcRenderer.invoke(IPC.backupCreateIncremental, { destination, baseArchive }),
    restoreIncrementalArchive: (baseArchive: string, incrementalArchive: string, destination: string) => ipcRenderer.invoke(IPC.backupRestoreIncremental, { baseArchive, incrementalArchive, destination })
  } satisfies BackupApiContract,
  checkpoint: {
    list: () => ipcRenderer.invoke(IPC.checkpointList),
    create: (name: string) => ipcRenderer.invoke(IPC.checkpointCreate, name),
    restore: (id: string) => ipcRenderer.invoke(IPC.checkpointRestore, id)
  } satisfies CheckpointApiContract,
  diagnostics: {
    export: (destination: string) => ipcRenderer.invoke(IPC.diagnosticsExport, destination),
    exportCompressed: (destination: string) => ipcRenderer.invoke(IPC.diagnosticsExportCompressed, destination)
  },
  extensions: {
    list: () => ipcRenderer.invoke(IPC.extensionList),
    permissionPreview: (id: string) => ipcRenderer.invoke(IPC.extensionPermissionPreview, id),
    preview: (sourcePath: string) => ipcRenderer.invoke(IPC.extensionPreview, sourcePath),
    install: (sourcePath: string, approvedPermissions = []) => ipcRenderer.invoke(IPC.extensionInstall, { sourcePath, approvedPermissions }),
    uninstall: (id: string) => ipcRenderer.invoke(IPC.extensionUninstall, id),
    rollback: (id: string) => ipcRenderer.invoke(IPC.extensionRollback, id),
    trustStatus: () => ipcRenderer.invoke(IPC.extensionTrustStatus)
  } satisfies ExtensionApiContract,
  telemetry: {
    getStatus: () => ipcRenderer.invoke(IPC.telemetryGetStatus),
    setConsent: (enabled: boolean) => ipcRenderer.invoke(IPC.telemetrySetConsent, enabled)
  } satisfies TelemetryApiContract,
  settings: {
    get: (key: string) => ipcRenderer.invoke(IPC.settingsGet, key),
    set: (key: string, value: string) => ipcRenderer.invoke(IPC.settingsSet, { key, value })
  } satisfies SettingsApiContract,
  secret: {
    has: (key: string) => ipcRenderer.invoke(IPC.secretHas, key),
    set: (key: string, value: string) => ipcRenderer.invoke(IPC.secretSet, { key, value }),
    remove: (key: string) => ipcRenderer.invoke(IPC.secretRemove, key)
  } satisfies SecretApiContract,
  update: {
    check: () => ipcRenderer.invoke(IPC.updateCheck),
    download: () => ipcRenderer.invoke(IPC.updateDownload),
    install: () => ipcRenderer.invoke(IPC.updateInstall),
    cancel: () => ipcRenderer.invoke(IPC.updateCancel),
    onEvent: (listener: Parameters<UpdateApiContract['onEvent']>[0]) => {
      const handler = (_event: Electron.IpcRendererEvent, value: Parameters<UpdateApiContract['onEvent']>[0] extends (event: infer E) => void ? E : never) => listener(value)
      ipcRenderer.on(IPC.updateEvent, handler)
      return () => ipcRenderer.removeListener(IPC.updateEvent, handler)
    }
  } satisfies UpdateApiContract,
  revision: {
    list: (relPath?: string) => ipcRenderer.invoke(IPC.revisionList, relPath),
    get: (id: string) => ipcRenderer.invoke(IPC.revisionGet, id),
    revert: (id: string) => ipcRenderer.invoke(IPC.revisionRevert, id)
  } satisfies RevisionApiContract,
  ai: {
    listProfiles: () => ipcRenderer.invoke(IPC.aiListProfiles),
    saveProfile: (profile: Parameters<AiApiContract['saveProfile']>[0]) => ipcRenderer.invoke(IPC.aiSaveProfile, profile),
    selectProfile: (id: string) => ipcRenderer.invoke(IPC.aiSelectProfile, id),
    deleteProfile: (id: string) => ipcRenderer.invoke(IPC.aiDeleteProfile, id),
    hasSecret: (id: string) => ipcRenderer.invoke(IPC.aiHasSecret, id),
    setSecret: (profileId: string, secret: string) => ipcRenderer.invoke(IPC.aiSetSecret, { profileId, secret }),
    removeSecret: (id: string) => ipcRenderer.invoke(IPC.aiRemoveSecret, id),
    hasImageSecret: (id: string) => ipcRenderer.invoke(IPC.aiHasImageSecret, id),
    setImageSecret: (profileId: string, secret: string) => ipcRenderer.invoke(IPC.aiSetImageSecret, { profileId, secret }),
    removeImageSecret: (id: string) => ipcRenderer.invoke(IPC.aiRemoveImageSecret, id),
    testProfile: (id: string) => ipcRenderer.invoke(IPC.aiTestProfile, id),
    testEmbedding: (id: string) => ipcRenderer.invoke(IPC.aiTestEmbedding, id),
    chat: (profileId: string, request: Parameters<AiApiContract['chat']>[1]) => ipcRenderer.invoke(IPC.aiChat, { profileId, request }),
    stream: async (profileId: string, request: Parameters<AiApiContract['chat']>[1], onEvent: (event: AiStreamEnvelope['event']) => void, options?: AiStreamOptions) => {
      const jobId = crypto.randomUUID()
      const listener = (_event: Electron.IpcRendererEvent, envelope: AiStreamEnvelope) => { if (envelope.jobId === jobId) onEvent(envelope.event) }
      ipcRenderer.on(IPC.aiStreamEvent, listener)
      ipcRenderer.send(IPC.aiStreamStart, { jobId, profileId, request, ...options })
      return () => { ipcRenderer.send(IPC.aiStreamCancel, jobId); ipcRenderer.removeListener(IPC.aiStreamEvent, listener) }
    },
    ask: async (prompt: string) => {
      const project = await ipcRenderer.invoke(IPC.projectGetInfo)
      const profileId = project.ok ? project.data?.manifest.providerProfile : null
      if (!profileId) return { text: '尚未配置 Provider，请先打开 Provider 设置', provider: 'unconfigured' }
      const result = await ipcRenderer.invoke(IPC.aiChat, { profileId, request: { messages: [{ role: 'user', content: prompt }] } })
      return result.ok ? { text: result.data.text, provider: profileId } : { text: result.error.message, provider: profileId }
    }
  }
}

contextBridge.exposeInMainWorld('novelAPI', api)

contextBridge.exposeInMainWorld('novelMenu', {
  onAction: (callback: (action: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) => callback(action)
    ipcRenderer.on(IPC.menuAction, listener)
    return () => ipcRenderer.removeListener(IPC.menuAction, listener)
  }
})
