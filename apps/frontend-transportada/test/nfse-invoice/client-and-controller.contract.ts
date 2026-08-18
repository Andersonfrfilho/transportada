import { describe, expect, test } from 'bun:test'

import {
  AUTHORIZED_INVOICE_LIST_ITEM,
  CANCELLATION_MOTIVE,
  CANCELLATION_REASON,
  CANCELLATION_SUMMARY,
  DOCUMENT_DOWNLOAD,
  DOCUMENT_ID,
  EMISSION_PROFILE_OPTION,
  INVOICE_DETAIL,
  INVOICE_DOCUMENTS,
  INVOICE_ID,
  INVOICE_LIST_ITEM,
  INVOICE_PAGE,
  INVOICE_PREVIEW,
  ISSUANCE_SUMMARY,
  loadFutureModule,
  PROFILE_ID,
  REJECTED_INVOICE_DETAIL,
  SECOND_DOCUMENT_ID,
  SELECTION_BODY,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_CURSOR,
  SYNTHETIC_IDEMPOTENCY_KEY,
} from './nfse-invoice.fixture'

const API_URL = 'https://api.example.test'
const INVOICES_PATH = `${API_URL}/nfse-service-invoices`
const PROFILE_OPTIONS_PATH = `${API_URL}/nfse-emission-profiles/options`
const CLIENT_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceClient.service'
const ADAPTERS_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceResponse.validation'
const HOOK_MODULE = '../../src/modules/nfse-invoice/hooks/useNfseInvoices.hook'

