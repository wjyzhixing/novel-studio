/// <reference types="vite/client" />

import type { CreateProjectInput, ProjectInfo, RecentProject } from '../../shared/ipc'
import type { ChapterMeta, ChapterContent, SearchHit, ExportFormat } from '../../shared/chapter'
import type { Result } from '../../shared/result'
import type { StoryApiContract } from '../../shared/story'
import type { AiApiContract } from '../../shared/ai'
import type { AiEditApiContract } from '../../shared/ai-edit'
import type { ContextApiContract } from '../../shared/context'
import type { CanonApiContract } from '../../shared/canon'
import type { WorkflowApiContract } from '../../shared/workflow'
import type { WorkflowRun } from '../../shared/runtime'
import type { JobRecord } from '../../shared/jobs'
import type { ImageApiContract } from '../../shared/image'
import type { BackupApiContract } from '../../shared/backup'
import type { MemoryApiContract } from '../../shared/memory'
import type { RevisionApiContract } from '../../shared/revision'
import type { CheckpointApiContract } from '../../shared/checkpoint'
import type { SceneApiContract } from '../../shared/scene'
import type { VolumeApiContract } from '../../shared/volume'

declare global {
  interface Window {
    novelAPI: {
      project: {
        pickDirectory(): Promise<Result<string | null>>
        create(input: CreateProjectInput): Promise<Result<ProjectInfo>>
        open(rootPath: string): Promise<Result<ProjectInfo>>
        close(): Promise<Result<null>>
        getInfo(): Promise<Result<ProjectInfo | null>>
        setArtDirection(value: string): Promise<Result<ProjectInfo>>
        repairIndexes(): Promise<Result<import('../../shared/ipc').ProjectRepairResult>>
        listRecent(): Promise<Result<RecentProject[]>>
        removeRecent(path: string): Promise<Result<null>>
        seedMockStory(): Promise<Result<null>>
        readText(relPath: string): Promise<Result<string>>
        pickArchiveSave(): Promise<Result<string | null>>
        pickArchiveOpen(): Promise<Result<string | null>>
        checkIntegrity(): Promise<Result<import('../../shared/ipc').ProjectIntegrity>>
        pickTextImport(): Promise<Result<string | null>>
        pickImageImport(): Promise<Result<string | null>>
        pickExportSave(format: ExportFormat): Promise<Result<string | null>>
        pickDiagnosticsSave(): Promise<Result<string | null>>
      }
      chapter: {
        list(): Promise<Result<ChapterMeta[]>>
        read(relPath: string): Promise<Result<ChapterContent>>
        create(title: string): Promise<Result<ChapterMeta>>
        rename(relPath: string, title: string): Promise<Result<ChapterMeta[]>>
        save(relPath: string, markdown: string): Promise<Result<{ savedAt: string; wordCount: number }>>
        move(relPath: string, toIndex: number): Promise<Result<ChapterMeta[]>>
        remove(relPath: string): Promise<Result<null>>
        readNote(relPath: string): Promise<Result<string>>
        saveNote(relPath: string, notes: string): Promise<Result<null>>
        importFile(sourcePath: string, title?: string): Promise<Result<ChapterMeta>>
        exportAll(format: ExportFormat, destination: string): Promise<Result<{ destination: string; chapterCount: number }>>
      }
      scene: SceneApiContract
      volume: VolumeApiContract
      search: {
        project(query: string): Promise<Result<SearchHit[]>>
      }
      story: StoryApiContract
      ai: AiApiContract & { ask(prompt: string): Promise<{ text: string; provider: string }> }
      aiEdit: AiEditApiContract
      context: ContextApiContract
      memory: MemoryApiContract
      canon: CanonApiContract
      workflowEditor: WorkflowApiContract
      workflowRuntime: { start(id: string, relPath: string, sceneId?: string): Promise<Result<string>>; run(id: string, relPath: string, sceneId?: string): Promise<Result<WorkflowRun>>; cancel(id: string): Promise<Result<null>>; retry(id: string, relPath: string): Promise<Result<string>>; resume(id: string, resumeInput?: unknown): Promise<Result<WorkflowRun>>; listRuns(recover?: boolean, summaries?: boolean): Promise<Result<WorkflowRun[]>>; onEvent(listener: (event: import('../../shared/runtime').WorkflowRuntimeEvent) => void): () => void }
      jobs: { list(recover?: boolean): Promise<Result<JobRecord[]>> }
      image: ImageApiContract
      backup: BackupApiContract
      revision: RevisionApiContract
      checkpoint: CheckpointApiContract
      diagnostics: import('../../shared/diagnostics').DiagnosticsApiContract
    }
    /** Menu bridge is unavailable when the renderer is opened directly in a browser. */
    novelMenu?: { onAction(callback: (action: string) => void): () => void }
  }
}

export {}
