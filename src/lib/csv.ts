import type { DailyReport, Finding, Project } from '../db/types'
import { roDate, roDateTime, roNumber } from './format'

export const CSV_BOM = '﻿'
export const CSV_SEP = ';'

export function csvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? '' : typeof v === 'number' ? roNumber(v) : v
  s = s.replace(/\r\n|\r/g, '\n')
  // protecție împotriva interpretării ca formulă în Excel
  if (/^[=+\-@\t]/.test(s) && !/^-?\d+(,\d+)?$/.test(s)) s = `'${s}`
  if (s.includes(CSV_SEP) || s.includes('"') || s.includes('\n')) s = `"${s.replace(/"/g, '""')}"`
  return s
}

/** CSV cu BOM UTF-8, separator „;”, rânduri CRLF (Excel cu setări românești). */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(CSV_SEP))
  return CSV_BOM + lines.join('\r\n') + '\r\n'
}

const STATUS_RO = { draft: 'Ciornă', final: 'Finalizat' } as const

export function reportsCsv(project: Project, reports: DailyReport[]): string {
  const header = [
    'Proiect',
    'Data',
    'Stare',
    'Vreme',
    'Temp. dimineață (°C)',
    'Temp. prânz (°C)',
    'Total personal',
    'Personal pe categorii',
    'Utilaje',
    'Activități executate',
    'Materiale recepționate',
    'Probleme / întârzieri',
    'Instrucțiuni primite',
    'Instrucțiuni de la',
    'Vizite pe șantier',
    'Evenimente SSM',
    'Observații',
  ]
  const rows = [...reports]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((r) => [
      project.name,
      roDate(r.date),
      STATUS_RO[r.status],
      r.weather.join(', '),
      r.tempMorning,
      r.tempNoon,
      r.personnel.reduce((s, p) => s + (p.count ?? 0), 0),
      r.personnel.map((p) => `${p.category}: ${p.count ?? 0}`).join(' | '),
      r.equipment.map((e) => `${e.name}: ${e.count ?? 0} buc., ${roNumber(e.hours) || '0'} h`).join(' | '),
      r.activities
        .map((a) => [a.description, a.quantity !== null ? `${roNumber(a.quantity)} ${a.unit}`.trim() : '', a.location].filter(Boolean).join(' – '))
        .join(' | '),
      r.materials
        .map((m) => [m.name, m.quantity !== null ? `${roNumber(m.quantity)} ${m.unit}`.trim() : '', m.document].filter(Boolean).join(' – '))
        .join(' | '),
      r.problems,
      r.instructions,
      r.instructionsFrom,
      r.visits,
      r.safety,
      r.notes,
    ])
  return toCsv(header, rows)
}

export function findingsCsv(project: Project, findings: Finding[]): string {
  const header = [
    'Proiect',
    'Titlu',
    'Descriere',
    'Categorie',
    'Gravitate',
    'Stare',
    'Locație',
    'Latitudine',
    'Longitudine',
    'Precizie GPS (m)',
    'Responsabil',
    'Termen',
    'Creată la',
    'Istoric stări',
  ]
  const rows = findings.map((f) => [
    project.name,
    f.title,
    f.description,
    f.category,
    f.severity,
    f.status,
    f.location,
    f.gps ? f.gps.lat.toFixed(6).replace('.', ',') : '',
    f.gps ? f.gps.lng.toFixed(6).replace('.', ',') : '',
    f.gps ? f.gps.accuracy : null,
    f.responsible,
    roDate(f.dueDate),
    roDateTime(f.createdAt),
    f.history.map((h) => `${roDateTime(h.at)} ${h.from ? `${h.from} → ` : ''}${h.to}`).join(' | '),
  ])
  return toCsv(header, rows)
}
