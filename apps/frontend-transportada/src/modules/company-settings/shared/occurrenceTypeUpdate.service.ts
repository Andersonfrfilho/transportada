/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  OCCURRENCE_REDELIVERY_POLICY,
  type OccurrenceAttachmentMode,
  type OccurrenceItemsWriteMode,
  type OccurrenceRedeliveryPolicy,
  type OccurrenceType,
  type OccurrenceTypeFlow,
  type TripOccurrenceStage,
} from '@/modules/trip/shared/occurrence.constant'

export type OccurrenceTypeSaveInput = Readonly<{
  active: boolean
  /** Spec 166 RF9: desligado, o campo de item na tela de registro vira seleção única. */
  allowsMultipleItems: boolean
  /** Spec 179 RF1: só tem efeito em tipo de rua — é o motorista quem tira a foto. */
  attachmentMode: OccurrenceAttachmentMode
  emailTemplateKey: null | string
  /** Spec 218 (D1, RF-B5): `undefined` é "não mexe" — só a troca explícita do seletor manda o campo. */
  flow?: OccurrenceTypeFlow | undefined
  /** Spec 241 RF4: `undefined` é "não mexe" — só a troca do seletor Produtos manda o campo. */
  itemsMode?: OccurrenceItemsWriteMode | undefined
  /** Spec 185 T6.1 (D2, RF6): só vale para `stage: 'separation'` — o CHECK do banco recusa em `delivery`. */
  leavesDocumentBehind: boolean
  name: string
  notifies: boolean
  occurrenceTypeId: null | string
  /** Spec 164 RF1: conjunto completo — sempre enviado, nunca omitido no `PUT`. */
  redeliveryPolicy: OccurrenceRedeliveryPolicy
  stage: TripOccurrenceStage
}>

export type OccurrenceTypeEdit = Readonly<
  Partial<
    Pick<
      OccurrenceTypeSaveInput,
      | 'active'
      | 'allowsMultipleItems'
      | 'attachmentMode'
      | 'flow'
      | 'itemsMode'
      | 'leavesDocumentBehind'
      | 'notifies'
      | 'redeliveryPolicy'
    >
  >
>

/** Spec 241 RF4: Produtos Desligado zera a política — tipo sem produtos não abre tratativa. */
export function buildOccurrenceTypeUpdate(
  type: OccurrenceType,
  edit: OccurrenceTypeEdit = {},
): OccurrenceTypeSaveInput {
  const redeliveryPolicy =
    edit.itemsMode === 'off'
      ? OCCURRENCE_REDELIVERY_POLICY.unset
      : (edit.redeliveryPolicy ?? type.redeliveryPolicy)
  return {
    active: type.active,
    allowsMultipleItems: type.allowsMultipleItems,
    attachmentMode: type.attachmentMode,
    emailTemplateKey: type.emailTemplateKey,
    leavesDocumentBehind: type.leavesDocumentBehind,
    name: type.name,
    notifies: type.notifies,
    occurrenceTypeId: type.id,
    stage: type.stage,
    ...edit,
    redeliveryPolicy,
  }
}
