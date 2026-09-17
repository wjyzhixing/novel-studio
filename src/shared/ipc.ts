import type { NovelManifest } from './project-schema'
import type { Result } from './result'
import type { UpdateApiContract } from './update'

/**
 * Typed IPC channel map (blueprint §5/§33).
 * Preload and main both import this file so channel names and payload types
 * can never drift apart.
 */
export const IPC = {
  menuAction: 'menu:action',
  projectPickDirectory: 'project:pick-directory',
  projectCreate: 'project:create',
  projectOpen: 'project:open',
  projectClose: 'project:close',
  projectGetInfo: 'project:get-info',
  projectSetArtDirection: 'project:set-art-direction',
  projectRecentList: 'project:recent-list',
  projectRemoveRecent: 'project:remove-recent',
  projectSeedMockStory: 'project:seed-mock-story',
  projectReadText: 'project:read-text', projectRepairIndexes: 'project:repair-indexes',
  projectPickArchiveSave: 'project:pick-archive-save', projectPickArchiveOpen: 'project:pick-archive-open',
  projectPickTextImport: 'project:pick-text-import', projectPickExtensionPackage: 'project:pick-extension-package', projectPickCommunityWorkflowOpen: 'project:pick-community-workflow-open', projectPickCommunityWorkflowSave: 'project:pick-community-workflow-save', projectPickExportSave: 'project:pick-export-save', projectPickDiagnosticsSave: 'project:pick-diagnostics-save',
  projectCheckIntegrity: 'project:check-integrity',
  chapterList: 'chapter:list',
  chapterRead: 'chapter:read',
  chapterCreate: 'chapter:create',
  chapterRename: 'chapter:rename',
  chapterSave: 'chapter:save',
  chapterMove: 'chapter:move',
  chapterRemove: 'chapter:remove',
  chapterReadNote: 'chapter:read-note', chapterSaveNote: 'chapter:save-note',
  chapterImport: 'chapter:import', chapterExport: 'chapter:export',
  sceneList: 'scene:list', sceneCreate: 'scene:create', sceneUpdate: 'scene:update', sceneRemove: 'scene:remove', sceneReorder: 'scene:reorder',
  volumeList: 'volume:list', volumeCreate: 'volume:create', volumeUpdate: 'volume:update', volumeRemove: 'volume:remove', volumeAssignChapter: 'volume:assign-chapter', volumeUnassignChapter: 'volume:unassign-chapter', volumeReorder: 'volume:reorder',
  searchProject: 'search:project',
  storyListEntities: 'story:list-entities',
  storyGetEntity: 'story:get-entity',
  storySaveEntity: 'story:save-entity',
  storyDeleteEntity: 'story:delete-entity',
  storyListTimeline: 'story:list-timeline',
  storySaveTimelineEvent: 'story:save-timeline-event',
  storySearch: 'story:search', storySearchAll: 'story:search-all',
  storyListRelations: 'story:list-relations', storySaveRelation: 'story:save-relation', storyDeleteRelation: 'story:delete-relation',
  storyListArtifacts: 'story:list-artifacts', storySaveArtifact: 'story:save-artifact', storyDeleteArtifact: 'story:delete-artifact', storyListForeshadowing: 'story:list-foreshadowing', storyDeleteTimelineEvent: 'story:delete-timeline-event'
  ,authoringGet: 'authoring:get', authoringInitialize: 'authoring:initialize', authoringRefresh: 'authoring:refresh', authoringSave: 'authoring:save', authoringSaveFoundation: 'authoring:save-foundation', authoringMarkExported: 'authoring:mark-exported', authoringReview: 'authoring:review', fullRevisionPrepare: 'full-revision:prepare', fullRevisionApprove: 'full-revision:approve'
  ,aiListProfiles: 'ai:list-profiles', aiSaveProfile: 'ai:save-profile', aiSelectProfile: 'ai:select-profile', aiDeleteProfile: 'ai:delete-profile',
  aiHasSecret: 'ai:has-secret', aiSetSecret: 'ai:set-secret', aiRemoveSecret: 'ai:remove-secret', aiHasImageSecret: 'ai:has-image-secret', aiSetImageSecret: 'ai:set-image-secret', aiRemoveImageSecret: 'ai:remove-image-secret',
  aiTestProfile: 'ai:test-profile', aiTestEmbedding: 'ai:test-embedding', aiChat: 'ai:chat'
  ,aiStreamStart: 'ai:stream-start', aiStreamCancel: 'ai:stream-cancel', aiStreamEvent: 'ai:stream-event'
  ,aiEditListPending: 'ai-edit:list-pending', aiEditRun: 'ai-edit:run', aiEditCreateFromText: 'ai-edit:create-from-text', aiEditAccept: 'ai-edit:accept', aiEditReject: 'ai-edit:reject'
  ,aiEditCancel: 'ai-edit:cancel', aiEditRetry: 'ai-edit:retry'
  ,contextBuild: 'context:build', contextSummarize: 'context:summarize', contextSnapshotList: 'context:snapshot-list', contextSnapshotRead: 'context:snapshot-read', contextSnapshotReplay: 'context:snapshot-replay'
  ,memoryExtractFromChapter: 'memory:extract-from-chapter'
  ,canonListFacts: 'canon:list-facts', canonCountFacts: 'canon:count-facts', canonCheck: 'canon:check', canonListProposals: 'canon:list-proposals', canonProposeFact: 'canon:propose-fact', canonProposeFactUpdate: 'canon:propose-fact-update', canonProposeRelation: 'canon:propose-relation', canonProposeTimeline: 'canon:propose-timeline', canonProposeForeshadowing: 'canon:propose-foreshadowing', canonReject: 'canon:reject', canonApply: 'canon:apply', canonRevert: 'canon:revert'
  ,workflowList: 'workflow:list', workflowRead: 'workflow:read', workflowSave: 'workflow:save', workflowValidate: 'workflow:validate'
  ,communityWorkflowPreview: 'community-workflow:preview', communityWorkflowInstall: 'community-workflow:install', communityWorkflowExport: 'community-workflow:export'
  ,workflowRuntimeRun: 'workflow-runtime:run', workflowRuntimeStart: 'workflow-runtime:start', workflowRuntimeEvent: 'workflow-runtime:event', workflowRuntimeCancel: 'workflow-runtime:cancel', workflowRuntimeRetry: 'workflow-runtime:retry', workflowRuntimeResume: 'workflow-runtime:resume', workflowRuntimeList: 'workflow-runtime:list'
  ,jobsList: 'jobs:list', jobsCancel: 'jobs:cancel', jobsRetry: 'jobs:retry', jobsEvent: 'jobs:event'
  ,imageProposeScene: 'image:propose-scene', imageGenerate: 'image:generate', imageImport: 'image:import', imageTestConnection: 'image:test-connection', imageListAssets: 'image:list-assets', imageDeleteAsset: 'image:delete-asset', imageReadAsset: 'image:read-asset', imageInsert: 'image:insert'
  ,revisionList: 'revision:list', revisionGet: 'revision:get', revisionRevert: 'revision:revert'
  ,backupCreate: 'backup:create', backupRestore: 'backup:restore', backupCreateIncremental: 'backup:create-incremental', backupRestoreIncremental: 'backup:restore-incremental'
  ,checkpointList: 'checkpoint:list', checkpointCreate: 'checkpoint:create', checkpointRestore: 'checkpoint:restore'
  ,diagnosticsExport: 'diagnostics:export', diagnosticsExportCompressed: 'diagnostics:export-compressed'
  ,telemetryGetStatus: 'telemetry:get-status', telemetrySetConsent: 'telemetry:set-consent'
  ,settingsGet: 'settings:get', settingsSet: 'settings:set'
  ,secretHas: 'secret:has', secretSet: 'secret:set', secretRemove: 'secret:remove'
  ,updateCheck: 'update:check', updateDownload: 'update:download', updateInstall: 'update:install', updateCancel: 'update:cancel', updateEvent: 'update:event'
  ,extensionList: 'extension:list', extensionPermissionPreview: 'extension:permission-preview', extensionPreview: 'extension:preview', extensionInstall: 'extension:install', extensionUninstall: 'extension:uninstall', extensionRollback: 'extension:rollback', extensionTrustStatus: 'extension:trust-status'
} as const

