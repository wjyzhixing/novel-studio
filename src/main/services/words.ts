/**
 * Word/character counting (Blueprint §26): Chinese characters and English
 * words are counted separately. Markdown syntax is stripped before counting.
 */

const stripMarkdown = (md: string): string =>
  md
    // remove code fences
    .replace(/```[\s\S]*?```/g, ' ')
    // inline code
    .replace(/`[^`]*`/g, ' ')
    // images/links keep their text
    .replace(/![^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // heading/keyword markers
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/(\*\*|__|\*|_|~~)/g, ' ')
    // blockquote/list markers
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')

export function countWords(markdown: string): number {
  const text = stripMarkdown(markdown)
  // CJK characters (including punctuation-free run counting): count each CJK char
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) ?? []).length
  // Latin/digit words
  const latin = (text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ').match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) ?? []).length
  return cjk + latin
}