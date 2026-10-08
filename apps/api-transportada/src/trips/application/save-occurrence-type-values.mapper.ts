/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Do corpo do `PUT` do catálogo para os valores do caso de uso, campo a campo. Em arquivo próprio
 * para a composição não esquecer campo calada: um campo aceito pela fronteira e não repassado aqui
 * é gravação perdida sem erro nenhum (`moments` ficou de fora assim até a 246 T1c.4).
 */
import type { SaveOccurrenceTypeValues } from './save-occurrence-type.use-case.js'

export function toSaveOccurrenceTypeValues(
  input: SaveOccurrenceTypeValues,
): SaveOccurrenceTypeValues {
  return {
    active: input.active,
    allowsMultipleItems: input.allowsMultipleItems,
    attachmentMode: input.attachmentMode,
    declaredAmountLabel: input.declaredAmountLabel,
    declaredAmountMode: input.declaredAmountMode,
    declaredAmountScope: input.declaredAmountScope,
    emailBody: input.emailBody,
    emailItemLineTemplate: input.emailItemLineTemplate,
    emailSubject: input.emailSubject,
    emailsContractor: input.emailsContractor,
    emailTemplateKey: input.emailTemplateKey,
    flow: input.flow,
    iconName: input.iconName,
    itemsMinimumCount: input.itemsMinimumCount,
    itemsMode: input.itemsMode,
    leavesDocumentBehind: input.leavesDocumentBehind,
    moments: input.moments,
    name: input.name,
    noteMode: input.noteMode,
    notifies: input.notifies,
    occurrenceTypeId: input.occurrenceTypeId,
    photoMinimumCount: input.photoMinimumCount,
    referenceNumberLabel: input.referenceNumberLabel,
    referenceNumberMode: input.referenceNumberMode,
    redeliveryPolicy: input.redeliveryPolicy,
    signatureMode: input.signatureMode,
    stage: input.stage,
  }
}
