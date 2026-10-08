/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 255 T3.2 (RF4): o corpo do `PUT` leva `iconName` como string do catálogo, `null` para "Sem ícone"
 * e o omite quando a edição não mexeu nele (ausente é "mantém" na API).
 */
import { describe, expect, test } from 'bun:test'

import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import { buildOccurrenceTypeUpdate } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import { createTripClient } from '@/modules/trip/shared/tripClient.service'

const TYPE: OccurrenceType = {
  active: true,
  allowsMultipleItems: false,
  attachmentMode: 'off',
  emailBody: '',
  emailSubject: '',
  emailTemplateKey: null,
  flow: 'document',
  iconName: 'truck',
  id: 'type-1',
  leavesDocumentBehind: false,
  name: 'Avaria',
  notifies: false,
  redeliveryPolicy: 'unset',
  stage: 'delivery',
}

async function captureBody(
  input: ReturnType<typeof buildOccurrenceTypeUpdate>,
): Promise<Record<string, unknown>> {
  let sent = ''
  const client = createTripClient({
    apiUrl: 'https://api.example.test',
    fetch: async (request: RequestInfo | URL) => {
      sent = await new Request(request).text()
      return Response.json({ data: { ...TYPE } })
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
  await client.saveOccurrenceType(input)
  return JSON.parse(sent) as Record<string, unknown>
}

describe('corpo do PUT de tipo de ocorrência com ícone (spec 255 T3.2)', () => {
  test('escolher um ícone envia o nome', async () => {
    const body = await captureBody(buildOccurrenceTypeUpdate(TYPE, { iconName: 'camera' }))
    expect(body.iconName).toBe('camera')
  })

  test('"Sem ícone" envia null explícito', async () => {
    const body = await captureBody(buildOccurrenceTypeUpdate(TYPE, { iconName: null }))
    expect(body).toHaveProperty('iconName', null)
  })

  test('edição que não mexe no ícone omite a chave', async () => {
    const body = await captureBody(buildOccurrenceTypeUpdate(TYPE, { name: 'Outro' }))
    expect(body).not.toHaveProperty('iconName')
  })
})
