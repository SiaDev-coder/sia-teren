import type { ReactNode } from 'react'
import { navigate, useHashPath } from '../router'
import { IconAlert, IconBack, IconFolder, IconMore, IconToday } from './icons'

export function Layout({ title, backTo, right, children, fab }: { title: string; backTo?: string; right?: ReactNode; children: ReactNode; fab?: ReactNode }) {
  return (
    <>
      <header className="topbar">
        {backTo !== undefined && (
          <button className="icon-btn" aria-label="Înapoi" onClick={() => navigate(backTo)}>
            <IconBack />
          </button>
        )}
        <h1>{title}</h1>
        {right}
      </header>
      <main id="continut">{children}</main>
      {fab}
    </>
  )
}

const NAV = [
  { href: '/', label: 'Proiecte', Icon: IconFolder, match: (p: string) => p === '/' || p.startsWith('/proiect') && !p.includes('/constat') && !p.includes('/raport/') },
  { href: '/azi', label: 'Azi', Icon: IconToday, match: (p: string) => p.startsWith('/azi') || p.includes('/raport/') },
  { href: '/constatari', label: 'Constatări', Icon: IconAlert, match: (p: string) => p.includes('constat') },
  { href: '/mai-mult', label: 'Mai mult', Icon: IconMore, match: (p: string) => ['/mai-mult', '/setari', '/backup', '/cos', '/despre', '/instalare', '/arhiva', '/export'].some((x) => p.startsWith(x)) },
]

export function BottomNav() {
  const path = useHashPath()
  return (
    <nav className="bottomnav" aria-label="Navigare principală">
      {NAV.map(({ href, label, Icon, match }) => (
        <a key={href} href={`#${href}`} aria-current={match(path) ? 'page' : undefined}>
          <Icon />
          {label}
        </a>
      ))}
    </nav>
  )
}
