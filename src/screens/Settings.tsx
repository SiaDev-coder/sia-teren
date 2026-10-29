import { useEffect, useRef, useState } from 'react'
import { setSetting, useSettings, type Theme } from '../db/settings'
import { Layout } from '../components/Layout'
import { ProgressBar, Section, SelectField, TextField, confirmDialog, toast, errorMessage } from '../components/ui'
import { useObjectUrl } from '../components/useObjectUrl'
import { processLogo } from '../lib/photo'
import { requestPersist, storageInfo, type StorageInfo } from '../lib/storage'
import { formatBytes } from '../lib/format'
import { MODEL_LABELS, type AsrDevice, type AsrModel } from '../lib/asr-protocol'
import { defaultModel, deleteModel, detectDevice, downloadModel, isModelCached, modelInfo, type Progress } from '../lib/asr'

export function SettingsScreen() {
  const s = useSettings()
  const [company, setCompany] = useState<string | null>(null)
  const [user, setUser] = useState<string | null>(null)
  const logoUrl = useObjectUrl(s?.logo ?? null)
  const logoInput = useRef<HTMLInputElement>(null)
  const [storage, setStorage] = useState<StorageInfo | null>(null)

  const refreshStorage = () => void storageInfo().then(setStorage)
  useEffect(refreshStorage, [])

  if (!s) return <Layout title="Setări" backTo="/mai-mult">{null}</Layout>

  return (
    <Layout title="Setări" backTo="/mai-mult">
      <Section title="Firmă și utilizator" defaultOpen>
        <TextField
          label="Denumirea firmei (apare în antetul PDF)"
          name="companyName"
          value={company ?? s.companyName}
          onChange={(v) => {
            setCompany(v)
            void setSetting('companyName', v)
          }}
        />
        <TextField
          label="Numele tău (apare la „Întocmit”)"
          name="userName"
          value={user ?? s.userName}
          onChange={(v) => {
            setUser(v)
            void setSetting('userName', v)
          }}
        />
        <div className="field">
          <span>Logo (antetul PDF)</span>
          {logoUrl ? (
            <img src={logoUrl} alt="Logo firmă" style={{ maxWidth: 200, maxHeight: 80, objectFit: 'contain', background: '#fff', borderRadius: 8, padding: 6, border: '1px solid var(--border)' }} />
          ) : (
            <span className="muted small">Niciun logo încărcat.</span>
          )}
          <div className="row">
            <button type="button" className="btn grow" onClick={() => logoInput.current?.click()}>
              {s.logo ? 'Schimbă logo-ul' : 'Încarcă logo'}
            </button>
            {s.logo && (
              <button type="button" className="btn danger" onClick={() => setSetting('logo', null)}>
                Elimină
              </button>
            )}
          </div>
          <input
            ref={logoInput}
            type="file"
            accept="image/*"
            hidden
            data-testid="logo-input"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                await setSetting('logo', await processLogo(f))
                toast('Logo salvat.', 'ok')
              } catch (err) {
                toast(errorMessage(err), 'error')
              }
            }}
          />
        </div>
      </Section>

      <Section title="Aspect" defaultOpen>
        <SelectField<Theme>
          label="Temă"
          name="theme"
          value={s.theme}
          options={[
            { value: 'auto', label: 'Automat (ca telefonul)' },
            { value: 'light', label: 'Luminoasă' },
            { value: 'dark', label: 'Întunecată' },
          ]}
          onChange={(v) => setSetting('theme', v)}
        />
      </Section>

      <Section title="Model vocal (transcriere offline)" defaultOpen>
        <VoiceModelSettings chosen={s.voiceModel} ready={s.voiceModelsReady.map((m) => m.model)} />
      </Section>

      <Section title="Spațiu pe telefon" defaultOpen>
        {storage && (
          <dl className="kv">
            <dt>Spațiu folosit</dt>
            <dd data-testid="storage-usage">{storage.usage !== null ? formatBytes(storage.usage) : 'necunoscut'}</dd>
            <dt>Disponibil</dt>
            <dd>{storage.quota !== null ? formatBytes(storage.quota) : 'necunoscut'}</dd>
            <dt>Stocare persistentă</dt>
            <dd data-testid="persist-state">
              {storage.persisted === true ? 'Da — browserul nu șterge datele singur' : storage.persisted === false ? 'Nu (încă)' : 'necunoscut pe acest browser'}
            </dd>
          </dl>
        )}
        {storage?.persisted === false && (
          <button
            className="btn block"
            style={{ marginTop: 10 }}
            onClick={async () => {
              const ok = await requestPersist()
              await setSetting('persistGranted', ok)
              refreshStorage()
              toast(ok ? 'Stocarea persistentă a fost acordată.' : 'Browserul nu a acordat stocarea persistentă. Instalează aplicația pe ecranul principal și încearcă din nou.', ok ? 'ok' : 'info', 6000)
            }}
          >
            Cere stocare persistentă
          </button>
        )}
        <p className="muted small">Toate datele stau doar pe acest telefon. Fă regulat o copie de siguranță (Mai mult → Copie de siguranță).</p>
      </Section>
    </Layout>
  )
}