describe('nfse invoice client contract', () => {
  test('lists, previews and reads invoices over authenticated no-store requests', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    expect(
      await client.listInvoices({
        cursor: SYNTHETIC_CURSOR,
        filters: {
          createdFrom: '2026-08-01T00:00:00.000Z',
          statusIn: ['authorized', 'pending_authorization'],
          takerTaxIdEq: '11222333000181',
        },
        limit: 25,
      }),
    ).toEqual(INVOICE_PAGE)
    expect(await client.previewInvoices(SELECTION_BODY)).toEqual(INVOICE_PREVIEW)
    expect(await client.getInvoice({ invoiceId: INVOICE_ID })).toEqual(INVOICE_DETAIL)
    expect(await client.listInvoiceDocuments({ invoiceId: INVOICE_ID })).toEqual(INVOICE_DOCUMENTS)

    const [listRequest, previewRequest, detailRequest, documentsRequest] = requests
    if (
      listRequest === undefined ||
      previewRequest === undefined ||
      detailRequest === undefined ||
      documentsRequest === undefined
    ) {
      throw new Error('NFSE_CONTRACT_REQUEST_MISSING')
    }

    expect(listRequest.url).toBe(
      `${INVOICES_PATH}?cursor=${encodeURIComponent(SYNTHETIC_CURSOR)}&limit=25&createdFrom=${encodeURIComponent('2026-08-01T00:00:00.000Z')}&statusIn=${encodeURIComponent('authorized,pending_authorization')}&takerTaxIdEq=11222333000181`,
    )
    expect(listRequest.method).toBe('GET')
    expect(listRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(listRequest.cache).toBe('no-store')

    expect(previewRequest.url).toBe(`${INVOICES_PATH}/preview`)
    expect(previewRequest.method).toBe('POST')
    expect(previewRequest.headers.get('content-type')).toBe('application/json')
    expect(await previewRequest.json()).toEqual({
      documentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID],
      profileId: PROFILE_ID,
    })

    expect(detailRequest.url).toBe(`${INVOICES_PATH}/${INVOICE_ID}`)
    expect(documentsRequest.url).toBe(`${INVOICES_PATH}/${INVOICE_ID}/documents`)
    expect(documentsRequest.cache).toBe('no-store')
  })

  /** Emissão e cancelamento são aceites de fila: a chave de idempotência é o que impede a duplicata. */
  test('sends creation and cancellation as idempotent requests', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    expect(
      await client.createInvoices({ ...SELECTION_BODY, idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY }),
    ).toEqual(ISSUANCE_SUMMARY)
    expect(
      await client.cancelInvoice({
        cancellationMotive: CANCELLATION_MOTIVE,
        cancellationReason: CANCELLATION_REASON,
        idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
        invoiceId: INVOICE_ID,
      }),
    ).toEqual(CANCELLATION_SUMMARY)

    const [createRequest, cancelRequest] = requests
    if (createRequest === undefined || cancelRequest === undefined) {
      throw new Error('NFSE_CONTRACT_REQUEST_MISSING')
    }

    expect(createRequest.url).toBe(INVOICES_PATH)
    expect(createRequest.method).toBe('POST')
    expect(createRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    expect(await createRequest.json()).toEqual({
      documentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID],
      profileId: PROFILE_ID,
    })

    expect(cancelRequest.url).toBe(`${INVOICES_PATH}/${INVOICE_ID}/cancel`)
    expect(cancelRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    /**
     * Dois campos porque são duas coisas: o **código** é o que a prefeitura lê na transmissão, e o
     * texto é o registro de por que a nota saiu do ar. `toEqual` no corpo inteiro é de propósito —
     * mandar só o texto faz a prefeitura recusar o cancelamento dias depois, na consulta.
     */
    expect(await cancelRequest.json()).toEqual({
      cancellationMotive: CANCELLATION_MOTIVE,
      cancellationReason: CANCELLATION_REASON,
    })
  })

  /**
   * `1` (erro na emissão) existe no vocabulário da prefeitura e é o único que ela recusa, pedindo
   * substituição da nota em vez de cancelamento — a nota iria para `cancellation_requested`,
   * liberaria as NF-e vinculadas e ficaria esperando um retorno que nunca chega. A tela não o
   * oferece, e é aqui que isso é cobrado.
   */
  test('o catálogo de motivos não oferece o código que a prefeitura recusa', async () => {
    const constants = await loadFutureModule<{
      readonly NFSE_CANCELLATION_MOTIVES: readonly string[]
    }>('../../src/modules/nfse-invoice/shared/nfseInvoice.constant')

    expect(constants.NFSE_CANCELLATION_MOTIVES).toEqual(['2', '4'])
    expect(constants.NFSE_CANCELLATION_MOTIVES).not.toContain('1')
  })

  /** O corpo `.strict()` da API recusa campo desconhecido: a chave de idempotência é cabeçalho. */
  test('keeps the idempotency key out of the request body', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    await client.createInvoices({ ...SELECTION_BODY, idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY })
    await client.cancelInvoice({
      cancellationMotive: CANCELLATION_MOTIVE,
      cancellationReason: CANCELLATION_REASON,
      idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
      invoiceId: INVOICE_ID,
    })

    for (const request of requests) {
      expect(JSON.stringify(await request.json())).not.toContain(SYNTHETIC_IDEMPOTENCY_KEY)
    }
  })

  test('sends the optional description template only when the operator changed it', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    await client.previewInvoices(SELECTION_BODY)
    await client.previewInvoices({
      ...SELECTION_BODY,
      descriptionTemplate: 'Entregas em {{municipio}} de {{periodo}}.',
    })

    const [withoutTemplate, withTemplate] = requests
    if (withoutTemplate === undefined || withTemplate === undefined) {
      throw new Error('NFSE_CONTRACT_REQUEST_MISSING')
    }

    expect(await withoutTemplate.json()).not.toHaveProperty('descriptionTemplate')
    expect(await withTemplate.json()).toMatchObject({
      descriptionTemplate: 'Entregas em {{municipio}} de {{periodo}}.',
    })
  })

  /** O documento fiscal sai por URL assinada: a resposta é o link, nunca os bytes do XML. */
  test('asks for the signed xml and pdf links instead of the fiscal bytes', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    expect(await client.getInvoiceDocumentUrl({ invoiceId: INVOICE_ID, kind: 'xml' })).toEqual(
      DOCUMENT_DOWNLOAD,
    )
    expect(await client.getInvoiceDocumentUrl({ invoiceId: INVOICE_ID, kind: 'pdf' })).toEqual(
      DOCUMENT_DOWNLOAD,
    )

    const [xmlRequest, pdfRequest] = requests
    if (xmlRequest === undefined || pdfRequest === undefined) {
      throw new Error('NFSE_CONTRACT_REQUEST_MISSING')
    }

    expect(xmlRequest.url).toBe(`${INVOICES_PATH}/${INVOICE_ID}/xml`)
    expect(xmlRequest.method).toBe('GET')
    expect(pdfRequest.url).toBe(`${INVOICES_PATH}/${INVOICE_ID}/pdf`)
  })

  test('never smuggles the tenant identifier into the request path or body', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    await client.previewInvoices({ ...SELECTION_BODY, companyId: 'forbidden-company' } as never)
    await client.createInvoices({
      ...SELECTION_BODY,
      companyId: 'forbidden-company',
      idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
    } as never)
    await client.cancelInvoice({
      cancellationMotive: CANCELLATION_MOTIVE,
      cancellationReason: CANCELLATION_REASON,
      companyId: 'forbidden-company',
      idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
      invoiceId: INVOICE_ID,
    } as never)

    for (const request of requests) {
      expect(request.url).not.toContain('forbidden-company')
      expect(JSON.stringify(await request.json())).not.toContain('forbidden-company')
    }
  })

  test('surfaces the api error code instead of a generic failure', async () => {
    const { createNfseInvoiceClient } = await loadFutureModule<ClientModule>(CLIENT_MODULE)
    const client = createNfseInvoiceClient({
      apiUrl: API_URL,
      fetch: () =>
        Promise.resolve(
          Response.json(
            { error: { code: 'NFSE_INVOICE_ALREADY_CANCELLED', message: 'cancelled' } },
            { status: 409 },
          ),
        ),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(
      await client
        .cancelInvoice({
          cancellationMotive: CANCELLATION_MOTIVE,
          cancellationReason: CANCELLATION_REASON,
          idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
          invoiceId: INVOICE_ID,
        })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'NFSE_INVOICE_ALREADY_CANCELLED' }))
  })
})

