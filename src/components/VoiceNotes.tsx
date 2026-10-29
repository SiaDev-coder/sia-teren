import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addAudio, audioFor, softDelete, updateAudio } from '../db/repo'
import type { AudioNote, OwnerType } from '../db/types'
import { pickRecorderMime } from '../lib/audio'
import { readyModel, transcribe } from '../lib/asr'
import { useObjectUrl } from './useObjectUrl'
import { Sheet, confirmDialog, toast, errorMessage } from './ui'
import { IconMic, IconStop, IconTrash } from './icons'
import { roDateTime } from '../lib/format'

export interface InsertTarget {
  label: string
  insert: (text: string) => void
}

interface Props {
  projectId: string
  ownerType: OwnerType
  ownerId: string
  disabled?: boolean
  targets: InsertTarget[]
  /** apelat înainte de a salva o notă (ex. ca raportul să existe) */
  beforeAdd?: () => Promise<void>
}

const running = new Set<string>()

async function runTranscription(note: AudioNote) {
  if (running.has(note.id)) return
  running.add(note.id)
  try {
    await updateAudio(note.id, { transcriptStatus: 'pending', transcriptError: '' })
    const text = await transcribe(note.blob)
    await updateAudio(note.id, { transcript: text, transcriptStatus: 'done' })
    if (!text) toast('Transcrierea nu a găsit vorbire în înregistrare.', 'info')
  } catch (e) {
    await updateAudio(note.id, { transcriptStatus: 'error', transcriptError: errorMessage(e) })
  } finally {
    running.delete(note.id)
  }
}

