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
 */
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import type { OccurrenceTypeFlow } from '../../shared/trip-occurrence.constant.js'
import type { DeliveryProofFieldMode } from '../domain/delivery-proof-settings.policy.js'
import { resolveOccurrenceAttachmentModeForRecipient } from '../domain/occurrence-attachment-overrides.policy.js'
import type { OccurrenceAttachmentOverridesLookup } from '../domain/occurrence-attachment-overrides.policy.js'
import type { OccurrenceTypeRecord } from './register-trip-occurrence.use-case.js'
import type { TripStopOccurrenceKind } from '../../database/trip.schema.js'
import { resolveStopOccurrenceKind } from '../domain/stop-occurrence-kind.policy.js'

export type FieldOccurrenceType = {
  /**
   * Spec 179 T304: se o registro do motorista exige comprovante. `type.attachmentMode` é
   * ausente só para dado legado sem a coluna preenchida — aqui vira `'off'`, nunca fica
   * indefinido, porque a app do motorista já decide se antecipa a observação obrigatória a
   * partir deste campo.
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
  /**
   * Spec 241 (RF5): se o tipo carrega produtos. Ausente na linha legada lê `optional`, o
   * comportamento de antes da coluna. O app do motorista ignora o campo (guard tolerante).
   */
  readonly itemsMode: DeliveryProofFieldMode
  readonly name: string
  /**
   * Spec 218 D2: qual dos 5 valores fixos de parada o tipo representa — a prévia do aviso no app
   * lê este campo. Nulo em tipo de nota; tipo de parada sem valor sai `other`, o mesmo que o
   * registro grava.
   */
  readonly stopKind: TripStopOccurrenceKind | null
}

export type FieldOccurrenceTypesPort = {
  listOccurrenceTypes(input: {
    readonly companyId: string
  }): Promise<readonly OccurrenceTypeRecord[]>
}

/**
 * Spec 218 T9: a leitura em lote das duas tabelas de exceção, escopada aos tipos já filtrados
 * (`flow`/`stage`/`active`) — nunca uma consulta por tipo.
 */
export type FieldOccurrenceTypeOverridesPort = {
  listOverridesForTypes(input: {
    readonly companyId: string
    readonly occurrenceTypeIds: readonly string[]
  }): Promise<{
    readonly contractorOverrides: readonly {
      readonly attachmentMode: DeliveryProofFieldMode
      readonly contractorId: string
      readonly occurrenceTypeId: string
    }[]
    readonly recipientOverrides: readonly {
      readonly attachmentMode: DeliveryProofFieldMode
      readonly occurrenceTypeId: string
      readonly taxId: string
    }[]
  }>
}

export type ListFieldOccurrenceTypesParams = {
  readonly companyId: string
  /** Spec 218 RF-B2: ausente é "sem contratante resolvido" — cai no `attachmentMode` do tipo. */
  readonly contractorId?: string | null
  /** Só é consultado quando ao menos um dos dois vier informado — regressão zero sem eles. */
  readonly overrides?: FieldOccurrenceTypeOverridesPort
  /** Ausente é "sem destinatário resolvido" — mesmo tratamento de `contractorId`. */
  readonly recipientTaxId?: string | null
  readonly repository: FieldOccurrenceTypesPort
}

export type ResolveFieldOccurrenceTypesParams = {
  readonly contractorId?: string | null
  readonly overrides?: {
    readonly contractorOverrides: readonly {
      readonly attachmentMode: DeliveryProofFieldMode
      readonly contractorId: string
      readonly occurrenceTypeId: string
    }[]
    readonly recipientOverrides: readonly {
      readonly attachmentMode: DeliveryProofFieldMode
      readonly occurrenceTypeId: string
      readonly taxId: string
    }[]
  }
  readonly recipientTaxId?: string | null
  readonly types: readonly OccurrenceTypeRecord[]
}

/**
 * Spec 218 RF-C3 (follow-up, snapshot do motorista): a parte pura de `listFieldOccurrenceTypes` —
 * filtra, resolve e devolve, sem tocar em banco. Extraída para quem já carregou tipos/exceções uma
 * vez (o snapshot resolve N notas da viagem com essa carga única, em vez de uma consulta por nota).
 */
