/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O CCMEI real não está versionado — ele imprime CPF, RG e endereço residencial do empresário, e a
 * § Privacidade da 048 recusa PII no repositório. O que se gera aqui é um PDF **de verdade**, com
 * camada de texto de verdade: prova bytes → fragmento → geometria → campo.
 *
 * O que ele **não** prova é que o layout do gov.br é este. Isso é conferência manual contra uma
 * amostra real, e o mapa de rótulos que ela produziu está escrito na spec.
 */
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs'

import {
  readPdfTextLayer,
  type PdfGetDocument,
  type PdfPageText,
} from '@adatechnology/document-intake'

export type PdfTextPlacement = Readonly<{
  size?: number
  text: string
  x: number
  y: number
}>

const PAGE_WIDTH_POINTS = 595
const PAGE_HEIGHT_POINTS = 842
const DEFAULT_FONT_SIZE = 8

/** O build `legacy/` é obrigatório fora do navegador: o normal quebra em Node com `DOMMatrix`. */
export const getLegacyDocument = pdfjsLegacy.getDocument as unknown as PdfGetDocument

/** Parênteses e barra invertida são sintaxe de string no PDF: escapá-los é o mínimo. */
function escapePdfText(text: string): string {
  return text.replace(/([\\()])/gu, '\\$1')
}

/**
 * O PDF sem `/Encoding` lê a string em WinAnsi, um byte por caractere. `TextEncoder` produziria
 * UTF-8 e o `Ç` de "CONDIÇÃO" chegaria como dois caracteres estranhos — o título não casaria, e o
 * teste passaria a medir o encoding em vez da geometria.
 */
function toLatin1Bytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1)
    bytes[index] = value.charCodeAt(index) & 0xff

  return bytes
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

const VALUE_OFFSET_POINTS = 14

/** Rótulo em cima, valor logo abaixo e alinhado à esquerda dele — é o que o CCMEI imprime. */
export function buildLabelledColumns(
  columns: readonly Readonly<{ label: string; value: string; x: number; y: number }>[],
): readonly PdfTextPlacement[] {
  return columns.flatMap((column) => [
    { text: column.label, x: column.x, y: column.y },
    { text: column.value, x: column.x + 2, y: column.y - VALUE_OFFSET_POINTS },
  ])
}

/** O título do CCMEI é impresso em duas linhas — é assim na amostra real. */
export const CCMEI_TITLE_PLACEMENTS: readonly PdfTextPlacement[] = [
  { size: 14, text: 'Certificado da Condição de', x: 60, y: 790 },
  { size: 14, text: 'Microempreendedor Individual', x: 60, y: 770 },
]

export async function readSyntheticPage(bytes: Uint8Array): Promise<PdfPageText> {
  return readPdfTextLayer({ data: bytes, getDocument: getLegacyDocument })
}

/** O CCMEI de referência: título em duas linhas e os rótulos que a amostra real imprime. */
export function buildCcmeiPdf(overrides: Readonly<Record<string, string>> = {}): Uint8Array {
  const printed: Readonly<Record<string, string>> = {
    Bairro: 'CENTRO',
    CEP: '01001-000',
    CNPJ: '30.213.061/0001-06',
    'Data de Início de Atividades': '11/04/2019',
    Logradouro: 'PRACA DA SE',
    Município: 'SAO PAULO',
    'Nome Empresarial': 'MARIA DE SOUSA 11144477735',
    'Nome Fantasia': 'SOUSA TRANSPORTES',
    Número: '100',
    'Situação Cadastral Vigente': 'ATIVA',
    UF: 'SP',
    ...overrides,
  }

  const columns = Object.entries(printed).map(([label, value], index) => ({
    label,
    value,
    x: 60 + (index % 3) * 170,
    y: 700 - Math.floor(index / 3) * 40,
  }))

  return buildTextPdf([...CCMEI_TITLE_PLACEMENTS, ...buildLabelledColumns(columns)])
}

const CRLV_TITLE_PLACEMENT: PdfTextPlacement = {
  size: 12,
  text: 'CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEÍCULO',
  x: 90,
  y: 800,
}

/** O CRLV de referência da spec 048, com o rodapé da CDT que contém a palavra "CNH". */
export function buildCrlvPdf(overrides: Readonly<Record<string, string>> = {}): Uint8Array {
  const printed: Readonly<Record<string, string>> = {
    'ANO MODELO': '2021',
    CARROCERIA: 'FURGAO',
    'CODIGO RENAVAM': '00123456789',
    COMBUSTIVEL: 'ALCOOL/GASOLINA',
    'COR PREDOMINANTE': 'BRANCA',
    'CPF / CNPJ': '111.444.777-35',
    EIXOS: '2',
    'MARCA / MODELO / VERSAO': 'FIAT/FIORINO ENDURANCE 1.4',
    'MUNICIPIO / UF': 'SAO PAULO / SP',
    NOME: 'MARIA DE SOUSA',
    PLACA: 'GCQ8E47',
    ...overrides,
  }

  const columns = Object.entries(printed).map(([label, value], index) => ({
    label,
    value,
    x: 60 + (index % 3) * 170,
    y: 700 - Math.floor(index / 3) * 40,
  }))

  return buildTextPdf([
    CRLV_TITLE_PLACEMENT,
    ...buildLabelledColumns(columns),
    { text: 'você tem acesso ao CRLV, à CNH e ainda ganha desconto de 40%', x: 60, y: 90 },
  ])
}
