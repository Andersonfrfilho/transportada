/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 (ADR-0107): leitura e escrita da lista de contratantes de um tipo de ocorrência, sempre
 * pela empresa do contexto. A leitura é em lote — uma consulta para N tipos, nunca uma por tipo.
 */
import { and, asc, eq, inArray } from 'drizzle-orm'

import { contractors } from '../../database/delivery-client.schema.js'
import { companyOccurrenceTypeContractors } from '../../database/occurrence-type-contractor.schema.js'
import type { OccurrenceClientChannelMatrix } from '../domain/occurrence-client-channels.policy.js'
import {
  readResolvedClientChannelMatrices,
  type ClientChannelLegacyRecord,
} from './occurrence-type-client-channels.query.js'
import { companyOccurrenceTypes } from '../../database/trip.schema.js'
import { ContractorNotFoundError } from '../../delivery-clients/domain/delivery-client.error.js'
import {
  OCCURRENCE_TYPE_CONTRACTOR_SCOPE,
  type OccurrenceTypeContractorScope,
} from '../../shared/trip-occurrence.constant.js'
import type { ApiLogger } from '../../shared/api.types.js'
import { resolveOccurrenceTypeMoments } from '../domain/occurrence-moment.policy.js'
import { assertOccurrenceTypeContractorScopeIsWritable } from '../domain/occurrence-type-contractor-scope.policy.js'
import { pruneOccurrenceTypeMailRecipients } from './occurrence-type-mail-recipients.support.js'
import { listTypesWithoutUsableTemplateOrEmpty } from './occurrence-mail-template-missing.query.js'
import {
  readOccurrenceTypeMailRecipients,
  readOccurrenceTypeMailWatchers,
  type OccurrenceTypeMailRecipientView,
  type OccurrenceTypeMailWatcherView,
} from './occurrence-type-mail-view.query.js'
import { readOccurrenceTypeMoments } from './occurrence-type-moments.query.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type OccurrenceTypeContractorDetail = {
  readonly displayName: string
  readonly id: string
  readonly status: string
  readonly taxId: string
}

export type OccurrenceTypeContractorScopeView = {
  /** Spec 286 (RF2): a matriz "Retorno ao cliente" resolvida (o gravado, ou o derivado dos campos antigos). */
  readonly clientChannels: null | OccurrenceClientChannelMatrix
  readonly contractors: readonly OccurrenceTypeContractorDetail[]
  readonly contractorScope: OccurrenceTypeContractorScope
  /** Spec 271 (D12): os destinatários escolhidos no tipo `listed` (contatos das contratantes da lista). */
  readonly contractorMailRecipients: readonly OccurrenceTypeMailRecipientView[]
  /** Spec 271: os responsáveis em cópia escolhidos no tipo (da lista da empresa). */
  readonly contractorMailWatchers: readonly OccurrenceTypeMailWatcherView[]
  /** Spec 271 (D9): o e-mail à contratante está ligado e o tipo não tem modelo utilizável. */
  readonly missingNotificationTemplate: boolean
}

type ScopedRecord = ClientChannelLegacyRecord & {
  readonly contractorNotificationTemplateKey?: null | string | undefined
  readonly contractorScope?: OccurrenceTypeContractorScope | undefined
  readonly emailsContractor?: boolean | undefined
  readonly id: string
}

/** O gravado, por tipo; tipo sem linha fica fora do mapa. */
async function readContractorIdsByType(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceTypeIds: readonly string[] },
): Promise<ReadonlyMap<string, readonly string[]>> {
  if (params.occurrenceTypeIds.length === 0) return new Map()
  const rows = await queryable
    .select({
      contractorId: companyOccurrenceTypeContractors.contractorId,
      occurrenceTypeId: companyOccurrenceTypeContractors.occurrenceTypeId,
    })
    .from(companyOccurrenceTypeContractors)
    .where(
      and(
        eq(companyOccurrenceTypeContractors.companyId, params.companyId),
        inArray(companyOccurrenceTypeContractors.occurrenceTypeId, [...params.occurrenceTypeIds]),
      ),
    )
    .orderBy(asc(companyOccurrenceTypeContractors.contractorId))

  const byType = new Map<string, string[]>()
  for (const row of rows) {
    const ids = byType.get(row.occurrenceTypeId) ?? []
    ids.push(row.contractorId)
    byType.set(row.occurrenceTypeId, ids)
  }
  return byType
}

/**
 * Cada tipo com os ids da sua lista. Uma consulta para a lista inteira, e só para os `listed`: o
 * leitor ignora as linhas de tipo `all` (defesa da ADR-0107 D2). Sem escopo no registro (dublê de
 * teste) vale `all`.
 */
export async function withOccurrenceTypeContractorIds<TRecord extends ScopedRecord>(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly records: readonly TRecord[] },
): Promise<
  readonly (TRecord & {
    readonly contractorIds: readonly string[]
    readonly contractorScope: OccurrenceTypeContractorScope
  })[]
