/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantConversationsLabels } from '@adatechnology/conversations-ui/participant'

/** Os rótulos do SDK que o fio usa; a lista inteira mora em `thread.labels.*` do namespace do assunto. */
export const SUBJECT_THREAD_LABEL_KEYS = [
  'attach',
  'attachmentTooLarge',
  'attachmentTypeNotAccepted',
  'attachmentsList',
  'audioEmpty',
  'audioPlayer',
  'audioPosition',
  'audioPositionValue',
  'audioTooLarge',
  'audioUnavailable',
  'back',
  'cancelSelection',
  'channelApp',
  'channelEmail',
  'channelPortal',
  'channelWebchat',
  'channelWhatsapp',
  'channelsGroup',
  'closeMessageInfo',
  'collapseTranscription',
  'conversationOptions',
  'copyMessage',
  'copyProtocol',
  'copySelection',
  'copyValue',
  'discard',
  'discardAudio',
  'downloadAttachment',
  'downloadConversation',
  'edit',
  'emptyTranscription',
  'externalLinkHint',
  'infoAuthor',
  'infoReadAt',
  'infoSentAt',
  'infoStatus',
  'loadError',
  'loadMore',
  'loadOlder',
  'loading',
  'machineTranscription',
  'me',
  'messageInfo',
  'messageInputLabel',
  'messageInputPlaceholder',
  'messageOptions',
  'microphoneDenied',
  'newMessages',
  'notFound',
  'pauseAudio',
  'playAudio',
  'playbackRate',
  'protocolCopied',
  'protocolPrefix',
  'quickRepliesGroup',
  'recordAudio',
  'recordingElapsed',
  'recordingInProgress',
  'recordingUnsupported',
  'removeAttachment',
  'retry',
  'reviewAudio',
  'scrollToLatest',
  'selectMessage',
  'selectMessages',
  'selectedCount',
  'send',
  'sendAudio',
  'showFullTranscription',
  'showOriginalText',
  'statusDelivered',
  'statusFailed',
  'statusFailedShort',
  'statusQueued',
  'statusRead',
  'statusSending',
  'statusSent',
  'stopRecording',
  'transcribing',
  'transcriptionReady',
  'transcriptionTooLong',
  'valueCopied',
] as const satisfies readonly (keyof ParticipantConversationsLabels)[]

export type SubjectThreadTranslate = (key: string) => string

/** `closedNotice` varia com o motivo (encerrada, viagem terminou, só leitura): quem monta passa o texto. */
export function buildSubjectThreadLabels(
  translate: SubjectThreadTranslate,
  closedNotice: string,
): Partial<ParticipantConversationsLabels> {
  const labels: Partial<Record<keyof ParticipantConversationsLabels, string>> = { closedNotice }
  for (const key of SUBJECT_THREAD_LABEL_KEYS) labels[key] = translate(`thread.labels.${key}`)
  return labels
}

/**
 * Spec 274: o fio da contratante sai por e-mail, não pelo app. O padrão do assunto fala "ao motorista" e promete
 * reenvio "quando a rede voltar" (fila offline do app); aqui os textos são os do e-mail. `translate` lê o
 * namespace `occurrenceConversation`.
 */
export function buildContractorThreadLabels(
  translate: SubjectThreadTranslate,
): Partial<ParticipantConversationsLabels> {
  return {
    messageInputLabel: translate('thread.contractorInputLabel'),
    messageInputPlaceholder: translate('thread.contractorInputPlaceholder'),
    newMessages: translate('thread.contractorNewMessages'),
    statusQueued: translate('thread.contractorQueued'),
  }
}
