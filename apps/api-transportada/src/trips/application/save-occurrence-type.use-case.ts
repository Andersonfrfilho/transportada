/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 (revisão): o tipo de ocorrência **seleciona** um template do módulo de notificações —
 * o texto do e-mail mora só lá. Assunto/corpo próprios são legado: continuam gravados na linha
 * antiga, e o cadastro com chave os zera de propósito, porque o template manda.
 */
import { OccurrenceEmailTemplateNotFoundError } from '../domain/trip.error.js'
import type { RedeliveryPolicy } from '../../database/trip.schema.js'
import type { DeliveryProofFieldMode } from '../domain/delivery-proof-settings.policy.js'
import type { TripOccurrenceStage } from '../../shared/trip-occurrence.constant.js'
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
  /** Spec 179 (RF1): se o registro do motorista exige comprovante. */
  readonly attachmentMode: DeliveryProofFieldMode
  readonly emailBody: string
  readonly emailSubject: string
  readonly emailTemplateKey: null | string
  readonly name: string
  readonly notifies: boolean
  readonly occurrenceTypeId: null | string
  /** Ausente é `'unset'` — nenhum caso de tratativa abre para este tipo. */
  readonly redeliveryPolicy?: RedeliveryPolicy
  readonly stage: TripOccurrenceStage
}

export type SaveOccurrenceTypeWithTemplateInput = {
  readonly companyId: string
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
  const { emailTemplateKey } = input.values
  if (emailTemplateKey === null) return input.save(input.values)

  const exists = await input.templates.hasActiveEmailTemplate({
    companyId: input.companyId,
    templateKey: emailTemplateKey,
  })
  if (!exists) throw new OccurrenceEmailTemplateNotFoundError()

  return input.save({ ...input.values, emailBody: '', emailSubject: '' })
}
