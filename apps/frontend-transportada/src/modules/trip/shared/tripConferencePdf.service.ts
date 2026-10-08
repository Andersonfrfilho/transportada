/* Copyright (c) 2026 Ada Technology. MIT License. */
import { ROUTE_SEPARATOR } from './tripConferenceSheet.service'
import type {
  TripConferenceSheetLabels,
  TripConferenceSheetModel,
} from './tripConferenceSheet.service'

export type BuildTripConferencePdfInput = Readonly<{
  brandName: string
  labels: TripConferenceSheetLabels
  logoDataUrl: null | string
  sheet: TripConferenceSheetModel
}>

const PAGE_MARGIN_MM = 10
const HEADER_FILL = 217
const ZEBRA_FILL = 242
const SUPPORTED_LOGO_TYPES = new Set(['image/png', 'image/jpeg'])
/** Colunas fixas (mm): a do cliente fica com o que sobra de uma A4 paisagem. */
const COLUMN_WIDTHS_MM = { 0: 10, 1: 20, 2: 22, 4: 52, 5: 28, 6: 32, 7: 18, 8: 28 } as const

/** A lista quebra entre cidades, nunca no meio do nome de uma: "SANTA RITA DO PASSA QUATRO" fica inteira. */
export function packCitiesIntoLines(input: {
  readonly cities: readonly string[]
  readonly maxWidth: number
  readonly measure: (text: string) => number
}): readonly string[] {
  const lines: string[] = []
  let current = ''

  for (const city of input.cities) {
    const candidate = current === '' ? city : `${current}${ROUTE_SEPARATOR}${city}`

    if (current !== '' && input.measure(candidate) > input.maxWidth) {
      lines.push(`${current}${ROUTE_SEPARATOR.trimEnd()}`)
      current = city
    } else {
      current = candidate
    }
  }
  if (current !== '') lines.push(current)

  return lines
}

/** O logo vem de uma URL da instalação; formato que o PDF não desenha (SVG) simplesmente fica de fora. */
export async function fetchLogoDataUrl(logoUrl: string): Promise<null | string> {
  try {
    const response = await fetch(logoUrl)
    if (!response.ok) return null
    const blob = await response.blob()
    if (!SUPPORTED_LOGO_TYPES.has(blob.type)) return null

    return await new Promise<null | string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** Carregadas sob demanda: o painel só paga o peso da biblioteca de quem pede o PDF. */
export async function buildTripConferencePdf(input: BuildTripConferencePdfInput): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const { brandName, labels, logoDataUrl, sheet } = input
  const doc = new jsPDF({ format: 'a4', orientation: 'landscape', unit: 'mm' })
  const pageWidth = doc.internal.pageSize.getWidth()
  let cursorY = PAGE_MARGIN_MM

  if (logoDataUrl !== null) {
    doc.addImage(logoDataUrl, PAGE_MARGIN_MM, cursorY, 14, 14, undefined, 'FAST')
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(brandName.toUpperCase(), PAGE_MARGIN_MM + (logoDataUrl === null ? 0 : 17), cursorY + 9)
  doc.setFontSize(14)
  doc.text(labels.title.toUpperCase(), pageWidth - PAGE_MARGIN_MM, cursorY + 6, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(sheet.printedAtText, pageWidth - PAGE_MARGIN_MM, cursorY + 11, { align: 'right' })
  cursorY += 17
  doc.setLineWidth(0.6)
  doc.line(PAGE_MARGIN_MM, cursorY, pageWidth - PAGE_MARGIN_MM, cursorY)
  cursorY += 4

  const fieldWidth = (pageWidth - PAGE_MARGIN_MM * 2) / 3
  sheet.fields.forEach((field, index) => {
    const x = PAGE_MARGIN_MM + (index % 3) * fieldWidth
    const y = cursorY + Math.floor(index / 3) * 9
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.text(field.label.toUpperCase(), x, y + 2)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(field.value, x, y + 6.5, { maxWidth: fieldWidth - 4 })
  })
  cursorY += Math.ceil(sheet.fields.length / 3) * 9

  if (sheet.routeCities !== '') {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const lines = packCitiesIntoLines({
      cities: sheet.routeCities.split(ROUTE_SEPARATOR),
      maxWidth: pageWidth - PAGE_MARGIN_MM * 2,
      measure: (text) => doc.getTextWidth(text),
    })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.text(labels.routeCities.toUpperCase(), PAGE_MARGIN_MM, cursorY + 2)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text([...lines], PAGE_MARGIN_MM, cursorY + 6.5)
    cursorY += 6.5 + lines.length * 4
  }
  cursorY += 3

  autoTable(doc, {
    body: sheet.rows.map((row) => [...row]),
    columnStyles: {
      0: { cellWidth: COLUMN_WIDTHS_MM[0], halign: 'center' },
      1: { cellWidth: COLUMN_WIDTHS_MM[1], halign: 'center' },
      2: { cellWidth: COLUMN_WIDTHS_MM[2], halign: 'center' },
      3: { halign: 'left' },
      4: { cellWidth: COLUMN_WIDTHS_MM[4], halign: 'left' },
      5: { cellWidth: COLUMN_WIDTHS_MM[5] },
      6: { cellWidth: COLUMN_WIDTHS_MM[6] },
      7: { cellWidth: COLUMN_WIDTHS_MM[7], halign: 'center' },
      8: { cellWidth: COLUMN_WIDTHS_MM[8], halign: 'right' },
    },
    foot: [
      [
        { colSpan: 7, content: sheet.totalsRow[0] ?? '', styles: { halign: 'right' } },
        { content: sheet.totalsRow[1] ?? '', styles: { halign: 'center' } },
        { content: sheet.totalsRow[2] ?? '', styles: { halign: 'right' } },
      ],
    ],
    footStyles: { fillColor: HEADER_FILL, fontStyle: 'bold', textColor: 0 },
    head: [[...sheet.columns].map((column) => column.toUpperCase())],
    headStyles: { fillColor: HEADER_FILL, fontSize: 7, halign: 'center', textColor: 0 },
    margin: { left: PAGE_MARGIN_MM, right: PAGE_MARGIN_MM },
    showFoot: 'lastPage',
    startY: cursorY,
    styles: {
      cellPadding: 1.6,
      fontSize: 8,
      lineColor: 0,
      lineWidth: 0.2,
      minCellHeight: 8,
      textColor: 0,
    },
    alternateRowStyles: { fillColor: ZEBRA_FILL },
    theme: 'grid',
  })

  const tableEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const signatureY = Math.min(tableEnd + 18, doc.internal.pageSize.getHeight() - 14)
  const usable = pageWidth - PAGE_MARGIN_MM * 2
  const gap = 12
  const widths = [usable * 0.4, usable * 0.4, usable * 0.2].map((width) => width - gap)
  const captions = [labels.driverSignature, labels.checkedBy, labels.date]
  let x = PAGE_MARGIN_MM

  doc.setLineWidth(0.3)
  doc.setFontSize(8)
  captions.forEach((caption, index) => {
    const width = widths[index] ?? 0
    doc.line(x, signatureY, x + width, signatureY)
    doc.text(caption, x + width / 2, signatureY + 4, { align: 'center' })
    x += width + gap
  })

  return doc.output('blob')
}
