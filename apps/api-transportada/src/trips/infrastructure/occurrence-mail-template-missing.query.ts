/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 (ADR-0106, D8) e 271 (ADR-0108, D9): o aviso "Tipo sem modelo de notificação" do feed, do detalhe e
 * do editor do tipo. O servidor calcula; o painel não recalcula. Só a ocorrência de nota, com contratante
 * conhecida, de tipo que avisa a contratante (`emails_contractor`) e **sem modelo utilizável**: chave nula, ou
 * chave sem versão ativa de e-mail `pt-BR` de corpo texto e assunto preenchido no módulo de notificação.
 *
 * Uma consulta `IN (chaves)` por página, só das chaves distintas: nunca por linha.
 */
import { safeLogWarn } from '../../logging/safe-logger.service.js'
import {
  assessContractorTemplate,
  blocksContractorMailSend,
} from '../../occurrence-conversation/domain/occurrence-contractor-template.policy.js'
import { readActiveContractorTemplates } from '../../occurrence-conversation/infrastructure/notification-template.query.js'
import type { ApiLogger } from '../../shared/api.types.js'
import { readFailureCode } from './occurrence-type-items-read.query.js'
import type { TripQueryable } from './trip-queryable.type.js'

export const OCCURRENCE_MAIL_TEMPLATE_MISSING_READ_FAILED_MESSAGE =
  'occurrence_mail_template_missing_read_failed'

export type MailTemplateCandidate = {
  readonly contractorId: null | string
  readonly emailsContractor: boolean
  readonly id: string
  readonly source: 'document' | 'stop'
  readonly typeNotificationTemplateKey: null | string
}

/** As chaves, dentre as pedidas, sem modelo utilizável no módulo de notificação (D5). */
export async function listUnusableTemplateKeys(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly keys: readonly string[] },
): Promise<ReadonlySet<string>> {
  const templates = await readActiveContractorTemplates(queryable, params)
  return new Set(
    [...new Set(params.keys)].filter((key) => {
      const template = templates.get(key) ?? null
      return blocksContractorMailSend(assessContractorTemplate({ key, template }))
    }),
  )
}

/** Quais dos `entries` (id e chave, nula é "sem modelo") não têm modelo utilizável — a mesma regra para ocorrência e tipo. */
async function listIdsWithoutUsableTemplate(
  queryable: TripQueryable,
  params: {
    readonly companyId: string
    readonly entries: readonly { readonly id: string; readonly key: null | string }[]
  },
): Promise<ReadonlySet<string>> {
  if (params.entries.length === 0) return new Set()
  const unusableKeys = await listUnusableTemplateKeys(queryable, {
    companyId: params.companyId,
    keys: params.entries.flatMap((entry) => (entry.key === null ? [] : [entry.key])),
  })
  return new Set(
    params.entries
      .filter((entry) => entry.key === null || unusableKeys.has(entry.key))
      .map((entry) => entry.id),
  )
}

export async function listMissingNotificationTemplates(
  queryable: TripQueryable,
  params: { readonly candidates: readonly MailTemplateCandidate[]; readonly companyId: string },
): Promise<ReadonlySet<string>> {
  return listIdsWithoutUsableTemplate(queryable, {
    companyId: params.companyId,
    entries: params.candidates
      .filter(
        (candidate) =>
          candidate.source === 'document' &&
          candidate.emailsContractor &&
          candidate.contractorId !== null,
      )
      .map((candidate) => ({ id: candidate.id, key: candidate.typeNotificationTemplateKey })),
  })
}

export type MailTemplateTypeCandidate = {
  readonly emailsContractor: boolean
  readonly id: string
  readonly key: null | string
}

/** O aviso do editor do tipo: `emails_contractor` ligado e sem modelo utilizável. */
export async function listTypesWithoutUsableTemplate(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly types: readonly MailTemplateTypeCandidate[] },
): Promise<ReadonlySet<string>> {
  return listIdsWithoutUsableTemplate(queryable, {
    companyId: params.companyId,
    entries: params.types.filter((type) => type.emailsContractor),
  })
}

/**
 * ⚠️ É refinamento: o painel só mostra um selo, então a falha desta leitura vira "ninguém sem modelo" —
 * registrada, sem parâmetro nem dado — em vez de derrubar o feed, o detalhe e o envio, que já funcionavam sem
 * ela. Sem `logger` a falha propaga: dentro de transação o `.catch` esconderia a causa e o próximo comando
 * morreria com `25P02`.
 */
export function listMissingNotificationTemplatesOrEmpty(
  queryable: TripQueryable,
  params: {
    readonly candidates: readonly MailTemplateCandidate[]
    readonly companyId: string
    readonly logger?: ApiLogger
  },
): Promise<ReadonlySet<string>> {
  const { logger, ...readParams } = params
  return orEmptyWhenLogged(listMissingNotificationTemplates(queryable, readParams), logger)
}

export function listTypesWithoutUsableTemplateOrEmpty(
  queryable: TripQueryable,
  params: {
    readonly companyId: string
    readonly logger?: ApiLogger
    readonly types: readonly MailTemplateTypeCandidate[]
  },
): Promise<ReadonlySet<string>> {
  const { logger, ...readParams } = params
  return orEmptyWhenLogged(listTypesWithoutUsableTemplate(queryable, readParams), logger)
}

function orEmptyWhenLogged(
  read: Promise<ReadonlySet<string>>,
  logger: ApiLogger | undefined,
): Promise<ReadonlySet<string>> {
  if (logger === undefined) return read
  return read.catch((error: unknown) => {
    safeLogWarn({
      logger,
      message: OCCURRENCE_MAIL_TEMPLATE_MISSING_READ_FAILED_MESSAGE,
      metadata: { code: readFailureCode(error) },
    })
    return new Set<string>()
  })
}
