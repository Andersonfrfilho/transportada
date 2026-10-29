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
    contractorReplyAlertIntervalMinutes: input.contractorReplyAlertIntervalMinutes,
    contractorReplyAlertMaxCount: input.contractorReplyAlertMaxCount,
    contractorReplyAlertMode: input.contractorReplyAlertMode,
    contractorReplyAttachmentKind: input.contractorReplyAttachmentKind,
    contractorReplyResolveOnDelivery: input.contractorReplyResolveOnDelivery,
    duplicateRequestPolicy: input.duplicateRequestPolicy,
    driverLockHours: input.driverLockHours,
    clientEmailType: input.clientEmailType,
    clientEmailSendMode: input.clientEmailSendMode,
    clientChannel: input.clientChannel,
    clientChannels: input.clientChannels,
    asksClientContact: input.asksClientContact,
    asksNewDueDate: input.asksNewDueDate,
    contractorReplyAcknowledgementQuickReplyId: input.contractorReplyAcknowledgementQuickReplyId,
    contractorReplyMode: input.contractorReplyMode,
    contractorReplyWaitHours: input.contractorReplyWaitHours,
    driverReplyTemplate: input.driverReplyTemplate,
    forwardToNoteRecipient: input.forwardToNoteRecipient,
    forwardToInformedEmail: input.forwardToInformedEmail,
    forwardEmailSubject: input.forwardEmailSubject,
    forwardEmailBody: input.forwardEmailBody,
    emailsContractor: input.emailsContractor,
    contractorNotificationTemplateKey: input.contractorNotificationTemplateKey,
    contractorMailWatcherUserIds: input.contractorMailWatcherUserIds,
    contractorMailRecipientContactIds: input.contractorMailRecipientContactIds,
    contractorIds: input.contractorIds,
    contractorScope: input.contractorScope,
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
