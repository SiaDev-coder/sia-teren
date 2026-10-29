import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { createProject, updateProject, type ProjectInput } from '../db/repo'
import { Layout } from '../components/Layout'
import { TextField, toast, errorMessage } from '../components/ui'
import { navigate } from '../router'
import { useDraft } from '../components/useDraft'

const EMPTY: ProjectInput = {
  name: '',
  beneficiary: '',
  contractNo: '',
  lot: '',
  locality: '',
  county: '',
  contractor: '',
  supervisor: '',
  startDate: '',
}

export function ProjectForm({ id }: { id?: string }) {
  const [v, setV, clearDraft] = useDraft<ProjectInput>(id ? null : 'sia-ciorna-proiect-nou', EMPTY)
  const [loaded, setLoaded] = useState(!id)
  const [missing, setMissing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    void db.projects.get(id).then((p) => {
      if (!p || p.deletedAt !== null) setMissing(true)
      else {
        const { name, beneficiary, contractNo, lot, locality, county, contractor, supervisor, startDate } = p
        setV({ name, beneficiary, contractNo, lot, locality, county, contractor, supervisor, startDate })
      }
      setLoaded(true)
    })
  }, [id, setV])

  const set = (k: keyof ProjectInput) => (val: string) => setV((s) => ({ ...s, [k]: val }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!v.name.trim()) {
      toast('Completează denumirea proiectului.', 'error')
      return
    }
    setSaving(true)
    try {
      const clean = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim()])) as ProjectInput
      if (id) {
        await updateProject(id, clean)
        toast('Proiect salvat.', 'ok')
        navigate(`/proiect/${id}`)
      } else {
        const p = await createProject(clean)
        clearDraft()
        toast('Proiect creat.', 'ok')
        navigate(`/proiect/${p.id}`, { replace: true })
      }
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return <Layout title="Proiect" backTo="/">{null}</Layout>
  if (missing)
    return (
      <Layout title="Proiect" backTo="/">
        <div className="empty">
          <h2>Proiectul nu există</h2>
          <p>Poate a fost șters. Verifică în Coș.</p>
        </div>
      </Layout>
    )
  return (
    <Layout title={id ? 'Editează proiectul' : 'Proiect nou'} backTo={id ? `/proiect/${id}` : '/'}>
      <form onSubmit={submit} className="card" noValidate>
        <TextField label="Denumire proiect" name="name" value={v.name} onChange={set('name')} required autoFocus={!id} placeholder="ex. Extindere rețea apă-canal" />
        <TextField label="Beneficiar" name="beneficiary" value={v.beneficiary} onChange={set('beneficiary')} />
        <div className="grid2">
          <TextField label="Număr contract" name="contractNo" value={v.contractNo} onChange={set('contractNo')} />
          <TextField label="Lot (CL)" name="lot" value={v.lot} onChange={set('lot')} />
        </div>
        <div className="grid2">
          <TextField label="Localitate" name="locality" value={v.locality} onChange={set('locality')} />
          <TextField label="Județ" name="county" value={v.county} onChange={set('county')} />
        </div>
        <TextField label="Antreprenor" name="contractor" value={v.contractor} onChange={set('contractor')} />
        <TextField label="Supervizor / diriginte de șantier" name="supervisor" value={v.supervisor} onChange={set('supervisor')} />
        <TextField label="Data începerii" name="startDate" type="date" value={v.startDate} onChange={set('startDate')} />
        <button className="btn primary big block" type="submit" disabled={saving}>
          {id ? 'Salvează modificările' : 'Creează proiectul'}
        </button>
      </form>
    </Layout>
  )
}
