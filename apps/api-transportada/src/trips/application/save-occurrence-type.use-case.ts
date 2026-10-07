/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 (revisão): o tipo de ocorrência **seleciona** um template do módulo de notificações para o
 * aviso interno (quem despachou a viagem). Spec 247 (RF2): o e-mail à contratante é outro canal, com
 * assunto/corpo próprios — salvar um nunca apaga o outro.
 */
import {
  OccurrenceEmailTemplateNotFoundError,
  OccurrenceTypeLeavesDocumentBehindRequiresSeparationError,
} from '../domain/trip.error.js'
import type { RedeliveryPolicy } from '../../database/trip.schema.js'
import type { DeliveryProofFieldMode } from '../domain/delivery-proof-settings.policy.js'
import { OCCURRENCE_TYPE_FLOWS } from '../../shared/trip-occurrence.constant.js'
import type {
  OccurrenceDeclaredAmountScope,
  OccurrenceMoment,
  OccurrenceTypeFlow,
  TripOccurrenceStage,
} from '../../shared/trip-occurrence.constant.js'
import { assertDeclaredAmountHasItems } from '../domain/occurrence-declared-amount-shape.policy.js'
import {
  assertItemsMinimumMatchesMode,
  assertItemsOffHasNoRedeliveryPolicy,
} from '../domain/occurrence-items-shape.policy.js'
import { OccurrenceTypeMomentsStageConflictError } from '../domain/occurrence-moment.error.js'
import {
  assertOccurrenceMomentsAreWritable,
  deriveOccurrenceMomentsFromStageAndFlow,
  deriveStageAndFlowFromMoments,
  isExpressedByStageAndFlow,
  normalizeOccurrenceMoments,
} from '../domain/occurrence-moment.policy.js'
import type { OccurrenceTypeRecord } from './register-trip-occurrence.use-case.js'

/** O catálogo de templates da empresa, visto pelo único predicado que este cadastro precisa. */
export type OccurrenceEmailTemplateCatalogPort = {
  hasActiveEmailTemplate(input: {
    readonly companyId: string
    readonly templateKey: string
  }): Promise<boolean>
}

export type SaveOccurrenceTypeValues = {
  readonly active: boolean
  /** Spec 166 (RF3/RF9): se este tipo aceita mais de um item marcado. Ausente é "não mexa". */
  readonly allowsMultipleItems?: boolean | undefined
  /**
   * Spec 179 (RF1): se o registro do motorista exige comprovante. **Opcional de propósito**:
   * ausente quer dizer "não mexa", e não `'off'` — o editor do painel ainda não manda o campo, e
   * zerá-lo aqui desligaria a exigência de foto de um tipo `required` a cada edição de e-mail.
   */
  readonly attachmentMode?: DeliveryProofFieldMode | undefined
  /**
   * Spec 247 (RF1): o valor pago digitado — modo, escopo e rótulo. Ausente é "não mexa", nunca o
   * padrão da coluna (`off`), que desligaria o campo de um tipo configurado a cada edição de e-mail.
   */
  readonly declaredAmountLabel?: string | undefined
  readonly declaredAmountMode?: DeliveryProofFieldMode | undefined
  readonly declaredAmountScope?: OccurrenceDeclaredAmountScope | undefined
  readonly emailBody: string
  /** Spec 247 (RF6): o formato de cada linha de item do e-mail. Ausente é "não mexa". */
  readonly emailItemLineTemplate?: string | undefined
  /** Spec 183 T802: ausente é "não mexa", como `attachmentMode`. */
  readonly emailsContractor?: boolean | undefined
  readonly emailSubject: string
  readonly emailTemplateKey: null | string
  /**
   * Spec 218 (D1, RF-B5): qual dos dois caminhos de registro este tipo alimenta. Obrigatório na
   * criação (a fronteira já recusa `occurrenceTypeId: null` sem `flow`, ver `occurrence.schema.ts`);
   * ausente na edição é "não mexa", mesmo motivo de `attachmentMode`.
   */
  readonly flow?: OccurrenceTypeFlow | undefined
  /**
   * Spec 246 (RF1c2): a quantidade mínima de produtos, só com `itemsMode = 'required'`; `null` é
   * "todos os itens da nota". Ausente é "não mexa".
   */
  readonly itemsMinimumCount?: null | number | undefined
  /**
   * Spec 241 (RF4), spec 246 (RF1b): se o tipo carrega produtos. Ausente é "não mexa", como
   * `attachmentMode` — nunca `'optional'`, que religaria um tipo `off`.
   */
  readonly itemsMode?: DeliveryProofFieldMode | undefined
  /**
   * Spec 185 (RF6, ADR-0074 §4): só tipo de separação pode "deixar a nota para trás" —
   * `saveOccurrenceTypeWithTemplate` recusa `true` com `stage !== 'separation'` antes de gravar.
   * Ausente é "não mexa", nunca `false` — mesmo motivo de `attachmentMode` acima.
   */
  readonly leavesDocumentBehind?: boolean | undefined
  /**
   * Spec 246 (RF0, T1b.1b): o conjunto de momentos. Presente, `stage`/`flow` gravados são os
   * derivados dele; ausente é "não mexa" — na edição o caso de uso só re-deriva quando o par muda
   * num tipo que o par diz inteiro, e na criação vale o derivado de `stage`/`flow`.
   */
  readonly moments?: readonly OccurrenceMoment[] | undefined
  readonly name: string
  /** Spec 246 (RF1, RF3): a exigência da observação. Ausente é "não mexa" — nunca `'optional'`. */
  readonly noteMode?: DeliveryProofFieldMode | undefined
  readonly notifies: boolean
  readonly occurrenceTypeId: null | string
  /** Spec 246 (RF1c): a quantidade mínima de fotos (1..5), lida só com a foto `required`. Ausente é "não mexa". */
  readonly photoMinimumCount?: number | undefined
  /** Spec 247 (RF1): o número do documento do cliente — modo e rótulo. Ausente é "não mexa". */
  readonly referenceNumberLabel?: string | undefined
  readonly referenceNumberMode?: DeliveryProofFieldMode | undefined
  /** Ausente é "não mexa" (spec 164 RF1) — o valor guardado fica; na criação vale `'unset'`. */
  readonly redeliveryPolicy?: RedeliveryPolicy | undefined
  /** Spec 246 (RF1): a exigência da assinatura. Ausente é "não mexa" — nunca `'off'`. */
  readonly signatureMode?: DeliveryProofFieldMode | undefined
  readonly stage: TripOccurrenceStage
}

