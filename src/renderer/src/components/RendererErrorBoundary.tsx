import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { getUiText, readUiLocale } from '../lib/i18n'

type Props = { children: ReactNode }
type State = { hasError: boolean; errorName: string | null }

export class RendererErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorName: null }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      errorName: error instanceof Error && error.name ? error.name : 'UnknownError',
    }
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo): void {
    // Keep the fallback local and metadata-only. Renderer exceptions must not
    // be copied into project files, diagnostics exports, or provider requests.
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    const locale = typeof localStorage === 'undefined' ? 'zh-CN' : readUiLocale(localStorage)
    const uiText = (key: Parameters<typeof getUiText>[1]) => getUiText(locale, key)
    return (
      <main className="renderer-error-boundary" role="alert">
        <section className="renderer-error-card">
          <AlertTriangle size={22} aria-hidden="true" />
          <h1>{uiText('rendererErrorTitle')}</h1>
          <p>{uiText('rendererErrorHint')}</p>
          {this.state.errorName && <code>{this.state.errorName}</code>}
          <button type="button" onClick={() => this.setState({ hasError: false })}>
            <RotateCcw size={14} aria-hidden="true" /> {uiText('rendererErrorRetry')}
          </button>
        </section>
      </main>
    )
  }
}