describe('nfse invoice response contract', () => {
  test('keeps the invoice dto strict, decimal-safe and free of tenant or fiscal payload fields', async () => {
    const adapters = await createAdapters()

    expect(adapters.invoiceFromApi(INVOICE_LIST_ITEM)).toEqual(INVOICE_LIST_ITEM)
    expect(adapters.invoiceDetailFromApi(INVOICE_DETAIL)).toEqual(INVOICE_DETAIL)
    expect(adapters.invoiceDetailFromApi(REJECTED_INVOICE_DETAIL)).toEqual(REJECTED_INVOICE_DETAIL)
    expect(adapters.invoiceDocumentsFromApi(INVOICE_DOCUMENTS)).toEqual(INVOICE_DOCUMENTS)
    expect(
      adapters.invoiceListFromApi({
        data: [INVOICE_LIST_ITEM, AUTHORIZED_INVOICE_LIST_ITEM],
        page: { nextCursor: SYNTHETIC_CURSOR },
      }),
    ).toEqual(INVOICE_PAGE)

    expect(() =>
      adapters.invoiceFromApi({ ...INVOICE_LIST_ITEM, companyId: 'forbidden-company' }),
    ).toThrow('NFSE_INVOICE_RESPONSE_INVALID')
    expect(() => adapters.invoiceFromApi({ ...INVOICE_LIST_ITEM, serviceAmount: 672.22 })).toThrow(
      'NFSE_INVOICE_RESPONSE_INVALID',
    )
    expect(() => adapters.invoiceFromApi({ ...INVOICE_LIST_ITEM, status: 'archived' })).toThrow(
      'NFSE_INVOICE_RESPONSE_INVALID',
    )
    expect(() => adapters.invoiceFromApi({ ...INVOICE_LIST_ITEM, documentCount: '2' })).toThrow(
      'NFSE_INVOICE_RESPONSE_INVALID',
    )
    expect(() => adapters.invoiceDetailFromApi({ ...INVOICE_DETAIL, xml: '<CompNfse />' })).toThrow(
      'NFSE_INVOICE_RESPONSE_INVALID',
    )
    expect(() => adapters.invoiceDetailFromApi({ ...INVOICE_DETAIL, charges: [{}] })).toThrow(
      'NFSE_INVOICE_RESPONSE_INVALID',
    )
    expect(() => adapters.invoiceListFromApi({ data: [INVOICE_LIST_ITEM], page: null })).toThrow(
      'NFSE_INVOICE_RESPONSE_INVALID',
    )
  })

  test('accepts the preview with its blocks and refuses a malformed projection', async () => {
    const adapters = await createAdapters()

    expect(adapters.previewFromApi(INVOICE_PREVIEW)).toEqual(INVOICE_PREVIEW)
    expect(adapters.previewFromApi({ blocked: [], invoices: [] })).toEqual({
      blocked: [],
      invoices: [],
    })

    expect(() => adapters.previewFromApi({ ...INVOICE_PREVIEW, blocked: [{}] })).toThrow(
      'NFSE_INVOICE_RESPONSE_INVALID',
    )
    expect(() =>
      adapters.previewFromApi({
        blocked: INVOICE_PREVIEW.blocked,
        invoices: [{ ...INVOICE_PREVIEW.invoices[0], issAmount: 13.44 }],
      }),
    ).toThrow('NFSE_INVOICE_RESPONSE_INVALID')
    expect(() =>
      adapters.previewFromApi({
        blocked: INVOICE_PREVIEW.blocked,
        invoices: [{ ...INVOICE_PREVIEW.invoices[0], listedDocuments: '1' }],
      }),
    ).toThrow('NFSE_INVOICE_RESPONSE_INVALID')
  })

  test('accepts the queue acknowledgements and the short-lived download link', async () => {
    const adapters = await createAdapters()

    expect(adapters.issuanceSummaryFromApi(ISSUANCE_SUMMARY)).toEqual(ISSUANCE_SUMMARY)
    expect(adapters.cancellationSummaryFromApi(CANCELLATION_SUMMARY)).toEqual(CANCELLATION_SUMMARY)
    expect(adapters.documentDownloadFromApi(DOCUMENT_DOWNLOAD)).toEqual(DOCUMENT_DOWNLOAD)

    expect(() =>
      adapters.issuanceSummaryFromApi({ ...ISSUANCE_SUMMARY, replayed: 'false' }),
    ).toThrow('NFSE_INVOICE_RESPONSE_INVALID')
    expect(() =>
      adapters.cancellationSummaryFromApi({ ...CANCELLATION_SUMMARY, releasedDocumentIds: null }),
    ).toThrow('NFSE_INVOICE_RESPONSE_INVALID')
    expect(() =>
      adapters.documentDownloadFromApi({ ...DOCUMENT_DOWNLOAD, content: '<CompNfse />' }),
    ).toThrow('NFSE_INVOICE_RESPONSE_INVALID')
  })
})

