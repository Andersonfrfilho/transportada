/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T2 (RF1, RF2): o `PUT` do tipo aceita a matriz "Retorno ao cliente" (`clientChannels`), canal a canal, e
 * confere a chave do modelo **no canal** contra o módulo de notificação — todos os problemas de uma vez. O tipo só
 * seleciona a chave; texto livre novo não entra por aqui.
 */
import { describe, expect, test } from 'bun:test'

import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import {
  saveOccurrenceTypeWithTemplate,
  type OccurrenceEmailTemplateCatalogPort,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import { assessClientChannelTemplate } from '../../src/trips/domain/occurrence-client-channel-template.policy.js'
import { OccurrenceClientChannelTemplateInvalidError } from '../../src/trips/domain/occurrence-client-channels.error.js'
import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-0000000000e1'

function putRequest(body: unknown): Request {
  return new Request('http://localhost/company-settings/occurrence-types', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

function baseBody(): Record<string, unknown> {
  return {
    active: true,
    emailTemplateKey: null,
    name: 'Cliente pediu prorrogação do boleto',
    notifies: false,
    occurrenceTypeId: OCCURRENCE_TYPE_ID,
    stage: 'delivery',
  }
}

async function parseStatus(body: unknown): Promise<number | undefined> {
  return parseOccurrenceTypeRequest(putRequest(body)).then(
    () => undefined,
    (reason: unknown) => (reason as { status: number }).status,
  )
}

type Templates = Record<string, { readonly body: string; readonly subject: null | string }>

async function save(params: {
  readonly templates: Templates
  readonly values: SaveOccurrenceTypeValues
}): Promise<{ readonly error: unknown; readonly saved: SaveOccurrenceTypeValues[] }> {
  const saved: SaveOccurrenceTypeValues[] = []
  const templates: OccurrenceEmailTemplateCatalogPort = {
    findClientChannelTemplate: async ({ channel, key }) =>
      params.templates[`${channel}:${key}`] ?? null,
    findContractorTemplate: async () => null,
    hasActiveEmailTemplate: async () => true,
  }
  const error = await saveOccurrenceTypeWithTemplate({
    companyId: COMPANY_ID,
    findCurrentType: async () => null,
    save: async (values) => {
      saved.push(values)
      return {
        active: true,
        allowsMultipleItems: true,
        emailTemplateKey: null,
        id: OCCURRENCE_TYPE_ID,
        itemsMode: 'optional',
        name: values.name,
        notifies: false,
        redeliveryPolicy: 'unset',
        stage: values.stage,
      } satisfies OccurrenceTypeRecord
    },
    templates,
    values: params.values,
  }).then(
    () => undefined,
    (reason: unknown) => reason,
  )
  return { error, saved }
}

function values(
  clientChannels: SaveOccurrenceTypeValues['clientChannels'],
): SaveOccurrenceTypeValues {
  return {
    active: true,
    clientChannels,
    emailTemplateKey: null,
    name: 'Boleto',
    notifies: false,
    occurrenceTypeId: OCCURRENCE_TYPE_ID,
    stage: 'delivery',
  }
}

describe('spec 286 T2: a fronteira da matriz por canal', () => {
  test('ausente fica ausente — nunca mexe nas caixas gravadas', async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest(baseBody()))
    expect('clientChannels' in parsed).toBe(false)
  })

  test('um canal só é aceito; o outro fica ausente', async () => {
    const parsed = await parseOccurrenceTypeRequest(
      putRequest({
        ...baseBody(),
        clientChannels: {
          whatsapp: { enabled: true, sendMode: 'automatic', templateKey: ' boleto.whatsapp ' },
        },
      }),
    )
    expect(parsed.clientChannels).toEqual({
      whatsapp: { enabled: true, sendMode: 'automatic', templateKey: 'boleto.whatsapp' },
    })
  })

  test.each([
    ['canal desconhecido', { sms: { enabled: true, sendMode: 'manual', templateKey: null } }],
    [
      'modo off (desligado é a caixa)',
      { email: { enabled: false, sendMode: 'off', templateKey: null } },
    ],
    ['canal pela metade', { email: { enabled: true } }],
    ['chave vazia', { email: { enabled: true, sendMode: 'manual', templateKey: '  ' } }],
    [
      'texto livre no canal',
      { email: { enabled: true, sendMode: 'manual', templateKey: null, body: 'Olá' } },
    ],
  ])('%s é 400', async (_label, clientChannels) => {
    expect(await parseStatus({ ...baseBody(), clientChannels })).toBe(400)
  })
})

describe('spec 286 T2: a chave é conferida no canal, na gravação', () => {
  test('modelo do canal certo grava', async () => {
    const { error, saved } = await save({
      templates: {
        'email:boleto': { body: 'Segue o boleto.', subject: 'Boleto' },
        'whatsapp:boleto': { body: 'Segue o boleto.', subject: null },
      },
      values: values({
        email: { enabled: true, sendMode: 'manual', templateKey: 'boleto' },
        whatsapp: { enabled: true, sendMode: 'automatic', templateKey: 'boleto' },
      }),
    })
    expect(error).toBeUndefined()
    expect(saved).toHaveLength(1)
  })

  test('chave nula grava: o canal fica sem modelo e não sai', async () => {
    const { error } = await save({
      templates: {},
      values: values({ whatsapp: { enabled: true, sendMode: 'manual', templateKey: null } }),
    })
    expect(error).toBeUndefined()
  })

  test('modelo só de e-mail não serve ao WhatsApp, e todos os problemas vêm juntos', async () => {
    const { error, saved } = await save({
      templates: { 'email:boleto': { body: 'Segue.', subject: '' } },
      values: values({
        email: { enabled: true, sendMode: 'manual', templateKey: 'boleto' },
        whatsapp: { enabled: true, sendMode: 'manual', templateKey: 'boleto' },
      }),
    })
    expect(saved).toHaveLength(0)
    expect(error).toBeInstanceOf(OccurrenceClientChannelTemplateInvalidError)
    const invalid = error as OccurrenceClientChannelTemplateInvalidError
    expect(invalid.status).toBe(400)
    expect(invalid.code).toBe('OCCURRENCE_CLIENT_CHANNEL_TEMPLATE_INVALID')
    expect(invalid.details).toEqual([
      { field: 'clientChannels.email.templateKey', message: 'empty_subject' },
      { field: 'clientChannels.whatsapp.templateKey', message: 'not_found' },
    ])
  })
})

describe('spec 286 T2: assessClientChannelTemplate', () => {
  test('o WhatsApp não tem assunto; o e-mail precisa dele', () => {
    const template = { body: 'Segue o boleto.', subject: null }
    expect(assessClientChannelTemplate({ channel: 'whatsapp', key: 'k', template })).toEqual([])
    expect(assessClientChannelTemplate({ channel: 'email', key: 'k', template })).toEqual([
      { code: 'empty_subject' },
    ])
  })

  test('chave de aviso do sistema e corpo vazio são recusados', () => {
    expect(
      assessClientChannelTemplate({
        channel: 'email',
        key: 'notification.standard-email',
        template: { body: ' ', subject: 'x' },
      }),
    ).toEqual([{ code: 'system_key' }, { code: 'empty_body' }])
  })

  test('inexistente é not_found', () => {
    expect(assessClientChannelTemplate({ channel: 'email', key: 'k', template: null })).toEqual([
      { code: 'not_found' },
    ])
  })
})