> {
  const listedIds = params.records
    .filter((record) => record.contractorScope === OCCURRENCE_TYPE_CONTRACTOR_SCOPE.listed)
    .map((record) => record.id)
  const byType = await readContractorIdsByType(queryable, {
    companyId: params.companyId,
    occurrenceTypeIds: listedIds,
  })
  return params.records.map((record) => {
    const contractorScope = record.contractorScope ?? OCCURRENCE_TYPE_CONTRACTOR_SCOPE.all
    return {
      ...record,
      contractorIds:
        contractorScope === OCCURRENCE_TYPE_CONTRACTOR_SCOPE.listed
          ? (byType.get(record.id) ?? [])
          : [],
      contractorScope,
    }
  })
}

/** Nome, CNPJ e situação das contratantes de cada tipo, ordenadas por nome — só para o cadastro. */
export async function readOccurrenceTypeContractorDetails(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceTypeIds: readonly string[] },
): Promise<ReadonlyMap<string, readonly OccurrenceTypeContractorDetail[]>> {
  if (params.occurrenceTypeIds.length === 0) return new Map()
  const rows = await queryable
    .select({
      displayName: contractors.displayName,
      id: contractors.id,
      occurrenceTypeId: companyOccurrenceTypeContractors.occurrenceTypeId,
      status: contractors.status,
      taxId: contractors.taxId,
    })
    .from(companyOccurrenceTypeContractors)
    .innerJoin(
      contractors,
      and(
        eq(contractors.companyId, companyOccurrenceTypeContractors.companyId),
        eq(contractors.id, companyOccurrenceTypeContractors.contractorId),
      ),
    )
    .where(
      and(
        eq(companyOccurrenceTypeContractors.companyId, params.companyId),
        inArray(companyOccurrenceTypeContractors.occurrenceTypeId, [...params.occurrenceTypeIds]),
      ),
    )
    .orderBy(asc(contractors.displayName), asc(contractors.id))

  const byType = new Map<string, OccurrenceTypeContractorDetail[]>()
  for (const { occurrenceTypeId, ...detail } of rows) {
    const details = byType.get(occurrenceTypeId) ?? []
    details.push(detail)
    byType.set(occurrenceTypeId, details)
  }
  return byType
}

/**
 * A resposta do cadastro (`GET`/`PUT /company-settings/occurrence-types`): cada tipo sem os ids crus e
 * com `contractorScope` e `contractors` (nome, CNPJ, situação), numa consulta só. Só o cadastro vê
 * isso — as listas de rua nunca levam escopo nem contratantes.
 */
export async function toOccurrenceTypeSettingsViews<
  TRecord extends ScopedRecord & { readonly contractorIds?: readonly string[] | undefined },
>(
  queryable: TripQueryable,
  params: {
    readonly companyId: string
    readonly logger?: ApiLogger
    readonly records: readonly TRecord[]
  },
): Promise<readonly (Omit<TRecord, 'contractorIds'> & OccurrenceTypeContractorScopeView)[]> {
  const listedIds = params.records
    .filter((record) => record.contractorScope === OCCURRENCE_TYPE_CONTRACTOR_SCOPE.listed)
    .map((record) => record.id)
  const detailsByType = await readOccurrenceTypeContractorDetails(queryable, {
    companyId: params.companyId,
    occurrenceTypeIds: listedIds,
  })
  const typeIds = params.records.map((record) => record.id)
  const [watchersByType, recipientsByType] = await Promise.all([
    readOccurrenceTypeMailWatchers(queryable, {
      companyId: params.companyId,
      occurrenceTypeIds: typeIds,
    }),
    readOccurrenceTypeMailRecipients(queryable, {
      companyId: params.companyId,
      occurrenceTypeIds: typeIds,
    }),
  ])
  /** Spec 286 (RF2): a matriz "Retorno ao cliente" de cada tipo, numa consulta para a lista inteira. */
  const clientChannelsByType = await readResolvedClientChannelMatrices(queryable, {
    companyId: params.companyId,
    records: params.records,
  })
  const missingTemplateTypeIds = await listTypesWithoutUsableTemplateOrEmpty(queryable, {
    companyId: params.companyId,
    ...(params.logger === undefined ? {} : { logger: params.logger }),
    types: params.records.map((record) => ({
      emailsContractor: record.emailsContractor ?? false,
      id: record.id,
      key: record.contractorNotificationTemplateKey ?? null,
    })),
  })
  return params.records.map((original) => {
    const record: Omit<TRecord, 'contractorIds'> & { contractorIds?: unknown } = { ...original }
    delete record.contractorIds
    const contractorScope = record.contractorScope ?? OCCURRENCE_TYPE_CONTRACTOR_SCOPE.all
    return {
      ...record,
      contractors:
        contractorScope === OCCURRENCE_TYPE_CONTRACTOR_SCOPE.listed
          ? (detailsByType.get(record.id) ?? [])
          : [],
      contractorMailRecipients: recipientsByType.get(record.id) ?? [],
      contractorMailWatchers: watchersByType.get(record.id) ?? [],
      clientChannels: clientChannelsByType.get(record.id) ?? null,
      contractorScope,
      missingNotificationTemplate: missingTemplateTypeIds.has(record.id),
    }
  })
}

