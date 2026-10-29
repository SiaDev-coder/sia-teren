import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { match, useHashPath } from './router'
import { BottomNav } from './components/Layout'
import { ConfirmHost, ToastHost } from './components/ui'
import { useSettings } from './db/settings'
import { ProjectsScreen } from './screens/Projects'
import { ProjectForm } from './screens/ProjectForm'
import { ProjectDetail } from './screens/ProjectDetail'
import { ReportScreen } from './screens/Report'
import { TodayScreen } from './screens/Today'
import { FindingsList, FindingsTab } from './screens/Findings'
import { FindingNew, FindingScreen } from './screens/Finding'
import { MoreScreen } from './screens/More'
import { SettingsScreen } from './screens/Settings'
import { BackupScreen } from './screens/Backup'
import { TrashScreen } from './screens/Trash'
import { AboutScreen } from './screens/About'
import { InstallGuide } from './screens/Install'
import { ExportScreen } from './screens/Export'
import { Layout } from './components/Layout'

function Route() {
  const path = useHashPath()
  let m: Record<string, string> | null
  if (path === '/' || path === '') return <ProjectsScreen />
  if (path === '/azi') return <TodayScreen />
  if (path === '/constatari') return <FindingsTab />
  if (path === '/mai-mult') return <MoreScreen />
  if (path === '/setari') return <SettingsScreen />
  if (path === '/backup') return <BackupScreen />
  if (path === '/cos') return <TrashScreen />
  if (path === '/despre') return <AboutScreen />
  if (path === '/instalare') return <InstallGuide />
  if (path === '/arhiva') return <ProjectsScreen archived />
  if (path === '/export') return <ExportScreen />
  if (path === '/proiect/nou') return <ProjectForm />
  if ((m = match('/proiect/:id/editare', path))) return <ProjectForm key={m.id} id={m.id} />
  if ((m = match('/proiect/:id/raport/:date', path))) return <ReportScreen key={`${m.id}/${m.date}`} projectId={m.id} date={m.date} />
  if ((m = match('/proiect/:id/constatari', path))) return <FindingsList key={m.id} projectId={m.id} />
  if ((m = match('/proiect/:id/constatare/noua', path))) return <FindingNew key={m.id} projectId={m.id} />
  if ((m = match('/proiect/:id/export', path))) return <ExportScreen key={m.id} projectId={m.id} />
  if ((m = match('/proiect/:id', path))) return <ProjectDetail key={m.id} id={m.id} />
  if ((m = match('/constatare/:id', path))) return <FindingScreen key={m.id} id={m.id} />
  return (
    <Layout title="Pagină inexistentă" backTo="/">
      <div className="empty">
        <h2>Pagina nu există</h2>
        <a className="btn primary" href="#/">
          Mergi la proiecte
        </a>
      </div>
    </Layout>
  )
}

function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('Service worker:', error)
    },
  })
  if (!needRefresh) return null
  return (
    <div className="banner warn" role="alert" style={{ margin: 0, borderRadius: 0 }}>
      <span className="grow">Versiune nouă disponibilă. Datele introduse sunt deja salvate.</span>
      <button className="btn dark" onClick={() => updateServiceWorker(true)}>
        Versiune nouă — Actualizează
      </button>
    </div>
  )
}

export function App() {
  const settings = useSettings()
  useEffect(() => {
    const root = document.documentElement
    if (!settings || settings.theme === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', settings.theme)
  }, [settings])
  return (
    <div className="app">
      <a href="#continut" className="sr-only">
        Sari la conținut
      </a>
      <UpdateBanner />
      <Route />
      <BottomNav />
      <ToastHost />
      <ConfirmHost />
    </div>
  )
}
