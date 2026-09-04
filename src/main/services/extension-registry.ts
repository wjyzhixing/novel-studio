import type { ExtensionRegistrySnapshot, ExporterExtension, ImporterExtension, ProviderExtension, WorkflowNodeExtension } from '../../shared/extensions'
import { DomainError } from './errors'

/** Main-process registry for built-in and trusted extensions. No filesystem
 * discovery or arbitrary JS execution is performed by this registry. */
export class ExtensionRegistry {
  private state: {
    providers: readonly ProviderExtension[]
    workflowNodes: readonly WorkflowNodeExtension[]
    importers: readonly ImporterExtension[]
    exporters: readonly ExporterExtension[]
  } = { providers: [], workflowNodes: [], importers: [], exporters: [] }

  registerProvider(extension: ProviderExtension): void {
    this.state = { ...this.state, providers: this.replaceUnique(this.state.providers, extension, (item) => item.id) }
  }

  registerWorkflowNode(extension: WorkflowNodeExtension): void {
    this.state = { ...this.state, workflowNodes: this.replaceUnique(this.state.workflowNodes, extension, (item) => item.type) }
  }

  registerImporter(extension: ImporterExtension): void {
    this.state = { ...this.state, importers: this.replaceUnique(this.state.importers, extension, (item) => item.id) }
  }

  registerExporter(extension: ExporterExtension): void {
    this.state = { ...this.state, exporters: this.replaceUnique(this.state.exporters, extension, (item) => item.id) }
  }

  getProvider(id: string): ProviderExtension {
    const extension = this.state.providers.find((item) => item.id === id)
    if (!extension) throw new DomainError('PROJECT_NOT_FOUND', `Provider extension 不存在: ${id}`)
    return extension
  }

  getImporterForExtension(extension: string): ImporterExtension {
    const normalized = extension.toLowerCase().replace(/^\./, '')
    const importer = this.state.importers.find((item) => item.extensions.some((value) => value.toLowerCase().replace(/^\./, '') === normalized))
    if (!importer) throw new DomainError('VALIDATION_FAILED', `没有支持 .${normalized} 的导入器`)
    return importer
  }

  getExporter(format: string): ExporterExtension {
    const exporter = this.state.exporters.find((item) => item.format === format)
    if (!exporter) throw new DomainError('VALIDATION_FAILED', `没有支持 ${format} 的导出器`)
    return exporter
  }

  snapshot(): ExtensionRegistrySnapshot {
    return {
      providers: this.state.providers.map(({ id, kind, label }) => ({ id, kind, label })),
      workflowNodes: this.state.workflowNodes.map(({ type, label }) => ({ type, label })),
      importers: this.state.importers.map(({ id, label, extensions }) => ({ id, label, extensions: [...extensions] })),
      exporters: this.state.exporters.map(({ id, label, format }) => ({ id, label, format }))
    }
  }

  private replaceUnique<T>(items: readonly T[], next: T, key: (item: T) => string): readonly T[] {
    const id = key(next)
    if (!id.trim()) throw new DomainError('VALIDATION_FAILED', '扩展 ID 不能为空')
    return [...items.filter((item) => key(item) !== id), next]
  }
}
