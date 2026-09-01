/* Copyright (c) 2026 Ada Technology. MIT License. */
const AGGREGATE_APPLICATIONS_PATH = '/aggregate-applications'

export type AggregateApplicationStatus = 'approved' | 'pending' | 'rejected'

export type AggregateApplication = Readonly<{
  companyId: string
  createdAt: string
  declaredData: Readonly<Record<string, unknown>>
  driverId: string | null
  duplicateDriverId: string | null
  email: string
  id: string
  latestSubmission: Readonly<Record<string, unknown>> | null
  name: string
  phone: string
  rejectionReason: string
  resubmittedAt: string | null
  reviewedAt: string | null
  status: AggregateApplicationStatus
  taxId: string
  updatedAt: string
}>

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export class AggregateApplicationRequestError extends Error {
  public constructor() {
    super('AGGREGATE_APPLICATION_REQUEST_FAILED')
    this.name = 'AggregateApplicationRequestError'
  }
}

export type AggregateApplicationAttachment = Readonly<{
  /** O que a leitura do **servidor** achou; `null` quando não houve leitura ou nada foi reconhecido. */
  extractedFields: Readonly<Record<string, string | null>> | null
  id: string
  rejectionReason: string
  status: AggregateApplicationStatus
  taxId: string
  type: 'ccmei' | 'cnh' | 'crlv' | 'other'
}>

export type AggregateApplicationClient = Readonly<{
  approve: (id: string) => Promise<AggregateApplication>
  attachmentDownloadUrl: (
    input: Readonly<{ applicationId: string; attachmentId: string }>,
  ) => Promise<string>
  listAttachments: (applicationId: string) => Promise<readonly AggregateApplicationAttachment[]>
  reviewAttachment: (
    input: Readonly<{
      applicationId: string
      attachmentId: string
      decision: 'approved' | 'rejected'
      rejectionReason: string
    }>,
  ) => Promise<AggregateApplicationAttachment>
  list: () => Promise<readonly AggregateApplication[]>
  reject: (
    input: Readonly<{ id: string; rejectionReason: string }>,
  ) => Promise<AggregateApplication>
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
    throw new AggregateApplicationRequestError()
  }
  if (!response.ok) throw new AggregateApplicationRequestError()

  try {
    return await response.json()
  } catch {
    throw new AggregateApplicationRequestError()
  }
}

export function createAggregateApplicationClient(
  dependencies: ClientDependencies,
): AggregateApplicationClient {
  return {
    async approve(id) {
      const request = await authenticatedRequest({
        dependencies,
        method: 'POST',
        path: `${AGGREGATE_APPLICATIONS_PATH}/${id}/approve`,
      })
      const body = await readJson({ dependencies, request })
      return (body as { data: AggregateApplication }).data
    },
    async attachmentDownloadUrl({ applicationId, attachmentId }) {
      const request = await authenticatedRequest({
        dependencies,
        method: 'GET',
        path: `${AGGREGATE_APPLICATIONS_PATH}/${applicationId}/attachments/${attachmentId}/download`,
      })
      const body = await readJson({ dependencies, request })
      return (body as { data: { url: string } }).data.url
    },
    async list() {
      const request = await authenticatedRequest({
        dependencies,
        method: 'GET',
        path: AGGREGATE_APPLICATIONS_PATH,
      })
      const body = await readJson({ dependencies, request })
      return (body as { data: readonly AggregateApplication[] }).data
    },
    async listAttachments(applicationId) {
      const request = await authenticatedRequest({
        dependencies,
        method: 'GET',
        path: `${AGGREGATE_APPLICATIONS_PATH}/${applicationId}/attachments`,
      })
      const body = await readJson({ dependencies, request })
      return (body as { data: readonly AggregateApplicationAttachment[] }).data
    },
    async reject({ id, rejectionReason }) {
      const request = await authenticatedRequest({
        body: { rejectionReason },
        dependencies,
        method: 'POST',
        path: `${AGGREGATE_APPLICATIONS_PATH}/${id}/reject`,
      })
      const body = await readJson({ dependencies, request })
      return (body as { data: AggregateApplication }).data
    },
    async reviewAttachment({ applicationId, attachmentId, decision, rejectionReason }) {
      const request = await authenticatedRequest({
        body: { decision, rejectionReason },
        dependencies,
        method: 'POST',
        path: `${AGGREGATE_APPLICATIONS_PATH}/${applicationId}/attachments/${attachmentId}/review`,
      })
      const body = await readJson({ dependencies, request })
      return (body as { data: AggregateApplicationAttachment }).data
    },
  }
}