describe('nfse invoice controller contract', () => {
  test('gates every action behind its own permission', async () => {
    const { createNfseInvoiceController } = await loadFutureModule<ControllerModule>(HOOK_MODULE)

    const readerOnly = createNfseInvoiceController({
      client: createStubClient([]),
      permissions: ['nfse.read'],
    })
    expect(readerOnly.canReadInvoices).toBeTrue()
    expect(readerOnly.canIssueInvoices).toBeFalse()
    expect(readerOnly.canCancelInvoices).toBeFalse()
    expect(
      await readerOnly
        .createInvoices({ ...SELECTION_BODY, idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'NFSE_INVOICE_FORBIDDEN' }))
    expect(
      await readerOnly
        .cancelInvoice({
          cancellationMotive: CANCELLATION_MOTIVE,
          cancellationReason: CANCELLATION_REASON,
          idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
          invoiceId: INVOICE_ID,
        })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'NFSE_INVOICE_FORBIDDEN' }))

    /** Emitir e cancelar são permissões distintas: quem emite não derruba nota autorizada. */
    const issuerOnly = createNfseInvoiceController({
      client: createStubClient([]),
      permissions: ['nfse.read', 'nfse.issue'],
    })
    expect(issuerOnly.canIssueInvoices).toBeTrue()
    expect(issuerOnly.canCancelInvoices).toBeFalse()
    expect(
      await issuerOnly
        .cancelInvoice({
          cancellationMotive: CANCELLATION_MOTIVE,
          cancellationReason: CANCELLATION_REASON,
          idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
          invoiceId: INVOICE_ID,
        })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'NFSE_INVOICE_FORBIDDEN' }))
  })

  test('lets the full operator reach every route once', async () => {
    const { createNfseInvoiceController } = await loadFutureModule<ControllerModule>(HOOK_MODULE)
    const calls: string[] = []
    const controller = createNfseInvoiceController({
      client: createStubClient(calls),
      permissions: ['nfse.read', 'nfse.issue', 'nfse.cancel'],
    })

    await controller.listInvoices({ cursor: null, limit: 25 })
    await controller.previewInvoices(SELECTION_BODY)
    await controller.createInvoices({
      ...SELECTION_BODY,
      idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
    })
    await controller.getInvoice({ invoiceId: INVOICE_ID })
    await controller.listInvoiceDocuments({ invoiceId: INVOICE_ID })
    await controller.getInvoiceDocumentUrl({ invoiceId: INVOICE_ID, kind: 'xml' })
    await controller.cancelInvoice({
      cancellationMotive: CANCELLATION_MOTIVE,
      cancellationReason: CANCELLATION_REASON,
      idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
      invoiceId: INVOICE_ID,
    })

    expect(calls).toEqual([
      'list',
      'preview',
      'create',
      'detail',
      'documents',
      'download',
      'cancel',
    ])
  })

  /** Sem empresa resolvida não há permissão nenhuma: a tela não pode chamar a API por engano. */
  test('refuses every route when the operator carries no permission', async () => {
    const { createNfseInvoiceController } = await loadFutureModule<ControllerModule>(HOOK_MODULE)
    const calls: string[] = []
    const controller = createNfseInvoiceController({
      client: createStubClient(calls),
      permissions: [],
    })

    expect(controller.canReadInvoices).toBeFalse()
    expect(
      await controller.listInvoices({ cursor: null, limit: 25 }).catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'NFSE_INVOICE_FORBIDDEN' }))
    expect(calls).toEqual([])
  })
})

