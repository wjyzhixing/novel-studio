import type { NovelManifest } from './project-schema'
import type { Result } from './result'

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
  projectPickTextImport: 'project:pick-text-import', projectPickExportSave: 'project:pick-export-save', projectPickDiagnosticsSave: 'project:pick-diagnostics-save',
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
  storySearch: 'story:search',
  storyListRelations: 'story:list-relations', storySaveRelation: 'story:save-relation', storyDeleteRelation: 'story:delete-relation',
  storyListArtifacts: 'story:list-artifacts', storySaveArtifact: 'story:save-artifact', storyDeleteArtifact: 'story:delete-artifact', storyListForeshadowing: 'story:list-foreshadowing', storyDeleteTimelineEvent: 'story:delete-timeline-event'
  ,aiListProfiles: 'ai:list-profiles', aiSaveProfile: 'ai:save-profile', aiSelectProfile: 'ai:select-profile', aiDeleteProfile: 'ai:delete-profile',
  aiHasSecret: 'ai:has-secret', aiSetSecret: 'ai:set-secret', aiRemoveSecret: 'ai:remove-secret', aiHasImageSecret: 'ai:has-image-secret', aiSetImageSecret: 'ai:set-image-secret', aiRemoveImageSecret: 'ai:remove-image-secret',
  aiTestProfile: 'ai:test-profile', aiTestEmbedding: 'ai:test-embedding', aiChat: 'ai:chat'
  ,aiStreamStart: 'ai:stream-start', aiStreamCancel: 'ai:stream-cancel', aiStreamEvent: 'ai:stream-event'
  ,aiEditListPending: 'ai-edit:list-pending', aiEditRun: 'ai-edit:run', aiEditCreateFromText: 'ai-edit:create-from-text', aiEditAccept: 'ai-edit:accept', aiEditReject: 'ai-edit:reject'
  ,aiEditCancel: 'ai-edit:cancel', aiEditRetry: 'ai-edit:retry'
  ,contextBuild: 'context:build', contextSummarize: 'context:summarize', contextSnapshotList: 'context:snapshot-list', contextSnapshotRead: 'context:snapshot-read', contextSnapshotReplay: 'context:snapshot-replay'
  ,memoryExtractFromChapter: 'memory:extract-from-chapter'
  ,canonListFacts: 'canon:list-facts', canonCountFacts: 'canon:count-facts', canonCheck: 'canon:check', canonListProposals: 'canon:list-proposals', canonProposeFact: 'canon:propose-fact', canonReject: 'canon:reject', canonApply: 'canon:apply', canonRevert: 'canon:revert'
  ,workflowList: 'workflow:list', workflowRead: 'workflow:read', workflowSave: 'workflow:save', workflowValidate: 'workflow:validate'
  ,workflowRuntimeRun: 'workflow-runtime:run', workflowRuntimeStart: 'workflow-runtime:start', workflowRuntimeEvent: 'workflow-runtime:event', workflowRuntimeCancel: 'workflow-runtime:cancel', workflowRuntimeRetry: 'workflow-runtime:retry', workflowRuntimeResume: 'workflow-runtime:resume', workflowRuntimeList: 'workflow-runtime:list'
  ,jobsList: 'jobs:list'
  ,imageProposeScene: 'image:propose-scene', imageGenerate: 'image:generate', imageImport: 'image:import', imageTestConnection: 'image:test-connection', imageListAssets: 'image:list-assets', imageDeleteAsset: 'image:delete-asset', imageReadAsset: 'image:read-asset', imageInsert: 'image:insert'
  ,revisionList: 'revision:list', revisionGet: 'revision:get', revisionRevert: 'revision:revert'
  ,backupCreate: 'backup:create', backupRestore: 'backup:restore', backupCreateIncremental: 'backup:create-incremental', backupRestoreIncremental: 'backup:restore-incremental'
  ,checkpointList: 'checkpoint:list', checkpointCreate: 'checkpoint:create', checkpointRestore: 'checkpoint:restore'
  ,diagnosticsExport: 'diagnostics:export'
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
  invalidSourceFiles: string[]
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
  invalidSourceFiles: string[]
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
  pickTextImport(): Promise<Result<string | null>>
  pickImageImport(): Promise<Result<string | null>>
  pickExportSave(format: import('./chapter').ExportFormat): Promise<Result<string | null>>
}
