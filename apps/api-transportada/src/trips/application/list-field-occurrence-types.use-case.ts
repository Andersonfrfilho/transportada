/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7.3 (L2): os tipos que o escritório oferece ao registrar ocorrência em nome do
 * motorista — só os ativos de rua, com `id`, `name` e `attachmentMode`. O assunto e o corpo do
 * e-mail são configuração (`settings.manage`) e não saem por aqui.
 *
 * Spec 218 RF-B2/T9: o `attachmentMode` passa a resolver em 3 camadas (destinatário > contratante >
 * geral do tipo) quando o chamador já sabe o contratante/destinatário da nota — `contractorId`/
 * `recipientTaxId` ausentes preservam o comportamento de hoje byte a byte (regressão zero). É o
 * único ponto de leitura, reaproveitado pelo motorista (`me-trip.routes.ts`) e pelo escritório
 * (`trip-field-office-occurrence.routes.ts`), então as duas rotas ganham a exceção de uma vez.
 *
 * Spec 246 (RF5, T2.1): a resolução cobre os **seis** campos (foto, observação, assinatura,
 * produtos e os dois mínimos), campo a campo, por `resolveOccurrenceRequirements` — nulo na exceção
 * herda do tipo. `attachmentMode` segue no corpo, igual a `photoMode`, para o app que não o conhece.
 */
import { OCCURRENCE_MOMENT } from '../../shared/trip-occurrence.constant.js'
import type {
  OccurrenceDeclaredAmountScope,
  OccurrenceMoment,
  OccurrenceTypeFlow,
} from '../../shared/trip-occurrence.constant.js'
import { resolveDeclaredAmountTarget } from '../domain/occurrence-declared-amount-target.policy.js'
import { occurrenceTypeAcceptsMoment } from '../domain/occurrence-moment.policy.js'
import type { DeliveryProofFieldMode } from '../domain/delivery-proof-settings.policy.js'
import {
  pickCoreRequirements,
  resolveOccurrenceRequirements,
} from '../domain/occurrence-requirements.policy.js'
import type {
  OccurrenceCoreRequirements,
  OccurrenceRequirementDeclaration,
  OccurrenceRequirements,
  OccurrenceRequirementSources,
} from '../domain/occurrence-requirements.policy.js'
import type { OccurrenceTypeRecord } from './register-trip-occurrence.use-case.js'
import type { TripStopOccurrenceKind } from '../../database/trip.schema.js'
import { resolveStopOccurrenceKind } from '../domain/stop-occurrence-kind.policy.js'

/**
 * Spec 247 (T4.6): os seis campos da 246 e os cinco da devolução — o painel e o app já os toleram
 * (etapa 1 e 1b da ADR-0081 §9). O escopo do valor pago sai **efetivo**: com Produtos desligado, é `occurrence`.
 */
export type FieldOccurrenceType = OccurrenceCoreRequirements & {
  readonly declaredAmountLabel: string
  readonly declaredAmountMode: DeliveryProofFieldMode
  readonly declaredAmountScope: OccurrenceDeclaredAmountScope
  readonly referenceNumberLabel: string
  readonly referenceNumberMode: DeliveryProofFieldMode
  /**
   * Spec 179 T304: se o registro do motorista exige comprovante. Igual a `photoMode`, mantido no
   * corpo por um ciclo para o app anterior à spec 246. `type.attachmentMode` é ausente só para dado
   * legado sem a coluna preenchida — aqui vira `'off'`, nunca fica indefinido.
   *
   * Spec 218 RF-B2: já vem resolvido em 3 camadas quando `contractorId`/`recipientTaxId` foram
   * informados — nenhuma lógica de precedência entra no app do motorista, só leitura do valor
   * pronto (mesma filosofia de "server-driven UI").
   */
  readonly attachmentMode: DeliveryProofFieldMode
  /**
   * Spec 218 (D1, RF-B5): qual dos dois caminhos de registro este tipo alimenta — o app do
   * motorista usa este campo para rotear o registro (fase futura, RF-A5), sem decidir nada aqui.
   */
  readonly flow: OccurrenceTypeFlow
  readonly id: string
  readonly name: string
  /**
   * Spec 218 D2: qual dos 5 valores fixos de parada o tipo representa — a prévia do aviso no app
   * lê este campo. Nulo em tipo de nota; tipo de parada sem valor sai `other`, o mesmo que o
   * registro grava.
   */
  readonly stopKind: TripStopOccurrenceKind | null
}

/** Spec 246 (RF12): o tipo resolvido e a camada que decidiu cada campo — a verificação mostra as duas. */
export type FieldOccurrenceTypeResolution = {
  /** Spec 247: a exigência efetiva inteira — o registro no servidor cobra também número e valor pago. */
  readonly requirements: OccurrenceRequirements
  readonly sources: OccurrenceRequirementSources
  readonly type: FieldOccurrenceType
}

