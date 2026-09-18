/**
 * ADR-0069 §3 (spec 156 T14): a leitura do número do canhoto por OCR é **atalho**, nunca decide
 * sozinha — a foto sugere, a pessoa confirma (ADR-0067 §4). Este módulo é só a extração e o
 * casamento, puros, sem tocar no motor do Tesseract: testável sem imagem nem worker.
 *
 * A leitura é do **texto inteiro**, sem whitelist (a sonda da ADR-0069 mostrou que a whitelist só
 * de dígitos cola o número na série); o que se aproveita é o token no formato impresso do DANFE
 * (`\d{3}\.\d{3}\.\d{3}`) logo depois do rótulo `Nº`/`N°`/`NO`/`NUMERO`, e os dígitos depois de
 * `SÉRIE`/`SERIE`.
 */

/** O que o Tesseract devolve por palavra (`words[].text`/`words[].confidence`, 0–100). */
export type CanhotoOcrWord = Readonly<{ confidence: number; text: string }>

export type CanhotoOcrExtraction = Readonly<{ number: string; series: string | null }>

const NUMBER_TOKEN_PATTERN = /^\d{3}\.\d{3}\.\d{3}$/u
/**
 * Baixos (T15): sem a flag `i` global — o `N` do rótulo é sempre exigido maiúsculo (o DANFE nunca
 * imprime o rótulo em minúsculo). Isso barra a preposição comum "no" sem barrar a leitura real do
 * OCR: `Nº` costuma sair do motor como `No` (`N` maiúsculo, `o` minúsculo, típico do jeito que o
 * glifo `º` é reconhecido) ou `NO` — as duas cobertas pelo grupo `(?i:O)`, cuja insensibilidade a
 * caixa vale só para essa letra, nunca para o `N` que a antecede.
 */
const NUMBER_LABEL_PATTERN = /^N[º°]\.?$|^N(?i:O)\.?$|^(?i:NUMERO)$|^N(?i:[ÚU]MERO)$/u
const SERIES_LABEL_PATTERN = /^S[ÉE]RIE:?$/iu
const SERIES_DIGITS_PATTERN = /^\d{1,3}$/u

/**
 * R2 — confiança por palavra. Limiar **provisório**: começa conservador (a ADR-0069 §6 deixa o
 * valor final para a validação com canhoto real). 80 é acima da confiança medida na sonda (91) só
 * o suficiente para não aceitar o dígito trocado da fixture de teste, sem recusar a leitura limpa.
 */
export const CANHOTO_OCR_MINIMUM_WORD_CONFIDENCE = 80

function findLabelIndex(words: readonly CanhotoOcrWord[], pattern: RegExp): number {
  return words.findIndex((word) => pattern.test(word.text.trim()))
}

/** Baixos (T15): todas as ocorrências do rótulo, não só a primeira — o texto do canhoto costuma
 * repetir "Nº" em mais de um lugar (cabeçalho e corpo), e a primeira nem sempre precede o token. */
function findAllLabelIndexes(words: readonly CanhotoOcrWord[], pattern: RegExp): readonly number[] {
  return words.reduce<readonly number[]>(
    (indexes, word, index) => (pattern.test(word.text.trim()) ? [...indexes, index] : indexes),
    [],
  )
}

/**
 * `undefined` cobre toda leitura inconclusiva: sem rótulo, sem token no formato certo, ou
 * confiança abaixo do limiar. Não se "conserta" dígito faltando (ADR-0069 §3, R2).
 */
function findValidNumberToken(
  words: readonly CanhotoOcrWord[],
  input: Readonly<{ minimumConfidence: number }>,
): CanhotoOcrWord | undefined {
  for (const labelIndex of findAllLabelIndexes(words, NUMBER_LABEL_PATTERN)) {
    const candidate = words[labelIndex + 1]
    if (candidate === undefined || !NUMBER_TOKEN_PATTERN.test(candidate.text.trim())) continue
    if (candidate.confidence < input.minimumConfidence) continue
    return candidate
  }
  return undefined
}

