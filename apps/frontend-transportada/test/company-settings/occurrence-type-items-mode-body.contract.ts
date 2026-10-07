/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 RF4/RF12/CA10: o corpo do `PUT /company-settings/occurrence-types` leva `itemsMode` quando
 * o painel o manda e o omite quando não manda (ausente é "não mexa"); a política vai sempre — e é
 * `unset` quando o tipo é Desligado (a prorrogação da spec 208), sem itens e sem política.
 */
import { describe, expect, test } from 'bun:test'

import { createTripClient } from '@/modules/trip/shared/tripClient.service'

const TYPE_RESPONSE = {
  active: true,
  allowsMultipleItems: true,
  emailBody: '',
  emailSubject: '',
  emailTemplateKey: null,
  id: '54ed0225-f293-47c3-84fe-0b66eff68784',
  itemsMode: 'off',
  name: 'Cliente pediu prorrogação do boleto',
  notifies: false,
  redeliveryPolicy: 'unset',
  stage: 'delivery',
}

const SAVE_INPUT = {
  active: true,
  allowsMultipleItems: true,
  attachmentMode: 'off',
  emailTemplateKey: null,
  flow: 'document',
  leavesDocumentBehind: false,
  name: 'Cliente pediu prorrogação do boleto',
  notifies: false,
  occurrenceTypeId: null,
  redeliveryPolicy: 'unset',
  stage: 'delivery',
} as const

async function captureBody(
  input: Parameters<ReturnType<typeof createTripClient>['saveOccurrenceType']>[0],
): Promise<Record<string, unknown>> {
  let sent = ''
  const client = createTripClient({
    apiUrl: 'https://api.example.test',
    fetch: async (request: RequestInfo | URL) => {
      sent = await new Request(request).text()
      return Response.json({ data: TYPE_RESPONSE })
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
  await client.saveOccurrenceType(input)
  return JSON.parse(sent) as Record<string, unknown>
}

describe('corpo do PUT de tipo de ocorrência (spec 241)', () => {
  test('Produtos Desligado, foto desligada, sem soltar a nota: itemsMode off e política unset', async () => {
    const body = await captureBody({ ...SAVE_INPUT, itemsMode: 'off' })
    expect(body).toEqual({
      active: true,
      allowsMultipleItems: true,
      attachmentMode: 'off',
      emailTemplateKey: null,
      flow: 'document',
      itemsMode: 'off',
      leavesDocumentBehind: false,
      name: 'Cliente pediu prorrogação do boleto',
      notifies: false,
      occurrenceTypeId: null,
      redeliveryPolicy: 'unset',
      stage: 'delivery',
    })
  })

  test('sem itemsMode no input, a chave não vai no corpo (não mexa)', async () => {
    const body = await captureBody({ ...SAVE_INPUT })
    expect(body).not.toHaveProperty('itemsMode')
    expect(body.redeliveryPolicy).toBe('unset')
  })
})
