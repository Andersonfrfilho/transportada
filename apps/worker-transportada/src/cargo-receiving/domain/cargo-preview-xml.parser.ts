/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.1 (ADR-0094 §7): as partes XML da planilha. `DOCTYPE` é recusado antes do parse — o
 * OOXML não usa, e é por ele que entra a expansão de entidade.
 */
import { XMLParser } from 'fast-xml-parser'

import {
  SHARED_STRINGS_RELATIONSHIP_SUFFIX,
  WORKBOOK_BASE_PATH,
  WORKSHEET_RELATIONSHIP_SUFFIX,
} from './cargo-preview-workbook.constant.js'
import { CargoPreviewWorkbookError } from './cargo-preview-workbook.error.js'
import { normalizePreviewColumnName } from './preview-column-name.policy.js'

type XmlRecord = Readonly<Record<string, unknown>>

const REPEATED_TAGS = new Set(['c', 'r', 'Relationship', 'sheet', 'si'])
const DOCTYPE_PATTERN = /<!(?:DOCTYPE|ENTITY)/iu
/** Contado antes do parse, com ou sem prefixo de namespace (`<x:si>`), para não montar o que se recusa. */
const SHARED_STRING_TAG = /<(?:[\w.-]+:)?si[\s>/]/gu
const UTF8 = new TextDecoder('utf-8')

/** `parseTagValue: false`: `1780.62` convertido para float binário perderia o centavo. */
const xmlParser = new XMLParser({
  attributeNamePrefix: '@',
  htmlEntities: true,
  ignoreAttributes: false,
  isArray: (tag) => REPEATED_TAGS.has(tag),
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: true,
  removeNSPrefix: true,
  trimValues: false,
})

export function asRecord(value: unknown): XmlRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as XmlRecord)
    : undefined
}

export function asList(value: unknown): readonly unknown[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

export function readNodeText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  const text = asRecord(node)?.['#text']
  return typeof text === 'string' || typeof text === 'number' ? String(text) : ''
}

/** Texto de `<si>` ou `<is>`: `<t>` direto, ou a soma dos `<r><t>` (texto rico). */
export function readRichText(node: unknown): string {
  const record = asRecord(node)
  if (record === undefined) return readNodeText(node)
  if (record['t'] !== undefined) return readNodeText(record['t'])
  return asList(record['r'])
    .map((run) => readNodeText(asRecord(run)?.['t']))
    .join('')
}

export function decodeXmlPart(bytes: Uint8Array): string {
  const text = UTF8.decode(bytes)
  if (DOCTYPE_PATTERN.test(text)) throw new CargoPreviewWorkbookError('PREVIEW_NOT_A_WORKBOOK')
  return text
}

export function parseXmlPart(text: string): XmlRecord {
  try {
    return asRecord(xmlParser.parse(text)) ?? {}
  } catch {
    throw new CargoPreviewWorkbookError('PREVIEW_NOT_A_WORKBOOK')
  }
}

export function readSharedStrings(input: {
  readonly maxCellLength: number
  readonly maxStrings: number
  readonly xml: string
}): readonly string[] {
  if ((input.xml.match(SHARED_STRING_TAG)?.length ?? 0) > input.maxStrings) {
    throw new CargoPreviewWorkbookError('PREVIEW_TOO_MANY_STRINGS')
  }
  const items = asList(asRecord(parseXmlPart(input.xml)['sst'])?.['si'])
  return items.map((item) => {
    const text = readRichText(item)
    if (text.length > input.maxCellLength)
      throw new CargoPreviewWorkbookError('PREVIEW_CELL_TOO_LONG')
    return text
  })
}

function resolveTarget(target: string): string {
  if (target.split('/').includes('..'))
    throw new CargoPreviewWorkbookError('PREVIEW_NOT_A_WORKBOOK')
  return target.startsWith('/') ? target.slice(1) : `${WORKBOOK_BASE_PATH}${target}`
}

function readRelationships(relsXml: string): readonly XmlRecord[] {
  const relationships = asRecord(parseXmlPart(relsXml)['Relationships'])?.['Relationship']
  return asList(relationships).flatMap((item) => {
    const record = asRecord(item)
    return record === undefined ? [] : [record]
  })
}

function findSheetRelationshipId(input: { sheetName: string | null; workbookXml: string }): string {
  const sheets = asList(
    asRecord(asRecord(parseXmlPart(input.workbookXml)['workbook'])?.['sheets'])?.['sheet'],
  )
  const wanted = input.sheetName === null ? undefined : normalizePreviewColumnName(input.sheetName)
  const sheet = sheets
    .map((item) => asRecord(item))
    .find(
      (item) =>
        wanted === undefined ||
        normalizePreviewColumnName(String(item?.['@name'] ?? '')) === wanted,
    )
  const relationshipId = sheet?.['@id']
  if (typeof relationshipId !== 'string')
    throw new CargoPreviewWorkbookError('PREVIEW_SHEET_NOT_FOUND')
  return relationshipId
}

/** A aba (pelo nome do perfil, ou a primeira) e as strings compartilhadas, pelos relacionamentos. */
export function resolveWorkbookParts(input: {
  readonly relsXml: string
  readonly sheetName: string | null
  readonly workbookXml: string
}): { readonly sharedStringsEntry: string | undefined; readonly sheetEntry: string } {
  const relationshipId = findSheetRelationshipId(input)
  const relationships = readRelationships(input.relsXml)
  const sheet = relationships.find(
    (item) =>
      item['@Id'] === relationshipId &&
      String(item['@Type'] ?? '').endsWith(WORKSHEET_RELATIONSHIP_SUFFIX),
  )
  const sheetTarget = sheet?.['@Target']
  if (typeof sheetTarget !== 'string') throw new CargoPreviewWorkbookError('PREVIEW_NOT_A_WORKBOOK')
  const strings = relationships.find((item) =>
    String(item['@Type'] ?? '').endsWith(SHARED_STRINGS_RELATIONSHIP_SUFFIX),
  )?.['@Target']
  return {
    sharedStringsEntry: typeof strings === 'string' ? resolveTarget(strings) : undefined,
    sheetEntry: resolveTarget(sheetTarget),
  }
}