export type ReplaceOccurrenceTypeContractorScopeParams = {
  readonly companyId: string
  readonly contractorIds: readonly string[]
  readonly occurrenceTypeId: string
  readonly scope: OccurrenceTypeContractorScope
}

/**
 * Substituição total do escopo e da lista, numa transação do chamador: o tipo travado `FOR UPDATE`,
 * as contratantes conferidas na empresa com `FOR KEY SHARE` (inexistente ou de outra empresa é o
 * mesmo 404), e a invariante `listed` ⇔ ao menos uma linha conferida no fim. É o que o `PUT` e o
 * script de dados chamam — nunca dois caminhos de escrita.
 */
export async function replaceOccurrenceTypeContractorScope(
  transaction: TripQueryable,
  params: ReplaceOccurrenceTypeContractorScopeParams,
): Promise<void> {
  const contractorIds = [...new Set(params.contractorIds)]
  await lockTypeRow(transaction, params)
  if (params.scope === OCCURRENCE_TYPE_CONTRACTOR_SCOPE.listed) {
    await assertContractorsBelongToCompany(transaction, { ...params, contractorIds })
  }
  await transaction
    .update(companyOccurrenceTypes)
    .set({ contractorScope: params.scope })
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, params.companyId),
        eq(companyOccurrenceTypes.id, params.occurrenceTypeId),
      ),
    )
  await transaction
    .delete(companyOccurrenceTypeContractors)
    .where(
      and(
        eq(companyOccurrenceTypeContractors.companyId, params.companyId),
        eq(companyOccurrenceTypeContractors.occurrenceTypeId, params.occurrenceTypeId),
      ),
    )
  if (params.scope === OCCURRENCE_TYPE_CONTRACTOR_SCOPE.listed && contractorIds.length > 0) {
    await transaction.insert(companyOccurrenceTypeContractors).values(
      contractorIds.map((contractorId) => ({
        companyId: params.companyId,
        contractorId,
        occurrenceTypeId: params.occurrenceTypeId,
      })),
    )
  }
  /** Spec 271 (D12): a escolha de destinatários segue o escopo — contratante que saiu da lista leva os contatos dela. */
  await pruneOccurrenceTypeMailRecipients(transaction, params)
  await assertStoredOccurrenceTypeContractorScope(transaction, params)
}

/**
 * A invariante sobre o que está gravado (e travado) agora: o escopo do tipo, a lista e os momentos.
 * Pega também o `PUT` que só mudou os momentos de um tipo `listed` para "só parada".
 */
export async function assertStoredOccurrenceTypeContractorScope(
  transaction: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceTypeId: string },
): Promise<void> {
  const [type] = await transaction
    .select({
      contractorScope: companyOccurrenceTypes.contractorScope,
      flow: companyOccurrenceTypes.flow,
      stage: companyOccurrenceTypes.stage,
    })
    .from(companyOccurrenceTypes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, params.companyId),
        eq(companyOccurrenceTypes.id, params.occurrenceTypeId),
      ),
    )
    .limit(1)
  if (type === undefined) return
  const idsByType = await readContractorIdsByType(transaction, {
    companyId: params.companyId,
    occurrenceTypeIds: [params.occurrenceTypeId],
  })
  const momentsByType = await readOccurrenceTypeMoments(transaction, {
    companyId: params.companyId,
    occurrenceTypeIds: [params.occurrenceTypeId],
  })
  assertOccurrenceTypeContractorScopeIsWritable({
    contractorIds: idsByType.get(params.occurrenceTypeId) ?? [],
    moments: resolveOccurrenceTypeMoments({
      flow: type.flow,
      moments: momentsByType.get(params.occurrenceTypeId),
      stage: type.stage,
    }),
    scope: type.contractorScope,
  })
}

export async function lockTypeRow(
  transaction: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceTypeId: string },
): Promise<void> {
  await transaction
    .select({ id: companyOccurrenceTypes.id })
    .from(companyOccurrenceTypes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, params.companyId),
        eq(companyOccurrenceTypes.id, params.occurrenceTypeId),
      ),
    )
    .for('update')
}

async function assertContractorsBelongToCompany(
  transaction: TripQueryable,
  params: { readonly companyId: string; readonly contractorIds: readonly string[] },
): Promise<void> {
  if (params.contractorIds.length === 0) return
  const rows = await transaction
    .select({ id: contractors.id })
    .from(contractors)
    .where(
      and(
        eq(contractors.companyId, params.companyId),
        inArray(contractors.id, [...params.contractorIds]),
      ),
    )
    .for('key share')
  if (rows.length !== params.contractorIds.length) throw new ContractorNotFoundError()
}
