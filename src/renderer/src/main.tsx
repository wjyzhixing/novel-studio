import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { RendererErrorBoundary } from './components/RendererErrorBoundary'
import './styles/tokens.css'
import './styles/app.css'
import './styles/scene.css'
import './styles/volume.css'
import './styles/illustration.css'
import './styles/backup.css'
import './styles/developer.css'
import './styles/developer-meta.css'
import './styles/graph-meta.css'
import './styles/story-meta.css'
import './styles/health.css'
import './styles/right-panel.css'
import './styles/authoring-flow.css'
import './styles/authoring-wizard.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RendererErrorBoundary>
      <App />
    </RendererErrorBoundary>
  </React.StrictMode>
)
