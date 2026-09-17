export interface SelectionAction {
  id: string
  label: string
  mutatesDocument: boolean
  prompt: string
}

export const selectionActions: readonly SelectionAction[] = [
  { id: 'polish', label: '润写', mutatesDocument: true, prompt: '润写选中的文字，保持原有事实、人物和叙事视角，只返回处理后的正文。' },
  { id: 'rewrite', label: '改写', mutatesDocument: true, prompt: '改写选中的文字，保持原有事实、人物和叙事视角，只返回处理后的正文。' },
  { id: 'expand', label: '扩写', mutatesDocument: true, prompt: '扩写选中的文字，保持原有事实、人物和叙事视角，只返回处理后的正文。' },
  { id: 'shorten', label: '缩写', mutatesDocument: true, prompt: '缩写选中的文字，保留关键事实、人物和叙事视角，只返回处理后的正文。' },
  { id: 'continue', label: '续写', mutatesDocument: true, prompt: '续写选中的文字，保持原有事实、人物和叙事视角，只返回追加后的正文。' },
  { id: 'explain', label: '解释', mutatesDocument: false, prompt: '解释下面选中的文字，只返回解释，不要改写正文。' },
  { id: 'translate', label: '翻译', mutatesDocument: true, prompt: '翻译选中的文字，保持原有事实和语义，只返回翻译后的正文。' },
  { id: 'select', label: '选中', mutatesDocument: false, prompt: '' },
  { id: 'clear-selection', label: '取消选中', mutatesDocument: false, prompt: '' }
]