export interface ProjectInfo {
  rootPath: string
  manifest: NovelManifest
}

export interface RecentProject {
  path: string
  title: string
  lastOpenedAt: string
}

export interface MigrationReport {
  fromVersion: number
  toVersion: number
  applied: Array<{ version: number; name: string }>
  status: 'up_to_date' | 'migrated'
}

export interface TelemetryStatus {
  enabled: boolean
  consent: 'not-granted' | 'granted' | 'revoked'
}

export interface TelemetryApiContract {
  getStatus(): Promise<Result<TelemetryStatus>>
  setConsent(enabled: boolean): Promise<Result<TelemetryStatus>>
}

export interface SettingsApiContract {
  get(key: string): Promise<Result<string | null>>
  set(key: string, value: string): Promise<Result<null>>
}

export interface SecretApiContract {
  has(key: string): Promise<Result<boolean>>
  set(key: string, value: string): Promise<Result<null>>
  remove(key: string): Promise<Result<null>>
}

export type { UpdateApiContract }

export interface ProjectIntegrity {
  chaptersOnDisk: number
  chaptersIndexed: number
  entitiesOnDisk: number
  entitiesIndexed: number
  relationsIndexed: number
  danglingRelations: number
  danglingTimelineEntityRefs: number
  danglingTimelineChapterRefs: number
  factsIndexed: number
  assetsOnDisk: number
  assetsIndexed: number
  embeddingRows: number
  staleEmbeddings: number
  danglingEmbeddings: number
  invalidStoryArtifacts: number
  invalidStoryArtifactDetails: InvalidStoryArtifactDetail[]
  invalidSourceFiles: string[]
  invalidSourceDetails: InvalidSourceDetail[]
  migration: MigrationReport
  missingFiles: string[]
  warnings: string[]
}