/**
 * O que o cadastro lê do tipo já gravado para validar o estado resultante (spec 241 RF11) e decidir
 * o conjunto de momentos (spec 246 T1b.1b). `stage` ausente é dublê de teste: sem ele não há troca
 * de par para conferir.
 */
export type CurrentOccurrenceTypeShape = Partial<
  Pick<
    OccurrenceTypeRecord,
    | 'declaredAmountMode'
    | 'declaredAmountScope'
    | 'flow'
    | 'itemsMinimumCount'
    | 'moments'
    | 'stage'
  >
> &
  Pick<OccurrenceTypeRecord, 'itemsMode' | 'redeliveryPolicy'>

export type SaveOccurrenceTypeWithTemplateInput = {
  readonly companyId: string
  readonly findCurrentType: (input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }) => Promise<CurrentOccurrenceTypeShape | null>
  readonly save: (values: SaveOccurrenceTypeValues) => Promise<OccurrenceTypeRecord>
  readonly templates: OccurrenceEmailTemplateCatalogPort
  readonly values: SaveOccurrenceTypeValues
}

/**
 * ⚠️ **Chave presente é validada na gravação**, não no envio: descobrir o template inexistente
 * quando a ocorrência acontecer seria descobrir com o aviso já perdido. A chave é do aviso interno;
 * assunto e corpo são o e-mail à contratante e **seguem gravados como vieram** (spec 247 RF2) — zerá-los
 * aqui apagava, sem erro, o e-mail que o aviso automático (183) manda.
 */
export async function saveOccurrenceTypeWithTemplate(
  input: SaveOccurrenceTypeWithTemplateInput,
): Promise<OccurrenceTypeRecord> {
  const stored = await readStoredTypeWhenNeeded(input)
  const values = resolveMomentsChange({ stored, values: input.values })
  if (values.leavesDocumentBehind === true && values.stage !== 'separation') {
    throw new OccurrenceTypeLeavesDocumentBehindRequiresSeparationError()
  }

  assertItemsOffHasNoRedeliveryPolicy({ stored, values })
  assertItemsMinimumMatchesMode({ stored, values })
  assertDeclaredAmountHasItems({ stored, values })

  const { emailTemplateKey } = values
  if (emailTemplateKey === null) return input.save(values)

  const exists = await input.templates.hasActiveEmailTemplate({
    companyId: input.companyId,
    templateKey: emailTemplateKey,
  })
  if (!exists) throw new OccurrenceEmailTemplateNotFoundError()

  return input.save(values)
}

/** Uma leitura só do gravado, e só na edição que deixa algum campo ausente. */
async function readStoredTypeWhenNeeded(
  input: SaveOccurrenceTypeWithTemplateInput,
): Promise<CurrentOccurrenceTypeShape | null> {
  const {
    declaredAmountMode,
    declaredAmountScope,
    itemsMinimumCount,
    itemsMode,
    moments,
    occurrenceTypeId,
    redeliveryPolicy,
  } = input.values
  const isStoredStateNeeded =
    occurrenceTypeId !== null &&
    (itemsMode === undefined ||
      declaredAmountMode === undefined ||
      declaredAmountScope === undefined ||
      itemsMinimumCount === undefined ||
      redeliveryPolicy === undefined ||
      moments === undefined)
  return isStoredStateNeeded
    ? input.findCurrentType({ companyId: input.companyId, occurrenceTypeId })
    : null
}

type ResolveMomentsChangeParams = {
  readonly stored: CurrentOccurrenceTypeShape | null
  readonly values: SaveOccurrenceTypeValues
}

/**
 * Spec 246 (T1b.1b): com `moments`, o par gravado é o derivado do conjunto. Sem `moments`, o gravado
 * fica — salvo quando o `PUT` muda `stage`/`flow`: tipo que o par diz inteiro re-deriva o conjunto
 * (o painel de hoje troca `flow` assim); tipo com vários momentos é 409, nunca perda calada.
 */
function resolveMomentsChange(params: ResolveMomentsChangeParams): SaveOccurrenceTypeValues {
  const { stored, values } = params
  if (values.moments !== undefined) {
    const moments = normalizeOccurrenceMoments(values.moments)
    assertOccurrenceMomentsAreWritable(moments)
    return { ...values, ...deriveStageAndFlowFromMoments(moments), moments }
  }
  if (values.occurrenceTypeId === null || stored?.stage === undefined) return values

  const storedPair = { flow: stored.flow ?? OCCURRENCE_TYPE_FLOWS.document, stage: stored.stage }
  const nextPair = { flow: values.flow ?? storedPair.flow, stage: values.stage }
  if (nextPair.stage === storedPair.stage && nextPair.flow === storedPair.flow) return values
  if (!isExpressedByStageAndFlow({ ...storedPair, moments: stored.moments })) {
    throw new OccurrenceTypeMomentsStageConflictError()
  }
  return { ...values, moments: deriveOccurrenceMomentsFromStageAndFlow(nextPair) }
}
