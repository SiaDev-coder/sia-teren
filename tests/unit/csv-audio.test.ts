import { describe, it, expect } from 'vitest'
import { toCsv, reportsCsv, findingsCsv, CSV_BOM } from '../../src/lib/csv'
import { emptyReport } from '../../src/db/repo'
import { resampleLinear, downmixToMono, pickRecorderMime, TARGET_SAMPLE_RATE, extensionForMime } from '../../src/lib/audio'
import type { Finding, Project } from '../../src/db/types'

const project = { id: 'p', name: 'Rețea canal Țicleni', contractNo: '7/2026' } as Project

describe('CSV pentru Excel cu setări românești', () => {
  it('BOM UTF-8, separator „;”, CRLF, ghilimele unde trebuie, diacritice intacte', () => {
    const csv = toCsv(['Coloană', 'Număr'], [['ș;ț "x"', 3.5], ['linie\nnouă', -2]])
    expect(csv.startsWith(CSV_BOM)).toBe(true)
    const body = csv.slice(1)
    expect(body).toBe('Coloană;Număr\r\n"ș;ț ""x""";3,5\r\n"linie\nnouă";-2\r\n')
    const bytes = new TextEncoder().encode(csv)
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  })

  it('rapoarte: date ZZ.LL.AAAA, virgulă zecimală, diacritice', () => {
    const r = emptyReport('p', '2026-10-29')
    r.tempMorning = -3.5
    r.weather = ['ceață', 'vânt puternic']
    r.personnel = [{ id: '1', category: 'Muncitori necalificați', count: 4 }]
    r.equipment = [{ id: '2', name: 'Excavator', count: 1, hours: 6.25 }]
    r.activities = [{ id: '3', description: 'Pozare țeavă PEHD', quantity: 120.5, unit: 'm', location: 'Str. Școlii' }]
    const csv = reportsCsv(project, [r])
    const [head, row] = csv.slice(1).split('\r\n')
    expect(head.split(';')[1]).toBe('Data')
    const cells = row.split(';')
    expect(cells[0]).toBe('Rețea canal Țicleni')
    expect(cells[1]).toBe('29.10.2026')
    expect(cells[3]).toBe('ceață, vânt puternic')
    expect(cells[4]).toBe('-3,5')
    expect(cells[6]).toBe('4')
    expect(row).toContain('6,25 h')
    expect(row).toContain('Pozare țeavă PEHD – 120,5 m – Str. Școlii')
  })

  it('constatări: coordonate cu virgulă zecimală și istoric', () => {
    const f: Finding = {
      id: 'f', projectId: 'p', createdAt: Date.UTC(2026, 9, 1, 8), updatedAt: 0, deletedAt: null,
      title: 'Lipsă împrejmuire', description: 'Groapă neîmprejmuită', category: 'SSM', severity: 'critică',
      location: 'Cămin C3', gps: { lat: 44.123456, lng: 23.654321, accuracy: 7, at: 0 }, responsible: 'Șef punct',
      dueDate: '2026-10-05', status: 'Deschisă', history: [{ from: null, to: 'Deschisă', at: Date.UTC(2026, 9, 1, 8) }],
    }
    const row = findingsCsv(project, [f]).slice(1).split('\r\n')[1].split(';')
    expect(row[7]).toBe('44,123456')
    expect(row[8]).toBe('23,654321')
    expect(row[11]).toBe('05.10.2026')
  })

  it('protecție la formule Excel', () => {
    expect(toCsv(['a'], [['=SUM(A1)']])).toContain("'=SUM(A1)")
  })
})

describe('audio pentru Whisper', () => {
  it('reeșantionare 48 kHz → 16 kHz: lungime corectă și frecvență păstrată', () => {
    const sr = 48000
    const sec = 2
    const f0 = 440
    const input = new Float32Array(sr * sec)
    for (let i = 0; i < input.length; i++) input[i] = Math.sin((2 * Math.PI * f0 * i) / sr)
    const out = resampleLinear(input, sr, TARGET_SAMPLE_RATE)
    expect(out).toBeInstanceOf(Float32Array)
    expect(out.length).toBe(TARGET_SAMPLE_RATE * sec)
    // numărăm trecerile prin zero → frecvența ~440 Hz
    let zc = 0
    for (let i = 1; i < out.length; i++) if (out[i - 1] < 0 !== out[i] < 0) zc++
    expect(zc / 2 / sec).toBeGreaterThan(430)
    expect(zc / 2 / sec).toBeLessThan(450)
  })

  it('reeșantionare 44,1 kHz → 16 kHz și mono din stereo', () => {
    const l = new Float32Array(44100).fill(0.5)
    const r = new Float32Array(44100).fill(-0.5)
    const mono = downmixToMono([l, r])
    expect(Math.abs(mono[100])).toBeLessThan(1e-6)
    const out = resampleLinear(new Float32Array(44100).fill(0.25), 44100)
    expect(out.length).toBe(16000)
    expect(out[5000]).toBeCloseTo(0.25, 5)
  })

  it('alege primul tip de înregistrare suportat (iPhone: audio/mp4)', () => {
    expect(pickRecorderMime((t) => t === 'audio/mp4')).toBe('audio/mp4')
    expect(pickRecorderMime(() => true)).toBe('audio/webm;codecs=opus')
    expect(pickRecorderMime(() => false)).toBe('')
    expect(extensionForMime('audio/mp4')).toBe('m4a')
  })
})
