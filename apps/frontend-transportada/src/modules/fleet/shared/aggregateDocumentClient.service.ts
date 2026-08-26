/* Copyright (c) 2026 Ada Technology. MIT License. */
const AGGREGATE_DOCUMENTS_PATH = '/aggregate-documents'

export type AggregateDocumentStatus = 'approved' | 'pending' | 'rejected'
export type AggregateDocumentType = 'cnh' | 'crlv'

export type AggregateDocumentDivergence = Readonly<{
  declared: string
  extracted: string
  field: string
}>

export type AggregateDocumentForReview = Readonly<{
  createdAt: string
  divergences: readonly AggregateDocumentDivergence[]
  /** `false` quando não houve leitura: PDF, OCR desligado, ou texto ilegível. */
  hasExtraction: boolean
  id: string
  rejectionReason: string
  status: AggregateDocumentStatus
  taxId: string
  type: AggregateDocumentType
  updatedAt: string
}>

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export class AggregateDocumentRequestError extends Error {
  public constructor() {
    super('AGGREGATE_DOCUMENT_REQUEST_FAILED')
    this.name = 'AggregateDocumentRequestError'
  }
}

export type AggregateDocumentClient = Readonly<{
  /** URL assinada de vida curta — o binário nunca é servido direto, nem cai em link do DOM. */
  getDownloadUrl: (id: string) => Promise<string>
  list: () => Promise<readonly AggregateDocumentForReview[]>
  review: (
    input: Readonly<{
      decision: 'approved' | 'rejected'
      id: string
      rejectionReason: string
    }>,
  ) => Promise<void>
}>

async function authenticatedRequest(
  input: Readonly<{
    body?: unknown
    dependencies: ClientDependencies
    method: string
    path: string
  }>,
): Promise<Request> {
  const accessToken = await input.dependencies.getAccessToken()
  return new Request(`${input.dependencies.apiBaseUrl}${input.path}`, {
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    method: input.method,
  })
}

async function readJson(
  input: Readonly<{ dependencies: ClientDependencies; request: Request }>,
): Promise<unknown> {
  let response: Response
  try {
    response = await input.dependencies.fetch(input.request)
  } catch {
    throw new AggregateDocumentRequestError()
  }
  if (!response.ok) throw new AggregateDocumentRequestError()

  try {
    return await response.json()
  } catch {
    throw new AggregateDocumentRequestError()
  }
}

export function createAggregateDocumentClient(
  dependencies: ClientDependencies,
): AggregateDocumentClient {
  return {
    async getDownloadUrl(id) {
      const request = await authenticatedRequest({
        dependencies,
        method: 'GET',
        path: `${AGGREGATE_DOCUMENTS_PATH}/${id}/download`,
      })
      const body = await readJson({ dependencies, request })
      return (body as { data: { url: string } }).data.url
    },
    async list() {
      const request = await authenticatedRequest({
        dependencies,
        method: 'GET',
        path: AGGREGATE_DOCUMENTS_PATH,
      })
      const body = await readJson({ dependencies, request })
      return (body as { data: readonly AggregateDocumentForReview[] }).data
    },
    async review({ decision, id, rejectionReason }) {
      const request = await authenticatedRequest({
        body: { decision, rejectionReason },
        dependencies,
        method: 'POST',
        path: `${AGGREGATE_DOCUMENTS_PATH}/${id}/review`,
      })
      await readJson({ dependencies, request })
    },
  }
}
