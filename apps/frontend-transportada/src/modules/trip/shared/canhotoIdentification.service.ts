/* Copyright (c) 2026 Ada Technology. MIT License. */
import { decodeBarcodeFrame, type BarcodeFrame } from '@/components/ui/barcodeDecoder.service'

import { tripDocumentLabel } from './tripDocument.service'

/**
 * ADR-0067 §4 (spec 156 D6): a foto do canhoto **sugere** a nota, nunca decide sozinha — quem
 * grava é a pessoa, confirmando o passo do assistente. Esta função é só a classificação; nenhuma
 * chamada de rede, nenhuma gravação.
 *
 * A chave impressa no código de barras da DANFE é Code 128, sempre numérica (o gerador do próprio
 * produto, `code128.service.ts`, também assume subconjunto C) — diferente do texto/QR que
 * `nfeAccessKey.service.ts` extrai, onde o CNPJ do emitente pode ter letra (IN RFB 2229/2024). Por
 * isso a validação aqui exige 44 dígitos, não o padrão alfanumérico daquele módulo.
 */
const ACCESS_KEY_DIGITS_PATTERN = /^\d{44}$/u
const ACCESS_KEY_CHECK_DIGIT_INDEX = 43
const ACCESS_KEY_MODEL_RANGE = [20, 22] as const
const ACCESS_KEY_SERIES_RANGE = [22, 25] as const
const ACCESS_KEY_NUMBER_RANGE = [25, 34] as const
const NFE_MODEL = '55'
const ZERO_CHAR_CODE = '0'.charCodeAt(0)
const CHECK_DIGIT_WEIGHT_MIN = 2
const CHECK_DIGIT_WEIGHT_MAX = 9

function charValue(character: string): number {
  return character.charCodeAt(0) - ZERO_CHAR_CODE
}

/**
 * Módulo 11 com pesos 2→9 ciclando da direita para a esquerda (Anexo II da NT da NF-e) — o mesmo
 * cálculo do `fiscal-provider`, reescrito aqui porque o bundle do frontend não carrega o pacote
 * (mesma razão do `nfeAccessKey.service.ts`).
 */
function computeAccessKeyCheckDigit(base: string): string {
  let sum = 0
  let weight = CHECK_DIGIT_WEIGHT_MIN
  for (let index = base.length - 1; index >= 0; index -= 1) {
    sum += charValue(base[index] as string) * weight
    weight = weight === CHECK_DIGIT_WEIGHT_MAX ? CHECK_DIGIT_WEIGHT_MIN : weight + 1
  }
  const remainder = sum % 11
  return remainder < 2 ? '0' : String(11 - remainder)
}

export type ParsedNfeAccessKey = Readonly<{ number: string; series: string }>

/** `undefined` cobre os três jeitos de recusar: tamanho, dígito verificador e modelo. */
export function parseNfeAccessKeyFromBarcode(candidate: string): ParsedNfeAccessKey | undefined {
  if (!ACCESS_KEY_DIGITS_PATTERN.test(candidate)) return undefined
  const base = candidate.slice(0, ACCESS_KEY_CHECK_DIGIT_INDEX)
  if (computeAccessKeyCheckDigit(base) !== candidate.slice(ACCESS_KEY_CHECK_DIGIT_INDEX)) {
    return undefined
  }
  const [modelStart, modelEnd] = ACCESS_KEY_MODEL_RANGE
  if (candidate.slice(modelStart, modelEnd) !== NFE_MODEL) return undefined

  const [seriesStart, seriesEnd] = ACCESS_KEY_SERIES_RANGE
  const [numberStart, numberEnd] = ACCESS_KEY_NUMBER_RANGE
  return {
    number: String(Number(candidate.slice(numberStart, numberEnd))),
    series: String(Number(candidate.slice(seriesStart, seriesEnd))),
  }
}

/** Nota da viagem só com o que a classificação precisa — nunca o `TripDocumentDetail` inteiro. */
export type CanhotoTripDocument = Readonly<{
  /**
   * A chave inteira, quando quem monta a lista a tem. Número e série não bastam: dois emitentes
   * numeram cada um a sua série, e a mesma viagem pode levar `77777/1` de dois fornecedores.
   */
  accessKey?: null | string
  id: string
  nfeNumber?: null | string
  nfeSeries?: null | string
  /**
   * Spec 156 T14, ADR-0069 §3 (R4): só o casamento por OCR usa este campo (unicidade sem as notas
   * liberadas) — a classificação por código de barras, abaixo, não o lê.
   */
  releasedAt?: null | string
}>

function normalizeDigits(value: null | string | undefined): string {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? '' : String(Number(trimmed))
}

