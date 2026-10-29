import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { changeFindingStatus, createFinding, saveFinding, softDelete, type FindingInput } from '../db/repo'
import { FINDING_CATEGORIES, FINDING_STATUSES, SEVERITIES, type Finding, type GpsFix } from '../db/types'
import { Layout } from '../components/Layout'
import { Section, SelectField, TextArea, TextField, confirmDialog, toast, errorMessage } from '../components/ui'
import { PhotoSection } from '../components/Photos'
import { VoiceNotes, type InsertTarget } from '../components/VoiceNotes'
import { useAutosave } from '../components/useAutosave'
import { IconPin, IconTrash } from '../components/icons'
import { getPosition } from '../lib/gps'
import { formatCoords, isoDate, roDateTime } from '../lib/format'
import { isOverdue } from '../lib/findings'
import { navigate } from '../router'
import { useDraft } from '../components/useDraft'

function GpsField({ gps, onChange, disabled }: { gps: GpsFix | null; onChange: (g: GpsFix | null) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  return (
    <div className="field">
      <span>Poziție GPS</span>
      {gps ? (
        <div className="row">
          <span className="grow" data-testid="gps-value">
            {formatCoords(gps.lat, gps.lng)} <span className="muted">(precizie ±{gps.accuracy} m)</span>
          </span>
          {!disabled && (
            <button type="button" className="btn" onClick={() => onChange(null)}>
              Elimină
            </button>
          )}
        </div>
      ) : (
        <span className="muted small">Fără poziție GPS (opțional).</span>
      )}
      {!disabled && (
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setMsg('Se caută poziția GPS (până la 20 de secunde)…')
            const r = await getPosition()
            setBusy(false)
            if (r.ok) {
              onChange(r.fix)
              setMsg('')
            } else setMsg(r.reason)
          }}
        >
          <IconPin /> {gps ? 'Actualizează poziția GPS' : 'Adaugă poziția GPS'}
        </button>
      )}
      {msg && <small className="hint" role="status">{msg}</small>}
    </div>
  )
}

function Fields({ v, set, disabled, editing }: { v: FindingInput; set: (p: Partial<FindingInput>) => void; disabled?: boolean; editing?: boolean }) {
  return (
    <>
      <TextField
        label="Titlu"
        name="title"
        required
        value={v.title}
        onChange={(title) => set({ title })}
        disabled={disabled}
        hint={!editing || v.title.trim() ? undefined : 'Titlul este obligatoriu — până îl completezi, rămâne salvat titlul anterior.'}
      />
      <TextArea label="Descriere" name="description" value={v.description} onChange={(description) => set({ description })} disabled={disabled} />
      <div className="grid2">
        <SelectField label="Categorie" name="category" value={v.category} options={FINDING_CATEGORIES} onChange={(category) => set({ category })} disabled={disabled} />
        <SelectField label="Gravitate" name="severity" value={v.severity} options={SEVERITIES} onChange={(severity) => set({ severity })} disabled={disabled} />
      </div>
      <TextField label="Locație" name="location" value={v.location} onChange={(location) => set({ location })} placeholder="ex. Cămin C12, tronson T3" disabled={disabled} />
      <GpsField gps={v.gps} onChange={(gps) => set({ gps })} disabled={disabled} />
      <div className="grid2">
        <TextField label="Responsabil" name="responsible" value={v.responsible} onChange={(responsible) => set({ responsible })} disabled={disabled} />
        <TextField label="Termen" name="dueDate" type="date" value={v.dueDate} onChange={(dueDate) => set({ dueDate })} disabled={disabled} />
      </div>
    </>
  )
}

export function FindingNew({ projectId }: { projectId: string }) {
  const [v, setV, clearDraft] = useDraft<FindingInput>(`sia-ciorna-constatare-${projectId}`, {
    title: '',
    description: '',
    category: 'calitate',
    severity: 'minoră',
    location: '',
    gps: null,
    responsible: '',
    dueDate: '',
  })
  const [saving, setSaving] = useState(false)
  return (
    <Layout title="Constatare nouă" backTo={`/proiect/${projectId}/constatari`}>
      <form
        className="card"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          if (!v.title.trim()) {
            toast('Completează titlul constatării.', 'error')
            return
          }
          setSaving(true)
          try {
            const f = await createFinding(projectId, { ...v, title: v.title.trim() })
            clearDraft()
            toast('Constatare salvată. Adaugă fotografiile „înainte”.', 'ok')
            navigate(`/constatare/${f.id}`, { replace: true })
          } catch (err) {
            toast(errorMessage(err), 'error')
            setSaving(false)
          }
        }}
      >
        <Fields v={v} set={(p) => setV((s) => ({ ...s, ...p }))} />
        <button className="btn primary big block" type="submit" disabled={saving}>
          Salvează constatarea
        </button>
      </form>
    </Layout>
  )
}

