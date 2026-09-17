import type { UiTextKey } from '../lib/i18n'

export type CommandActionId = 'new-chapter' | 'open-workflow' | 'open-images' | 'open-settings' | 'open-health' | 'repair-indexes' | 'check-integrity' | 'close-project'

export interface CommandActionDefinition {
  id: CommandActionId
  labelKey: UiTextKey
  hintKey: UiTextKey
  shortcut?: string
}

export const commandActionDefinitions: readonly CommandActionDefinition[] = [
  { id: 'new-chapter', labelKey: 'actionNewChapter', hintKey: 'actionNewChapterHint' },
  { id: 'open-workflow', labelKey: 'actionOpenWorkflow', hintKey: 'actionOpenWorkflowHint', shortcut: 'mod+shift+p' },
  { id: 'open-images', labelKey: 'actionOpenImages', hintKey: 'actionOpenImagesHint' },
  { id: 'open-settings', labelKey: 'actionOpenSettings', hintKey: 'actionOpenSettingsHint' },
  { id: 'open-health', labelKey: 'actionOpenHealth', hintKey: 'actionOpenHealthHint' },
  { id: 'repair-indexes', labelKey: 'actionRepairIndexes', hintKey: 'actionRepairIndexesHint' },
  { id: 'check-integrity', labelKey: 'actionCheckIntegrity', hintKey: 'actionCheckIntegrityHint' },
  { id: 'close-project', labelKey: 'actionCloseProject', hintKey: 'actionCloseProjectHint' }
]

export function matchesCommandAction(action: CommandActionDefinition, query: string, localizedText?: (key: UiTextKey) => string): boolean {
  const normalized = query.trim().toLowerCase()
  return !normalized || `${localizedText?.(action.labelKey) ?? action.labelKey} ${localizedText?.(action.hintKey) ?? action.hintKey} ${action.id}`.toLowerCase().includes(normalized)
}

export function commandAction(id: CommandActionId): CommandActionDefinition {
  return commandActionDefinitions.find((definition) => definition.id === id) ?? commandActionDefinitions[0]
}
