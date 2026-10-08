/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T5.3 (1ª metade): o catálogo e as exceções lidos com os campos novos — e, de uma API
 * anterior (sem os campos, sem a rota em lote), lidos como sempre. Dados sintéticos.
 */
import { describe, expect, test } from 'bun:test'

import { createTripClient } from '@/modules/trip/shared/tripClient.service'
import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const API_URL = 'https://api.example.test'
const TYPE_ID = '54ed0225-f293-47c3-84fe-0b66eff68784'
const BATCH_URL = `${API_URL}/company-settings/occurrence-types/attachment-overrides`
const TYPES_URL = `${API_URL}/company-settings/occurrence-types`

const adapters = createTripResponseAdapters()

function buildRawType(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    active: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: TYPE_ID,
    name: 'Recusa total',
    notifies: false,
    stage: 'delivery',
    ...extra,
  }
}

function createClient(input: { readonly requests: Request[]; readonly response: Response }) {
  return createTripClient({
    apiUrl: API_URL,
    fetch: (resource, init) => {
      input.requests.push(new Request(resource, init))
      return Promise.resolve(input.response)
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

describe('catálogo: o tipo lido com os campos novos (spec 246 RF1)', () => {
  /** M5: ausente continua ausente — a API antiga recusa a chave, então a tela não oferece o controle. */
  test('API anterior (sem os campos): continuam ausentes, e não viram o valor de hoje', () => {
    const [type] = adapters.occurrenceTypesFromApi([buildRawType()])
    for (const key of [
      'itemsMinimumCount',
      'moments',
      'noteMode',
      'photoMinimumCount',
      'signatureMode',
    ]) {
      expect(type).not.toHaveProperty(key)
    }
  })

  test('API nova: carrega o que veio, inclusive os momentos', () => {
    const [type] = adapters.occurrenceTypesFromApi([
      buildRawType({
        itemsMinimumCount: 2,
        itemsMode: 'required',
        moments: ['document', 'stop'],
        noteMode: 'required',
        photoMinimumCount: 3,
        signatureMode: 'optional',
      }),
    ])
    expect(type?.noteMode).toBe('required')
    expect(type?.signatureMode).toBe('optional')
    expect(type?.photoMinimumCount).toBe(3)
    expect(type?.itemsMinimumCount).toBe(2)
    expect(type?.itemsMode).toBe('required')
    expect(type?.moments).toEqual(['document', 'stop'])
  })
})

async function readsAsFailure(client: ReturnType<typeof createClient>): Promise<boolean> {
  const failure = await client.listOccurrenceAttachmentOverridesBatch().then(
    () => undefined,
    (error: unknown) => error,
  )
  return failure instanceof Error
}

describe('cliente: exceções em lote (spec 246 RF11c)', () => {
  test('uma leitura GET na rota fixa, autenticada, com os campos modo-ou-nulo', async () => {
    const requests: Request[] = []
    const client = createClient({
      requests,
      response: Response.json({
        data: {
          overridesByType: [
            {
              contractorOverrides: [
                {
                  attachmentMode: 'optional',
                  contractorId: 'contractor-1',
                  itemsMinimumCount: null,
                  itemsMode: null,
                  noteMode: 'required',
                  photoMinimumCount: null,
                  signatureMode: null,
                },
              ],
              occurrenceTypeId: TYPE_ID,
              recipientOverrides: [{ attachmentMode: 'required', taxId: '12345678000190' }],
            },
          ],
        },
      }),
    })

    const result = await client.listOccurrenceAttachmentOverridesBatch()

    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe(BATCH_URL)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer synthetic-token')
    expect(result).toHaveLength(1)
    expect(result[0]?.occurrenceTypeId).toBe(TYPE_ID)
    expect(result[0]?.contractorOverrides[0]?.noteMode).toBe('required')
    expect(result[0]?.recipientOverrides[0]?.taxId).toBe('12345678000190')
  })

  test('API anterior à rota (404): lista vazia, sem erro', async () => {
    const client = createClient({
      requests: [],
      response: Response.json(
        { error: { code: 'NOT_FOUND', message: 'not found' } },
        { status: 404 },
      ),
    })
    expect(await client.listOccurrenceAttachmentOverridesBatch()).toEqual([])
  })

  test('outro erro HTTP continua erro, e resposta fora do formato é inválida', async () => {
    const failing = createClient({
      requests: [],
      response: Response.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 }),
    })
    expect(await readsAsFailure(failing)).toBe(true)

    for (const overridesByType of [
      [{ contractorOverrides: [], occurrenceTypeId: TYPE_ID }],
      [
        {
          contractorOverrides: [
            { attachmentMode: 'optional', contractorId: 'c', noteMode: 'sometimes' },
          ],
          occurrenceTypeId: TYPE_ID,
          recipientOverrides: [],
        },
      ],
    ]) {
      const invalid = createClient({
        requests: [],
        response: Response.json({ data: { overridesByType } }),
      })
      expect(await readsAsFailure(invalid)).toBe(true)
    }
  })
})

describe('cliente: PUT do cadastro só manda o que a edição mudou (spec 246 RF4)', () => {
  const BASE = {
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'optional',
    emailTemplateKey: null,
    leavesDocumentBehind: false,
    name: 'Recusa total',
    notifies: false,
    occurrenceTypeId: TYPE_ID,
    redeliveryPolicy: 'unset',
    stage: 'delivery',
  } as const

  async function sentBody(extra: Readonly<Record<string, unknown>>): Promise<unknown> {
    const requests: Request[] = []
    const client = createClient({
      requests,
      response: Response.json({ data: buildRawType() }),
    })
    await client.saveOccurrenceType({ ...BASE, ...extra })
    expect(requests[0]?.url).toBe(TYPES_URL)
    return requests[0]?.json()
  }

  test('sem os campos novos, o corpo não os leva', async () => {
    const body = await sentBody({})
    for (const key of ['noteMode', 'signatureMode', 'photoMinimumCount', 'itemsMinimumCount']) {
      expect(body).not.toHaveProperty(key)
    }
  })

  test('com os campos novos, o corpo leva cada um, e itemsMinimumCount nulo é nulo', async () => {
    const body = await sentBody({
      itemsMinimumCount: null,
      moments: ['document'],
      noteMode: 'required',
      photoMinimumCount: 2,
      signatureMode: 'optional',
    })
    expect(body).toMatchObject({
      itemsMinimumCount: null,
      moments: ['document'],
      noteMode: 'required',
      photoMinimumCount: 2,
      signatureMode: 'optional',
    })
  })
})

describe('cliente: o e-mail à contratante e a prévia do servidor (spec 247 RF2, RF4)', () => {
  const MAIL = {
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'optional',
    emailTemplateKey: null,
    leavesDocumentBehind: false,
    name: 'Devolução parcial',
    notifies: false,
    occurrenceTypeId: TYPE_ID,
    redeliveryPolicy: 'unset',
    stage: 'delivery',
  } as const

  test('o PUT leva assunto, corpo, linha e interruptor só quando informados', async () => {
    const without: Request[] = []
    await createClient({
      requests: without,
      response: Response.json({ data: buildRawType() }),
    }).saveOccurrenceType(MAIL)
    const withoutBody: unknown = await without[0]?.json()
    for (const key of ['emailBody', 'emailSubject', 'emailItemLineTemplate', 'emailsContractor']) {
      expect(withoutBody).not.toHaveProperty(key)
    }

    const withMail: Request[] = []
    await createClient({
      requests: withMail,
      response: Response.json({ data: buildRawType() }),
    }).saveOccurrenceType({
      ...MAIL,
      emailBody: 'Corpo',
      emailItemLineTemplate: '{{item}}',
      emailSubject: 'Assunto',
      emailsContractor: true,
    })
    expect(await withMail[0]?.json()).toMatchObject({
      emailBody: 'Corpo',
      emailItemLineTemplate: '{{item}}',
      emailSubject: 'Assunto',
      emailsContractor: true,
    })
  })

  test('a prévia vai por POST em /email-preview com os três textos, e devolve assunto e corpo', async () => {
    const requests: Request[] = []
    const preview = await createClient({
      requests,
      response: Response.json({
        data: { body: 'Corpo renderizado', subject: 'Assunto renderizado' },
      }),
    }).previewOccurrenceTypeEmail({
      emailBody: 'b',
      emailItemLineTemplate: 'l',
      emailSubject: 's',
    })
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.url).toBe(`${TYPES_URL}/email-preview`)
    expect(await requests[0]?.json()).toEqual({
      emailBody: 'b',
      emailItemLineTemplate: 'l',
      emailSubject: 's',
    })
    expect(preview).toEqual({ body: 'Corpo renderizado', subject: 'Assunto renderizado' })
  })

  test('resposta sem assunto ou corpo é recusada, não vira prévia vazia', async () => {
    const client = createClient({
      requests: [],
      response: Response.json({ data: { subject: 'só assunto' } }),
    })
    const outcome = await client
      .previewOccurrenceTypeEmail({ emailBody: '', emailItemLineTemplate: '', emailSubject: '' })
      .then(
        () => 'resolved',
        () => 'rejected',
      )
    expect(outcome).toBe('rejected')
  })
})

describe('cliente: contratantes do seletor de exceção (revisão do painel M7)', () => {
  const FULL = { closingPeriod: 'monthly', notes: '', reportEmail: '', status: 'active' }
  const PAGES = [
    {
      data: [{ ...FULL, displayName: 'Aurora', id: 'c-1', taxId: '11222333000144' }],
      page: { nextCursor: 'proxima' },
    },
    {
      data: [{ ...FULL, displayName: 'Boreal', id: 'c-2', taxId: '99888777000166' }],
      page: { nextCursor: null },
    },
  ]

  test('segue o cursor até o fim, em vez de parar nos primeiros 100', async () => {
    const urls: string[] = []
    const client = createTripClient({
      apiUrl: API_URL,
      fetch: (resource) => {
        urls.push(new Request(resource).url)
        return Promise.resolve(Response.json(PAGES[urls.length - 1]))
      },
      getAccessToken: () => Promise.resolve('synthetic-token'),
    })

    const contractors = await client.listContractors()

    expect(urls).toEqual([
      `${API_URL}/contractors?limit=100`,
      `${API_URL}/contractors?limit=100&cursor=proxima`,
    ])
    expect(contractors.map((contractor) => contractor.id)).toEqual(['c-1', 'c-2'])
  })
})
