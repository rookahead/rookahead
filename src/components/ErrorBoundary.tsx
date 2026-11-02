import { Component, type ErrorInfo, type ReactNode } from 'react'

/** A page that crashes says so, with what went wrong, instead of leaving an empty screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[page crash]', error, info.componentStack)
  }

  render() {
    const { error } = this.state as { error: Error | null }
    if (!error) return this.props.children
    return (
      <main className="crash-page" role="alert">
        <h1>Something went wrong on this page</h1>
        <p>Your games and reviews are safe. If it keeps happening, send us this:</p>
        <code>{error.message}</code>
        <div className="crash-actions">
          <button className="btn primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button className="btn ghost" onClick={() => location.assign('/')}>
            Go to Home
          </button>
        </div>
      </main>
    )
  }
}
