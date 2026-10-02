/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Cópia por valor** da régua de `apps/frontend-transportada/src/modules/trip/shared/
 * canhotoIdentification.service.ts` (formato, dígito verificador módulo 11, modelo 55 e casamento
 * com as notas da viagem). As apps não importam código uma da outra, e a leitura do worker tem de
 * concordar com a do navegador — foto que o navegador identifica e o worker não (ou o contrário) é
 * exatamente o defeito que a spec 222 não pode ter. `test/canhoto-read/barcode-policy.contract.ts`
 * usa as mesmas chaves do contrato do frontend para denunciar a divergência.
 *
 * O que muda é só a saída: o navegador classifica contra a nota da tela; o worker **não decide**
 * (RF-B4) e devolve o que viu — o veredito é de `resolveAutomaticCanhotoReview`, na API.
 */
import { CANHOTO_BARCODE_READ_SOURCE } from './canhoto-read.constant.js'

const ACCESS_KEY_PATTERN = /^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$/u
const ACCESS_KEY_CHECK_DIGIT_INDEX = 43
const ACCESS_KEY_MODEL_RANGE = [20, 22] as const
const ACCESS_KEY_SERIES_RANGE = [22, 25] as const
const ACCESS_KEY_NUMBER_RANGE = [25, 34] as const
const NFE_MODEL = '55'
const ZERO_CHAR_CODE = '0'.charCodeAt(0)
const CHECK_DIGIT_WEIGHT_MIN = 2
const CHECK_DIGIT_WEIGHT_MAX = 9
const CHECK_DIGIT_MODULUS = 11

/** NT 2024.002: o valor do caractere é o código ASCII menos o de `'0'` — letra maiúscula vale 17–42. */
function charValue(character: string): number {
  return character.charCodeAt(0) - ZERO_CHAR_CODE
}

function computeAccessKeyCheckDigit(base: string): string {
  let sum = 0
  let weight = CHECK_DIGIT_WEIGHT_MIN
  for (let index = base.length - 1; index >= 0; index -= 1) {
    sum += charValue(base[index] as string) * weight
    weight = weight === CHECK_DIGIT_WEIGHT_MAX ? CHECK_DIGIT_WEIGHT_MIN : weight + 1
  }
  const remainder = sum % CHECK_DIGIT_MODULUS
  return remainder < 2 ? '0' : String(CHECK_DIGIT_MODULUS - remainder)
}

export type ParsedNfeAccessKey = Readonly<{ number: string; series: string }>

/** `undefined` cobre os três jeitos de recusar: tamanho, dígito verificador e modelo. */
export function parseNfeAccessKeyFromBarcode(candidate: string): ParsedNfeAccessKey | undefined {
  if (!ACCESS_KEY_PATTERN.test(candidate)) return undefined
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

/** Nota da viagem só com o que o casamento precisa. `id` é o de `trip_documents`, o que a rota espera. */
export type CanhotoTripDocument = Readonly<{
  accessKey: null | string
  id: string
  nfeNumber: null | string
  nfeSeries: null | string
  releasedAt: Date | null
}>

function normalizeDigits(value: null | string): string {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? '' : String(Number(trimmed))
}

/**
 * A chave inteira decide quando a nota a traz. Sem ela, número e série só identificam se houver
 * **uma** candidata — nota que traz outra chave já está descartada, nota liberada não conta, e mais
 * de uma candidata é inconclusiva, nunca a primeira da lista.
 */
function findTripDocument(
  documents: readonly CanhotoTripDocument[],
  input: Readonly<{ accessKey: string; parsed: ParsedNfeAccessKey }>,
): CanhotoTripDocument | undefined {
  const byKey = documents.find((document) => document.accessKey === input.accessKey)
  if (byKey !== undefined) return byKey

  const candidates = documents.filter(
    (document) =>
      (document.accessKey ?? '') === '' &&
      document.releasedAt === null &&
      normalizeDigits(document.nfeNumber) === input.parsed.number &&
      normalizeDigits(document.nfeSeries) === input.parsed.series,
  )
  const [only] = candidates
  return candidates.length === 1 ? only : undefined
}

/**
 * O que o worker reporta à rota do robô. `unusable` não vira chamada nenhuma: a máquina terminou de
 * ler e não achou código utilizável, e isso só se registra como a tentativa (RF-B9).
 */
export type CanhotoBarcodeIdentification =
  | Readonly<{ kind: 'unusable' }>
  | Readonly<{
      kind: 'read'
      readDocumentId: null | string
      readNumber: string
      readSeries: string
      readSource: typeof CANHOTO_BARCODE_READ_SOURCE
    }>

export type IdentifyCanhotoBarcodeParams = Readonly<{
  text: null | string
  tripDocuments: readonly CanhotoTripDocument[]
}>

/**
 * Pura: recebe o texto já decodificado. Número e série lidos sobem mesmo quando nenhuma nota casa —
 * é o "pendente **com** o número lido" (CA10); quem diz que não casa é o servidor.
 */
export function identifyCanhotoBarcode({
  text,
  tripDocuments,
}: IdentifyCanhotoBarcodeParams): CanhotoBarcodeIdentification {
  const candidate = text?.trim() ?? ''
  const parsed = candidate === '' ? undefined : parseNfeAccessKeyFromBarcode(candidate)
  if (parsed === undefined) return { kind: 'unusable' }

  const document = findTripDocument(tripDocuments, { accessKey: candidate, parsed })
  return {
    kind: 'read',
    readDocumentId: document?.id ?? null,
    readNumber: parsed.number,
    readSeries: parsed.series,
    readSource: CANHOTO_BARCODE_READ_SOURCE,
  }
}
