/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Extração por heurística sobre texto de OCR genérico (Tesseract self-hosted, sem leitor de CNH
 * dedicado) — não é leitura oficial de documento, é melhor palpite. Toda saída daqui é sugestão:
 * o campo pré-preenche o formulário, o agregado confirma ou corrige; a aprovação automática só
 * acontece quando a confiança é alta (ver `scoreAggregateDocumentMatch`), e mesmo assim o operador
 * revisa a fila normalmente — isto nunca é a única porta de entrada.
 */
import { LICENSE_CATEGORIES, type LicenseCategory } from '../../shared/license-category.constant.js'

const LICENSE_NUMBER_PATTERN = /\b\d{11}\b/
const PLATE_PATTERN = /\b[A-Z]{3}[ -]?\d[A-Z0-9]\d{2}\b/
const RENAVAM_PATTERN = /\b\d{9,11}\b/
/** Só o resto da MESMA linha do rótulo — sem isso, "NOME" engole a linha seguinte inteira. */
const NAME_LABEL_PATTERN = /nome\s*[:]?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s]{2,60})/i
const CATEGORY_LABEL_PATTERN = /cat(?:egoria)?[.\s]*(?:hab[.\s]*)?[:\s]+([A-E]{1,2})\b/i

export type ExtractedCnhFields = Readonly<{
  licenseCategory: LicenseCategory | null
  licenseNumber: string | null
  name: string | null
}>

export type ExtractedCrlvFields = Readonly<{
  plate: string | null
  renavam: string | null
}>

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ')
}

/** Só a mesma linha do rótulo "NOME" — engolir a próxima linha inteira seria pior que não achar nada. */
function extractNameFromLine(rawText: string): string | null {
  const line = rawText.split('\n').find((candidate) => NAME_LABEL_PATTERN.test(candidate))
  if (line === undefined) return null
  const match = line.match(NAME_LABEL_PATTERN)
  return match?.[1] ? toTitleCase(normalizeWhitespace(match[1]).trim()) : null
}

export function extractCnhFields(rawText: string): ExtractedCnhFields {
  const name = extractNameFromLine(rawText)
  const text = normalizeWhitespace(rawText)

  const categoryMatch = text.match(CATEGORY_LABEL_PATTERN)
  const category = categoryMatch?.[1]?.toUpperCase() ?? null
  const licenseCategory = isLicenseCategory(category) ? category : null

  const licenseNumberMatch = text.match(LICENSE_NUMBER_PATTERN)
  const licenseNumber = licenseNumberMatch?.[0] ?? null

  return { licenseCategory, licenseNumber, name }
}

export function extractCrlvFields(rawText: string): ExtractedCrlvFields {
  const text = normalizeWhitespace(rawText).toUpperCase()

  const plateMatch = text.match(PLATE_PATTERN)
  const plate = plateMatch?.[0].replace(/[ -]/g, '') ?? null

  const renavamMatch = text.match(RENAVAM_PATTERN)
  const renavam = renavamMatch?.[0] ?? null

  return { plate, renavam }
}

function isLicenseCategory(value: string | null): value is LicenseCategory {
  return value !== null && (LICENSE_CATEGORIES as readonly string[]).includes(value)
}

export type AggregateDocumentMatchOutcome = Readonly<{
  confidence: 'high' | 'low' | 'none'
  matchedFieldCount: number
}>

const HIGH_CONFIDENCE_MATCHES = 2

/**
 * Conta quantos campos declarados o OCR confirmou — não pesa "quão parecido", só bate exato depois
 * de normalizar. `high` (2+ campos batendo) libera aprovação automática; qualquer coisa abaixo
 * disso cai na fila manual, nunca reprova sozinho (falso negativo de OCR não pode virar recusa).
 */
export function scoreAggregateDocumentMatch(input: {
  readonly declared: readonly (string | null)[]
  readonly extracted: readonly (string | null)[]
}): AggregateDocumentMatchOutcome {
  let matchedFieldCount = 0
  for (let index = 0; index < input.declared.length; index += 1) {
    const declaredValue = normalizeForCompare(input.declared[index])
    const extractedValue = normalizeForCompare(input.extracted[index])
    if (declaredValue !== null && declaredValue === extractedValue) matchedFieldCount += 1
  }

  const confidence: AggregateDocumentMatchOutcome['confidence'] =
    matchedFieldCount >= HIGH_CONFIDENCE_MATCHES ? 'high' : matchedFieldCount > 0 ? 'low' : 'none'
  return { confidence, matchedFieldCount }
}

function normalizeForCompare(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const normalized = value.trim().toUpperCase().replace(/\s+/g, ' ')
  return normalized.length === 0 ? null : normalized
}

/**
 * A divergência é o que o operador precisa ver antes de aprovar: onde o documento diz uma coisa e a
 * ficha diz outra. Campo que a leitura não achou **não** é divergência — é ausência, e acusar
 * ausência como conflito faria o operador desconfiar de documento correto. O mesmo vale para o
 * campo que a pessoa não declarou: não há o que conferir.
 */
export function listAggregateDocumentDivergences(input: {
  readonly declared: Readonly<Record<string, string | null>>
  readonly extracted: Readonly<Record<string, string | null | undefined>>
}): readonly Readonly<{ declared: string; extracted: string; field: string }>[] {
  const divergences: Array<{ declared: string; extracted: string; field: string }> = []

  for (const field of Object.keys(input.extracted)) {
    const extracted = normalizeForCompare(input.extracted[field] ?? null)
    const declared = normalizeForCompare(input.declared[field] ?? null)
    if (extracted === null || declared === null) continue
    if (extracted === declared) continue
    divergences.push({
      declared: input.declared[field] ?? '',
      extracted: input.extracted[field] ?? '',
      field,
    })
  }

  return divergences
}
