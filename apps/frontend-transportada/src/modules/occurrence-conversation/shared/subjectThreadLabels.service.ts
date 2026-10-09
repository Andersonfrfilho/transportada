/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantConversationsLabels } from '@adatechnology/conversations-ui/participant'

/** Os rótulos do SDK que o fio usa; a lista inteira mora em `thread.labels.*` do namespace do assunto. */
export const SUBJECT_THREAD_LABEL_KEYS = [
  'attach',
  'attachmentTooLarge',
  'attachmentTypeNotAccepted',
  'attachmentsList',
  'back',
  'channelApp',
  'channelEmail',
  'channelPortal',
  'channelWebchat',
  'channelWhatsapp',
  'channelsGroup',
  'copyProtocol',
  'copyValue',
  'discard',
  'downloadAttachment',
  'edit',
  'externalLinkHint',
  'loadError',
  'loadMore',
  'loadOlder',
  'loading',
  'me',
  'messageInputLabel',
  'messageInputPlaceholder',
  'newMessages',
  'notFound',
  'protocolCopied',
  'protocolPrefix',
  'quickRepliesGroup',
  'removeAttachment',
  'retry',
  'scrollToLatest',
  'send',
  'statusDelivered',
  'statusFailed',
  'statusFailedShort',
  'statusQueued',
  'statusRead',
  'statusSending',
  'statusSent',
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
