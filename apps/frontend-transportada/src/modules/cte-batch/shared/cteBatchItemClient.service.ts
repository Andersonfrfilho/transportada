/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CompanyCteItemPage } from './cteBatchItem.types'
import { createCompanyCteItemPageAdapter } from './cteBatchItem.validation'
import type { CteExportRequestBody } from './cteBatchItemExport.service'
import type { CteItemTableFilters } from './cteBatchItemTable.service'
import { serializeCteItemQuery } from './cteBatchItemTable.service'

const CTE_BATCH_ITEMS_PATH = '/cte-batch-items'
const CTE_ITEM_EXPORT_PATH = '/cte-batches/items/export'
const CTE_EXPORT_FALLBACK_FILE_NAME = 'cte-xml.zip'
const CONTENT_DISPOSITION_FILE_NAME = /filename="([^"]+)"/u

const CTE_ITEM_ERROR = {
  REQUEST_FAILED: 'CTE_BATCH_REQUEST_FAILED',
  RESPONSE_INVALID: 'CTE_BATCH_RESPONSE_INVALID',
} as const

type CteBatchItemClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type ListCompanyCteItemsInput = Readonly<{
  cursor: null | string
  filters: CteItemTableFilters
  limit: number
}>

export type CteItemExportFile = Readonly<{
  blob: Blob
  fileName: string
}>

export type CteBatchItemClient = Readonly<{
  exportCompanyItems: (body: CteExportRequestBody) => Promise<CteItemExportFile>
  listCompanyItems: (input: ListCompanyCteItemsInput) => Promise<CompanyCteItemPage>
}>

export function createCteBatchItemClient(
  dependencies: CteBatchItemClientDependencies,
): CteBatchItemClient {
  const pageFromApi = createCompanyCteItemPageAdapter()

  return {
    async exportCompanyItems(body) {
      const accessToken = await dependencies.getAccessToken()
      const response = await requestArchive({
        fetch: dependencies.fetch,
        request: new Request(`${dependencies.apiUrl}${CTE_ITEM_EXPORT_PATH}`, {
          body: JSON.stringify(body),
          cache: 'no-store',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          method: 'POST',
        }),
      })
      return {
        blob: await response.blob(),
        fileName: readFileName(response.headers.get('content-disposition')),
      }
    },
    async listCompanyItems(input) {
      const accessToken = await dependencies.getAccessToken()
      const search = serializeCteItemQuery(input)
      const payload = await requestJson({
        fetch: dependencies.fetch,
        init: {
          cache: 'no-store',
          headers: { authorization: `Bearer ${accessToken}` },
          method: 'GET',
        },
        url: `${dependencies.apiUrl}${CTE_BATCH_ITEMS_PATH}?${search}`,
      })
      return pageFromApi(payload)
    },
  }
}

/** O corpo de sucesso é binário; só a falha vem em JSON, e é dela que sai o código estável. */
async function requestArchive(
  input: Readonly<{
    fetch: CteBatchItemClientDependencies['fetch']
    request: Request
  }>,
): Promise<Response> {
  let response: Response
  try {
    response = await input.fetch(input.request)
  } catch {
    throw new Error(CTE_ITEM_ERROR.REQUEST_FAILED)
  }
  if (!response.ok) throw new Error(readErrorCode(await readJsonPayload(response)))
  return response
}

async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return JSON.parse(await response.text()) as unknown
  } catch {
    return undefined
  }
}

function readErrorCode(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
    return CTE_ITEM_ERROR.REQUEST_FAILED
  }
  const error = (payload as Readonly<{ error: unknown }>).error
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return CTE_ITEM_ERROR.REQUEST_FAILED
  }
  const code = (error as Readonly<{ code: unknown }>).code
  return typeof code === 'string' && code.length > 0 ? code : CTE_ITEM_ERROR.REQUEST_FAILED
}

function readFileName(disposition: null | string): string {
  const matched = disposition === null ? null : CONTENT_DISPOSITION_FILE_NAME.exec(disposition)
  return matched?.[1] ?? CTE_EXPORT_FALLBACK_FILE_NAME
}

async function requestJson(
  input: Readonly<{
    fetch: CteBatchItemClientDependencies['fetch']
    init: RequestInit
    url: string
  }>,
): Promise<unknown> {
  let response: Response
  try {
    response = await input.fetch(input.url, input.init)
  } catch {
    throw new Error(CTE_ITEM_ERROR.REQUEST_FAILED)
  }
  if (!response.ok) throw new Error(CTE_ITEM_ERROR.REQUEST_FAILED)
  try {
    return JSON.parse(await response.text()) as unknown
  } catch {
    throw new Error(CTE_ITEM_ERROR.RESPONSE_INVALID)
  }
}
