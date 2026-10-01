/**
 * Spec 220 RF26/RNF02: o veredito automático do canhoto. Este arquivo não lê imagem nem decide
 * sozinho — ele junta o que o código de barras (`canhotoIdentification`) e o OCR (`canhotoOcr`)
 * acharam e produz o estado que a API vai gravar.
 *
 * Duas regras moram aqui porque o banco as impõe e uma violação só apareceria como 500:
 * `approved` exige `readSource === 'barcode'`, e `readNumber` e `readSource` existem juntos ou
 * não existem. Por isso uma nota casada sem número impresso **não aprova**: não haveria o que
 * gravar ao lado da origem.
 */
import {
  identifyCanhotoFromFrame,
  type CanhotoIdentificationResult,
} from '@/modules/trip/shared/canhotoIdentification.service'
import {
  identifyCanhotoNumber,
  type CanhotoOcrTripDocument,
  type IdentifyCanhotoNumberResult,
} from '@/modules/trip/shared/canhotoOcr.service'
import {
  raceAgainstTimeout,
  recognizeCanhotoWords,
  OCR_TIMEOUT,
} from '@/modules/trip/shared/canhotoOcrEngine.service'
import type { BarcodeFrame } from '@/components/ui/barcodeDecoder.service'

/** RNF02: a leitura do painel tem 20 s. Estourou, o canhoto vai para a fila humana. */
export const CANHOTO_REVIEW_TIMEOUT_MS = 20_000

export const CANHOTO_REVIEW_TIMED_OUT = Symbol('canhoto-review-timeout')

export type CanhotoReviewOutcome = Readonly<{
  readDocumentId: null | string
  readNumber: null | string
  readSeries: null | string
  readSource: 'barcode' | 'ocr' | null
  review: 'approved' | 'pending'
}>

/**
 * A lista que serve aos dois leitores: o OCR exige número e série, e o código de barras casa pela
 * chave — uma lista só de `CanhotoOcrTripDocument` nunca aprovaria, porque não carrega a chave.
 */
export type CanhotoReviewTripDocument = CanhotoOcrTripDocument &
  Readonly<{ accessKey?: null | string }>

export type ResolveCanhotoReviewOutcomeParams = Readonly<{
  identification: CanhotoIdentificationResult
  ocr?: IdentifyCanhotoNumberResult | typeof CANHOTO_REVIEW_TIMED_OUT
  tripDocuments: readonly CanhotoReviewTripDocument[]
}>

const PENDING_WITHOUT_READING: CanhotoReviewOutcome = {
  readDocumentId: null,
  readNumber: null,
  readSeries: null,
  readSource: null,
  review: 'pending',
}

function buildBarcodeOutcome(
  documentId: string,
  tripDocuments: readonly CanhotoReviewTripDocument[],
  review: CanhotoReviewOutcome['review'],
): CanhotoReviewOutcome {
  const document = tripDocuments.find((candidate) => candidate.id === documentId)
  if (document?.nfeNumber == null) return PENDING_WITHOUT_READING

  return {
    readDocumentId: documentId,
    readNumber: document.nfeNumber,
    readSeries: document.nfeSeries,
    readSource: 'barcode',
    review,
  }
}

function resolveOcrOutcome(ocr: ResolveCanhotoReviewOutcomeParams['ocr']): CanhotoReviewOutcome {
  if (ocr === undefined || ocr === CANHOTO_REVIEW_TIMED_OUT) return PENDING_WITHOUT_READING
  if (ocr.status === 'manual') return PENDING_WITHOUT_READING

  return {
    readDocumentId: ocr.documentId,
    readNumber: ocr.extraction.number,
    readSeries: ocr.extraction.series,
    readSource: 'ocr',
    review: 'pending',
  }
}

/** RF26: só o código de barras aprova. O OCR sugere, e quem decide é gente. */
export function resolveCanhotoReviewOutcome({
  identification,
  ocr,
  tripDocuments,
}: ResolveCanhotoReviewOutcomeParams): CanhotoReviewOutcome {
  if (identification.status === 'matched') {
    return buildBarcodeOutcome(identification.documentId, tripDocuments, 'approved')
  }
  if (identification.status === 'otherSelected' || identification.status === 'onTripNotSelected') {
    return buildBarcodeOutcome(identification.documentId, tripDocuments, 'pending')
  }
  if (identification.status === 'notOnTrip') return PENDING_WITHOUT_READING

  return resolveOcrOutcome(ocr)
}

type RecognizeWords = typeof recognizeCanhotoWords

export type ReviewCanhotoParams = Readonly<{
  canhotoOcrEnabled: boolean
  expectedDocumentId: string
  frame: BarcodeFrame
  image: Parameters<RecognizeWords>[0]
  recognizeWords?: RecognizeWords
  selectedDocumentIds: readonly string[]
  tripDocuments: readonly CanhotoReviewTripDocument[]
}>

/** Roda fora do caminho de render: o código de barras primeiro, o OCR só quando ele não leu. */
export async function reviewCanhoto({
  canhotoOcrEnabled,
  expectedDocumentId,
  frame,
  image,
  recognizeWords = recognizeCanhotoWords,
  selectedDocumentIds,
  tripDocuments,
}: ReviewCanhotoParams): Promise<CanhotoReviewOutcome> {
  const identification = identifyCanhotoFromFrame({
    expectedDocumentId,
    frame,
    selectedDocumentIds,
    tripDocuments,
  })
  if (identification.status !== 'unreadable' || !canhotoOcrEnabled) {
    return resolveCanhotoReviewOutcome({ identification, tripDocuments })
  }

  const words = await raceAgainstTimeout(
    Promise.resolve(recognizeWords(image)),
    CANHOTO_REVIEW_TIMEOUT_MS,
  )
  if (words === OCR_TIMEOUT) {
    return resolveCanhotoReviewOutcome({
      identification,
      ocr: CANHOTO_REVIEW_TIMED_OUT,
      tripDocuments,
    })
  }
  if (words === undefined) return resolveCanhotoReviewOutcome({ identification, tripDocuments })

  return resolveCanhotoReviewOutcome({
    identification,
    ocr: identifyCanhotoNumber({
      expectedDocumentId,
      selectedDocumentIds,
      tripDocuments,
      words,
    }),
    tripDocuments,
  })
}
