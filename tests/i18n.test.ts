import { describe, expect, it } from 'vitest'
import { DEFAULT_UI_LOCALE, getUiText, readUiLocale, type UiLocale } from '../src/renderer/src/lib/i18n'

describe('UI language contract', () => {
  it('falls back safely and keeps project language independent', () => {
    expect(DEFAULT_UI_LOCALE).toBe('zh-CN')
    expect(readUiLocale({ getItem: () => 'fr-FR' })).toBe(DEFAULT_UI_LOCALE)
    expect(getUiText('en-US', 'projectHealth')).toBe('Project Health')
    expect(getUiText('zh-CN', 'projectHealth')).toBe('项目健康')
    expect(getUiText('en-US', 'saveNote')).toBe('Save note')
    expect(getUiText('zh-CN', 'canonCheck')).toBe('Canon Check')
  })

  it('reads only supported persisted locale values', () => {
    const locales: UiLocale[] = ['zh-CN', 'en-US']
    for (const locale of locales) expect(readUiLocale({ getItem: () => locale })).toBe(locale)
    expect(readUiLocale({ getItem: () => null })).toBe('zh-CN')
  })
})
