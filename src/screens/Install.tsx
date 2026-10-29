import { useSyncExternalStore, useState } from 'react'
import { Layout } from '../components/Layout'
import { isIos, isIosNotInstalled, isStandalone } from '../lib/platform'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

/** Apelat o singură dată la pornire: capturează evenimentul de instalare Android/Chrome. */
export function setupInstallCapture() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

export function useInstall() {
  const ev = useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => deferred,
  )
  return {
    canPrompt: !!ev,
    prompt: async () => {
      if (!deferred) return
      await deferred.prompt()
      await deferred.userChoice.catch(() => null)
      deferred = null
      emit()
    },
  }
}

export function InstallBanner() {
  const { canPrompt, prompt } = useInstall()
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('sia-install-hidden') === '1'
    } catch {
      return false
    }
  })
  if (hidden || isStandalone()) return null
  const hide = () => {
    setHidden(true)
    try {
      localStorage.setItem('sia-install-hidden', '1')
    } catch {
      /* ignorăm */
    }
  }
  if (canPrompt)
    return (
      <div className="banner info">
        <span className="grow">Instalează SIA Teren pe telefon: pornește din iconiță și merge fără internet.</span>
        <button className="btn primary" onClick={prompt}>
          Instalează
        </button>
        <button className="btn" onClick={hide}>
          Mai târziu
        </button>
      </div>
    )
  if (isIosNotInstalled())
    return (
      <div className="banner warn">
        <span className="grow">
          Pe iPhone, adaugă aplicația pe ecranul principal. Altfel Safari poate șterge datele dacă nu deschizi aplicația 7 zile.
        </span>
        <a className="btn dark" href="#/instalare">
          Arată-mi cum
        </a>
        <button className="btn" onClick={hide}>
          Mai târziu
        </button>
      </div>
    )
  return null
}

const ShareIcon = () => (
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" rx="14" fill="#e8eef4" />
    <path d="M32 12v26M23 21l9-9 9 9" stroke="#0a84ff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 30h-4v22h32V30h-4" stroke="#0a84ff" strokeWidth="4" fill="none" strokeLinejoin="round" />
  </svg>
)
const AddHomeIcon = () => (
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" rx="14" fill="#e8eef4" />
    <rect x="16" y="16" width="32" height="32" rx="7" stroke="#1b2733" strokeWidth="4" fill="none" />
    <path d="M32 24v16M24 32h16" stroke="#1b2733" strokeWidth="4" strokeLinecap="round" />
  </svg>
)
const AppIcon = () => (
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" rx="14" fill="#1b2733" />
    <rect x="18" y="14" width="28" height="38" rx="4" fill="#f2b705" />
    <path d="M32 24c0 0-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13z" fill="#1b2733" />
  </svg>
)
const MenuIcon = () => (
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" rx="14" fill="#e8eef4" />
    <circle cx="32" cy="18" r="4" fill="#1b2733" />
    <circle cx="32" cy="32" r="4" fill="#1b2733" />
    <circle cx="32" cy="46" r="4" fill="#1b2733" />
  </svg>
)

export function InstallGuide() {
  const { canPrompt, prompt } = useInstall()
  const ios = isIos()
  return (
    <Layout title="Instalează pe telefon" backTo="/mai-mult">
      {isStandalone() && <div className="banner info">Aplicația este deja instalată și rulează din iconiță.</div>}
      {canPrompt && (
        <button className="btn primary big block" style={{ marginBottom: 12 }} onClick={prompt}>
          Instalează acum
        </button>
      )}
      <div className="card" style={ios ? { order: -1 } : undefined}>
        <h2 style={{ fontSize: 19, marginBottom: 12 }}>iPhone / iPad (Safari)</h2>
        <div className="guide-step">
          <span className="num">1</span>
          <ShareIcon />
          <p>Deschide adresa aplicației în <strong>Safari</strong> și apasă butonul <strong>Partajare</strong> (pătratul cu săgeată în sus, jos pe ecran).</p>
        </div>
        <div className="guide-step">
          <span className="num">2</span>
          <AddHomeIcon />
          <p>Derulează lista și alege <strong>„Adaugă pe ecranul principal”</strong>, apoi <strong>„Adaugă”</strong>.</p>
        </div>
        <div className="guide-step">
          <span className="num">3</span>
          <AppIcon />
          <p>Pornește de acum aplicația din iconița <strong>SIA Teren</strong>. Așa datele nu sunt șterse de Safari și aplicația merge fără internet.</p>
        </div>
      </div>
      <div className="card">
        <h2 style={{ fontSize: 19, marginBottom: 12 }}>Android (Chrome)</h2>
        <div className="guide-step">
          <span className="num">1</span>
          <MenuIcon />
          <p>Deschide adresa aplicației în <strong>Chrome</strong>. Apasă butonul <strong>„Instalează”</strong> din aplicație sau meniul ⋮ din dreapta sus.</p>
        </div>
        <div className="guide-step">
          <span className="num">2</span>
          <AddHomeIcon />
          <p>Alege <strong>„Instalează aplicația”</strong> (sau „Adaugă pe ecranul de pornire”) și confirmă.</p>
        </div>
        <div className="guide-step">
          <span className="num">3</span>
          <AppIcon />
          <p>Pornește aplicația din iconița <strong>SIA Teren</strong>. Merge și în modul avion.</p>
        </div>
      </div>
    </Layout>
  )
}
