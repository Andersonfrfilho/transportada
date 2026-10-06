/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (revisão do painel M4): o corpo do cadastro de tipo novo. Os momentos são a fonte; o grupo
 * (`stage`) e o fluxo (`flow`) que a API ainda grava saem deles, e o que a API anterior recusa não vai.
 */
import {
  OCCURRENCE_ATTACHMENT_MODE,
  OCCURRENCE_REDELIVERY_POLICY,
  TRIP_OCCURRENCE_STAGE,
  type OccurrenceAttachmentMode,
  type OccurrenceItemsWriteMode,
  type OccurrenceMoment,
  type OccurrenceRedeliveryPolicy,
  type OccurrenceTypeFlow,
  type TripOccurrenceStage,
} from './occurrence.constant'
import { readRequirementFieldsOfMoments } from './occurrenceRequirementScope.service'
import { OCCURRENCE_TEMPLATE_NONE } from './occurrenceTemplate.service'
import type { OccurrenceTypeSaveInput } from './occurrenceTypeUpdate.service'

export type OccurrenceTypeCreateDraft = Readonly<{
  allowsMultipleItems: boolean
  attachmentMode: OccurrenceAttachmentMode
  emailTemplateKey: string
  itemsMode: OccurrenceItemsWriteMode
  leavesDocumentBehind: boolean
  moments: readonly OccurrenceMoment[]
  name: string
  noteMode: OccurrenceAttachmentMode
  notifies: boolean
  redeliveryPolicy: OccurrenceRedeliveryPolicy
  signatureMode: OccurrenceAttachmentMode
}>

/** O que a API que responde a listagem sabe receber: o painel não manda o que ela recusaria com `.strict()`. */
export type OccurrenceTypeCreateSupport = Readonly<{
  hasItemsMode: boolean
  hasMoments: boolean
  hasRequirementModes: boolean
}>

export function deriveOccurrenceStage(moments: readonly OccurrenceMoment[]): TripOccurrenceStage {
  return moments.includes('separation')
    ? TRIP_OCCURRENCE_STAGE.separation
    : TRIP_OCCURRENCE_STAGE.delivery
}

export function deriveOccurrenceFlow(moments: readonly OccurrenceMoment[]): OccurrenceTypeFlow {
  return moments.includes('stop') ? 'stop' : 'document'
}

export function buildOccurrenceTypeCreateInput(
  input: Readonly<{ draft: OccurrenceTypeCreateDraft; support: OccurrenceTypeCreateSupport }>,
): OccurrenceTypeSaveInput {
  const { draft, support } = input
  const fields = readRequirementFieldsOfMoments(draft.moments)
  const stage = support.hasMoments
    ? deriveOccurrenceStage(draft.moments)
    : TRIP_OCCURRENCE_STAGE.delivery
  const isItemsOff = support.hasItemsMode && draft.itemsMode === 'off'
  return {
    active: true,
    allowsMultipleItems: draft.allowsMultipleItems,
    attachmentMode: fields.includes('photo')
      ? draft.attachmentMode
      : OCCURRENCE_ATTACHMENT_MODE.off,
    emailTemplateKey:
      draft.emailTemplateKey === OCCURRENCE_TEMPLATE_NONE ? null : draft.emailTemplateKey,
    flow: deriveOccurrenceFlow(draft.moments),
    ...(support.hasItemsMode ? { itemsMode: draft.itemsMode } : {}),
    leavesDocumentBehind: stage === TRIP_OCCURRENCE_STAGE.separation && draft.leavesDocumentBehind,
    ...(support.hasMoments ? { moments: draft.moments } : {}),
    name: draft.name,
    ...(support.hasRequirementModes && fields.includes('note') ? { noteMode: draft.noteMode } : {}),
    notifies: draft.notifies,
    occurrenceTypeId: null,
    redeliveryPolicy: isItemsOff ? OCCURRENCE_REDELIVERY_POLICY.unset : draft.redeliveryPolicy,
    ...(support.hasRequirementModes && fields.includes('signature')
      ? { signatureMode: draft.signatureMode }
      : {}),
    stage,
  }
}