async function createAdapters(): Promise<
  ReturnType<AdaptersModule['createNfseInvoiceResponseAdapters']>
> {
  const { createNfseInvoiceResponseAdapters } =
    await loadFutureModule<AdaptersModule>(ADAPTERS_MODULE)
  return createNfseInvoiceResponseAdapters()
}

describe('nfse emission profile options contract', () => {
  /**
   * Quem emite tem `nfse.issue` e não `settings.manage`. Pedir a listagem inteira devolvia 403 e a
   * emissão morria com o diálogo vazio — o caminho é a rota de opções.
   */
  test('reads the options route instead of the settings.manage listing', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    expect(await client.listEmissionProfiles()).toEqual([EMISSION_PROFILE_OPTION])

    const [optionsRequest] = requests
    if (optionsRequest === undefined) throw new Error('NFSE_CONTRACT_REQUEST_MISSING')

    expect(optionsRequest.url).toBe(PROFILE_OPTIONS_PATH)
    expect(optionsRequest.method).toBe('GET')
    expect(optionsRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(optionsRequest.cache).toBe('no-store')
    expect(optionsRequest.url).not.toContain('statusEq')
    expect(optionsRequest.url).not.toContain('limit')
  })

  /** Um parâmetro fiscal a mais no corpo é resposta de outra rota — o guarda recusa. */
  test('rejects an option carrying a field beyond the three the dialog needs', async () => {
    const { createNfseInvoiceResponseAdapters } =
      await loadFutureModule<AdaptersModule>(ADAPTERS_MODULE)
    const adapters = createNfseInvoiceResponseAdapters()

    expect(adapters.emissionProfilesFromApi({ data: [EMISSION_PROFILE_OPTION] })).toEqual([
      EMISSION_PROFILE_OPTION,
    ])
    expect(() =>
      adapters.emissionProfilesFromApi({
        data: [{ ...EMISSION_PROFILE_OPTION, issRate: '0.050000' }],
      }),
    ).toThrow('NFSE_INVOICE_RESPONSE_INVALID')
  })

  /** O gate do diálogo é a permissão de emitir, não a de administrar a empresa. */
  test('gates the profile query on nfse.issue', async () => {
    const hook = await Bun.file(
      new URL(
        '../../src/modules/nfse-invoice/hooks/useNfseEmissionDialog.hook.ts',
        import.meta.url,
      ),
    ).text()

    expect(hook).toContain('NFSE_ISSUE_PERMISSION')
    expect(hook).not.toContain('NFSE_SETTINGS_MANAGE_PERMISSION')
  })
})

