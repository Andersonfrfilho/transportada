/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A ponte entre dezenove códigos de exceção e cinco palavras do catálogo. No cron cada um deles era
 * uma linha de log com a mensagem crua e um código de saída 1 — a planilha que não abre e a agência
 * fora do ar diziam a mesma coisa ao operador, que é nada.
 *
 * Erro que nenhuma das duas metades reconhece **não é traduzido**: ele volta `undefined`, o ciclo o
 * conta como falha e a linha fecha em `unexpected_error`. Emprestar a palavra de uma agência para um
 * defeito nosso é a única saída pior que não ter palavra.
 */
import type { JobOutcome } from '../../shared/job-catalog.constant.js'

/**
 * Em ordem de precedência: quando as duas metades falham, o ciclo fecha pela primeira desta lista.
 * Do que uma pessoa resolve (planilha que não abre, recorte vazio) ao que o tempo resolve (semana
 * ainda não publicada, agência fora do ar).
 */
export const FUEL_PRICE_PULL_FAILURE_OUTCOMES = [
  'anp_malformed_workbook',
  'aneel_empty_slice',
  'anp_week_not_published',
  'anp_unreachable',
  'aneel_unreachable',
] as const satisfies readonly JobOutcome[]

export type FuelPricePullFailureOutcome = (typeof FUEL_PRICE_PULL_FAILURE_OUTCOMES)[number]

export const FUEL_PRICE_PULL_FAILURE_CAUSES = [
  'aneel_empty_slice',
  'aneel_malformed_response',
  'aneel_transport_failure',
  'aneel_unavailable',
  'anp_malformed_workbook',
  'anp_transport_failure',
  'anp_unexpected_status',
  'anp_week_unavailable',
] as const

export type FuelPricePullFailureCause = (typeof FUEL_PRICE_PULL_FAILURE_CAUSES)[number]

const OUTCOME_BY_CAUSE: Readonly<Record<FuelPricePullFailureCause, FuelPricePullFailureOutcome>> = {
  aneel_empty_slice: 'aneel_empty_slice',
  /**
   * O catálogo não tem palavra para corpo que o schema recusa, e `aneel_empty_slice` diria que a
   * agência respondeu vazio — ela respondeu outra coisa. Fica com a palavra de quem não respondeu.
   */
  aneel_malformed_response: 'aneel_unreachable',
  aneel_transport_failure: 'aneel_unreachable',
  aneel_unavailable: 'aneel_unreachable',
  anp_malformed_workbook: 'anp_malformed_workbook',
  anp_transport_failure: 'anp_unreachable',
  anp_unexpected_status: 'anp_unreachable',
  // A semana que a ANP ainda não publicou é fato do calendário, não falha nossa nem da rede.
  anp_week_unavailable: 'anp_week_not_published',
}

export function toFuelPricePullFailureOutcome(
  cause: FuelPricePullFailureCause,
): FuelPricePullFailureOutcome {
  return OUTCOME_BY_CAUSE[cause]
}

/**
 * Rede caída não chega com código nosso: `fetch` rejeita `TypeError` e `AbortSignal.timeout` rejeita
 * `DOMException` com nome `TimeoutError`. Reconhecer pelo **nome** é o que impede agência fora do ar
 * de ser contada como defeito nosso.
 */
const TRANSPORT_ERROR_NAMES: readonly string[] = ['AbortError', 'TimeoutError', 'TypeError']

const ANP_CAUSE_BY_CODE: Readonly<Record<string, FuelPricePullFailureCause>> = {
  ANP_EMPTY_SHEET: 'anp_malformed_workbook',
  ANP_INVALID_PRICE: 'anp_malformed_workbook',
  ANP_INVALID_SERIAL_DATE: 'anp_malformed_workbook',
  ANP_MALFORMED_ROW: 'anp_malformed_workbook',
  ANP_MALFORMED_WORKBOOK: 'anp_malformed_workbook',
  ANP_MISSING_STATE_SHEET: 'anp_malformed_workbook',
  ANP_UNEXPECTED_HEADER: 'anp_malformed_workbook',
  ANP_UNEXPECTED_STATUS: 'anp_unexpected_status',
  ANP_UNKNOWN_PRODUCT: 'anp_malformed_workbook',
  ANP_UNKNOWN_STATE: 'anp_malformed_workbook',
  ANP_WEEK_UNAVAILABLE: 'anp_week_unavailable',
  FUEL_INVALID_PRICE: 'anp_malformed_workbook',
  XLSX_CORRUPT_DIRECTORY: 'anp_malformed_workbook',
  XLSX_NOT_A_ZIP: 'anp_malformed_workbook',
  XLSX_UNSUPPORTED_COMPRESSION: 'anp_malformed_workbook',
}

const ANEEL_CAUSE_BY_CODE: Readonly<Record<string, FuelPricePullFailureCause>> = {
  ANEEL_INVALID_TARIFF: 'aneel_malformed_response',
  ANEEL_MALFORMED_RESPONSE: 'aneel_malformed_response',
  ANEEL_TARIFF_UNAVAILABLE: 'aneel_unavailable',
}

type ClassifyParams = {
  readonly causeByCode: Readonly<Record<string, FuelPricePullFailureCause>>
  readonly error: unknown
  readonly transportCause: FuelPricePullFailureCause
}

function classify({
  causeByCode,
  error,
  transportCause,
}: ClassifyParams): FuelPricePullFailureCause | undefined {
  if (!(error instanceof Error)) return undefined
  if (TRANSPORT_ERROR_NAMES.includes(error.name)) return transportCause
  return causeByCode[error.message]
}

export function classifyAnpFailure(error: unknown): FuelPricePullFailureCause | undefined {
  return classify({
    causeByCode: ANP_CAUSE_BY_CODE,
    error,
    transportCause: 'anp_transport_failure',
  })
}

export function classifyAneelFailure(error: unknown): FuelPricePullFailureCause | undefined {
  return classify({
    causeByCode: ANEEL_CAUSE_BY_CODE,
    error,
    transportCause: 'aneel_transport_failure',
  })
}
