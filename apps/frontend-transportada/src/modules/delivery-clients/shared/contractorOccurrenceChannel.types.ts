/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Spec 318: por onde o aviso automático da ocorrência chega à contratante. */
export const OCCURRENCE_CHANNEL_KINDS = ['email', 'whatsapp_group'] as const
export type OccurrenceChannelKind = (typeof OCCURRENCE_CHANNEL_KINDS)[number]

export const OCCURRENCE_CHANNEL_KEYS = [
  'channel',
  'emailFallback',
  'groupJid',
  'groupName',
  'mentionPhone',
  'updatedAt',
] as const

export const OCCURRENCE_CHANNEL_GROUP_KEYS = ['groupJid', 'name', 'owner'] as const
export const OCCURRENCE_CHANNEL_GROUP_OWNER_KEYS = ['id', 'kind', 'name'] as const

export type ContractorOccurrenceChannel = Readonly<{
  channel: OccurrenceChannelKind
  emailFallback: boolean
  groupJid: null | string
  groupName: string
  mentionPhone: null | string
  updatedAt: null | string
}>

export type ContractorOccurrenceChannelGroup = Readonly<{
  groupJid: string
  name: string
  owner: null | Readonly<{ id: string; kind: 'contractor' | 'driver'; name: string }>
}>

export type ContractorOccurrenceChannelSaveBody =
  | Readonly<{ channel: 'email'; emailFallback: boolean }>
  | Readonly<{
      channel: 'whatsapp_group'
      emailFallback: boolean
      groupJid: string
      groupName: string
      mentionPhone: string
    }>
