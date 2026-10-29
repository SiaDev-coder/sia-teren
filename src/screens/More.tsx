import { Layout } from '../components/Layout'
import { IconChevron } from '../components/icons'
import { useInstall } from './Install'

const ITEMS = [
  { href: '/setari', title: 'Setări', meta: 'Firmă, logo, nume, temă, model vocal, spațiu' },
  { href: '/backup', title: 'Copie de siguranță și restaurare', meta: 'Salvează toate datele într-un fișier .zip' },
  { href: '/export', title: 'Rapoarte PDF și CSV', meta: 'Raport pe perioadă, export pentru Excel' },
  { href: '/arhiva', title: 'Proiecte arhivate', meta: 'Proiecte încheiate' },
  { href: '/cos', title: 'Coș', meta: 'Elemente șterse (se golește după 30 de zile)' },
  { href: '/instalare', title: 'Instalează pe telefon', meta: 'Ghid Android și iPhone' },
  { href: '/despre', title: 'Despre', meta: 'Versiune și licențe' },
]

export function MoreScreen() {
  const { canPrompt, prompt } = useInstall()
  return (
    <Layout title="Mai mult">
      {canPrompt && (
        <button className="btn primary big block" style={{ marginBottom: 12 }} onClick={prompt}>
          Instalează aplicația
        </button>
      )}
      <ul className="list">
        {ITEMS.map((i) => (
          <li key={i.href}>
            <a className="list-item" href={`#${i.href}`}>
              <div className="main">
                <div className="title">{i.title}</div>
                <div className="meta">{i.meta}</div>
              </div>
              <IconChevron className="chev" width={22} />
            </a>
          </li>
        ))}
      </ul>
    </Layout>
  )
}
