import { useEffect, useMemo, useState } from 'react'
import { Save, Search, Users } from 'lucide-react'
import { foreshadowingStatuses } from '../../../shared/story'
import type { EntityKind, StoryEntity, TimelineEvent, StoryArtifact, StoryArtifactKind, ForeshadowingEvidence } from '../../../shared/story'
import type { StorySection } from './Sidebar'
import { useAppStore } from '../store/app-store'

const kinds: Array<{ value: EntityKind; label: string }> = [
  { value: 'character', label: '人物' },
  { value: 'place', label: '地点' },
  { value: 'org', label: '组织' },
  { value: 'item', label: '物品' }
]

const sectionTitles: Record<StorySection, string> = { character: 'Characters', world: 'World', timeline: 'Timeline', org: 'Orgs', item: 'Items', place: 'Places', plots: 'Plots', foreshadowing: 'Foreshadowing', lore: 'Lore', notes: 'Notes' }
const entitySections = new Set<EntityKind>(['character', 'place', 'org', 'item'])
const structuredFields: Record<EntityKind, Array<[string, string]>> = {
  character: [['appearance', '外貌'], ['personality', '性格'], ['goals', '目标'], ['secrets', '秘密'], ['knowledge', '已知信息'], ['status', '状态']],
  place: [['type', '地点类型'], ['location', '位置'], ['rules', '地点规则'], ['description', '描述']],
  org: [['members', '成员'], ['hierarchy', '组织层级'], ['goals', '组织目标'], ['resources', '资源'], ['relations', '组织关系']],
  item: [['owner', '持有者'], ['state', '状态'], ['history', '历史'], ['rules', '物品规则']]
}
const artifactFields: Record<StoryArtifactKind, Array<[string, string]>> = {
  plot: [['status', '状态'], ['priority', '优先级'], ['setup', '铺垫'], ['payoff', '回收'], ['relatedChapters', '关联章节']],
  foreshadowing: [['setup', '埋设内容'], ['target', '目标回收'], ['payoffDeadline', '回收期限'], ['status', '状态'], ['relatedChapters', '关联章节（逗号分隔）']],
  lore: [['scope', '适用范围'], ['rule', '规则'], ['exceptions', '例外'], ['source', '来源']],
  note: []
}
const artifactSection: Record<Exclude<StorySection, 'character' | 'world' | 'timeline' | 'org' | 'item' | 'place'>, StoryArtifactKind> = { plots: 'plot', foreshadowing: 'foreshadowing', lore: 'lore', notes: 'note' }

function formatVisualIdentity(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2)
  return ''
}

