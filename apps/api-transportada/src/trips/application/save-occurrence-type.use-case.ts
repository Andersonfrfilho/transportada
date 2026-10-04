/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 (revisão): o tipo de ocorrência **seleciona** um template do módulo de notificações —
 * o texto do e-mail mora só lá. Assunto/corpo próprios são legado: continuam gravados na linha
 * antiga, e o cadastro com chave os zera de propósito, porque o template manda.
 */
import {
  OccurrenceEmailTemplateNotFoundError,
  OccurrenceTypeItemsOffRedeliveryPolicyError,
  OccurrenceTypeLeavesDocumentBehindRequiresSeparationError,
} from '../domain/trip.error.js'
import type { RedeliveryPolicy } from '../../database/trip.schema.js'
import type { DeliveryProofFieldMode } from '../domain/delivery-proof-settings.policy.js'
import type {
  OccurrenceTypeFlow,
  TripOccurrenceStage,
} from '../../shared/trip-occurrence.constant.js'
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
  /** Spec 166 (RF3/RF9): se este tipo aceita mais de um item marcado. */
  readonly allowsMultipleItems: boolean
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
   * Spec 241 (RF4): se o tipo carrega produtos (`off`/`optional`; `required` é da 239). Ausente é
   * "não mexa", como `attachmentMode` — nunca `'optional'`, que religaria um tipo `off`.
   */
  readonly itemsMode?: Exclude<DeliveryProofFieldMode, 'required'> | undefined
  /**
   * Spec 185 (RF6, ADR-0074 §4): só tipo de separação pode "deixar a nota para trás" —
   * `saveOccurrenceTypeWithTemplate` recusa `true` com `stage !== 'separation'` antes de gravar.
   * Ausente é "não mexa", nunca `false` — mesmo motivo de `attachmentMode` acima.
   */
  readonly leavesDocumentBehind?: boolean | undefined
  readonly name: string
  readonly notifies: boolean
  readonly occurrenceTypeId: null | string
  /** Ausente é "não mexa" (spec 164 RF1) — o valor guardado fica; na criação vale `'unset'`. */
  readonly redeliveryPolicy?: RedeliveryPolicy | undefined
  readonly stage: TripOccurrenceStage
}

/** O que o cadastro lê do tipo já gravado para validar o estado resultante (spec 241 RF11). */
export type CurrentOccurrenceTypeShape = Pick<
  OccurrenceTypeRecord,
  'itemsMode' | 'redeliveryPolicy'
>

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
  if (input.values.leavesDocumentBehind === true && input.values.stage !== 'separation') {
    throw new OccurrenceTypeLeavesDocumentBehindRequiresSeparationError()
  }

  await assertItemsOffHasNoRedeliveryPolicy(input)

  const { emailTemplateKey } = input.values
  if (emailTemplateKey === null) return input.save(input.values)

  const exists = await input.templates.hasActiveEmailTemplate({
    companyId: input.companyId,
    templateKey: emailTemplateKey,
  })
  if (!exists) throw new OccurrenceEmailTemplateNotFoundError()

  return input.save({ ...input.values, emailBody: '', emailSubject: '' })
}

/**
 * Spec 241 (RF11, D1): valida o estado **resultante** — campo ausente lê o valor gravado, porque
 * `off` + política diferente de `unset` é tratativa que não fecha. A CHECK do banco é só a rede.
 */
async function assertItemsOffHasNoRedeliveryPolicy(
  input: SaveOccurrenceTypeWithTemplateInput,
): Promise<void> {
  const { itemsMode, occurrenceTypeId, redeliveryPolicy } = input.values
  const isStoredStateNeeded =
    occurrenceTypeId !== null && (itemsMode === undefined || redeliveryPolicy === undefined)
  const stored = isStoredStateNeeded
    ? await input.findCurrentType({ companyId: input.companyId, occurrenceTypeId })
    : null

  const resultingItemsMode = itemsMode ?? stored?.itemsMode ?? 'optional'
  const resultingPolicy = redeliveryPolicy ?? stored?.redeliveryPolicy ?? 'unset'
  if (resultingItemsMode === 'off' && resultingPolicy !== 'unset') {
    throw new OccurrenceTypeItemsOffRedeliveryPolicyError()
  }
}
