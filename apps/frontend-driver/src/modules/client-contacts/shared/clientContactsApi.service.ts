/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DRIVER_CONVERSATION_ERROR } from '@/modules/conversation/shared/driverConversation.constant'
import {
  DriverConversationRequestError,
  type DriverConversationHttp,
} from '@/modules/conversation/shared/driverConversationsHttp.service'

import {
  CLIENT_CONTACT_CHANNELS,
  CLIENT_CONTACT_PATH,
  CLIENT_CONTACTS_PATH,
  type ClientContact,
  type ClientContactChannel,
} from './clientContacts.types'

export type ClientContactsApi = Readonly<{
  add: (input: {
    readonly address: string
    readonly channel: ClientContactChannel
    readonly documentId: string
    readonly label: string
  }) => Promise<ClientContact>
  list: (documentId: string) => Promise<readonly ClientContact[]>
  remove: (input: { readonly contactId: string; readonly documentId: string }) => Promise<void>
  update: (input: {
    readonly address?: string
    readonly contactId: string
    readonly documentId: string
    readonly label?: string
  }) => Promise<ClientContact>
}>

function invalidResponse(): never {
  throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.RESPONSE_INVALID)
}

/** Descarta o item malformado: o contato é leitura, e um item ruim não derruba a seção. */
export function parseClientContact(value: unknown): ClientContact | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const item = value as Readonly<Record<string, unknown>>
  const channel = CLIENT_CONTACT_CHANNELS.find((known) => known === item.channel)
  if (
    channel === undefined ||
    typeof item.contactId !== 'string' ||
    typeof item.addressMasked !== 'string' ||
    typeof item.label !== 'string' ||
    typeof item.editable !== 'boolean'
  ) {
    return undefined
  }
  return {
    addressMasked: item.addressMasked,
    channel,
    contactId: item.contactId,
    editable: item.editable,
    label: item.label,
  }
}

function readData(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) invalidResponse()
  return payload.data
}

function readContact(payload: unknown): ClientContact {
  return parseClientContact(readData(payload)) ?? invalidResponse()
}

export function createClientContactsApi(http: DriverConversationHttp): ClientContactsApi {
  return {
    add: async (input) =>
      readContact(
        await http.postJson(CLIENT_CONTACTS_PATH(input.documentId), {
          body: { address: input.address, channel: input.channel, label: input.label },
        }),
      ),
    list: async (documentId) => {
      const data = readData(await http.getJson(CLIENT_CONTACTS_PATH(documentId)))
      if (!Array.isArray(data)) invalidResponse()
      return (data as readonly unknown[])
        .map(parseClientContact)
        .filter((contact): contact is ClientContact => contact !== undefined)
    },
    remove: async (input) => {
      await http.deleteJson(CLIENT_CONTACT_PATH(input.documentId, input.contactId))
    },
    update: async (input) =>
      readContact(
        await http.patchJson(CLIENT_CONTACT_PATH(input.documentId, input.contactId), {
          body: {
            ...(input.address === undefined ? {} : { address: input.address }),
            ...(input.label === undefined ? {} : { label: input.label }),
          },
        }),
      ),
  }
}
