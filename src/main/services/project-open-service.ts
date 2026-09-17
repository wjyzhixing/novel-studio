import type { ProjectInfo } from '../../shared/ipc'
import type { ChapterService } from './chapter-service'
import type { ProjectService } from './project-service'

/**
 * Chapter Markdown is canonical; synchronize its rebuildable SQLite/FTS index
 * after every project lifecycle operation that makes the project available to
 * the renderer.
 */
export async function syncChapterIndex(chapterService: Pick<ChapterService, 'rebuildIndex'>): Promise<void> {
  await chapterService.rebuildIndex()
}

export async function openProjectAndSyncChapterIndex(
  projectService: ProjectService,
  chapterService: Pick<ChapterService, 'rebuildIndex'>,
  rootPath: string
): Promise<ProjectInfo> {
  const info = await projectService.open(rootPath)
  await syncChapterIndex(chapterService)
  return info
}