async function createRecordingClient(requests: Request[]): Promise<InvoiceClient> {
  const { createNfseInvoiceClient } = await loadFutureModule<ClientModule>(CLIENT_MODULE)
  return createNfseInvoiceClient({
    apiUrl: API_URL,
    fetch: (input) => {
      const request = input as Request
      requests.push(request.clone())
      return respond(request)
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

function respond(request: Request): Promise<Response> {
  if (request.url === `${INVOICES_PATH}/preview`) {
    return Promise.resolve(Response.json({ data: INVOICE_PREVIEW }))
  }
  if (request.url === `${INVOICES_PATH}/${INVOICE_ID}/cancel`) {
    return Promise.resolve(Response.json({ data: CANCELLATION_SUMMARY }, { status: 202 }))
  }
  if (request.url === `${INVOICES_PATH}/${INVOICE_ID}/documents`) {
    return Promise.resolve(Response.json({ data: INVOICE_DOCUMENTS }))
  }
  if (
    request.url === `${INVOICES_PATH}/${INVOICE_ID}/xml` ||
    request.url === `${INVOICES_PATH}/${INVOICE_ID}/pdf`
  ) {
    return Promise.resolve(Response.json({ data: DOCUMENT_DOWNLOAD }))
  }
  if (request.url === INVOICES_PATH && request.method === 'POST') {
    return Promise.resolve(Response.json({ data: ISSUANCE_SUMMARY }, { status: 202 }))
  }
  if (request.url.startsWith(`${INVOICES_PATH}?`)) {
    return Promise.resolve(
      Response.json({ data: INVOICE_PAGE.items, page: { nextCursor: INVOICE_PAGE.nextCursor } }),
    )
  }
  if (request.url === `${INVOICES_PATH}/${INVOICE_ID}`) {
    return Promise.resolve(Response.json({ data: INVOICE_DETAIL }))
  }
  if (request.url === PROFILE_OPTIONS_PATH) {
    return Promise.resolve(Response.json({ data: [EMISSION_PROFILE_OPTION] }))
  }

  throw new Error(`Unexpected request in contract: ${request.url}`)
}

function createStubClient(calls: string[]): InvoiceClient {
  return {
    cancelInvoice: () => {
      calls.push('cancel')
      return Promise.resolve(CANCELLATION_SUMMARY)
    },
    listEmissionProfiles: () => {
      calls.push('profiles')
      return Promise.resolve([EMISSION_PROFILE_OPTION])
    },
    createInvoices: () => {
      calls.push('create')
      return Promise.resolve(ISSUANCE_SUMMARY)
    },
    getInvoice: () => {
      calls.push('detail')
      return Promise.resolve(INVOICE_DETAIL)
    },
    getInvoiceDocumentUrl: () => {
      calls.push('download')
      return Promise.resolve(DOCUMENT_DOWNLOAD)
    },
    listInvoiceDocuments: () => {
      calls.push('documents')
      return Promise.resolve(INVOICE_DOCUMENTS)
    },
    listInvoices: () => {
      calls.push('list')
      return Promise.resolve(INVOICE_PAGE)
    },
    previewInvoices: () => {
      calls.push('preview')
      return Promise.resolve(INVOICE_PREVIEW)
    },
  }
}

type SelectionInput = Readonly<{
  descriptionTemplate?: string
  documentIds: readonly string[]
  profileId: string
}>

type InvoiceClient = {
  cancelInvoice(
    input: Readonly<{
      cancellationMotive: string
      cancellationReason: string
      idempotencyKey: string
      invoiceId: string
    }>,
  ): Promise<unknown>
  createInvoices(input: SelectionInput & Readonly<{ idempotencyKey: string }>): Promise<unknown>
  getInvoice(input: Readonly<{ invoiceId: string }>): Promise<unknown>
  getInvoiceDocumentUrl(
    input: Readonly<{ invoiceId: string; kind: 'pdf' | 'xml' }>,
  ): Promise<unknown>
  listEmissionProfiles(): Promise<readonly unknown[]>
  listInvoiceDocuments(input: Readonly<{ invoiceId: string }>): Promise<unknown>
  listInvoices(
    input: Readonly<{
      cursor: null | string
      filters?: Readonly<{
        createdFrom?: string
        createdUntil?: string
        statusIn?: readonly string[]
        takerTaxIdEq?: string
      }>
      limit: number
    }>,
  ): Promise<unknown>
  previewInvoices(input: SelectionInput): Promise<unknown>
}

type ClientModule = {
  readonly createNfseInvoiceClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => InvoiceClient
}

type AdaptersModule = {
  readonly createNfseInvoiceResponseAdapters: () => {
    readonly cancellationSummaryFromApi: (input: unknown) => unknown
    readonly documentDownloadFromApi: (input: unknown) => unknown
    readonly emissionProfilesFromApi: (input: unknown) => readonly unknown[]
    readonly invoiceDetailFromApi: (input: unknown) => unknown
    readonly invoiceDocumentsFromApi: (input: unknown) => unknown
    readonly invoiceFromApi: (input: unknown) => unknown
    readonly invoiceListFromApi: (input: unknown) => unknown
    readonly issuanceSummaryFromApi: (input: unknown) => unknown
    readonly previewFromApi: (input: unknown) => unknown
  }
}

type ControllerModule = {
  readonly createNfseInvoiceController: (input: {
    readonly client: InvoiceClient
    readonly permissions: readonly string[]
  }) => InvoiceClient & {
    readonly canCancelInvoices: boolean
    readonly canIssueInvoices: boolean
    readonly canReadInvoices: boolean
  }
}
