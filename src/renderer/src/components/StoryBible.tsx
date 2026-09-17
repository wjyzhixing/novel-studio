import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Save, Search, Users } from 'lucide-react'
import { foreshadowingStatuses } from '../../../shared/story'
import type { EntityKind, StoryEntity, TimelineEvent, StoryArtifact, StoryArtifactKind, ForeshadowingEvidence } from '../../../shared/story'
import type { StorySection } from './Sidebar'
import { useAppStore } from '../store/app-store'
import { useUiLocale, useUiText, type UiTextKey } from '../lib/i18n'
import { buildTimelineTrack, formatTimelineDate, formatTimelineGroupLabel, type TimelineLocale } from '../lib/timeline-visual-model'
import { useGlobalMessage } from '../lib/global-notification'

const kinds: Array<{ value: EntityKind; labelKey: UiTextKey }> = [
  { value: 'character', labelKey: 'storyCharacter' },
  { value: 'place', labelKey: 'storyPlace' },
  { value: 'org', labelKey: 'storyOrg' },
  { value: 'item', labelKey: 'storyItem' }
]

const entitySections = new Set<EntityKind>(['character', 'place', 'org', 'item'])
const structuredFields: Record<EntityKind, Array<[string, UiTextKey]>> = {
  character: [['appearance', 'storyFieldAppearance'], ['personality', 'storyFieldPersonality'], ['goals', 'storyFieldGoals'], ['secrets', 'storyFieldSecrets'], ['knowledge', 'storyFieldKnowledge'], ['status', 'storyFieldStatus']],
  place: [['type', 'storyFieldType'], ['location', 'storyFieldLocation'], ['rules', 'storyFieldRules'], ['description', 'storyFieldDescription']],
  org: [['members', 'storyFieldMembers'], ['hierarchy', 'storyFieldHierarchy'], ['goals', 'storyFieldGoals'], ['resources', 'storyFieldResources'], ['relations', 'storyFieldRelations']],
  item: [['owner', 'storyFieldOwner'], ['state', 'storyFieldState'], ['history', 'storyFieldHistory'], ['rules', 'storyFieldRules']]
}
const artifactFields: Record<StoryArtifactKind, Array<[string, UiTextKey]>> = {
  plot: [['status', 'storyFieldStatus'], ['priority', 'storyFieldPriority'], ['setup', 'storyFieldSetup'], ['payoff', 'storyFieldPayoff'], ['relatedChapters', 'storyFieldRelatedChapters']],
  foreshadowing: [['setup', 'storyFieldSetupContent'], ['target', 'storyFieldTargetPayoff'], ['payoffDeadline', 'storyFieldPayoffDeadline'], ['status', 'storyFieldStatus'], ['relatedChapters', 'storyFieldRelatedChaptersComma']],
  lore: [['scope', 'storyFieldScope'], ['rule', 'storyFieldRule'], ['exceptions', 'storyFieldExceptions'], ['source', 'storyFieldSource']],
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

function TimelineVisual({ track, selectedId, onSelect, unspecified, empty, locale, ariaLabel }: { track: ReturnType<typeof buildTimelineTrack>; selectedId?: string; onSelect: (event: TimelineEvent) => void; unspecified: string; empty: string; locale: TimelineLocale; ariaLabel: string }) {
  const dateLabel = (timestamp: number | null): string => timestamp === null ? unspecified : formatTimelineDate(timestamp, locale)
  return <section className="timeline-visual" data-testid="timeline-visual" aria-label={ariaLabel}>
    <div className="timeline-axis" aria-hidden="true"><span>{dateLabel(track.minAt)}</span><span>{dateLabel(track.maxAt)}</span></div>
    {track.points.length > 0 ? <div className="timeline-track">{track.points.map((point) => <button type="button" data-testid="timeline-point" data-event-id={point.event.id} aria-pressed={selectedId === point.event.id} key={point.event.id} className={`timeline-point${selectedId === point.event.id ? ' active' : ''}`} style={{ left: `${point.position * 100}%` }} title={point.event.title} aria-label={point.event.title} onClick={() => onSelect(point.event)}><span /></button>)}</div> : <p className="timeline-visual-empty">{empty}</p>}
    {track.points.length > 0 && <div className="timeline-point-labels">{track.points.map((point) => <button type="button" key={point.event.id} onClick={() => onSelect(point.event)}>{point.event.title}</button>)}</div>}
    {track.undated.length > 0 && <div className="timeline-undated"><b>{unspecified}</b>{track.undated.map((event) => <button type="button" key={event.id} onClick={() => onSelect(event)}>{event.title}</button>)}</div>}
  </section>
}

export function StoryBible({ section = 'character', focusEntityId, focusStoryResultId }: { section?: StorySection; focusEntityId?: string | null; focusStoryResultId?: string | null }) {
  const uiText = useUiText()
  const [locale] = useUiLocale()
  const formatUiText = (key: Parameters<typeof uiText>[0], values: Record<string, string | number>): string => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), uiText(key))
  const kindLabel = (value: EntityKind): string => ({ character: uiText('storyCharacter'), place: uiText('storyPlace'), org: uiText('storyOrg'), item: uiText('storyItem') })[value]
  const fieldLabel = (key: UiTextKey): string => uiText(key)
  const sectionTitle = (value: StorySection): string => ({ character: uiText('storyCharacters'), world: uiText('storyWorld'), timeline: uiText('storyTimeline'), org: uiText('storyOrgs'), item: uiText('storyItems'), place: uiText('storyPlaces'), plots: uiText('storyPlots'), foreshadowing: uiText('storyForeshadowing'), lore: uiText('storyLore'), notes: uiText('storyNotes') })[value]
  const artifactLabel = (value: StoryArtifactKind): string => ({ plot: uiText('storyPlot'), foreshadowing: uiText('storyForeshadowing'), lore: uiText('storyLore'), note: uiText('storyNote') })[value]
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
  const [notice, publishNotice] = useGlobalMessage()
  const setNotice = (value: string | null) => publishNotice(value ?? '')
  const [artifacts, setArtifacts] = useState<StoryArtifact[]>([])
  const [selectedArtifact, setSelectedArtifact] = useState<StoryArtifact | null>(null)
  const [artifactTitle, setArtifactTitle] = useState('')
  const [artifactValues, setArtifactValues] = useState<Record<string, string>>({})
  const [artifactNotes, setArtifactNotes] = useState('')
  const [evidenceItems, setEvidenceItems] = useState<ForeshadowingEvidence[]>([])
  const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)
  const onKindTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : event.key === 'Home' ? 0 : event.key === 'End' ? kinds.length - 1 - index : null
    if (direction === null) return
    event.preventDefault()
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? kinds.length - 1 : (index + direction + kinds.length) % kinds.length
    const nextKind = kinds[nextIndex].value
    setKind(nextKind)
    reset()
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-story-kind-tab="${nextKind}"]`)?.focus())
  }

  const reload = async () => {
    try {
      const [list, events, artifactList] = await Promise.all([
        window.novelAPI.story.listEntities(entityKind ? kind : undefined),
        window.novelAPI.story.listTimeline(),
        artifactKind ? window.novelAPI.story.listArtifacts(artifactKind) : Promise.resolve({ ok: true as const, data: [] as StoryArtifact[] })
      ])
      if (list.ok) setEntities(list.data); else setNotice(formatUiText('storyLoadEntityFailed', { error: list.error.message }))
      if (events.ok) setTimeline(events.data); else setNotice(formatUiText('storyLoadTimelineFailed', { error: events.error.message }))
      if (artifactList.ok) setArtifacts(artifactList.data); else setNotice(formatUiText('storyLoadEntriesFailed', { error: artifactList.error.message }))
    } catch (error) { setNotice(formatUiText('storyLoadFailed', { error: errorMessage(error) })) }
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
  const timelineTrack = useMemo(() => buildTimelineTrack(filteredTimeline), [filteredTimeline])
  const timelineGroups = useMemo(() => {
    const ordered = [...filteredTimeline].sort((left, right) => {
      if (timelineSort === 'updated') return right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title)
      const leftAt = left.at ? Date.parse(left.at) : Number.POSITIVE_INFINITY
      const rightAt = right.at ? Date.parse(right.at) : Number.POSITIVE_INFINITY
      return (Number.isNaN(leftAt) ? Number.POSITIVE_INFINITY : leftAt) - (Number.isNaN(rightAt) ? Number.POSITIVE_INFINITY : rightAt) || left.title.localeCompare(right.title)
    })
    const groups = new Map<string, TimelineEvent[]>()
    for (const event of ordered) {
        const key = formatTimelineGroupLabel(event.at, locale, uiText('storyUnspecified'))
      groups.set(key, [...(groups.get(key) ?? []), event])
    }
    return [...groups.entries()]
   }, [filteredTimeline, timelineSort, locale, uiText])
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
  useEffect(() => {
    if (!focusStoryResultId || section !== 'timeline') return
    const focused = timeline.find((event) => event.id === focusStoryResultId)
    if (focused) chooseTimeline(focused)
  }, [focusStoryResultId, section, timeline])
  useEffect(() => {
    if (!focusStoryResultId || !artifactKind) return
    const focused = artifacts.find((artifact) => artifact.id === focusStoryResultId)
    if (focused) chooseArtifact(focused)
  }, [artifactKind, artifacts, focusStoryResultId])
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
      if (!result.ok) { setNotice(formatUiText('storySaveEntityFailed', { error: result.error.message })); return }
      await reload(); choose(result.data); setNotice(uiText('storySaved'))
    } catch (error) { setNotice(formatUiText('storySaveEntityFailed', { error: errorMessage(error) })) }
  }
  const saveArtifact = async () => {
      if (!artifactKind || !artifactTitle.trim()) return
    try {
      if (artifactKind === 'foreshadowing' && evidenceItems.some((item) => !item.chapterRelPath.trim() || !item.quote.trim())) { setNotice(uiText('storyEvidenceRequired')); return }
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
      if (!result.ok) { setNotice(formatUiText('storySaveArtifactFailed', { error: result.error.message })); return }
      await reload(); chooseArtifact(result.data); setNotice(uiText('storySaved'))
    } catch (error) { setNotice(formatUiText('storySaveArtifactFailed', { error: errorMessage(error) })) }
  }
  const saveTimeline = async () => {
    try {
      const result = await window.novelAPI.story.saveTimelineEvent({ id: selectedTimeline?.id, title: timelineTitle, at: timelineAt.trim() || null, description: timelineDescription, chapterRelPath: timelineChapter.trim() || null, entityIds: timelineEntityIds, locationId: timelineLocation.trim() || null, causes: timelineCauses, effects: timelineEffects })
      if (!result.ok) { setNotice(formatUiText('storyOperationFailed', { error: result.error.message })); return }
      await reload(); chooseTimeline(result.data); setNotice(uiText('storySaved'))
    } catch (error) { setNotice(formatUiText('storySaveTimelineFailed', { error: errorMessage(error) })) }
  }
  const deleteTimeline = async () => {
    if (!selectedTimeline) return
    try {
      const result = await window.novelAPI.story.deleteTimelineEvent(selectedTimeline.id)
      if (!result.ok) { setNotice(formatUiText('storyOperationFailed', { error: result.error.message })); return }
      await reload(); resetTimeline(); setNotice(uiText('storyDeleted'))
    } catch (error) { setNotice(formatUiText('storyDeleteTimelineFailed', { error: errorMessage(error) })) }
  }
  const deleteEntity = async () => {
    if (!selected) return
    try {
      const result = await window.novelAPI.story.deleteEntity(selected.id)
      if (!result.ok) { setNotice(formatUiText('storyOperationFailed', { error: result.error.message })); return }
      reset(); await reload(); setNotice(uiText('storyDeleted'))
    } catch (error) { setNotice(formatUiText('storyDeleteEntityFailed', { error: errorMessage(error) })) }
  }
  const deleteArtifact = async () => {
    if (!selectedArtifact) return
    try {
      const result = await window.novelAPI.story.deleteArtifact(selectedArtifact.id)
      if (!result.ok) { setNotice(formatUiText('storyOperationFailed', { error: result.error.message })); return }
      resetArtifact(); await reload(); setNotice(uiText('storyDeleted'))
    } catch (error) { setNotice(formatUiText('storyDeleteArtifactFailed', { error: errorMessage(error) })) }
  }

  const evidenceEditor = <fieldset className="foreshadowing-evidence-editor"><legend>{uiText('storyEvidence')}</legend>{evidenceItems.map((item, index) => <div className="evidence-entry" key={`${item.chapterRelPath}-${index}`}><label>{uiText('storyEvidenceChapter')}<select value={item.chapterRelPath} onChange={(event) => setEvidenceItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, chapterRelPath: event.target.value } : entry))}><option value="">{uiText('storySelectChapterOption')}</option>{chapters.map((chapter) => <option key={chapter.relPath} value={chapter.relPath}>{chapter.number} · {chapter.title}</option>)}</select></label><label>{uiText('storyEvidenceQuote')}<textarea value={item.quote} onChange={(event) => setEvidenceItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, quote: event.target.value } : entry))} placeholder={uiText('storyEvidenceQuotePlaceholder')} /></label><label>{uiText('storyEvidenceNote')}<textarea value={item.note} onChange={(event) => setEvidenceItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, note: event.target.value } : entry))} placeholder={uiText('storyEvidenceNotePlaceholder')} /></label><button type="button" onClick={() => setEvidenceItems((current) => current.filter((_, entryIndex) => entryIndex !== index))}>{uiText('storyRemoveEvidence')}</button></div>)}<button type="button" onClick={() => setEvidenceItems((current) => [...current, { chapterRelPath: '', quote: '', note: '' }])}>＋ {uiText('storyAddEvidence')}</button><small className="field-help">{uiText('storyEvidenceHint')}</small></fieldset>

  const timelineView = <div className="story-bible-layout"><section className="story-entity-list"><button data-testid="timeline-new" className="story-new" onClick={resetTimeline}>＋ {uiText('storyNewEvent')}</button><div className="timeline-filters"><label className="story-search"><Search size={14} /><input aria-label={uiText('storyTimelineSearch')} value={timelineQuery} onChange={(event) => setTimelineQuery(event.target.value)} placeholder={uiText('storySearchEvents')} /></label><label className="story-search"><span>{uiText('storyRelatedEntity')}</span><select aria-label={uiText('storyRelatedEntity')} value={timelineEntityFilter} onChange={(event) => setTimelineEntityFilter(event.target.value)}><option value="">{uiText('storyAllEntities')}</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label className="story-search"><span>{uiText('storyChapter')}</span><select aria-label={uiText('storyChapter')} value={timelineChapterFilter} onChange={(event) => setTimelineChapterFilter(event.target.value)}><option value="">{uiText('storyAllChapters')}</option>{chapters.map((chapter) => <option key={chapter.relPath} value={chapter.relPath}>{chapter.title}</option>)}</select></label><label className="story-search"><span>{uiText('storySort')}</span><select aria-label={uiText('storySort')} value={timelineSort} onChange={(event) => setTimelineSort(event.target.value as 'chronological' | 'updated')}><option value="chronological">{uiText('storyStoryTime')}</option><option value="updated">{uiText('storyRecentlyUpdated')}</option></select></label></div><div className="timeline-groups">{timelineGroups.map(([group, events]) => <div className="timeline-group" key={group}><h3>{group}</h3>{events.map((event) => <button data-testid="timeline-event" data-event-id={event.id} className={`story-entity-row${selectedTimeline?.id === event.id ? ' active' : ''}`} key={event.id} onClick={() => chooseTimeline(event)}><b>{event.title}</b><small>{event.entityIds.map(entityName).join('、') || uiText('storyNoRelatedEntity')}{event.chapterRelPath ? ` · ${event.chapterRelPath}` : ''}</small></button>)}</div>)}</div>{filteredTimeline.length === 0 && <p className="story-empty">{uiText('storyNoMatchingEvents')}</p>}</section><section className="story-form"><h2>{selectedTimeline ? uiText('storyEditEvent') : uiText('storyCreateEvent')}</h2><label>{uiText('storyEventTitle')}<input data-testid="timeline-title" value={timelineTitle} onChange={(event) => setTimelineTitle(event.target.value)} /></label><label>{uiText('storyTime')}<input data-testid="timeline-at" value={timelineAt} onChange={(event) => setTimelineAt(event.target.value)} placeholder={uiText('storyExampleTime')} /></label><label>{uiText('storyLocation')}<select data-testid="timeline-location" value={timelineLocation} onChange={(event) => setTimelineLocation(event.target.value)}><option value="">{uiText('storyUnspecified')}</option>{entities.filter((entity) => entity.kind === 'place').map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>{uiText('storyRelatedChapter')}<input data-testid="timeline-chapter" value={timelineChapter} onChange={(event) => setTimelineChapter(event.target.value)} placeholder={uiText('storyExampleChapter')} />{timelineChapter && !chapters.some((chapter) => chapter.relPath === timelineChapter) && <small className="field-help timeline-missing">{uiText('storyNoTimelineIndex')}</small>}</label><fieldset className="timeline-participants"><legend>{uiText('storyParticipants')}</legend>{entities.length === 0 ? <small>{uiText('storyNoAvailableEntities')}</small> : entities.map((entity) => <label key={entity.id}><input data-testid={`timeline-participant-${entity.id}`} type="checkbox" checked={timelineEntityIds.includes(entity.id)} onChange={(event) => setTimelineEntityIds((current) => event.target.checked ? [...current, entity.id] : current.filter((id) => id !== entity.id))} />{entity.name}</label>)}</fieldset><label>{uiText('storyCauses')}<textarea data-testid="timeline-causes" value={timelineCauses} onChange={(event) => setTimelineCauses(event.target.value)} placeholder={uiText('storyCausesPlaceholder')} /></label><label>{uiText('storyEffects')}<textarea data-testid="timeline-effects" value={timelineEffects} onChange={(event) => setTimelineEffects(event.target.value)} placeholder={uiText('storyEffectsPlaceholder')} /></label><label>{uiText('storyDescription')}<textarea data-testid="timeline-description" value={timelineDescription} onChange={(event) => setTimelineDescription(event.target.value)} /></label><div className="story-form-actions"><button data-testid="timeline-save" className="primary" disabled={!timelineTitle.trim()} onClick={() => void saveTimeline()}><Save size={14} /> {uiText('storySave')}</button>{selectedTimeline?.chapterRelPath && chapters.some((chapter) => chapter.relPath === selectedTimeline.chapterRelPath) && <button onClick={() => useAppStore.getState().openChapter(selectedTimeline.chapterRelPath!)}>{uiText('storyOpenChapter')}</button>}{selectedTimeline?.chapterRelPath && !chapters.some((chapter) => chapter.relPath === selectedTimeline.chapterRelPath) && <span className="timeline-missing">{uiText('storyChapterMissing')}</span>}{selectedTimeline && <button data-testid="timeline-delete" onClick={() => void deleteTimeline()}>{uiText('storyDelete')}</button>}{notice && <span>{notice}</span>}</div></section></div>
  const artifactView = artifactKind ? <div className="story-bible-layout"><section className="story-entity-list"><button className="story-new" onClick={resetArtifact}>＋ {formatUiText('storyNewArtifact', { kind: artifactLabel(artifactKind) })}</button>{artifacts.map((artifact) => <button className={`story-entity-row${selectedArtifact?.id === artifact.id ? ' active' : ''}`} key={artifact.id} onClick={() => chooseArtifact(artifact)}><b>{artifact.title}</b><small>{artifact.fields.status ? String(artifact.fields.status) : artifact.notes.slice(0, 40)}</small></button>)}{artifacts.length === 0 && <p className="story-empty">{uiText('storyNoEntries')}</p>}</section><section className="story-form"><h2>{selectedArtifact ? uiText('storyEditArtifact') : formatUiText('storyNewArtifact', { kind: artifactLabel(artifactKind) })}</h2><label>{uiText('storyTitle')}<input value={artifactTitle} onChange={(event) => setArtifactTitle(event.target.value)} /></label>{artifactFields[artifactKind].map(([key, label]) => <label key={key}>{fieldLabel(label)}{artifactKind === 'foreshadowing' && key === 'status' ? <select value={artifactValues[key] ?? 'planned'} onChange={(event) => setArtifactValues((current) => ({ ...current, [key]: event.target.value }))}>{foreshadowingStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select> : artifactKind === 'foreshadowing' && key === 'relatedChapters' ? <select className="artifact-chapter-picker" aria-label={uiText('storyForeshadowingChapters')} multiple value={(artifactValues[key] ?? '').split(',').map((value) => value.trim()).filter(Boolean)} onChange={(event) => setArtifactValues((current) => ({ ...current, [key]: [...event.target.selectedOptions].map((option) => option.value).join(', ') }))}>{chapters.map((chapter) => <option key={chapter.relPath} value={chapter.relPath}>{chapter.number} · {chapter.title}</option>)}</select> : <textarea value={artifactValues[key] ?? ''} onChange={(event) => setArtifactValues((current) => ({ ...current, [key]: event.target.value }))} />}</label>)}{artifactKind === 'foreshadowing' && evidenceEditor}<small className="field-help">{uiText('storyForeshadowingChapterHint')}</small><label>{uiText('storyNotes')}<textarea value={artifactNotes} onChange={(event) => setArtifactNotes((event.target as HTMLTextAreaElement).value)} /></label><div className="story-form-actions"><button className="primary" disabled={!artifactTitle.trim()} onClick={() => void saveArtifact()}><Save size={14} /> {uiText('storySave')}</button>{selectedArtifact && <button onClick={() => void deleteArtifact()}>{uiText('storyDelete')}</button>}{notice && <span>{notice}</span>}</div></section></div> : null

  return (
    <main className="editor-shell story-bible-shell">
      <div className="editor-tab"><Users size={14} /> {uiText('storyBible')} · {sectionTitle(section)}</div>
       {section === 'timeline' ? <><TimelineVisual track={timelineTrack} selectedId={selectedTimeline?.id} onSelect={chooseTimeline} unspecified={uiText('storyUnspecified')} empty={uiText('storyNoMatchingEvents')} locale={locale} ariaLabel={uiText('storyTimelineOverview')} />{timelineView}</> : artifactKind ? artifactView : entityKind ? <div className="story-bible-layout">
        <section className="story-entity-list">
          <div className="story-kind-tabs" role="tablist" aria-label={uiText('storyEntityTypes')}>{kinds.map((entry, index) => <button type="button" role="tab" aria-selected={entry.value === kind} aria-controls="story-entity-form" tabIndex={entry.value === kind ? 0 : -1} data-story-kind-tab={entry.value} key={entry.value} className={entry.value === kind ? 'active' : ''} onClick={() => { setKind(entry.value); reset() }} onKeyDown={(event) => onKindTabKeyDown(event, index)}>{kindLabel(entry.value)}</button>)}</div>
          <label className="story-search"><Search size={14} /><input aria-label={uiText('storySearch')} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={uiText('storySearch')} /></label>
          <button className="story-new" onClick={reset}>＋ {formatUiText('storyNewEntity', { kind: kindLabel(kind) })}</button>
          {visible.map((entity) => <button type="button" aria-pressed={selected?.id === entity.id} className={`story-entity-row${selected?.id === entity.id ? ' active' : ''}`} key={entity.id} onClick={() => choose(entity)}><b>{entity.name}</b><small>{entity.aliases.join(' · ')}</small></button>)}
          {visible.length === 0 && <p className="story-empty">{uiText('storyNoEntities')}</p>}
        </section>
        <section id="story-entity-form" className="story-form">
          <h2>{selected ? uiText('storyEditEntity') : uiText('storyCreateEntity')}</h2>
          <label>{uiText('storyEntityName')}<input value={name} onChange={(event) => setName(event.target.value)} placeholder={uiText('storyExampleName')} /></label>
          <label>{uiText('storyAliases')}<input value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder={uiText('storyAliasesPlaceholder')} /></label>
          <label>{uiText('storyRoleType')}<input value={role} onChange={(event) => setRole(event.target.value)} placeholder={uiText('storyRolePlaceholder')} /></label>
          {(kind === 'character' || kind === 'place') && <label>{uiText('storyVisualIdentity')}<textarea className="visual-identity-input" value={visualIdentity} onChange={(event) => setVisualIdentity(event.target.value)} placeholder={uiText(kind === 'character' ? 'storyVisualIdentityCharacterPlaceholder' : 'storyVisualIdentityPlacePlaceholder')} /><small className="field-help">{uiText('storyVisualIdentityHint')}</small></label>}
          {structuredFields[kind].filter(([key]) => !(key === 'visualIdentity' || (kind === 'character' && key === 'status'))).map(([key, label]) => <label key={key}>{fieldLabel(label)}<textarea value={fieldValues[key] ?? ''} onChange={(event) => setFieldValues((current) => ({ ...current, [key]: event.target.value }))} placeholder={formatUiText('storyFieldPlaceholder', { field: fieldLabel(label) })} /></label>)}
          {kind === 'character' && <label>{uiText('storyFieldStatus')}<textarea value={fieldValues.status ?? ''} onChange={(event) => setFieldValues((current) => ({ ...current, status: event.target.value }))} placeholder={uiText('storyCharacterStatusPlaceholder')} /></label>}
          <label>{uiText('storyNotes')}<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={uiText('storyNotesPlaceholder')} /></label>
          <div className="story-form-actions"><button className="primary" disabled={!name.trim()} onClick={() => void save()}><Save size={14} /> {uiText('storySave')}</button>{selected && <button onClick={() => void deleteEntity()}>{uiText('storyDelete')}</button>}{notice && <span>{notice}</span>}</div>
          <div className="timeline-mini"><h3>{uiText('storyTimelineMini')}</h3>{timeline.map((event) => <div key={event.id}><time>{event.at ?? uiText('storyUnspecified')}</time><span>{event.title}</span></div>)}{timeline.length === 0 && <small>{uiText('storyNoTimeline')}</small>}</div>
        </section>
      </div> : <div className="story-section-panel"><h2>{sectionTitle(section)}</h2><p>{uiText('storyNoData')}</p></div>}
    </main>
  )
}