type AccessKeyLookup =
  | Readonly<{ document: CanhotoTripDocument; kind: 'found' }>
  | Readonly<{ kind: 'ambiguous' }>
  | Readonly<{ kind: 'absent' }>

/**
 * A chave inteira decide quando a nota a traz. Sem ela, número e série só identificam se houver
 * **uma** candidata — nota que traz outra chave já está descartada, e mais de uma candidata é
 * leitura inconclusiva, nunca a primeira da lista.
 */
function findDocumentByAccessKey(
  documents: readonly CanhotoTripDocument[],
  input: Readonly<{ accessKey: string; parsed: ParsedNfeAccessKey }>,
): AccessKeyLookup {
  const byKey = documents.find((document) => document.accessKey === input.accessKey)
  if (byKey !== undefined) return { document: byKey, kind: 'found' }

  const candidates = documents.filter(
    (document) =>
      (document.accessKey ?? '') === '' &&
      normalizeDigits(document.nfeNumber) === input.parsed.number &&
      normalizeDigits(document.nfeSeries) === input.parsed.series,
  )
  const [only] = candidates
  if (only === undefined) return { kind: 'absent' }
  return candidates.length === 1 ? { document: only, kind: 'found' } : { kind: 'ambiguous' }
}

/** Mesmo rótulo "número/série" da listagem (`tripDocumentLabel`) — a nota fora da viagem não tem
 * `TripDocumentDetail`, só o que a chave revelou. */
function formatAccessKeyLabel(parsed: ParsedNfeAccessKey): string {
  return tripDocumentLabel({
    freightCalculationId: null,
    id: '',
    nfeDocumentId: null,
    nfeNumber: parsed.number,
    nfeSeries: parsed.series,
  })
}

export type CanhotoIdentificationResult =
  | Readonly<{ documentId: string; status: 'matched' }>
  | Readonly<{ documentId: string; status: 'otherSelected' }>
  /**
   * Decisão registrada (spec 156 T10, sem pendência aberta): a troca só é oferecida **dentro da
   * seleção** (`otherSelected`). Nota que é da viagem mas ficou fora do lote marcado é bloqueada
   * com mensagem própria — incluir a nota na seleção sozinha, a partir de uma foto, seria o
   * assistente decidindo o lote por conta própria, o que a ADR-0067 §4 proíbe.
   */
  | Readonly<{ documentId: string; status: 'onTripNotSelected' }>
  | Readonly<{ documentLabel: string; status: 'notOnTrip' }>
  | Readonly<{ status: 'unreadable' }>

export type ClassifyCanhotoDocumentParams = Readonly<{
  expectedDocumentId: string
  selectedDocumentIds: readonly string[]
  text: string | null
  tripDocuments: readonly CanhotoTripDocument[]
}>

/** Pura: recebe o texto já decodificado, nunca chama a câmera nem o zxing. Testável sem imagem. */
export function classifyCanhotoDocument({
  expectedDocumentId,
  selectedDocumentIds,
  text,
  tripDocuments,
}: ClassifyCanhotoDocumentParams): CanhotoIdentificationResult {
  const candidate = text?.trim() ?? ''
  const parsed = candidate === '' ? undefined : parseNfeAccessKeyFromBarcode(candidate)
  if (parsed === undefined) return { status: 'unreadable' }

  const lookup = findDocumentByAccessKey(tripDocuments, { accessKey: candidate, parsed })
  if (lookup.kind === 'ambiguous') return { status: 'unreadable' }
  if (lookup.kind === 'absent') {
    return { documentLabel: formatAccessKeyLabel(parsed), status: 'notOnTrip' }
  }
  const document = lookup.document
  if (document.id === expectedDocumentId) return { documentId: document.id, status: 'matched' }
  if (selectedDocumentIds.includes(document.id)) {
    return { documentId: document.id, status: 'otherSelected' }
  }
  return { documentId: document.id, status: 'onTripNotSelected' }
}

export type IdentifyCanhotoFrameParams = Readonly<{
  expectedDocumentId: string
  frame: BarcodeFrame
  selectedDocumentIds: readonly string[]
  tripDocuments: readonly CanhotoTripDocument[]
}>

/** Decodifica o quadro e delega a classificação — a decodificação fica isolada aqui para o
 * contrato de cima poder rodar sem `BarcodeFrame` nenhum. */
export function identifyCanhotoFromFrame({
  expectedDocumentId,
  frame,
  selectedDocumentIds,
  tripDocuments,
}: IdentifyCanhotoFrameParams): CanhotoIdentificationResult {
  return classifyCanhotoDocument({
    expectedDocumentId,
    selectedDocumentIds,
    text: decodeBarcodeFrame(frame),
    tripDocuments,
  })
}
