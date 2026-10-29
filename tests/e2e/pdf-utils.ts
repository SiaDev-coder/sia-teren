import { readFileSync } from 'node:fs'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

export async function inspectPdf(path: string) {
  const data = new Uint8Array(readFileSync(path))
  const header = new TextDecoder().decode(data.slice(0, 5))
  const pdf = await getDocument({ data, useSystemFonts: false }).promise
  let text = ''
  let images = 0
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const tc = await page.getTextContent()
    text += tc.items.map((it) => ('str' in it ? it.str : '')).join('\n') + '\n'
    const ops = await page.getOperatorList()
    images += ops.fnArray.filter((f) => f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject).length
  }
  return { header, pages: pdf.numPages, text, images, bytes: data.length }
}
