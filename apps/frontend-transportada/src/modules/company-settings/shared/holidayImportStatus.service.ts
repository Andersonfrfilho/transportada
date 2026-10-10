/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  HOLIDAY_FETCH_FAILURE_CODES,
  HOLIDAY_IMPORT_HEADLINE,
  HOLIDAY_PLAN_RESTRICTED_CODE,
  HOLIDAY_RUN_FAILURE_HEADLINE,
} from './holidayImport.constant'
import type {
  HolidayImportFailure,
  HolidayImportHeadline,
  HolidayImportStatus,
  HolidayImportStatusView,
} from './holidayImport.types'
import type { HolidayProviderSettings } from './holidayProviderSettings.types'

const FAILURE_MESSAGE_PREFIX = 'import.failures'
const EXPLAIN_MESSAGE_PREFIX = 'import.status.explain'
const WAITING_WITH_TOKEN = 'waitingWithToken'
const UNKNOWN_FAILURE = 'unknown'

function isKnownFailure(code: string): boolean {
  return HOLIDAY_FETCH_FAILURE_CODES.some((known) => known === code)
}

function resolveRunFailureHeadline(outcome: string | undefined): HolidayImportHeadline | undefined {
  return Object.entries(HOLIDAY_RUN_FAILURE_HEADLINE).find(([code]) => code === outcome)?.[1]
}

/**
 * Par fora do plano é aviso, não falha: só quando a API manda a contagem (`planRestricted`) ele sai da lista de falhas
 * e do contador. Sem ela (API anterior), tudo segue como antes.
 */
function listVisibleFailures(status: HolidayImportStatus): readonly HolidayImportFailure[] {
  if (status.pairs.planRestricted === undefined) return status.failures
  return status.failures.filter((failure) => failure.errorCode !== HOLIDAY_PLAN_RESTRICTED_CODE)
}

function countFailedPairs(status: HolidayImportStatus): number {
  return Math.max(0, status.pairs.failed - (status.pairs.planRestricted ?? 0))
}

/**
 * O `status` não traz a chave nem o orçamento (são da instalação): "sem chave" e "orçamento atingido" vêm da configuração
 * lida à parte. Sem ela (a leitura falhou ou ainda não chegou), o cartão é o de antes — nenhuma das duas manchetes.
 */
type StatusViewInput = Readonly<{
  settings?: HolidayProviderSettings | undefined
  status: HolidayImportStatus
}>

/** `>=` casa com o worker, que só reivindica uma requisição enquanto `requests < budget`. */
function hasReachedBudget({ settings, status }: StatusViewInput): boolean {
  return settings !== undefined && status.monthlyRequests >= settings.monthlyRequestBudget
}

/**
 * Uma manchete só, por prioridade (spec 262 D8): empresa fora da importação, sem chave, chave ilegível e o que o
 * fornecedor fez no último ciclo da rotina, orçamento do mês atingido, falha por par, ainda sem a primeira busca, em
 * dia. Os números ficam todos na tela — a manchete é a primeira coisa que o operador precisa saber, não a única.
 */
function resolveHeadline(input: StatusViewInput): HolidayImportHeadline {
  const { settings, status } = input
  if (!status.isEnabled) return HOLIDAY_IMPORT_HEADLINE.DISABLED
  if (settings?.tokenConfigured === false) return HOLIDAY_IMPORT_HEADLINE.NO_TOKEN
  const runHeadline = resolveRunFailureHeadline(status.lastRun?.outcome)
  if (runHeadline !== undefined) return runHeadline
  if (hasReachedBudget(input)) return HOLIDAY_IMPORT_HEADLINE.BUDGET_REACHED
  if (listVisibleFailures(status).length > 0 || countFailedPairs(status) > 0) {
    return HOLIDAY_IMPORT_HEADLINE.FAILING
  }
  if (status.lastFetchedAt === null) return HOLIDAY_IMPORT_HEADLINE.WAITING
  return HOLIDAY_IMPORT_HEADLINE.HEALTHY
}

/** "Aguardando" só manda despausar em Operações quando a chave existe: sem ela o que falta é a chave. */
function resolveExplainKey(input: Readonly<{ headline: HolidayImportHeadline } & StatusViewInput>) {
  const isWaitingWithToken =
    input.headline === HOLIDAY_IMPORT_HEADLINE.WAITING && input.settings?.tokenConfigured === true
  return `${EXPLAIN_MESSAGE_PREFIX}.${isWaitingWithToken ? WAITING_WITH_TOKEN : input.headline}`
}

export function resolveImportStatusView(input: StatusViewInput): HolidayImportStatusView {
  const { status } = input
  const { done, total } = status.pairs
  const headline = resolveHeadline(input)
  return {
    explainKey: resolveExplainKey({ ...input, headline }),
    failedPairs: countFailedPairs(status),
    failures: listVisibleFailures(status).map(({ errorCode, pairs }) => ({
      code: errorCode,
      messageKey: `${FAILURE_MESSAGE_PREFIX}.${isKnownFailure(errorCode) ? errorCode : UNKNOWN_FAILURE}`,
      pairs,
    })),
    headline,
    lastRunFinishedAt: status.lastRun?.finishedAt ?? null,
    planRestrictedPairs: status.pairs.planRestricted ?? 0,
    progress: { done, ratio: total === 0 ? 0 : done / total, total },
  }
}
