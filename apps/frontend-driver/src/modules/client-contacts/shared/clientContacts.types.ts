/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor de `DELIVERY_CLIENT_CONTACT_CHANNELS` e `CLIENT_CHANNELS` (spec 281). */
export const CLIENT_CONTACT_CHANNELS = ['email', 'whatsapp'] as const
export type ClientContactChannel = (typeof CLIENT_CONTACT_CHANNELS)[number]

export const CLIENT_CHANNEL_VALUES = ['off', 'email', 'whatsapp', 'both'] as const
export type ClientChannelValue = (typeof CLIENT_CHANNEL_VALUES)[number]

/** O contato do cliente da nota, como a API devolve: o endereço nunca vem em claro. */
export type ClientContact = Readonly<{
  addressMasked: string
  channel: ClientContactChannel
  contactId: string
  /** `true` só para o que este motorista informou; o cadastro do escritório ele só vê. */
  editable: boolean
  label: string
}>

export const CLIENT_CONTACTS_PATH = (documentId: string): string =>
  `/me/trips/current/documents/${documentId}/client-contacts`
export const CLIENT_CONTACT_PATH = (documentId: string, contactId: string): string =>
  `${CLIENT_CONTACTS_PATH(documentId)}/${contactId}`