export interface ProjectRepairResult {
  documents: number
  entities: number
  timeline: number
  artifacts: number
  relations: number
  assets: number
  embeddingsRemoved: number
  restoredSources: string[]
  invalidStoryArtifacts: number
  invalidStoryArtifactDetails: InvalidStoryArtifactDetail[]
  invalidSourceFiles: string[]
  invalidSourceDetails: InvalidSourceDetail[]
}

export interface InvalidStoryArtifactDetail {
  id: string
  kind: string
  title: string
  issues: string[]
}

export interface InvalidSourceDetail {
  path: string
  issues: string[]
}

export interface CreateProjectInput {
  rootPath: string
  title: string
  language?: string
}

/** What the renderer is allowed to call, with exact Result types. */
export interface ProjectApiContract {
  pickDirectory(): Promise<Result<string | null>>
  create(input: CreateProjectInput): Promise<Result<ProjectInfo>>
  open(rootPath: string): Promise<Result<ProjectInfo>>
  close(): Promise<Result<null>>
  getInfo(): Promise<Result<ProjectInfo | null>>
  setArtDirection(value: string): Promise<Result<ProjectInfo>>
  repairIndexes(): Promise<Result<ProjectRepairResult>>
  listRecent(): Promise<Result<RecentProject[]>>
  removeRecent(path: string): Promise<Result<null>>
  seedMockStory(): Promise<Result<null>>
  readText(relPath: string): Promise<Result<string>>
  pickArchiveSave(): Promise<Result<string | null>>
  pickArchiveOpen(): Promise<Result<string | null>>
  checkIntegrity(): Promise<Result<ProjectIntegrity>>
  pickTextImport(extensions?: readonly string[]): Promise<Result<string | null>>
  pickExtensionPackage(): Promise<Result<string | null>>
  pickCommunityWorkflowOpen(): Promise<Result<string | null>>
  pickCommunityWorkflowSave(): Promise<Result<string | null>>
  pickImageImport(): Promise<Result<string | null>>
  pickExportSave(format: import('./chapter').ExportFormat): Promise<Result<string | null>>
}
