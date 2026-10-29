import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { copyFromPrevious, emptyReport, finalizeReport, findReport, reopenReport, saveReport, softDelete, touchProject } from '../db/repo'
import { WEATHER_OPTIONS, type ActivityRow, type DailyReport, type EquipmentRow, type MaterialRow, type PersonnelRow, type Weather } from '../db/types'
import { Layout } from '../components/Layout'
import { NumberField, Section, TextArea, TextField, confirmDialog, toast, errorMessage } from '../components/ui'
import { RowsEditor } from '../components/RowsEditor'
import { PhotoSection, type PhotoSectionHandle } from '../components/Photos'
import { VoiceNotes, type InsertTarget } from '../components/VoiceNotes'
import { useAutosave } from '../components/useAutosave'
import { IconBack, IconCamera, IconCheck, IconChevron, IconCopy, IconLock, IconMic, IconPdf, IconTrash } from '../components/icons'
import { addDays, isoDate, roLongDate } from '../lib/format'
import { navigate } from '../router'
import { isValidIsoDate } from '../lib/format'
import { ReportExistsError } from '../db/repo'
import { shareOrDownload } from '../lib/share'
import { newId } from '../lib/ids'

const CATEGORIES = [
  'Inginer / RTE',
  'Șef punct de lucru',
  'Maistru',
  'Muncitori calificați',
  'Muncitori necalificați',
  'Instalatori',
  'Sudori',
  'Mecanici utilaje',
  'Șoferi',
  'Electricieni',
  'Topograf',
]
const UNITS = ['m', 'm²', 'm³', 'buc', 'kg', 't', 'ml', 'set', 'ore']

function append(cur: string, text: string): string {
  return cur.trim() ? `${cur.trimEnd()}\n${text}` : text
}

export function ReportScreen({ projectId, date }: { projectId: string; date: string }) {
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId])
  const [initial, setInitial] = useState<DailyReport | null>(null)
  const [loadError, setError] = useState('')
  const validDate = isValidIsoDate(date)
  const error = validDate ? loadError : 'Data din adresă nu este validă.'

  useEffect(() => {
    let alive = true
    if (!validDate) return
    void (async () => {
      const p = await db.projects.get(projectId)
      if (!p || p.deletedAt !== null) {
        if (alive) setError('Proiectul nu există sau a fost șters.')
        return
      }
      // Vizualizarea unei zile NU creează raportul; el se salvează la prima completare.
      const r = (await findReport(projectId, date)) ?? emptyReport(projectId, date)
      await touchProject(projectId)
      if (alive) setInitial(r)
    })().catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
    }
  }, [projectId, date, validDate])

  if (error)
    return (
      <Layout title="Raport zilnic" backTo="/">
        <div className="empty">
          <h2>{error}</h2>
        </div>
      </Layout>
    )
  if (!initial || !project) return <Layout title="Raport zilnic" backTo={`/proiect/${projectId}`}>{null}</Layout>
  return <ReportEditor key={initial.id} initial={initial} projectName={project.name} />
}