function formatArtifactValue(key: string, value: unknown): string {
  if (key === 'relatedChapters' && Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').join(', ')
  return formatVisualIdentity(value)
}

export function StoryBible({ section = 'character', focusEntityId }: { section?: StorySection; focusEntityId?: string | null }) {
  const entityKind: EntityKind | null = entitySections.has(section as EntityKind) ? section as EntityKind : section === 'world' ? 'place' : null
  const [kind, setKind] = useState<EntityKind>(entityKind ?? 'character')
  const [entities, setEntities] = useState<StoryEntity[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [selectedTimeline, setSelectedTimeline] = useState<TimelineEvent | null>(null)
  const [timelineTitle, setTimelineTitle] = useState('')
  const [timelineAt, setTimelineAt] = useState('')
  const [timelineDescription, setTimelineDescription] = useState('')
  const [timelineChapter, setTimelineChapter] = useState('')
  const [timelineEntityFilter, setTimelineEntityFilter] = useState('')
  const [timelineChapterFilter, setTimelineChapterFilter] = useState('')
  const [timelineQuery, setTimelineQuery] = useState('')
  const [timelineSort, setTimelineSort] = useState<'chronological' | 'updated'>('chronological')
  const [timelineLocation, setTimelineLocation] = useState('')
  const [timelineCauses, setTimelineCauses] = useState('')
  const [timelineEffects, setTimelineEffects] = useState('')
  const [timelineEntityIds, setTimelineEntityIds] = useState<string[]>([])
  const [selected, setSelected] = useState<StoryEntity | null>(null)
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [aliases, setAliases] = useState('')
  const [notes, setNotes] = useState('')
  const [role, setRole] = useState('')
  const [visualIdentity, setVisualIdentity] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [artifacts, setArtifacts] = useState<StoryArtifact[]>([])
  const [selectedArtifact, setSelectedArtifact] = useState<StoryArtifact | null>(null)
  const [artifactTitle, setArtifactTitle] = useState('')
  const [artifactValues, setArtifactValues] = useState<Record<string, string>>({})
  const [artifactNotes, setArtifactNotes] = useState('')
  const [evidenceItems, setEvidenceItems] = useState<ForeshadowingEvidence[]>([])
  const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

  const reload = async () => {
    try {
      const [list, events, artifactList] = await Promise.all([
        window.novelAPI.story.listEntities(entityKind ? kind : undefined),
        window.novelAPI.story.listTimeline(),
        artifactKind ? window.novelAPI.story.listArtifacts(artifactKind) : Promise.resolve({ ok: true as const, data: [] as StoryArtifact[] })
      ])
      if (list.ok) setEntities(list.data); else setNotice(`读取实体失败：${list.error.message}`)
      if (events.ok) setTimeline(events.data); else setNotice(`读取时间线失败：${events.error.message}`)
      if (artifactList.ok) setArtifacts(artifactList.data); else setNotice(`读取故事条目失败：${artifactList.error.message}`)
    } catch (error) { setNotice(`读取 Story Bible 失败：${errorMessage(error)}`) }
  }
  const artifactKind = artifactSection[section as keyof typeof artifactSection]
  useEffect(() => { void reload() }, [kind, entityKind, artifactKind, section])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? entities.filter((entity) => [entity.name, ...entity.aliases].join(' ').toLowerCase().includes(q)) : entities
  }, [entities, query])
  const visibleTimeline = useMemo(() => {
    const q = timelineQuery.trim().toLowerCase()
    return timeline.filter((event) => (timelineEntityFilter ? event.entityIds.includes(timelineEntityFilter) : true) && (!q || [event.title, event.description, event.causes, event.effects, event.chapterRelPath ?? ''].join(' ').toLowerCase().includes(q)))
  }, [timeline, timelineEntityFilter, timelineQuery])
  const chapters = useAppStore((state) => state.chapters)
  const filteredTimeline = useMemo(() => timelineChapterFilter ? visibleTimeline.filter((event) => event.chapterRelPath === timelineChapterFilter) : visibleTimeline, [timelineChapterFilter, visibleTimeline])
  const timelineGroups = useMemo(() => {
    const ordered = [...filteredTimeline].sort((left, right) => {
      if (timelineSort === 'updated') return right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title)
      const leftAt = left.at ? Date.parse(left.at) : Number.POSITIVE_INFINITY
      const rightAt = right.at ? Date.parse(right.at) : Number.POSITIVE_INFINITY
      return (Number.isNaN(leftAt) ? Number.POSITIVE_INFINITY : leftAt) - (Number.isNaN(rightAt) ? Number.POSITIVE_INFINITY : rightAt) || left.title.localeCompare(right.title)
    })
    const groups = new Map<string, TimelineEvent[]>()
    for (const event of ordered) {
      const key = event.at?.trim() || '未定时间'
      groups.set(key, [...(groups.get(key) ?? []), event])
    }
    return [...groups.entries()]
  }, [filteredTimeline, timelineSort])
  const entityName = (id: string) => entities.find((entity) => entity.id === id)?.name ?? id

  const choose = (entity: StoryEntity) => {
    setSelected(entity)
    setName(entity.name)
    setAliases(entity.aliases.join(', '))
    setNotes(entity.notes)
    setRole(typeof entity.fields.role === 'string' ? entity.fields.role : '')
    setVisualIdentity(formatVisualIdentity(entity.fields.visualIdentity))
    setFieldValues(Object.fromEntries((structuredFields[entity.kind] ?? []).map(([key]) => [key, formatVisualIdentity(entity.fields[key])])))
    setNotice(null)
  }
  useEffect(() => {
    if (!focusEntityId) return
    const focused = entities.find((entity) => entity.id === focusEntityId)
    if (focused) choose(focused)
  }, [entities, focusEntityId])
  const reset = () => { setSelected(null); setName(''); setAliases(''); setNotes(''); setRole(''); setVisualIdentity(''); setFieldValues({}); setNotice(null) }
  const resetArtifact = () => { setSelectedArtifact(null); setArtifactTitle(''); setArtifactValues({}); setArtifactNotes(''); setEvidenceItems([]); setNotice(null) }
  const resetTimeline = () => { setSelectedTimeline(null); setTimelineTitle(''); setTimelineAt(''); setTimelineDescription(''); setTimelineChapter(''); setTimelineLocation(''); setTimelineCauses(''); setTimelineEffects(''); setTimelineEntityIds([]); setNotice(null) }
  const chooseTimeline = (event: TimelineEvent) => { setSelectedTimeline(event); setTimelineTitle(event.title); setTimelineAt(event.at ?? ''); setTimelineDescription(event.description); setTimelineChapter(event.chapterRelPath ?? ''); setTimelineLocation(event.locationId ?? ''); setTimelineCauses(event.causes); setTimelineEffects(event.effects); setTimelineEntityIds(event.entityIds); setNotice(null) }
  const chooseArtifact = (artifact: StoryArtifact) => {
    setSelectedArtifact(artifact); setArtifactTitle(artifact.title)
    setArtifactValues(Object.fromEntries((artifactFields[artifact.kind] ?? []).map(([key]) => [key, formatArtifactValue(key, artifact.fields[key])] )))
    const rawEvidence = artifact.fields.evidenceItems
    setEvidenceItems(Array.isArray(rawEvidence) ? rawEvidence.filter((item): item is ForeshadowingEvidence => Boolean(item && typeof item === 'object' && typeof (item as ForeshadowingEvidence).chapterRelPath === 'string' && typeof (item as ForeshadowingEvidence).quote === 'string')).map((item) => ({ chapterRelPath: item.chapterRelPath, quote: item.quote, note: item.note ?? '' })) : [])
    setArtifactNotes(artifact.notes); setNotice(null)
  }
  useEffect(() => {
    setKind(entityKind ?? 'character')
    reset()
    resetArtifact()
    resetTimeline()
  }, [section, entityKind])
  const save = async () => {
    try {
      const fields = { ...(selected?.fields ?? {}) } as Record<string, unknown>
      if (role.trim()) fields.role = role.trim()
      else delete fields.role
      if (visualIdentity.trim()) fields.visualIdentity = visualIdentity.trim()
      else delete fields.visualIdentity
      for (const [key] of structuredFields[kind]) {
        if (fieldValues[key]?.trim()) fields[key] = fieldValues[key].trim()
        else delete fields[key]
      }
      const result = await window.novelAPI.story.saveEntity({ id: selected?.id, kind, name, aliases: aliases.split(',').map((v) => v.trim()).filter(Boolean), fields, notes })
      if (!result.ok) { setNotice(result.error.message); return }
      await reload(); choose(result.data); setNotice('已保存')
    } catch (error) { setNotice(`保存实体失败：${errorMessage(error)}`) }
  }
  const saveArtifact = async () => {
      if (!artifactKind || !artifactTitle.trim()) return
    try {
      if (artifactKind === 'foreshadowing' && evidenceItems.some((item) => !item.chapterRelPath.trim() || !item.quote.trim())) { setNotice('每条证据都需要选择章节并填写原文摘录'); return }
      const fields: Record<string, unknown> = { ...(selectedArtifact?.fields ?? {}) }
      for (const [key] of artifactFields[artifactKind] ?? []) {
        const value = artifactValues[key]?.trim()
        if (!value) delete fields[key]
        else fields[key] = artifactKind === 'foreshadowing' && key === 'relatedChapters' ? value.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean) : value
      }
      if (artifactKind === 'foreshadowing') {
        fields.evidenceItems = evidenceItems.filter((item) => item.chapterRelPath.trim() || item.quote.trim() || item.note.trim()).map((item) => ({ chapterRelPath: item.chapterRelPath.trim(), quote: item.quote.trim(), note: item.note.trim() }))
      }
      const result = await window.novelAPI.story.saveArtifact({ id: selectedArtifact?.id, kind: artifactKind, title: artifactTitle, fields, notes: artifactNotes })
      if (!result.ok) { setNotice(result.error.message); return }
      await reload(); chooseArtifact(result.data); setNotice('已保存')
    } catch (error) { setNotice(`保存故事条目失败：${errorMessage(error)}`) }
  }
  const saveTimeline = async () => {
    try {
      const result = await window.novelAPI.story.saveTimelineEvent({ id: selectedTimeline?.id, title: timelineTitle, at: timelineAt.trim() || null, description: timelineDescription, chapterRelPath: timelineChapter.trim() || null, entityIds: timelineEntityIds, locationId: timelineLocation.trim() || null, causes: timelineCauses, effects: timelineEffects })
      if (!result.ok) { setNotice(`保存失败：${result.error.message}`); return }
      await reload(); chooseTimeline(result.data); setNotice('已保存')
    } catch (error) { setNotice(`保存时间线失败：${errorMessage(error)}`) }
  }
  const deleteTimeline = async () => {
    if (!selectedTimeline) return
    try {
      const result = await window.novelAPI.story.deleteTimelineEvent(selectedTimeline.id)
      if (!result.ok) { setNotice(`删除失败：${result.error.message}`); return }
      await reload(); resetTimeline(); setNotice('已删除')
    } catch (error) { setNotice(`删除时间线失败：${errorMessage(error)}`) }
  }
  const deleteEntity = async () => {
    if (!selected) return
    try {
      const result = await window.novelAPI.story.deleteEntity(selected.id)
      if (!result.ok) { setNotice(`删除失败：${result.error.message}`); return }
      reset(); await reload(); setNotice('已删除')
    } catch (error) { setNotice(`删除实体失败：${errorMessage(error)}`) }
  }
  const deleteArtifact = async () => {
    if (!selectedArtifact) return
    try {
      const result = await window.novelAPI.story.deleteArtifact(selectedArtifact.id)
      if (!result.ok) { setNotice(`删除失败：${result.error.message}`); return }
      resetArtifact(); await reload(); setNotice('已删除')
    } catch (error) { setNotice(`删除故事条目失败：${errorMessage(error)}`) }
  }

  const evidenceEditor = <fieldset className="foreshadowing-evidence-editor"><legend>证据条目</legend>{evidenceItems.map((item, index) => <div className="evidence-entry" key={`${item.chapterRelPath}-${index}`}><label>章节<select value={item.chapterRelPath} onChange={(event) => setEvidenceItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, chapterRelPath: event.target.value } : entry))}><option value="">选择章节</option>{chapters.map((chapter) => <option key={chapter.relPath} value={chapter.relPath}>{chapter.number} · {chapter.title}</option>)}</select></label><label>原文摘录<textarea value={item.quote} onChange={(event) => setEvidenceItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, quote: event.target.value } : entry))} placeholder="粘贴能够证明伏笔状态的原文" /></label><label>说明<textarea value={item.note} onChange={(event) => setEvidenceItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, note: event.target.value } : entry))} placeholder="说明这段文字如何证明埋设、回响或回收" /></label><button type="button" onClick={() => setEvidenceItems((current) => current.filter((_, entryIndex) => entryIndex !== index))}>移除此证据</button></div>)}<button type="button" onClick={() => setEvidenceItems((current) => [...current, { chapterRelPath: '', quote: '', note: '' }])}>＋ 添加证据</button><small className="field-help">证据会写入伏笔源数据；旧版 evidence 文本仍会保留兼容。</small></fieldset>

  const timelineView = <div className="story-bible-layout"><section className="story-entity-list"><button className="story-new" onClick={resetTimeline}>＋ 新建事件</button><div className="timeline-filters"><label className="story-search"><Search size={14} /><input aria-label="搜索时间线事件" value={timelineQuery} onChange={(event) => setTimelineQuery(event.target.value)} placeholder="搜索事件…" /></label><label className="story-search"><span>关联实体</span><select aria-label="按关联实体筛选" value={timelineEntityFilter} onChange={(event) => setTimelineEntityFilter(event.target.value)}><option value="">全部实体</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label className="story-search"><span>章节</span><select aria-label="按章节筛选" value={timelineChapterFilter} onChange={(event) => setTimelineChapterFilter(event.target.value)}><option value="">全部章节</option>{chapters.map((chapter) => <option key={chapter.relPath} value={chapter.relPath}>{chapter.title}</option>)}</select></label><label className="story-search"><span>排序</span><select aria-label="时间线排序" value={timelineSort} onChange={(event) => setTimelineSort(event.target.value as 'chronological' | 'updated')}><option value="chronological">故事时间</option><option value="updated">最近修改</option></select></label></div><div className="timeline-groups">{timelineGroups.map(([group, events]) => <div className="timeline-group" key={group}><h3>{group}</h3>{events.map((event) => <button className={`story-entity-row${selectedTimeline?.id === event.id ? ' active' : ''}`} key={event.id} onClick={() => chooseTimeline(event)}><b>{event.title}</b><small>{event.entityIds.map(entityName).join('、') || '无关联实体'}{event.chapterRelPath ? ` · ${event.chapterRelPath}` : ''}</small></button>)}</div>)}</div>{filteredTimeline.length === 0 && <p className="story-empty">暂无符合条件的时间线事件</p>}</section><section className="story-form"><h2>{selectedTimeline ? '编辑时间线事件' : '新建时间线事件'}</h2><label>事件标题<input value={timelineTitle} onChange={(event) => setTimelineTitle(event.target.value)} /></label><label>故事时间<input value={timelineAt} onChange={(event) => setTimelineAt(event.target.value)} placeholder="例如：2127-05-17 21:42" /></label><label>发生地点<select value={timelineLocation} onChange={(event) => setTimelineLocation(event.target.value)}><option value="">未指定</option>{entities.filter((entity) => entity.kind === 'place').map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>关联章节<input value={timelineChapter} onChange={(event) => setTimelineChapter(event.target.value)} placeholder="例如：chapters/001-第一章.md" />{timelineChapter && !chapters.some((chapter) => chapter.relPath === timelineChapter) && <small className="field-help timeline-missing">该章节当前未在索引中找到，保存后可通过修复索引重新检查。</small>}</label><fieldset className="timeline-participants"><legend>参与实体</legend>{entities.length === 0 ? <small>暂无可关联实体</small> : entities.map((entity) => <label key={entity.id}><input type="checkbox" checked={timelineEntityIds.includes(entity.id)} onChange={(event) => setTimelineEntityIds((current) => event.target.checked ? [...current, entity.id] : current.filter((id) => id !== entity.id))} />{entity.name}</label>)}</fieldset><label>事件原因<textarea value={timelineCauses} onChange={(event) => setTimelineCauses(event.target.value)} placeholder="causes" /></label><label>事件结果<textarea value={timelineEffects} onChange={(event) => setTimelineEffects(event.target.value)} placeholder="effects" /></label><label>描述<textarea value={timelineDescription} onChange={(event) => setTimelineDescription(event.target.value)} /></label><div className="story-form-actions"><button className="primary" disabled={!timelineTitle.trim()} onClick={() => void saveTimeline()}><Save size={14} /> 保存</button>{selectedTimeline?.chapterRelPath && chapters.some((chapter) => chapter.relPath === selectedTimeline.chapterRelPath) && <button onClick={() => useAppStore.getState().openChapter(selectedTimeline.chapterRelPath!)}>打开章节</button>}{selectedTimeline?.chapterRelPath && !chapters.some((chapter) => chapter.relPath === selectedTimeline.chapterRelPath) && <span className="timeline-missing">章节不存在</span>}{selectedTimeline && <button onClick={() => void deleteTimeline()}>删除</button>}{notice && <span>{notice}</span>}</div></section></div>
  const artifactView = artifactKind ? <div className="story-bible-layout"><section className="story-entity-list"><button className="story-new" onClick={resetArtifact}>＋ 新建{sectionTitles[section]}</button>{artifacts.map((artifact) => <button className={`story-entity-row${selectedArtifact?.id === artifact.id ? ' active' : ''}`} key={artifact.id} onClick={() => chooseArtifact(artifact)}><b>{artifact.title}</b><small>{artifact.fields.status ? String(artifact.fields.status) : artifact.notes.slice(0, 40)}</small></button>)}{artifacts.length === 0 && <p className="story-empty">暂无条目</p>}</section><section className="story-form"><h2>{selectedArtifact ? '编辑条目' : `新建${sectionTitles[section]}`}</h2><label>标题<input value={artifactTitle} onChange={(event) => setArtifactTitle(event.target.value)} /></label>{artifactFields[artifactKind].map(([key, label]) => <label key={key}>{label}{artifactKind === 'foreshadowing' && key === 'status' ? <select value={artifactValues[key] ?? 'planned'} onChange={(event) => setArtifactValues((current) => ({ ...current, [key]: event.target.value }))}>{foreshadowingStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select> : artifactKind === 'foreshadowing' && key === 'relatedChapters' ? <select className="artifact-chapter-picker" aria-label="伏笔关联章节" multiple value={(artifactValues[key] ?? '').split(',').map((value) => value.trim()).filter(Boolean)} onChange={(event) => setArtifactValues((current) => ({ ...current, [key]: [...event.target.selectedOptions].map((option) => option.value).join(', ') }))}>{chapters.map((chapter) => <option key={chapter.relPath} value={chapter.relPath}>{chapter.number} · {chapter.title}</option>)}</select> : <textarea value={artifactValues[key] ?? ''} onChange={(event) => setArtifactValues((current) => ({ ...current, [key]: event.target.value }))} />}</label>)}{artifactKind === 'foreshadowing' && evidenceEditor}<small className="field-help">伏笔关联章节可多选；保存后写入结构化章节回链。</small><label>Notes<textarea value={artifactNotes} onChange={(event) => setArtifactNotes((event.target as HTMLTextAreaElement).value)} /></label><div className="story-form-actions"><button className="primary" disabled={!artifactTitle.trim()} onClick={() => void saveArtifact()}><Save size={14} /> 保存</button>{selectedArtifact && <button onClick={() => void deleteArtifact()}>删除</button>}{notice && <span>{notice}</span>}</div></section></div> : null

  return (
    <main className="editor-shell story-bible-shell">
      <div className="editor-tab"><Users size={14} /> Story Bible · {sectionTitles[section]}</div>
      {section === 'timeline' ? timelineView : artifactKind ? artifactView : entityKind ? <div className="story-bible-layout">
        <section className="story-entity-list">
          <div className="story-kind-tabs">{kinds.map((entry) => <button key={entry.value} className={entry.value === kind ? 'active' : ''} onClick={() => { setKind(entry.value); reset() }}>{entry.label}</button>)}</div>
          <label className="story-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或 alias" /></label>
          <button className="story-new" onClick={reset}>＋ 新建{kind === 'character' ? '人物' : kinds.find((entry) => entry.value === kind)?.label}</button>
          {visible.map((entity) => <button className={`story-entity-row${selected?.id === entity.id ? ' active' : ''}`} key={entity.id} onClick={() => choose(entity)}><b>{entity.name}</b><small>{entity.aliases.join(' · ')}</small></button>)}
          {visible.length === 0 && <p className="story-empty">暂无实体</p>}
        </section>
        <section className="story-form">
          <h2>{selected ? '编辑实体' : '新建实体'}</h2>
          <label>名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：林默" /></label>
          <label>Aliases<input value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="逗号分隔" /></label>
          <label>角色 / 类型<input value={role} onChange={(event) => setRole(event.target.value)} placeholder="例如：protagonist" /></label>
          {(kind === 'character' || kind === 'place') && <label>Visual Identity<textarea className="visual-identity-input" value={visualIdentity} onChange={(event) => setVisualIdentity(event.target.value)} placeholder={kind === 'character' ? '发型、脸部特征、服装、体态、固定配饰、参考图资产 ID…' : '建筑/自然环境、材质、天气、标志物、空间气质…'} /><small className="field-help">会被 Illustration Studio 自动加入 Prompt，用于保持视觉一致性。</small></label>}
          {structuredFields[kind].filter(([key]) => !(key === 'visualIdentity' || (kind === 'character' && key === 'status'))).map(([key, label]) => <label key={key}>{label}<textarea value={fieldValues[key] ?? ''} onChange={(event) => setFieldValues((current) => ({ ...current, [key]: event.target.value }))} placeholder={`填写${label}，供 Agent 和一致性检查使用`} /></label>)}
          {kind === 'character' && <label>状态<textarea value={fieldValues.status ?? ''} onChange={(event) => setFieldValues((current) => ({ ...current, status: event.target.value }))} placeholder="例如：存活；当前位置；伤势" /></label>}
          <label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="自由文本设定" /></label>
          <div className="story-form-actions"><button className="primary" disabled={!name.trim()} onClick={() => void save()}><Save size={14} /> 保存</button>{selected && <button onClick={() => void deleteEntity()}>删除</button>}{notice && <span>{notice}</span>}</div>
          <div className="timeline-mini"><h3>Timeline</h3>{timeline.map((event) => <div key={event.id}><time>{event.at ?? '未定时间'}</time><span>{event.title}</span></div>)}{timeline.length === 0 && <small>暂无时间线事件</small>}</div>
        </section>
      </div> : <div className="story-section-panel"><h2>{sectionTitles[section]}</h2><p>当前模块暂无可用数据。</p></div>}
    </main>
  )
}