export type FieldOccurrenceTypesPort = {
  listOccurrenceTypes(input: {
    readonly companyId: string
  }): Promise<readonly OccurrenceTypeRecord[]>
}

/**
 * Spec 246 (D-a): o que cada tabela de exceção devolve — os seis campos, nulos herdando do tipo.
 * `attachmentMode` é a foto (`NOT NULL` na tabela); os outros são nulos e sem padrão.
 */
export type FieldOccurrenceTypeContractorOverride = OccurrenceRequirementDeclaration & {
  readonly contractorId: string
  readonly occurrenceTypeId: string
}

export type FieldOccurrenceTypeRecipientOverride = OccurrenceRequirementDeclaration & {
  readonly occurrenceTypeId: string
  readonly taxId: string
}

export type FieldOccurrenceTypeOverrides = {
  readonly contractorOverrides: readonly FieldOccurrenceTypeContractorOverride[]
  readonly recipientOverrides: readonly FieldOccurrenceTypeRecipientOverride[]
}

/**
 * Spec 218 T9: a leitura em lote das duas tabelas de exceção, escopada aos tipos já filtrados
 * (`flow`/`stage`/`active`) — nunca uma consulta por tipo.
 */
export type FieldOccurrenceTypeOverridesPort = {
  listOverridesForTypes(input: {
    readonly companyId: string
    readonly occurrenceTypeIds: readonly string[]
  }): Promise<FieldOccurrenceTypeOverrides>
}

/**
 * Spec 246 (RF0, T1b.2): o momento que a lista serve — `office` no lote do escritório, `document` no
 * snapshot da nota. Ausente é a lista do motorista: nota **e** parada, cada tipo roteado pelo `flow`.
 */
type FieldOccurrenceMomentFilter = {
  readonly moment?: OccurrenceMoment | undefined
}

/** Os momentos da rua que o motorista registra: a lista dele, quando nenhum momento é pedido. */
export const DRIVER_FIELD_MOMENTS = [OCCURRENCE_MOMENT.document, OCCURRENCE_MOMENT.stop] as const

export type ListFieldOccurrenceTypesParams = FieldOccurrenceMomentFilter & {
  readonly companyId: string
  /** Spec 218 RF-B2: ausente é "sem contratante resolvido" — cai nos modos do tipo. */
  readonly contractorId?: string | null
  /** Só é consultado quando ao menos um dos dois vier informado — regressão zero sem eles. */
  readonly overrides?: FieldOccurrenceTypeOverridesPort
  /** Ausente é "sem destinatário resolvido" — mesmo tratamento de `contractorId`. */
  readonly recipientTaxId?: string | null
  readonly repository: FieldOccurrenceTypesPort
}

export type ResolveFieldOccurrenceTypesParams = FieldOccurrenceMomentFilter & {
  readonly contractorId?: string | null
  readonly overrides?: FieldOccurrenceTypeOverrides
  readonly recipientTaxId?: string | null
  readonly types: readonly OccurrenceTypeRecord[]
}

type OverridesByKey<TOverride> = ReadonlyMap<string, ReadonlyMap<string, TOverride>>

/** Agrupa uma lista de exceções (já lidas em uma consulta só) por tipo e, dentro dele, pela chave. */
function indexOverrides<TOverride extends { readonly occurrenceTypeId: string }>(
  overrides: readonly TOverride[],
  keyOf: (override: TOverride) => string,
): OverridesByKey<TOverride> {
  const byType = new Map<string, Map<string, TOverride>>()
  for (const override of overrides) {
    const byKey = byType.get(override.occurrenceTypeId) ?? new Map<string, TOverride>()
    byKey.set(keyOf(override), override)
    byType.set(override.occurrenceTypeId, byKey)
  }
  return byType
}

function findOverride<TOverride>(params: {
  readonly byType: OverridesByKey<TOverride>
  readonly key: null | string
  readonly occurrenceTypeId: string
}): null | TOverride {
  if (params.key === null || params.key.length === 0) return null
  return params.byType.get(params.occurrenceTypeId)?.get(params.key) ?? null
}

