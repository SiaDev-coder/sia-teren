import { Component, type ReactNode } from 'react'

/** Dacă un ecran întâmpină o eroare neașteptată, arătăm un mesaj în română în loc de ecran alb. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Eroare de afișare:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main id="continut">
        <div className="empty" role="alert">
          <h2>Ecranul nu a putut fi afișat</h2>
          <p>Datele tale sunt salvate pe telefon. Încearcă din nou sau întoarce-te la lista de proiecte.</p>
          <p className="small muted">Detaliu tehnic: {this.state.error.message}</p>
          <div className="stack">
            <button className="btn primary block" onClick={() => location.reload()}>
              Încearcă din nou
            </button>
            <a className="btn block" href="#/" onClick={() => this.setState({ error: null })}>
              Mergi la proiecte
            </a>
          </div>
        </div>
      </main>
    )
  }
}
