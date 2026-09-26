/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { TripClient } from '@/modules/trip/shared/tripClient.service'

export type OccurrenceTypeSaveInput = Parameters<TripClient['saveOccurrenceType']>[0]

type OccurrenceTypeChange = Partial<
  Pick<
    OccurrenceTypeSaveInput,
    | 'active'
    | 'allowsMultipleItems'
    | 'attachmentMode'
    | 'emailsContractor'
    | 'name'
    | 'notifies'
    | 'redeliveryPolicy'
  >
>

/**
 * Item 9 da spec 183: a edição de uma linha do catálogo regrava o tipo **inteiro**, a partir do tipo
 * lido. Antes cada interruptor montava o próprio corpo à mão, e todo campo que nasceu depois
 * (`attachmentMode`, `emailsContractor`) ficou fora de todos eles. Campo novo do tipo entra aqui, e
 * só aqui.
 */
export function occurrenceTypeEdit(
  type: OccurrenceType,
  change: OccurrenceTypeChange,
): OccurrenceTypeSaveInput {
  return {
    active: type.active,
    allowsMultipleItems: type.allowsMultipleItems,
    attachmentMode: type.attachmentMode,
    emailTemplateKey: type.emailTemplateKey,
    emailsContractor: type.emailsContractor,
    name: type.name,
    notifies: type.notifies,
    occurrenceTypeId: type.id,
    redeliveryPolicy: type.redeliveryPolicy,
    stage: type.stage,
    ...change,
  }
}