export function extractCanhotoNumberFromWords(
  words: readonly CanhotoOcrWord[],
  input: Readonly<{ minimumConfidence: number }> = {
    minimumConfidence: CANHOTO_OCR_MINIMUM_WORD_CONFIDENCE,
  },
): CanhotoOcrExtraction | undefined {
  const numberToken = findValidNumberToken(words, input)
  if (numberToken === undefined) return undefined

  const seriesLabelIndex = findLabelIndex(words, SERIES_LABEL_PATTERN)
  const seriesToken = seriesLabelIndex === -1 ? undefined : words[seriesLabelIndex + 1]
  const series =
    seriesToken !== undefined &&
    SERIES_DIGITS_PATTERN.test(seriesToken.text.trim()) &&
    seriesToken.confidence >= input.minimumConfidence
      ? seriesToken.text.trim()
      : null

  return { number: numberToken.text.trim().split('.').join(''), series }
}

/** Nota da viagem só com o que o casamento precisa. */
export type CanhotoOcrTripDocument = Readonly<{
  id: string
  nfeNumber: string | null
  nfeSeries: string | null
  /** R4: nota liberada (`released_at`) não entra na conta de unicidade. */
  releasedAt: string | null
}>

export type CanhotoOcrMatchResult =
  | Readonly<{ documentId: string; status: 'matched' }>
  | Readonly<{ documentId: string; status: 'otherSelected' }>
  | Readonly<{ status: 'manual' }>

function normalizeDigits(value: null | string): string {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? '' : String(Number(trimmed))
}

export type MatchCanhotoOcrExtractionParams = Readonly<{
  expectedDocumentId: string
  extraction: CanhotoOcrExtraction
  selectedDocumentIds: readonly string[]
  tripDocuments: readonly CanhotoOcrTripDocument[]
}>

/**
 * R4 — a unicidade conta **todas** as notas da viagem, selecionadas ou não, sem as liberadas.
 * Número que casa com nota fora da seleção cai no manual, sem bloqueio: o bloqueio de chave é da
 * ADR-0067 §4, e aqui é só suspeita de leitura errada.
 */
export function matchCanhotoOcrExtraction(
  params: MatchCanhotoOcrExtractionParams,
): CanhotoOcrMatchResult {
  const number = normalizeDigits(params.extraction.number)
  const series =
    params.extraction.series === null ? null : normalizeDigits(params.extraction.series)

  const candidates = params.tripDocuments.filter(
    (document) =>
      document.releasedAt === null &&
      normalizeDigits(document.nfeNumber) === number &&
      (series === null || normalizeDigits(document.nfeSeries) === series),
  )
  const [only] = candidates
  if (only === undefined || candidates.length > 1) return { status: 'manual' }
  if (!params.selectedDocumentIds.includes(only.id)) return { status: 'manual' }
  if (only.id === params.expectedDocumentId) return { documentId: only.id, status: 'matched' }
  return { documentId: only.id, status: 'otherSelected' }
}

export type IdentifyCanhotoNumberParams = Readonly<{
  expectedDocumentId: string
  minimumConfidence?: number
  selectedDocumentIds: readonly string[]
  tripDocuments: readonly CanhotoOcrTripDocument[]
  words: readonly CanhotoOcrWord[]
}>

export type IdentifyCanhotoNumberResult =
  | (CanhotoOcrMatchResult & Readonly<{ extraction: CanhotoOcrExtraction }>)
  | Readonly<{ status: 'manual' }>

/** Extrai e casa numa chamada só — o que a UI (T14) precisa depois do código de barras falhar. */
export function identifyCanhotoNumber(
  params: IdentifyCanhotoNumberParams,
): IdentifyCanhotoNumberResult {
  const extraction = extractCanhotoNumberFromWords(params.words, {
    minimumConfidence: params.minimumConfidence ?? CANHOTO_OCR_MINIMUM_WORD_CONFIDENCE,
  })
  if (extraction === undefined) return { status: 'manual' }

  const match = matchCanhotoOcrExtraction({
    expectedDocumentId: params.expectedDocumentId,
    extraction,
    selectedDocumentIds: params.selectedDocumentIds,
    tripDocuments: params.tripDocuments,
  })
  return match.status === 'manual' ? match : { ...match, extraction }
}
