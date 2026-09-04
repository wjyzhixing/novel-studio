export interface SelectionAction {
  label: string
  mutatesDocument: boolean
  prompt: string
}

export const selectionActions: readonly SelectionAction[] = [
  { label: '润写', mutatesDocument: true, prompt: '润写选中的文字，保持原有事实、人物和叙事视角，只返回处理后的正文。' },
  { label: '改写', mutatesDocument: true, prompt: '改写选中的文字，保持原有事实、人物和叙事视角，只返回处理后的正文。' },
  { label: '扩写', mutatesDocument: true, prompt: '扩写选中的文字，保持原有事实、人物和叙事视角，只返回处理后的正文。' },
  { label: '缩写', mutatesDocument: true, prompt: '缩写选中的文字，保留关键事实、人物和叙事视角，只返回处理后的正文。' },
  { label: '续写', mutatesDocument: true, prompt: '续写选中的文字，保持原有事实、人物和叙事视角，只返回追加后的正文。' },
  { label: '解释', mutatesDocument: false, prompt: '解释下面选中的文字，只返回解释，不要改写正文。' },
  { label: '翻译', mutatesDocument: true, prompt: '翻译选中的文字，保持原有事实和语义，只返回翻译后的正文。' },
  { label: '更多', mutatesDocument: true, prompt: '' }
]
