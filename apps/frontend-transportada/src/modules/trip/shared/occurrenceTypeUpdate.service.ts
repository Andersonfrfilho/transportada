/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  OCCURRENCE_ITEMS_MODE,
  OCCURRENCE_REDELIVERY_POLICY,
  type OccurrenceAttachmentMode,
  type OccurrenceItemsWriteMode,
  type OccurrenceMoment,
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
  /**
   * Spec 246 RF1c2/RF4: `null` é "todos os itens da nota". Só vai com Produtos obrigatório — e sair
   * de `required` manda `null` explícito, porque a CHECK do banco recusa o mínimo em outro modo.
   */
  itemsMinimumCount?: null | number | undefined
  /** Spec 241 RF4: `undefined` é "não mexe" — só a troca do seletor Produtos manda o campo. */
  itemsMode?: OccurrenceItemsWriteMode | undefined
  /** Spec 185 T6.1 (D2, RF6): só vale para `stage: 'separation'` — o CHECK do banco recusa em `delivery`. */
  leavesDocumentBehind: boolean
  /** Spec 246 RF0/RF4: `undefined` é "não mexe". */
  moments?: readonly OccurrenceMoment[] | undefined
  name: string
  /** Spec 246 RF1/RF4: a observação e a assinatura — `undefined` é "não mexe". */
  noteMode?: OccurrenceAttachmentMode | undefined
  notifies: boolean
  occurrenceTypeId: null | string
  /** Spec 246 RF1c/RF4: de 1 a 5, só vale com a foto obrigatória — `undefined` é "não mexe". */
  photoMinimumCount?: number | undefined
  /** Spec 164 RF1: conjunto completo — sempre enviado, nunca omitido no `PUT`. */
  redeliveryPolicy: OccurrenceRedeliveryPolicy
  signatureMode?: OccurrenceAttachmentMode | undefined
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
      | 'itemsMinimumCount'
      | 'itemsMode'
      | 'leavesDocumentBehind'
      | 'moments'
      | 'noteMode'
      | 'notifies'
      | 'photoMinimumCount'
      | 'redeliveryPolicy'
      | 'signatureMode'
    >
  >
>

/**
 * Spec 246 RF1c2: o mínimo de produtos só existe com Produtos obrigatório. Sair de `required` manda
 * `null` explícito; com o tipo (já ou agora) obrigatório, vai o que a edição trouxe; senão nada.
 */
function resolveItemsMinimumCount(
  type: OccurrenceType,
  edit: Pick<OccurrenceTypeEdit, 'itemsMode'>,
  itemsMinimumCount: OccurrenceTypeEdit['itemsMinimumCount'],
): Pick<OccurrenceTypeSaveInput, 'itemsMinimumCount'> {
  const wasRequired = type.itemsMode === OCCURRENCE_ITEMS_MODE.required
  if (
    wasRequired &&
    edit.itemsMode !== undefined &&
    edit.itemsMode !== OCCURRENCE_ITEMS_MODE.required
  ) {
    return { itemsMinimumCount: null }
  }
  const itemsMode = edit.itemsMode ?? type.itemsMode
  if (itemsMinimumCount === undefined || itemsMode !== OCCURRENCE_ITEMS_MODE.required) return {}
  return { itemsMinimumCount }
}

/** Spec 241 RF4: Produtos Desligado zera a política — tipo sem produtos não abre tratativa. */
export function buildOccurrenceTypeUpdate(
  type: OccurrenceType,
  edit: OccurrenceTypeEdit = {},
): OccurrenceTypeSaveInput {
  const redeliveryPolicy =
    edit.itemsMode === OCCURRENCE_ITEMS_MODE.off
      ? OCCURRENCE_REDELIVERY_POLICY.unset
      : (edit.redeliveryPolicy ?? type.redeliveryPolicy)
  const { itemsMinimumCount, ...editWithoutMinimum } = edit
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
    ...editWithoutMinimum,
    ...resolveItemsMinimumCount(type, edit, itemsMinimumCount),
    redeliveryPolicy,
  }
}
