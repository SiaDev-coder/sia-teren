// Iconițe proprii (SVG simplu, linie 2 px).
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const base = (props: P) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
})

export const IconFolder = (p: P) => (
  <svg {...base(p)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
)
export const IconToday = (p: P) => (
  <svg {...base(p)}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /><path d="M8 14l3 3 5-5" /></svg>
)
export const IconAlert = (p: P) => (
  <svg {...base(p)}><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.01" /></svg>
)
export const IconMore = (p: P) => (
  <svg {...base(p)}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
)
export const IconPlus = (p: P) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconBack = (p: P) => (
  <svg {...base(p)}><path d="M15 5l-7 7 7 7" /></svg>
)
export const IconChevron = (p: P) => (
  <svg {...base(p)}><path d="M9 5l7 7-7 7" /></svg>
)
export const IconCamera = (p: P) => (
  <svg {...base(p)}><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></svg>
)
export const IconImage = (p: P) => (
  <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>
)
export const IconMic = (p: P) => (
  <svg {...base(p)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
)
export const IconStop = (p: P) => (
  <svg {...base(p)}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
)
export const IconPdf = (p: P) => (
  <svg {...base(p)}><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 14h6M9 18h4" /></svg>
)
export const IconShare = (p: P) => (
  <svg {...base(p)}><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v7h14v-7" /></svg>
)
export const IconTrash = (p: P) => (
  <svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
)
export const IconEdit = (p: P) => (
  <svg {...base(p)}><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>
)
export const IconPin = (p: P) => (
  <svg {...base(p)}><path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>
)
export const IconUndo = (p: P) => (
  <svg {...base(p)}><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
)
export const IconArrow = (p: P) => (
  <svg {...base(p)}><path d="M5 19L19 5M10 5h9v9" /></svg>
)
export const IconRect = (p: P) => (
  <svg {...base(p)}><rect x="4" y="6" width="16" height="12" rx="1" /></svg>
)
export const IconCircle = (p: P) => (
  <svg {...base(p)}><ellipse cx="12" cy="12" rx="8" ry="7" /></svg>
)
export const IconPen = (p: P) => (
  <svg {...base(p)}><path d="M3 17c3-4 5 2 8-2s4-8 7-6 1 6-2 9" /></svg>
)
export const IconText = (p: P) => (
  <svg {...base(p)}><path d="M5 6V4h14v2M12 4v16M9 20h6" /></svg>
)
export const IconCheck = (p: P) => (
  <svg {...base(p)}><path d="M5 12l5 5 9-10" /></svg>
)
export const IconCopy = (p: P) => (
  <svg {...base(p)}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>
)
export const IconDownload = (p: P) => (
  <svg {...base(p)}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
)
export const IconLock = (p: P) => (
  <svg {...base(p)}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
)