function ReportEditor({ initial, projectName }: { initial: DailyReport; projectName: string }) {
  const save = useCallback(async (full: DailyReport) => {
    try {
      await saveReport(full)
    } catch (e) {
      if (e instanceof ReportExistsError) {
        // raportul zilei a fost creat între timp (ex. în altă fereastră): îl deschidem pe acela
        navigate(`/proiect/${full.projectId}/raport/${full.date}?r=${Date.now()}`, { replace: true })
        throw new Error('Raportul acestei zile exista deja; s-a deschis cel salvat.', { cause: e })
      }
      throw e
    }
  }, [])
  const { value, update, flush, saveNow, state, setValue, current } = useAutosave<DailyReport>(initial, save)
  /** Raportul trebuie să existe în baza de date înainte de fotografii, note vocale, PDF sau finalizare. */
  const ensureSaved = async () => {
    await flush()
    if (!(await db.reports.get(current.current.id))) await saveNow()
  }
  const photoRef = useRef<PhotoSectionHandle>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const r = value
  const locked = r.status === 'final'
  const totalPersonnel = r.personnel.reduce((s, p) => s + (p.count ?? 0), 0)

  const goDate = async (d: string) => {
    if (!d) return
    await flush()
    navigate(`/proiect/${r.projectId}/raport/${d}`)
  }

  // textul transcris se poate pune în orice câmp text al raportului
  const appendTo = (k: 'problems' | 'instructions' | 'instructionsFrom' | 'visits' | 'safety' | 'notes') => (t: string) =>
    update({ [k]: k === 'instructionsFrom' ? (r[k].trim() ? `${r[k]} ${t}` : t) : append(r[k], t) })
  const rowTarget = <K extends 'activities' | 'materials' | 'equipment' | 'personnel'>(list: K, field: string, label: string) =>
    (r[list] as unknown as Record<string, unknown>[]).map((row, i) => ({
      label: `${label} ${i + 1}`,
      insert: (t: string) =>
        update({
          [list]: (r[list] as unknown as Record<string, unknown>[]).map((x) => (x === row ? { ...x, [field]: `${String(x[field] ?? '').trim()} ${t}`.trim() } : x)),
        } as Partial<DailyReport>),
    }))
  const targets: InsertTarget[] = [
    { label: 'Activitate nouă (descriere)', insert: (t) => update({ activities: [...r.activities, { id: newId(), description: t, quantity: null, unit: 'm', location: '' }] }) },
    ...rowTarget('activities', 'description', 'Activitatea – descriere'),
    ...rowTarget('activities', 'location', 'Activitatea – locație / tronson'),
    ...rowTarget('materials', 'name', 'Materialul – denumire'),
    ...rowTarget('materials', 'document', 'Materialul – aviz / factură'),
    ...rowTarget('equipment', 'name', 'Utilajul – denumire'),
    ...rowTarget('personnel', 'category', 'Personal – categoria'),
    { label: 'Probleme, întârzieri și cauze', insert: appendTo('problems') },
    { label: 'Instrucțiuni primite', insert: appendTo('instructions') },
    { label: 'Instrucțiuni primite de la', insert: appendTo('instructionsFrom') },
    { label: 'Vizite pe șantier', insert: appendTo('visits') },
    { label: 'Evenimente SSM', insert: appendTo('safety') },
    { label: 'Observații', insert: appendTo('notes') },
  ]

  const makePdf = async () => {
    setPdfBusy(true)
    try {
      await ensureSaved()
      const { dailyReportPdf } = await import('../lib/pdf')
      const { blob, filename } = await dailyReportPdf(r.id)
      const res = await shareOrDownload(blob, filename, `Raport zilnic ${projectName}`)
      if (res === 'downloaded') toast('PDF-ul a fost descărcat.', 'ok')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <Layout
      title={projectName}
      backTo={`/proiect/${r.projectId}`}
      right={
        <span className={`save-state ${state === 'saving' ? 'saving' : ''}`} role="status" aria-live="polite" data-testid="save-state">
          {state === 'saving' ? 'Se salvează…' : state === 'error' ? 'Eroare la salvare' : 'Salvat'}
        </span>
      }
    >
      <div className="date-nav">
        <button className="icon-btn" aria-label="Ziua precedentă" onClick={() => goDate(addDays(r.date, -1))}>
          <IconBack />
        </button>
        <input type="date" aria-label="Data raportului" value={r.date} onChange={(e) => goDate(e.target.value)} max="2100-12-31" />
        <button className="icon-btn" aria-label="Ziua următoare" onClick={() => goDate(addDays(r.date, 1))}>
          <IconChevron />
        </button>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 className="grow" style={{ fontSize: 19 }}>
          {roLongDate(r.date)}
          {r.date === isoDate() && <span className="muted small"> (azi)</span>}
        </h2>
        <span className={`badge ${locked ? 'ok' : 'warn'}`} data-testid="report-status">
          {locked ? 'Finalizat' : 'Ciornă'}
        </span>
      </div>

      {locked ? (
        <div className="banner info">
          <IconLock width={24} />
          <span className="grow">Raport finalizat — blocat la editare.</span>
          <button
            className="btn"
            onClick={async () => {
              if (!(await confirmDialog({ title: 'Redeschizi raportul?', message: 'Raportul revine la starea Ciornă și poate fi modificat.', confirmLabel: 'Redeschide' }))) return
              await reopenReport(r.id)
              setValue({ ...r, status: 'draft', finalizedAt: null })
              toast('Raport redeschis.', 'ok')
            }}
          >
            Redeschide
          </button>
        </div>
      ) : (
        <div className="quick">
          <button className="btn primary big" onClick={() => photoRef.current?.openCamera()}>
            <IconCamera /> Fotografie
          </button>
          <a className="btn big" href="#voce" onClick={(e) => { e.preventDefault(); const el = document.getElementById('voce') as HTMLDetailsElement | null; if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth' }) } }}>
            <IconMic /> Notă vocală
          </a>
        </div>
      )}

      <fieldset disabled={locked}>
        <Section title="Vreme și temperatură" defaultOpen count={r.weather.length ? r.weather.join(', ') : undefined}>
          <div className="check-group" role="group" aria-label="Vreme">
            {WEATHER_OPTIONS.map((w) => (
              <label className="chip" key={w}>
                <input
                  type="checkbox"
                  checked={r.weather.includes(w)}
                  onChange={(e) => update({ weather: e.target.checked ? [...r.weather, w] : r.weather.filter((x: Weather) => x !== w) })}
                />
                <span>{w}</span>
              </label>
            ))}
          </div>
          <div className="grid2" style={{ marginTop: 12 }}>
            <NumberField label="Temp. dimineață (°C)" name="tempMorning" allowNegative value={r.tempMorning} onChange={(v) => update({ tempMorning: v })} />
            <NumberField label="Temp. prânz (°C)" name="tempNoon" allowNegative value={r.tempNoon} onChange={(v) => update({ tempNoon: v })} />
          </div>
        </Section>

        <Section title="Personal" defaultOpen count={totalPersonnel ? `${totalPersonnel} pers.` : undefined}>
          <datalist id="categorii">
            {CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <RowsEditor<PersonnelRow>
            rows={r.personnel}
            onChange={(personnel) => update({ personnel })}
            make={() => ({ category: '', count: null })}
            addLabel="Adaugă categorie"
            itemLabel="Categoria"
            disabled={locked}
            render={(row, set) => (
              <div className="grid-wide">
                <label className="field">
                  <span>Categorie</span>
                  <input type="text" list="categorii" value={row.category} onChange={(e) => set({ category: e.target.value })} />
                </label>
                <NumberField label="Număr" integer value={row.count} onChange={(v) => set({ count: v })} />
              </div>
            )}
          />
          {!locked && <CopyPrevious reportId={r.id} onCopied={async () => setValue((await db.reports.get(r.id)) ?? r)} flush={ensureSaved} />}
        </Section>

        <Section title="Utilaje" count={r.equipment.length}>
          <RowsEditor<EquipmentRow>
            rows={r.equipment}
            onChange={(equipment) => update({ equipment })}
            make={() => ({ name: '', count: null, hours: null })}
            addLabel="Adaugă utilaj"
            itemLabel="Utilajul"
            disabled={locked}
            render={(row, set) => (
              <>
                <TextField label="Denumire" value={row.name} onChange={(v) => set({ name: v })} />
                <div className="grid2">
                  <NumberField label="Număr" integer value={row.count} onChange={(v) => set({ count: v })} />
                  <NumberField label="Ore" value={row.hours} onChange={(v) => set({ hours: v })} />
                </div>
              </>
            )}
          />
        </Section>

        <Section title="Activități executate" count={r.activities.length}>
          <datalist id="um">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <RowsEditor<ActivityRow>
            rows={r.activities}
            onChange={(activities) => update({ activities })}
            make={() => ({ description: '', quantity: null, unit: 'm', location: '' })}
            addLabel="Adaugă activitate"
            itemLabel="Activitatea"
            disabled={locked}
            render={(row, set) => (
              <>
                <TextArea label="Descriere" rows={2} value={row.description} onChange={(v) => set({ description: v })} />
                <div className="grid2">
                  <NumberField label="Cantitate" value={row.quantity} onChange={(v) => set({ quantity: v })} />
                  <label className="field">
                    <span>UM</span>
                    <input type="text" list="um" value={row.unit} onChange={(e) => set({ unit: e.target.value })} />
                  </label>
                </div>
                <TextField label="Locație / tronson" value={row.location} onChange={(v) => set({ location: v })} />
              </>
            )}
          />
        </Section>

        <Section title="Materiale recepționate" count={r.materials.length}>
          <RowsEditor<MaterialRow>
            rows={r.materials}
            onChange={(materials) => update({ materials })}
            make={() => ({ name: '', quantity: null, unit: 'buc', document: '' })}
            addLabel="Adaugă material"
            itemLabel="Materialul"
            disabled={locked}
            render={(row, set) => (
              <>
                <TextField label="Denumire" value={row.name} onChange={(v) => set({ name: v })} />
                <div className="grid2">
                  <NumberField label="Cantitate" value={row.quantity} onChange={(v) => set({ quantity: v })} />
                  <label className="field">
                    <span>UM</span>
                    <input type="text" list="um" value={row.unit} onChange={(e) => set({ unit: e.target.value })} />
                  </label>
                </div>
                <TextField label="Aviz / factură" value={row.document} onChange={(v) => set({ document: v })} />
              </>
            )}
          />
        </Section>

        <Section title="Probleme și instrucțiuni" count={[r.problems, r.instructions].filter((x) => x.trim()).length}>
          <TextArea label="Probleme, întârzieri și cauze" name="problems" value={r.problems} onChange={(v) => update({ problems: v })} />
          <TextArea label="Instrucțiuni primite" name="instructions" value={r.instructions} onChange={(v) => update({ instructions: v })} />
          <TextField label="Instrucțiuni primite de la" name="instructionsFrom" value={r.instructionsFrom} onChange={(v) => update({ instructionsFrom: v })} />
        </Section>

        <Section title="Vizite, SSM, observații" count={[r.visits, r.safety, r.notes].filter((x) => x.trim()).length}>
          <TextArea label="Vizite pe șantier" name="visits" value={r.visits} onChange={(v) => update({ visits: v })} />
          <TextArea label="Evenimente SSM" name="safety" value={r.safety} onChange={(v) => update({ safety: v })} />
          <TextArea label="Observații" name="notes" value={r.notes} onChange={(v) => update({ notes: v })} />
        </Section>
      </fieldset>

      <Section title="Fotografii" defaultOpen id="foto">
        <PhotoSection ref={photoRef} projectId={r.projectId} ownerType="report" ownerId={r.id} role="general" disabled={locked} beforeAdd={ensureSaved} />
      </Section>

      <Section title="Note vocale" id="voce">
        <VoiceNotes projectId={r.projectId} ownerType="report" ownerId={r.id} disabled={locked} targets={targets} beforeAdd={ensureSaved} />
      </Section>

      <div className="stack" style={{ marginTop: 16 }}>
        <button className="btn dark big block" onClick={makePdf} disabled={pdfBusy}>
          <IconPdf /> {pdfBusy ? 'Se generează PDF-ul…' : 'PDF raport zilnic'}
        </button>
        {!locked && (
          <button
            className="btn primary big block"
            onClick={async () => {
              await ensureSaved()
              if (
                !(await confirmDialog({
                  title: 'Finalizezi raportul?',
                  message: 'Raportul finalizat se blochează la editare. Îl poți redeschide oricând cu „Redeschide”.',
                  confirmLabel: 'Finalizează',
                }))
              )
                return
              await finalizeReport(r.id)
              setValue({ ...r, status: 'final', finalizedAt: Date.now() })
              toast('Raport finalizat.', 'ok')
            }}
          >
            <IconCheck /> Finalizează raportul
          </button>
        )}
        {!locked && (
        <button
          className="btn danger block"
          onClick={async () => {
            await flush()
            if (!(await db.reports.get(r.id))) {
              toast('Raportul acestei zile nu a fost încă completat, deci nu există nimic de șters.')
              return
            }
            if (!(await confirmDialog({ title: 'Ștergi raportul?', message: 'Raportul și fotografiile lui ajung în Coș 30 de zile.', confirmLabel: 'Șterge', danger: true }))) return
            await flush()
            await softDelete('reports', r.id)
            toast('Raportul a fost mutat în Coș.')
            navigate(`/proiect/${r.projectId}`)
          }}
        >
          <IconTrash /> Șterge raportul
        </button>
        )}
      </div>
    </Layout>
  )
}

function CopyPrevious({ reportId, onCopied, flush }: { reportId: string; onCopied: () => void; flush: () => Promise<void> }) {
  return (
    <button
      type="button"
      className="btn block"
      style={{ marginTop: 8 }}
      onClick={async () => {
        await flush()
        const r = await db.reports.get(reportId)
        if (r && (r.personnel.length || r.equipment.length)) {
          const ok = await confirmDialog({
            title: 'Înlocuiești personalul și utilajele?',
            message: 'Lista de personal și utilaje de azi va fi înlocuită cu cea din ultima zi cu raport.',
            confirmLabel: 'Copiază',
          })
          if (!ok) return
        }
        const done = await copyFromPrevious(reportId)
        if (!done) toast('Nu există un raport anterior în acest proiect.', 'error')
        else {
          onCopied()
          toast('Personalul și utilajele au fost copiate din ziua precedentă.', 'ok')
        }
      }}
    >
      <IconCopy /> Copiază din ziua precedentă (personal și utilaje)
    </button>
  )
}