export function resolveFieldOccurrenceTypes(
  params: ResolveFieldOccurrenceTypesParams,
): readonly FieldOccurrenceType[] {
  const fieldTypes = params.types.filter(
    (type) => type.active && type.stage === TRIP_OCCURRENCE_STAGE.delivery,
  )

  const contractorId = params.contractorId ?? null
  const recipientTaxId = params.recipientTaxId ?? null
  const hasResolutionSubject =
    contractorId !== null || (recipientTaxId !== null && recipientTaxId.length > 0)

  if (!hasResolutionSubject || params.overrides === undefined) {
    return fieldTypes.map((type) => ({
      attachmentMode: type.attachmentMode ?? 'off',
      flow: type.flow ?? 'document',
      id: type.id,
      itemsMode: type.itemsMode ?? 'optional',
      name: type.name,
      stopKind: resolveFieldStopKind(type),
    }))
  }

  const overridesByContractorIdByType = groupOverridesByType(
    params.overrides.contractorOverrides,
    (override) => override.contractorId,
  )
  const overridesByTaxIdByType = groupOverridesByType(
    params.overrides.recipientOverrides,
    (override) => override.taxId,
  )

  return fieldTypes.map((type) => {
    const lookup: OccurrenceAttachmentOverridesLookup = {
      overridesByContractorId: overridesByContractorIdByType.get(type.id) ?? new Map(),
      overridesByTaxId: overridesByTaxIdByType.get(type.id) ?? new Map(),
    }

    return {
      attachmentMode: resolveOccurrenceAttachmentModeForRecipient({
        attachmentMode: type.attachmentMode ?? 'off',
        contractorId,
        lookup,
        recipientTaxId,
      }),
      flow: type.flow ?? 'document',
      id: type.id,
      itemsMode: type.itemsMode ?? 'optional',
      name: type.name,
      stopKind: resolveFieldStopKind(type),
    }
  })
}

export async function listFieldOccurrenceTypes(
  params: ListFieldOccurrenceTypesParams,
): Promise<readonly FieldOccurrenceType[]> {
  const types = await params.repository.listOccurrenceTypes({ companyId: params.companyId })
  const contractorId = params.contractorId ?? null
  const recipientTaxId = params.recipientTaxId ?? null
  const hasResolutionSubject =
    contractorId !== null || (recipientTaxId !== null && recipientTaxId.length > 0)
  const overridesPort = params.overrides

  if (!hasResolutionSubject || overridesPort === undefined) {
    return resolveFieldOccurrenceTypes({ contractorId, recipientTaxId, types })
  }

  const overrides = await overridesPort.listOverridesForTypes({
    companyId: params.companyId,
    occurrenceTypeIds: types
      .filter((type) => type.active && type.stage === TRIP_OCCURRENCE_STAGE.delivery)
      .map((type) => type.id),
  })

  return resolveFieldOccurrenceTypes({ contractorId, overrides, recipientTaxId, types })
}

type OccurrenceTypeOverride = {
  readonly attachmentMode: DeliveryProofFieldMode
  readonly occurrenceTypeId: string
}

/** Agrupa uma lista de exceções (já lidas em uma consulta só) por `occurrenceTypeId`. */
function groupOverridesByType<TOverride extends OccurrenceTypeOverride>(
  overrides: readonly TOverride[],
  keyOf: (override: TOverride) => string,
): ReadonlyMap<string, ReadonlyMap<string, DeliveryProofFieldMode>> {
  const byType = new Map<string, Map<string, DeliveryProofFieldMode>>()
  for (const override of overrides) {
    const byKey = byType.get(override.occurrenceTypeId) ?? new Map<string, DeliveryProofFieldMode>()
    byKey.set(keyOf(override), override.attachmentMode)
    byType.set(override.occurrenceTypeId, byKey)
  }
  return byType
}

function resolveFieldStopKind(type: OccurrenceTypeRecord): TripStopOccurrenceKind | null {
  return type.flow === 'stop' ? resolveStopOccurrenceKind(type.stopKind ?? null) : null
}
