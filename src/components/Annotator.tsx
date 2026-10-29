import { useCallback, useEffect, useRef, useState } from 'react'
import type { Annotation, AnnotationTool, Photo } from '../db/types'
import { drawAnnotations } from '../lib/photo'
import { newId } from '../lib/ids'
import { IconArrow, IconCircle, IconPen, IconRect, IconText, IconUndo } from './icons'
import { Sheet } from './ui'

export const ANNOTATION_COLORS = [
  { value: '#e53935', label: 'roșu' },
  { value: '#ffd400', label: 'galben' },
  { value: '#ffffff', label: 'alb' },
  { value: '#1e88e5', label: 'albastru' },
]

const TOOLS: { tool: AnnotationTool; label: string; Icon: typeof IconArrow }[] = [
  { tool: 'arrow', label: 'Săgeată', Icon: IconArrow },
  { tool: 'ellipse', label: 'Cerc', Icon: IconCircle },
  { tool: 'rect', label: 'Dreptunghi', Icon: IconRect },
  { tool: 'free', label: 'Linie liberă', Icon: IconPen },
  { tool: 'text', label: 'Text', Icon: IconText },
]

/** Editor de adnotări: originalul rămâne neschimbat, adnotările sunt un strat separat, editabil. */
export function Annotator({ photo, onSave, onCancel }: { photo: Photo; onSave: (a: Annotation[]) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<ImageBitmap | HTMLImageElement | null>(null)
  const [anns, setAnns] = useState<Annotation[]>(photo.annotations)
  const [tool, setTool] = useState<AnnotationTool>('arrow')
  const [color, setColor] = useState(ANNOTATION_COLORS[0].value)
  const [draft, setDraft] = useState<Annotation | null>(null)
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null)
  const [text, setText] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const url = URL.createObjectURL(photo.blob)
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      imgRef.current = img
      const c = canvasRef.current
      if (c) {
        c.width = photo.width
        c.height = photo.height
      }
      setReady(true)
    }
    img.src = url
    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [photo])

  const redraw = useCallback(() => {
    const c = canvasRef.current
    const img = imgRef.current
    if (!c || !img) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    drawAnnotations(ctx, draft ? [...anns, draft] : anns, c.width, c.height)
  }, [anns, draft])

  useEffect(() => {
    if (ready) redraw()
  }, [ready, redraw])

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const p = pos(e)
    if (tool === 'text') {
      setTextAt(p)
      setText('')
      return
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setDraft({ id: newId(), tool, color, points: tool === 'free' ? [p] : [p, p] })
  }
  const onMove = (e: React.PointerEvent) => {
    if (!draft) return
    const p = pos(e)
    setDraft((d) => (d ? { ...d, points: d.tool === 'free' ? [...d.points, p] : [d.points[0], p] } : d))
  }
  const onUp = () => {
    if (!draft) return
    const [a, b] = [draft.points[0], draft.points[draft.points.length - 1]]
    const moved = Math.hypot(a.x - b.x, a.y - b.y) > 0.01 || draft.points.length > 3
    if (moved) setAnns((l) => [...l, draft])
    setDraft(null)
  }

  return (
    <div className="editor" role="dialog" aria-modal="true" aria-label="Adnotare fotografie">
      <div className="topline">
        <button className="btn" onClick={onCancel}>
          Renunță
        </button>
        <button className="btn primary" onClick={() => onSave(anns)}>
          Salvează adnotările
        </button>
      </div>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          data-testid="annot-canvas"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>
      <div className="toolbar" role="toolbar" aria-label="Unelte">
        {TOOLS.map(({ tool: t, label, Icon }) => (
          <button key={t} className="icon-btn" aria-label={label} title={label} aria-pressed={tool === t} onClick={() => setTool(t)}>
            <Icon />
          </button>
        ))}
        <span style={{ width: 8 }} />
        {ANNOTATION_COLORS.map((c) => (
          <button
            key={c.value}
            className="swatch"
            style={{ background: c.value }}
            aria-label={`Culoare ${c.label}`}
            aria-pressed={color === c.value}
            onClick={() => setColor(c.value)}
          />
        ))}
        <span style={{ width: 8 }} />
        <button className="icon-btn" aria-label="Anulează ultimul pas" title="Anulează pasul" disabled={!anns.length} onClick={() => setAnns((l) => l.slice(0, -1))}>
          <IconUndo />
        </button>
      </div>
      {textAt && (
        <Sheet title="Text pe fotografie" onClose={() => setTextAt(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) setAnns((l) => [...l, { id: newId(), tool: 'text', color, points: [textAt], text: text.trim() }])
              setTextAt(null)
            }}
          >
            <label className="field">
              <span>Text</span>
              <input type="text" value={text} autoFocus onChange={(e) => setText(e.target.value)} maxLength={80} />
            </label>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setTextAt(null)}>
                Renunță
              </button>
              <button type="submit" className="btn primary">
                Adaugă textul
              </button>
            </div>
          </form>
        </Sheet>
      )}
    </div>
  )
}
