import { useRef, useState } from 'react'
import { useSettings } from '../db/settings'
import { Layout } from '../components/Layout'
import { confirmDialog, toast, errorMessage } from '../components/ui'
import { IconDownload, IconShare } from '../components/icons'
import { createBackup, markBackupDone, parseBackup, restoreBackup, type ParsedBackup, type RestoreMode } from '../lib/backup'
import { shareOrDownload, download } from '../lib/share'
import { roDateTime } from '../lib/format'

export function BackupScreen() {
  const s = useSettings()
  const [busy, setBusy] = useState(false)
  const [parsed, setParsed] = useState<ParsedBackup | null>(null)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const make = async (mode: 'share' | 'download') => {
    setBusy(true)
    try {
      const { blob, filename } = await createBackup(__APP_VERSION__)
      if (mode === 'download') {
        download(blob, filename)
        await markBackupDone()
        toast('Copia de siguranță a fost descărcată.', 'ok')
      } else {
        const r = await shareOrDownload(blob, filename, 'Copie de siguranță SIA Teren')
        // data ultimei copii se schimbă doar dacă fișierul a plecat efectiv (nu la anulare)
        if (r !== 'cancelled') await markBackupDone()
        toast(r === 'downloaded' ? 'Copia de siguranță a fost descărcată.' : r === 'shared' ? 'Copia de siguranță a fost trimisă.' : 'Partajare anulată.', r === 'cancelled' ? 'info' : 'ok')
      }
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const restore = async (mode: RestoreMode) => {
    if (!parsed) return
    const ok = await confirmDialog({
      title: mode === 'replace' ? 'Înlocuiești toate datele?' : 'Adaugi / actualizezi datele?',
      message:
        mode === 'replace'
          ? 'Toate datele de pe acest telefon vor fi șterse și înlocuite cu cele din copie. Operația nu poate fi anulată.'
          : 'Elementele noi din copie se adaugă; cele existente se actualizează doar dacă versiunea din copie este mai nouă.',
      confirmLabel: mode === 'replace' ? 'Înlocuiește tot' : 'Adaugă / actualizează',
      danger: mode === 'replace',
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await restoreBackup(parsed, mode)
      setParsed(null)
      toast(
        mode === 'replace' ? `Restaurare completă: ${r.added} elemente.` : `Restaurare: ${r.added} adăugate, ${r.updated} actualizate, ${r.skipped} neschimbate.`,
        'ok',
        6000,
      )
    } catch (e) {
      toast(`Restaurarea nu a reușit; datele existente au rămas neschimbate. (${errorMessage(e)})`, 'error', 8000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout title="Copie de siguranță" backTo="/mai-mult">
      <div className="card stack">
        <h2 style={{ fontSize: 19 }}>Salvează o copie</h2>
        <p className="small">
          Fișierul <strong>.zip</strong> conține toate proiectele, rapoartele, constatările, fotografiile și notele vocale. Păstrează-l pe Drive, pe e-mail sau pe calculator.
        </p>
        <p className="small muted" data-testid="last-backup">
          Ultima copie: {s?.lastBackupAt ? roDateTime(s.lastBackupAt) : 'niciodată'}
        </p>
        <button className="btn primary big block" disabled={busy} onClick={() => make('share')}>
          <IconShare /> Creează și trimite copia
        </button>
        <button className="btn block" disabled={busy} onClick={() => make('download')}>
          <IconDownload /> Creează și descarcă pe telefon
        </button>
      </div>
      <div className="card stack">
        <h2 style={{ fontSize: 19 }}>Restaurează dintr-o copie</h2>
        <p className="small">Alege fișierul .zip creat de SIA Teren (de pe acest telefon sau de pe altul).</p>
        <button className="btn block" disabled={busy} onClick={() => input.current?.click()}>
          Alege fișierul copiei…
        </button>
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          hidden
          data-testid="restore-input"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            setError('')
            setParsed(null)
            setBusy(true)
            try {
              setParsed(await parseBackup(f))
            } catch (err) {
              setError(errorMessage(err))
            } finally {
              setBusy(false)
            }
          }}
        />
        {error && (
          <div className="banner danger" role="alert" data-testid="restore-error">
            {error} Datele existente nu au fost modificate.
          </div>
        )}
        {parsed && (
          <div className="stack" data-testid="restore-summary">
            <div className="banner info">
              <span className="grow">
                Copie din {roDateTime(Date.parse(parsed.manifest.createdAt))}: {parsed.projects.length} proiecte, {parsed.reports.length} rapoarte, {parsed.findings.length} constatări, {parsed.photos.length} fotografii, {parsed.audio.length} note vocale.
              </span>
            </div>
            <button className="btn primary block" disabled={busy} onClick={() => restore('merge')}>
              Adaugă / actualizează
            </button>
            <button className="btn danger block" disabled={busy} onClick={() => restore('replace')}>
              Înlocuiește tot
            </button>
          </div>
        )}
      </div>
      <div className="card small">
        <strong>Schimbi telefonul?</strong> Fă o copie pe telefonul vechi, trimite-o pe noul telefon (Drive, e-mail, WhatsApp), instalează aplicația pe noul telefon și alege „Restaurează” → „Înlocuiește tot”.
      </div>
    </Layout>
  )
}