export function VoiceNotes({ projectId, ownerType, ownerId, disabled, targets, beforeAdd }: Props) {
  const notes = useLiveQuery(() => audioFor(ownerType, ownerId), [ownerType, ownerId]) ?? []
  const model = useLiveQuery(readyModel, [])
  const [rec, setRec] = useState<{ mr: MediaRecorder; started: number; stream: MediaStream } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const chunks = useRef<Blob[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const importFile = async (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('audio/') && !/\.(m4a|mp3|wav|ogg|opus|webm|aac)$/i.test(f.name)) {
      toast('Fișierul ales nu este audio.', 'error')
      return
    }
    // durata din metadatele fișierului (dacă browserul o poate citi)
    const durationSec = await new Promise<number>((res) => {
      const a = document.createElement('audio')
      const u = URL.createObjectURL(f)
      a.preload = 'metadata'
      a.onloadedmetadata = () => {
        URL.revokeObjectURL(u)
        res(Number.isFinite(a.duration) ? Math.round(a.duration * 10) / 10 : 0)
      }
      a.onerror = () => {
        URL.revokeObjectURL(u)
        res(0)
      }
      a.src = u
    })
    let note: AudioNote
    try {
      await beforeAdd?.()
      note = await addAudio({ projectId, ownerType, ownerId, blob: f, mimeType: f.type || 'audio/mp4', durationSec })
    } catch (e) {
      toast(errorMessage(e), 'error')
      return
    }
    toast('Fișierul audio a fost atașat.', 'ok')
    if (await readyModel()) void runTranscription(note)
  }

  useEffect(() => {
    if (!rec) return
    const t = setInterval(() => setElapsed(Math.round((Date.now() - rec.started) / 1000)), 500)
    return () => clearInterval(t)
  }, [rec])

  useEffect(
    () => () => {
      rec?.stream.getTracks().forEach((t) => t.stop())
    },
    [rec],
  )

  const start = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast('Acest browser nu poate înregistra audio.', 'error')
      return
    }
    const mime = pickRecorderMime()
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
    } catch (e) {
      const name = (e as DOMException)?.name
      toast(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Accesul la microfon este refuzat. Îl poți permite din setările telefonului; restul aplicației funcționează normal.'
          : 'Microfonul nu este disponibil acum.',
        'error',
      )
      return
    }
    const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    chunks.current = []
    mr.ondataavailable = (ev) => ev.data.size && chunks.current.push(ev.data)
    const started = Date.now()
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      const type = mr.mimeType || mime || 'audio/webm'
      const blob = new Blob(chunks.current, { type })
      setRec(null)
      setElapsed(0)
      if (!blob.size) {
        toast('Înregistrarea este goală.', 'error')
        return
      }
      let note: AudioNote
      try {
        await beforeAdd?.()
        note = await addAudio({ projectId, ownerType, ownerId, blob, mimeType: type, durationSec: Math.round((Date.now() - started) / 100) / 10 })
      } catch (e) {
        toast(errorMessage(e), 'error')
        return
      }
      toast('Nota vocală a fost salvată.', 'ok')
      if (await readyModel()) void runTranscription(note)
    }
    mr.start(1000)
    setRec({ mr, started, stream })
  }

  return (
    <div className="stack">
      {notes.map((n) => (
        <NoteItem key={n.id} note={n} disabled={disabled} canTranscribe={!!model} targets={targets} />
      ))}
      {!disabled &&
        (rec ? (
          <button type="button" className="btn dark big" onClick={() => rec.mr.state !== 'inactive' && rec.mr.stop()}>
            <span className="rec-dot" aria-hidden="true" /> <IconStop /> Oprește înregistrarea ({elapsed} s)
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={start}>
              <IconMic /> Înregistrează notă vocală
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Atașează fișier audio (ex. mesaj vocal)
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.m4a,.mp3,.wav,.ogg,.opus"
              hidden
              data-testid="audio-input"
              onChange={(e) => {
                void importFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </>
        ))}
      {!model && <p className="muted small">Pentru transcriere automată în text, descarcă modelul vocal din Mai mult → Setări → Model vocal.</p>}
    </div>
  )
}

function NoteItem({ note, disabled, canTranscribe, targets }: { note: AudioNote; disabled?: boolean; canTranscribe: boolean; targets: InsertTarget[] }) {
  const url = useObjectUrl(note.blob)
  const [picking, setPicking] = useState(false)
  // „pending” fără o transcriere care rulează acum = întreruptă (aplicația s-a închis între timp)
  const pendingHere = note.transcriptStatus === 'pending' && running.has(note.id)
  const interrupted = note.transcriptStatus === 'pending' && !running.has(note.id)
  return (
    <div className="audio-item">
      <div className="row">
        <strong className="grow">Notă vocală · {roDateTime(note.createdAt)}</strong>
        <span className="muted small">{note.durationSec.toLocaleString('ro-RO')} s</span>
      </div>
      {url && <audio controls preload="metadata" src={url} />}
      {pendingHere && <p className="muted small">Se transcrie pe telefon… (poate dura)</p>}
      {interrupted && <p className="small" style={{ color: 'var(--danger)' }}>Transcrierea a fost întreruptă (aplicația s-a închis). Poți încerca din nou.</p>}
      {note.transcriptStatus === 'error' && <p className="small" style={{ color: 'var(--danger)' }}>{note.transcriptError}</p>}
      {note.transcriptStatus === 'done' && note.transcript && (
        <>
          <div className="transcript" data-testid="transcript">{note.transcript}</div>
          {!disabled && targets.length > 0 && (
            <button type="button" className="btn primary block" onClick={() => setPicking(true)}>
              Inserează textul în…
            </button>
          )}
        </>
      )}
      <div className="row" style={{ marginTop: 6 }}>
        {canTranscribe && !pendingHere && !disabled && (
          <button type="button" className="btn grow" onClick={() => runTranscription(note)}>
            {note.transcriptStatus === 'done' ? 'Transcrie din nou' : 'Transcrie în text'}
          </button>
        )}
        {!disabled && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Șterge nota vocală"
            onClick={async () => {
              if (await confirmDialog({ title: 'Ștergi nota vocală?', message: 'Nota ajunge în Coș 30 de zile.', confirmLabel: 'Șterge', danger: true }))
                await softDelete('audio', note.id)
            }}
          >
            <IconTrash />
          </button>
        )}
      </div>
      {picking && (
        <Sheet title="Inserează textul în câmpul…" onClose={() => setPicking(false)}>
          <div className="stack">
            {targets.map((t) => (
              <button
                key={t.label}
                className="btn block"
                onClick={() => {
                  t.insert(note.transcript)
                  setPicking(false)
                  toast(`Text inserat în „${t.label}”.`, 'ok')
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}
