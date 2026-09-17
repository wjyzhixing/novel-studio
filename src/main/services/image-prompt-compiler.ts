import type { StoryEntity } from '../../shared/story'

export interface ImagePromptInput {
  title: string
  description: string
  artDirection: string
  entities: StoryEntity[]
  subject?: string
  camera?: string
  composition?: string
  lighting?: string
  visualAnchors?: string[]
}
export interface ImagePromptOutput { prompt: string; negativePrompt: string; visualContext: string[] }

export function compileImagePrompt(input: ImagePromptInput): ImagePromptOutput {
  const visualContext = input.entities.flatMap((entity) => {
    const visual = entity.fields.visualIdentity ?? entity.fields.appearance
    return visual ? [`${entity.kind} ${entity.name}: ${formatVisual(visual)}`] : []
  })
  const parts = [
    `Scene: ${input.title}`,
    input.description,
    input.subject ? `Subject: ${input.subject}` : '',
    input.camera ? `Camera: ${input.camera}` : '',
    input.composition ? `Composition: ${input.composition}` : '',
    input.lighting ? `Lighting: ${input.lighting}` : '',
    input.artDirection ? `Art direction: ${input.artDirection}` : '',
    ...(input.visualAnchors ?? []).map((anchor) => anchor.trim()).filter(Boolean).map((anchor) => `Visual anchor: ${anchor}`),
    ...visualContext
  ].filter(Boolean)
  return { prompt: parts.join('\n'), negativePrompt: 'low quality, blurry, inconsistent character design, extra limbs, text, watermark', visualContext }
}

function formatVisual(value: unknown): string { return typeof value === 'string' ? value : JSON.stringify(value) }
