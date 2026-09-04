export type CommandActionId = 'new-chapter' | 'open-workflow' | 'open-images' | 'open-settings' | 'open-health' | 'repair-indexes' | 'check-integrity' | 'close-project'

export interface CommandActionDefinition {
  id: CommandActionId
  label: string
  hint: string
  shortcut?: string
}

export const commandActionDefinitions: readonly CommandActionDefinition[] = [
  { id: 'new-chapter', label: '新建章节', hint: '输入标题创建' },
  { id: 'open-workflow', label: '打开 Workflow Editor', hint: '⌘⇧P / Ctrl⇧P', shortcut: 'mod+shift+p' },
  { id: 'open-images', label: '打开 Illustration Studio', hint: '图片工作台' },
  { id: 'open-settings', label: '打开 Provider 设置', hint: '模型与密钥配置' },
  { id: 'open-health', label: '打开项目完整性', hint: '索引与引用检查' },
  { id: 'repair-indexes', label: '修复项目索引', hint: '从 Markdown/YAML/资产 sidecar 重建 SQLite 索引' },
  { id: 'check-integrity', label: '检查项目完整性', hint: '只读比较项目文件源与 SQLite 索引' },
  { id: 'close-project', label: '关闭项目', hint: '返回欢迎页' }
]

export function matchesCommandAction(action: CommandActionDefinition, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  return !normalized || `${action.label} ${action.hint} ${action.id}`.toLowerCase().includes(normalized)
}

export function commandAction(id: CommandActionId): CommandActionDefinition {
  return commandActionDefinitions.find((definition) => definition.id === id) ?? commandActionDefinitions[0]
}