export function FindingScreen({ id }: { id: string }) {
  const f = useLiveQuery(() => db.findings.get(id), [id])
  const [initial, setInitial] = useState<Finding | null | undefined>(undefined)
  useEffect(() => {
    void (async () => {
      const x = await db.findings.get(id)
      const p = x ? await db.projects.get(x.projectId) : undefined
      // o constatare a unui proiect aflat în Coș nu se mai editează
      setInitial(x && x.deletedAt === null && p && p.deletedAt === null ? x : null)
    })()
  }, [id])
  if (initial === undefined) return <Layout title="Constatare" backTo="/constatari">{null}</Layout>
  if (initial === null)
    return (
      <Layout title="Constatare" backTo="/constatari">
        <div className="empty">
          <h2>Constatarea nu există</h2>
          <p>Poate a fost ștearsă (sau proiectul ei este în Coș). Verifică în Coș.</p>
        </div>
      </Layout>
    )
  return <FindingEditor key={initial.id} initial={initial} live={f ?? initial} />
}

function FindingEditor({ initial, live }: { initial: Finding; live: Finding }) {
  const save = useCallback((patch: Partial<Finding>, full: Finding) => saveFinding(patch, full), [])
  const { value, update, state, flush } = useAutosave<Finding>(initial, save)
  const v = value
  const overdue = isOverdue(live, isoDate())

  const append = (cur: string, t: string) => (cur.trim() ? `${cur.trimEnd()}\n${t}` : t)
  const targets: InsertTarget[] = [
    { label: 'Descriere', insert: (t) => update({ description: append(v.description, t) }) },
    { label: 'Titlu', insert: (t) => update({ title: v.title.trim() ? `${v.title} ${t}` : t }) },
    { label: 'Locație', insert: (t) => update({ location: v.location.trim() ? `${v.location} ${t}` : t }) },
    { label: 'Responsabil', insert: (t) => update({ responsible: v.responsible.trim() ? `${v.responsible} ${t}` : t }) },
  ]

  return (
    <Layout
      title="Constatare"
      backTo={`/proiect/${v.projectId}/constatari`}
      right={
        <span className={`save-state ${state === 'saving' ? 'saving' : ''}`} role="status" aria-live="polite" data-testid="save-state">
          {state === 'saving' ? 'Se salvează…' : state === 'error' ? 'Eroare la salvare' : 'Salvat'}
        </span>
      }
    >
      {overdue && (
        <div className="banner danger" role="alert">
          Termen depășit — constatarea nu este închisă.
        </div>
      )}
      <Section title="Stare" defaultOpen count={live.status}>
        <div className="segmented" role="group" aria-label="Schimbă starea">
          {FINDING_STATUSES.map((s) => (
            <button
              type="button"
              key={s}
              aria-pressed={live.status === s}
              onClick={async () => {
                if (live.status === s) return
                if (s === 'Anulată' && !(await confirmDialog({ title: 'Anulezi constatarea?', confirmLabel: 'Anulează constatarea', cancelLabel: 'Înapoi' }))) return
                await flush()
                await changeFindingStatus(live.id, s)
                toast(`Stare: ${s}`, 'ok')
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <h3 style={{ fontSize: 16, margin: '14px 0 4px' }}>Istoric</h3>
        <ul className="history" data-testid="history">
          {[...live.history].reverse().map((h, i) => (
            <li key={i}>
              <strong>{roDateTime(h.at)}</strong> — {h.from ? `${h.from} → ${h.to}` : `creată (${h.to})`}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Detalii" defaultOpen>
        <Fields v={v} set={(p) => update(p)} editing />
      </Section>
      <Section title="Fotografii „înainte”" defaultOpen>
        <PhotoSection projectId={v.projectId} ownerType="finding" ownerId={v.id} role="before" />
      </Section>
      <Section title="Fotografii „după”" defaultOpen={['Rezolvată', 'Verificată'].includes(live.status)}>
        <PhotoSection projectId={v.projectId} ownerType="finding" ownerId={v.id} role="after" />
      </Section>
      <Section title="Note vocale">
        <VoiceNotes projectId={v.projectId} ownerType="finding" ownerId={v.id} targets={targets} />
      </Section>
      <button
        className="btn danger block"
        style={{ marginTop: 16 }}
        onClick={async () => {
          if (!(await confirmDialog({ title: 'Ștergi constatarea?', message: 'Constatarea și fotografiile ei ajung în Coș 30 de zile.', confirmLabel: 'Șterge', danger: true }))) return
          await flush()
          await softDelete('findings', v.id)
          toast('Constatarea a fost mutată în Coș.')
          navigate(`/proiect/${v.projectId}/constatari`)
        }}
      >
        <IconTrash /> Șterge constatarea
      </button>
    </Layout>
  )
}
