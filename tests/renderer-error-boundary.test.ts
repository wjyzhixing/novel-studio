import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('renderer error boundary contract', () => {
  it('wraps the root renderer and exposes a retryable safe fallback', async () => {
    const entry = await readFile(new URL('../src/renderer/src/main.tsx', import.meta.url), 'utf8')
    const boundary = await readFile(new URL('../src/renderer/src/components/RendererErrorBoundary.tsx', import.meta.url), 'utf8')

    expect(entry).toContain('RendererErrorBoundary')
    expect(entry).toContain('<RendererErrorBoundary>')
    expect(boundary).toContain('static getDerivedStateFromError')
    expect(boundary).toContain('componentDidCatch')
    expect(boundary).toContain('rendererErrorRetry')
    expect(boundary).toContain('this.setState({ hasError: false })')
    expect(boundary).toContain('role="alert"')
  })
})
