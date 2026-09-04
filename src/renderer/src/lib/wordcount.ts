/** Client-side word/char count for the status bar (Blueprint §26: CJK + latin split). */
const stripMarkdown = (markdown: string): string => markdown
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/`[^`]*`/g, ' ')
  .replace(/![^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/(\*\*|__|\*|_|~~)/g, ' ')
  .replace(/^>\s?/gm, '')
  .replace(/^[-*+]\s+/gm, '')
  .replace(/^\d+\.\s+/gm, '')

export function countWords(text: string): number {
  const plainText = stripMarkdown(text)
  const cjk = (plainText.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) ?? []).length
  const latin = (
    plainText.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ').match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) ?? []
  ).length
  return cjk + latin
}
