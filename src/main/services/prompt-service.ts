import { readFile } from 'node:fs/promises'
import type { ProjectService } from './project-service'
import { DomainError } from './errors'

/** Versioned prompt-pack access. Prompts are project files, never source constants. */
export class PromptService {
  constructor(private readonly project: ProjectService) {}

  async read(name: string): Promise<string> {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) {
      throw new DomainError('VALIDATION_FAILED', 'Prompt 名称不合法')
    }
    try {
      return (await readFile(this.project.resolveInProject(`prompts/${name}.md`), 'utf8')).trim()
    } catch {
      throw new DomainError('PROJECT_NOT_FOUND', `Prompt 文件不存在: prompts/${name}.md`)
    }
  }
}
