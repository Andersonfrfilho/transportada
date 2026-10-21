/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T3.1 (D7): o corpo do `PUT /company-settings/occurrence-types` leva `contractorScope` e
 * `contractorIds` **juntos**, só quando a edição os muda; um sem o outro nunca vai (a API recusa com 400),
 * e a edição de outro campo não os manda (ausente é "não mexa").
 */
import { describe, expect, test } from 'bun:test'

import { createTripClient } from '@/modules/trip/shared/tripClient.service'

const TYPE_RESPONSE = {
  active: true,
  allowsMultipleItems: true,
  contractorScope: 'listed',
  contractors: [],
  emailTemplateKey: null,
  id: '54ed0225-f293-47c3-84fe-0b66eff68784',
  name: 'Procedimento da contratante',
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
  name: 'Procedimento da contratante',
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

describe('corpo do PUT com o escopo de contratantes (spec 270)', () => {
  test('escopo e lista vão juntos', async () => {
    const body = await captureBody({
      ...SAVE_INPUT,
      contractorIds: ['c-1', 'c-2'],
      contractorScope: 'listed',
    })

    expect(body.contractorScope).toBe('listed')
    expect(body.contractorIds).toEqual(['c-1', 'c-2'])
  })

  test('voltar para todas manda a lista vazia, junto', async () => {
    const body = await captureBody({ ...SAVE_INPUT, contractorIds: [], contractorScope: 'all' })

    expect(body.contractorScope).toBe('all')
    expect(body.contractorIds).toEqual([])
  })

  test('um sem o outro não vai: a API recusaria o par incompleto', async () => {
    const onlyScope = await captureBody({ ...SAVE_INPUT, contractorScope: 'listed' })
    const onlyIds = await captureBody({ ...SAVE_INPUT, contractorIds: ['c-1'] })

    expect(onlyScope).not.toHaveProperty('contractorScope')
    expect(onlyScope).not.toHaveProperty('contractorIds')
    expect(onlyIds).not.toHaveProperty('contractorScope')
    expect(onlyIds).not.toHaveProperty('contractorIds')
  })

  test('editar outro campo não manda o escopo (ausente é "não mexa")', async () => {
    const body = await captureBody({ ...SAVE_INPUT, name: 'Só o nome' })

    expect(body).not.toHaveProperty('contractorScope')
    expect(body).not.toHaveProperty('contractorIds')
  })
})
