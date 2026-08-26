/* Copyright (c) 2026 Ada Technology. MIT License. */
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs'

import type { PdfGetDocument } from '@/modules/document-intake/shared/pdfTextLayer.service'

/**
 * O CRLV-e real não está versionado — é documento de veículo com CPF de proprietário impresso, e a
 * § Privacidade da spec 048 recusa PII no repositório. O que se gera aqui é um PDF **de verdade**,
 * com camada de texto de verdade, lido pelo pdf.js de verdade: prova bytes → fragmento → geometria →
 * campo. O que ele não prova é que o layout do Detran é este — isso é conferência manual, e está
 * escrito no `evidence.md`.
 *
 * O build `legacy/` é obrigatório fora do navegador: o normal quebra em Node com
 * `DOMMatrix is not defined`.
 */
export const getLegacyDocument = pdfjsLegacy.getDocument as unknown as PdfGetDocument

export type PdfTextPlacement = Readonly<{
  size?: number
  text: string
  x: number
  y: number
}>

const PAGE_WIDTH_POINTS = 595
const PAGE_HEIGHT_POINTS = 842
const DEFAULT_FONT_SIZE = 8

/** Parênteses e barra invertida são sintaxe de string no PDF: escapá-los é o mínimo. */
function escapePdfText(text: string): string {
  return text.replace(/([\\()])/gu, '\\$1')
}

export function buildTextPdf(placements: readonly PdfTextPlacement[]): Uint8Array {
  const content = placements
    .map(
      (placement) =>
        `BT /F1 ${placement.size ?? DEFAULT_FONT_SIZE} Tf 1 0 0 1 ${placement.x} ${placement.y} Tm (${escapePdfText(placement.text)}) Tj ET`,
    )
    .join('\n')

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH_POINTS} ${PAGE_HEIGHT_POINTS}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    // Sem `/WinAnsiEncoding` o byte 0xCD é o `˝` da StandardEncoding, e o `Í` de VEÍCULO some.
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })

  const crossReferenceStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceStart}\n%%EOF\n`

  return toLatin1Bytes(pdf)
}

/**
 * O PDF sem `/Encoding` lê a string em WinAnsi, um byte por caractere. `TextEncoder` produziria UTF-8
 * e o `Í` de "VEÍCULO" chegaria como dois caracteres estranhos — o título não casaria, e o teste
 * passaria a medir o encoding em vez da geometria.
 */
function toLatin1Bytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff
  }

  return bytes
}

const LABEL_ROW_Y = 700
const VALUE_OFFSET_POINTS = 14

/** Rótulo em cima, valor logo abaixo e alinhado à esquerda dele: é o que a medição descreve. */
export function buildLabelledColumns(
  columns: readonly Readonly<{ label: string; value: string; x: number; y?: number }>[],
): readonly PdfTextPlacement[] {
  return columns.flatMap((column) => {
    const y = column.y ?? LABEL_ROW_Y
    return [
      { text: column.label, x: column.x, y },
      { text: column.value, x: column.x + 2, y: y - VALUE_OFFSET_POINTS },
    ]
  })
}

export const CRLV_TITLE_PLACEMENT: PdfTextPlacement = {
  size: 12,
  text: 'CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEÍCULO',
  x: 90,
  y: 800,
}

/**
 * O rodapé promocional da Carteira Digital de Trânsito, que **contém a palavra CNH** — é ele que faz
 * um classificador por palavra solta chamar todo CRLV de habilitação.
 */
export const CDT_FOOTER_PLACEMENT: PdfTextPlacement = {
  text: 'você tem acesso ao CRLV, à CNH e ainda ganha desconto de 40% nas infrações',
  x: 60,
  y: 90,
}