function toFieldOccurrenceType(params: {
  readonly requirements: OccurrenceRequirements
  readonly type: OccurrenceTypeRecord
}): FieldOccurrenceType {
  const { requirements, type } = params
  return {
    ...pickCoreRequirements(requirements),
    attachmentMode: requirements.photoMode,
    declaredAmountLabel: requirements.declaredAmountLabel,
    declaredAmountMode: requirements.declaredAmountMode,
    /** O tipo não conhece a nota: só o modo de Produtos conta aqui; a nota sem produto refina no snapshot. */
    declaredAmountScope: resolveDeclaredAmountTarget({
      itemsMode: requirements.itemsMode,
      lineCount: 1,
      scope: requirements.declaredAmountScope,
    }),
    flow: type.flow ?? 'document',
    id: type.id,
    name: type.name,
    referenceNumberLabel: requirements.referenceNumberLabel,
    referenceNumberMode: requirements.referenceNumberMode,
    stopKind: resolveFieldStopKind(type),
  }
}

/**
 * Spec 218 RF-C3 (follow-up, snapshot do motorista): a parte pura de `listFieldOccurrenceTypes` —
 * filtra, resolve e devolve, sem tocar em banco. Extraída para quem já carregou tipos/exceções uma
 * vez (o snapshot resolve N notas da viagem com essa carga única, em vez de uma consulta por nota).
 *
 * Spec 246: sem contratante nem destinatário (ou sem exceções lidas) os dois lados ficam nulos e
 * cada campo cai no tipo — o mesmo resultado de hoje, pelo mesmo caminho.
 */
export function resolveFieldOccurrenceTypeResolutions(
  params: ResolveFieldOccurrenceTypesParams,
): readonly FieldOccurrenceTypeResolution[] {
  const contractorsByType = indexOverrides(
    params.overrides?.contractorOverrides ?? [],
    (override) => override.contractorId,
  )
  const recipientsByType = indexOverrides(
    params.overrides?.recipientOverrides ?? [],
    (override) => override.taxId,
  )

  return selectFieldOccurrenceTypes({ moment: params.moment, types: params.types }).map((type) => {
    const { requirements, sources } = resolveOccurrenceRequirements({
      contractorOverride: findOverride({
        byType: contractorsByType,
        key: params.contractorId ?? null,
        occurrenceTypeId: type.id,
      }),
      recipientOverride: findOverride({
        byType: recipientsByType,
        key: params.recipientTaxId ?? null,
        occurrenceTypeId: type.id,
      }),
      type,
    })
    return { requirements, sources, type: toFieldOccurrenceType({ requirements, type }) }
  })
}

export function resolveFieldOccurrenceTypes(
  params: ResolveFieldOccurrenceTypesParams,
): readonly FieldOccurrenceType[] {
  return resolveFieldOccurrenceTypeResolutions(params).map((resolution) => resolution.type)
}

/** Spec 246 (RF12): a mesma leitura, devolvendo também a camada de cada campo. */
export async function listFieldOccurrenceTypeResolutions(
  params: ListFieldOccurrenceTypesParams,
): Promise<readonly FieldOccurrenceTypeResolution[]> {
  const types = await params.repository.listOccurrenceTypes({ companyId: params.companyId })
  const contractorId = params.contractorId ?? null
  const recipientTaxId = params.recipientTaxId ?? null
  const hasResolutionSubject =
    contractorId !== null || (recipientTaxId !== null && recipientTaxId.length > 0)
  const { moment } = params

  if (!hasResolutionSubject || params.overrides === undefined) {
    return resolveFieldOccurrenceTypeResolutions({ contractorId, moment, recipientTaxId, types })
  }

  const overrides = await params.overrides.listOverridesForTypes({
    companyId: params.companyId,
    occurrenceTypeIds: selectFieldOccurrenceTypes({ moment, types }).map((type) => type.id),
  })

  return resolveFieldOccurrenceTypeResolutions({
    contractorId,
    moment,
    overrides,
    recipientTaxId,
    types,
  })
}

export async function listFieldOccurrenceTypes(
  params: ListFieldOccurrenceTypesParams,
): Promise<readonly FieldOccurrenceType[]> {
  const resolutions = await listFieldOccurrenceTypeResolutions(params)
  return resolutions.map((resolution) => resolution.type)
}

type SelectFieldOccurrenceTypesParams = FieldOccurrenceMomentFilter & {
  readonly types: readonly OccurrenceTypeRecord[]
}

/** Spec 246 (RF0): os tipos ativos do momento pedido — pelo conjunto, nunca pelo `stage`. */
export function selectFieldOccurrenceTypes(
  params: SelectFieldOccurrenceTypesParams,
): readonly OccurrenceTypeRecord[] {
  const moments = params.moment === undefined ? DRIVER_FIELD_MOMENTS : [params.moment]
  return params.types.filter(
    (type) =>
      type.active && moments.some((moment) => occurrenceTypeAcceptsMoment({ moment, type })),
  )
}

function resolveFieldStopKind(type: OccurrenceTypeRecord): TripStopOccurrenceKind | null {
  return type.flow === 'stop' ? resolveStopOccurrenceKind(type.stopKind ?? null) : null
}
