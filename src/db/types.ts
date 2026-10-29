/** Câmpuri comune tuturor înregistrărilor (pregătite pentru o sincronizare viitoare). */
export interface BaseRecord {
  id: string
  createdAt: number
  updatedAt: number
  /** Ștergere logică: momentul mutării în Coș, sau null. */
  deletedAt: number | null
}

export interface GpsFix {
  lat: number
  lng: number
  /** precizia în metri */
  accuracy: number
  at: number
}

export interface Project extends BaseRecord {
  name: string
  beneficiary: string
  contractNo: string
  lot: string
  locality: string
  county: string
  contractor: string
  supervisor: string
  /** AAAA-LL-ZZ */
  startDate: string
  /** 0 = activ, 1 = arhivat (0/1 pentru indexare în IndexedDB) */
  archived: 0 | 1
  lastUsedAt: number
}

export const WEATHER_OPTIONS = ['senin', 'noros', 'ploaie', 'ninsoare', 'ceață', 'vânt puternic'] as const
export type Weather = (typeof WEATHER_OPTIONS)[number]

export interface PersonnelRow {
  id: string
  category: string
  count: number | null
}
export interface EquipmentRow {
  id: string
  name: string
  count: number | null
  hours: number | null
}
export interface ActivityRow {
  id: string
  description: string
  quantity: number | null
  unit: string
  location: string
}
export interface MaterialRow {
  id: string
  name: string
  quantity: number | null
  unit: string
  document: string
}

export type ReportStatus = 'draft' | 'final'

export interface DailyReport extends BaseRecord {
  projectId: string
  /** AAAA-LL-ZZ, unică per proiect (între rapoartele neșterse) */
  date: string
  weather: Weather[]
  tempMorning: number | null
  tempNoon: number | null
  personnel: PersonnelRow[]
  equipment: EquipmentRow[]
  activities: ActivityRow[]
  materials: MaterialRow[]
  problems: string
  instructions: string
  instructionsFrom: string
  visits: string
  safety: string
  notes: string
  status: ReportStatus
  finalizedAt: number | null
}

export const FINDING_CATEGORIES = ['calitate', 'SSM', 'mediu', 'documentație', 'altele'] as const
export type FindingCategory = (typeof FINDING_CATEGORIES)[number]
export const SEVERITIES = ['minoră', 'majoră', 'critică'] as const
export type Severity = (typeof SEVERITIES)[number]
export const FINDING_STATUSES = ['Deschisă', 'În lucru', 'Rezolvată', 'Verificată', 'Anulată'] as const
export type FindingStatus = (typeof FINDING_STATUSES)[number]
/** Stări considerate închise (nu mai pot fi „depășite”). */
export const CLOSED_STATUSES: FindingStatus[] = ['Verificată', 'Anulată', 'Rezolvată']

export interface StatusChange {
  from: FindingStatus | null
  to: FindingStatus
  at: number
}

export interface Finding extends BaseRecord {
  projectId: string
  title: string
  description: string
  category: FindingCategory
  severity: Severity
  location: string
  gps: GpsFix | null
  responsible: string
  /** AAAA-LL-ZZ sau '' */
  dueDate: string
  status: FindingStatus
  history: StatusChange[]
}

export type OwnerType = 'report' | 'finding'
export type PhotoRole = 'general' | 'before' | 'after'

export type AnnotationTool = 'arrow' | 'rect' | 'ellipse' | 'free' | 'text'
/** Coordonate normalizate 0..1 față de lățimea/înălțimea fotografiei. */
export interface Annotation {
  id: string
  tool: AnnotationTool
  color: string
  points: { x: number; y: number }[]
  text?: string
}

export interface Photo extends BaseRecord {
  projectId: string
  ownerType: OwnerType
  ownerId: string
  role: PhotoRole
  /** fotografia originală (redimensionată, JPEG) — nu se modifică niciodată */
  blob: Blob
  width: number
  height: number
  takenAt: number
  gps: GpsFix | null
  /** stratul de adnotări, separat de original */
  annotations: Annotation[]
  caption: string
}

export interface AudioNote extends BaseRecord {
  projectId: string
  ownerType: OwnerType
  ownerId: string
  blob: Blob
  mimeType: string
  durationSec: number
  transcript: string
  transcriptStatus: 'none' | 'pending' | 'done' | 'error'
  transcriptError: string
}

export interface SettingRow {
  key: string
  value: unknown
}
