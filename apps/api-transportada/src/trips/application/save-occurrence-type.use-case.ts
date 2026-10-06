/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 (revisão): o tipo de ocorrência **seleciona** um template do módulo de notificações —
 * o texto do e-mail mora só lá. Assunto/corpo próprios são legado: continuam gravados na linha
 * antiga, e o cadastro com chave os zera de propósito, porque o template manda.
 */
import {
  OccurrenceEmailTemplateNotFoundError,
  OccurrenceTypeLeavesDocumentBehindRequiresSeparationError,
} from '../domain/trip.error.js'
import type { RedeliveryPolicy } from '../../database/trip.schema.js'
import type { DeliveryProofFieldMode } from '../domain/delivery-proof-settings.policy.js'
import { OCCURRENCE_TYPE_FLOWS } from '../../shared/trip-occurrence.constant.js'
import type {
  OccurrenceMoment,
  OccurrenceTypeFlow,
  TripOccurrenceStage,
} from '../../shared/trip-occurrence.constant.js'
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
  readonly emailBody: string
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
  Pick<OccurrenceTypeRecord, 'flow' | 'itemsMinimumCount' | 'moments' | 'stage'>
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
 * quando a ocorrência acontecer seria descobrir com o aviso já perdido. E com chave, assunto e
 * corpo do corpo da requisição são **ignorados e zerados** — dois textos para o mesmo aviso é o
 * defeito que esta revisão remove.
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

  const { emailTemplateKey } = values
  if (emailTemplateKey === null) return input.save(values)

  const exists = await input.templates.hasActiveEmailTemplate({
    companyId: input.companyId,
    templateKey: emailTemplateKey,
  })
  if (!exists) throw new OccurrenceEmailTemplateNotFoundError()

  return input.save({ ...values, emailBody: '', emailSubject: '' })
}

/** Uma leitura só do gravado, e só na edição que deixa algum campo ausente. */
async function readStoredTypeWhenNeeded(
  input: SaveOccurrenceTypeWithTemplateInput,
): Promise<CurrentOccurrenceTypeShape | null> {
  const { itemsMinimumCount, itemsMode, moments, occurrenceTypeId, redeliveryPolicy } = input.values
  const isStoredStateNeeded =
    occurrenceTypeId !== null &&
    (itemsMode === undefined ||
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