function VoiceModelSettings({ chosen, ready }: { chosen: AsrModel | null; ready: AsrModel[] }) {
  const [device, setDevice] = useState<AsrDevice | null>(null)
  const [def, setDef] = useState<AsrModel>('base')
  const [cached, setCached] = useState<Partial<Record<AsrModel, boolean>>>({})
  const [progress, setProgress] = useState<Progress | null>(null)
  const [busy, setBusy] = useState<AsrModel | null>(null)
  const current = chosen ?? def

  useEffect(() => {
    void detectDevice().then(setDevice)
    void defaultModel().then(setDef)
  }, [])

  useEffect(() => {
    for (const m of ready) void isModelCached(m).then((c) => setCached((x) => ({ ...x, [m]: c })))
  }, [ready])

  return (
    <div className="stack">
      <p className="small">
        Transcrie notele vocale în text <strong>direct pe telefon</strong>, fără internet, după o singură descărcare.
        {device && <> Acest dispozitiv folosește {device === 'webgpu' ? 'placa grafică (WebGPU) — mai rapid' : 'procesorul (WASM) — mai lent'}.</>}
      </p>
      <SelectField<AsrModel>
        label="Model"
        name="voiceModel"
        value={current}
        options={(['small', 'base'] as AsrModel[]).map((m) => ({ value: m, label: `${MODEL_LABELS[m]}${m === def ? ' — implicit aici' : ''}` }))}
        onChange={(m) => setSetting('voiceModel', m)}
      />
      {(['small', 'base'] as AsrModel[])
        .filter((m) => m === current || ready.includes(m))
        .map((m) => {
          const isReady = ready.includes(m)
          return (
            <div className="card" key={m} data-testid={`model-${m}`}>
              <div className="row">
                <strong className="grow">{MODEL_LABELS[m]}</strong>
                {isReady && <span className={`badge ${cached[m] === false ? 'danger' : 'ok'}`}>{cached[m] === false ? 'incomplet' : 'descărcat'}</span>}
              </div>
              {!isReady && (
                <p className="small muted">
                  Descărcare unică, pe Wi-Fi de preferat. Mărimea exactă îți este arătată înainte să confirmi descărcarea.
                </p>
              )}
              {busy === m && progress && (
                <div className="stack" style={{ margin: '8px 0' }}>
                  <ProgressBar value={progress.loaded} max={progress.total} label="Descărcare model vocal" />
                  <span className="small muted">
                    {progress.phase === 'runtime' ? 'Motor de transcriere' : 'Model'}: {formatBytes(progress.loaded)} din {formatBytes(progress.total)}
                  </span>
                </div>
              )}
              <div className="row" style={{ marginTop: 8 }}>
                {(!isReady || cached[m] === false) && (
                  <button
                    className="btn primary grow"
                    disabled={busy !== null}
                    onClick={async () => {
                      if (!navigator.onLine) {
                        toast('Descărcarea modelului are nevoie de internet (o singură dată). Încearcă pe Wi-Fi.', 'error')
                        return
                      }
                      setBusy(m)
                      try {
                        // mărimea reală, aflată de pe huggingface.co abia după apăsarea butonului
                        const info = await modelInfo(m)
                        const total = info.modelBytes + info.runtimeBytes
                        const ok = await confirmDialog({
                          title: 'Descarci modelul vocal?',
                          message: (
                            <p data-testid="model-size">
                              {MODEL_LABELS[m]}: <strong>{formatBytes(total)}</strong>
                              {info.unknown ? ' (unele fișiere fără mărime declarată)' : ''}. Descărcarea se face o singură dată; apoi transcrierea merge fără internet.
                            </p>
                          ),
                          confirmLabel: 'Descarcă',
                        })
                        if (!ok) return
                        setProgress({ loaded: 0, total: 1, phase: 'runtime' })
                        await downloadModel(m, setProgress)
                        await setSetting('voiceModel', m)
                        setCached((x) => ({ ...x, [m]: true }))
                        toast('Modelul vocal a fost descărcat. Transcrierea merge acum și fără internet.', 'ok', 5000)
                      } catch (e) {
                        toast(errorMessage(e), 'error', 8000)
                      } finally {
                        setBusy(null)
                        setProgress(null)
                      }
                    }}
                  >
                    {busy === m ? 'Se descarcă…' : 'Descarcă pentru folosire offline'}
                  </button>
                )}
                {isReady && (
                  <button
                    className="btn danger grow"
                    disabled={busy !== null}
                    onClick={async () => {
                      if (!(await confirmDialog({ title: 'Ștergi modelul vocal?', message: 'Notele vocale rămân salvate; transcrierea nu va mai merge până la o nouă descărcare.', confirmLabel: 'Șterge modelul', danger: true })))
                        return
                      try {
                        await deleteModel(m)
                        toast('Modelul vocal a fost șters de pe telefon.', 'ok')
                      } catch (e) {
                        toast(errorMessage(e), 'error')
                      }
                    }}
                  >
                    Șterge modelul
                  </button>
                )}
              </div>
            </div>
          )
        })}
    </div>
  )
}
