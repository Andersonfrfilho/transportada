/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  catalogFromApi,
  previewFromApi,
  templateFromApi,
  templateListFromApi,
} from './contractorMailTemplatesResponse.validation'
import type {
  ContractorMailTemplate,
  ContractorMailTemplateType,
  MailTemplateCatalogEntry,
  MailTemplateContent,
  MailTemplatePreviewResult,
} from './contractorMailTemplates.types'

export const CONTRACTOR_MAIL_TEMPLATES_PATH = '/contractor-mail-templates'
export const CONTRACTOR_MAIL_TEMPLATES_CATALOG_PATH = '/contractor-mail-templates/catalog'
export const CONTRACTOR_MAIL_TEMPLATES_PREVIEW_PATH = '/contractor-mail-templates/preview'

export const CONTRACTOR_MAIL_TEMPLATES_ERROR = {
  REQUEST_FAILED: 'REQUEST_FAILED',
  RESPONSE_INVALID: 'RESPONSE_INVALID',
} as const

/** `web.md` §11: a recusa do servidor nomeia o campo — `details` ancora o aviso no campo certo. */
export class ContractorMailTemplatesRequestError extends Error {
  public readonly details: ReadonlyMap<string, string>

  public constructor(code: string, details: ReadonlyMap<string, string> = new Map()) {
    super(code)
    this.name = 'ContractorMailTemplatesRequestError'
    this.details = details
  }
}

export type ContractorMailTemplateCreateBody = MailTemplateContent &
  Readonly<{ mailType: ContractorMailTemplateType; name: string }>

export type ContractorMailTemplateUpdateBody = Readonly<{
  closing?: string
  intro?: string
  itemText?: string
  name?: string
  status?: 'archived'
  subject?: string
  version: string
}>

export type MailTemplatePreviewSource =
  | Readonly<{ templateId: string }>
  | (MailTemplateContent & Readonly<{ mailType: ContractorMailTemplateType }>)

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type ContractorMailTemplatesClient = Readonly<{
  createTemplate: (body: ContractorMailTemplateCreateBody) => Promise<ContractorMailTemplate>
  getCatalog: () => Promise<readonly MailTemplateCatalogEntry[]>
  getTemplate: (templateId: string) => Promise<ContractorMailTemplate>
  listTemplates: (
    mailType: ContractorMailTemplateType,
  ) => Promise<readonly ContractorMailTemplate[]>
  preview: (source: MailTemplatePreviewSource) => Promise<MailTemplatePreviewResult>
  setDefault: (
    input: Readonly<{ templateId: string; version: string }>,
  ) => Promise<ContractorMailTemplate>
  updateTemplate: (
    input: Readonly<{ body: ContractorMailTemplateUpdateBody; templateId: string }>,
  ) => Promise<ContractorMailTemplate>
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function readErrorDetails(payload: unknown): ReadonlyMap<string, string> {
  const details = new Map<string, string>()
  if (!isRecord(payload) || !isRecord(payload.error) || !Array.isArray(payload.error.details)) {
    return details
  }
  for (const detail of payload.error.details) {
    if (isRecord(detail) && isString(detail.field) && isString(detail.message)) {
      details.set(detail.field, detail.message)
    }
  }
  return details
}

function readErrorCode(payload: unknown): string {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    isString((payload.error as { code?: unknown }).code)
  ) {
    return (payload.error as { code: string }).code
  }
  return CONTRACTOR_MAIL_TEMPLATES_ERROR.REQUEST_FAILED
}

async function request(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    method: 'GET' | 'PATCH' | 'POST'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'

  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, {
        ...(input.body === undefined ? {} : { body: input.body }),
        cache: 'no-store',
        headers,
        method: input.method,
      }),
    )
  } catch {
    throw new ContractorMailTemplatesRequestError(CONTRACTOR_MAIL_TEMPLATES_ERROR.REQUEST_FAILED)
  }

  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw new ContractorMailTemplatesRequestError(CONTRACTOR_MAIL_TEMPLATES_ERROR.RESPONSE_INVALID)
  }
  if (!response.ok) {
    throw new ContractorMailTemplatesRequestError(readErrorCode(payload), readErrorDetails(payload))
  }

  return payload
}

export function createContractorMailTemplatesClient(
  dependencies: ClientDependencies,
): ContractorMailTemplatesClient {
  return {
    async createTemplate(body) {
      return templateFromApi(
        await request({
          body: JSON.stringify(body),
          dependencies,
          method: 'POST',
          path: CONTRACTOR_MAIL_TEMPLATES_PATH,
        }),
      )
    },
    async getCatalog() {
      return catalogFromApi(
        await request({
          dependencies,
          method: 'GET',
          path: CONTRACTOR_MAIL_TEMPLATES_CATALOG_PATH,
        }),
      )
    },
    async getTemplate(templateId) {
      return templateFromApi(
        await request({
          dependencies,
          method: 'GET',
          path: `${CONTRACTOR_MAIL_TEMPLATES_PATH}/${templateId}`,
        }),
      )
    },
    async listTemplates(mailType) {
      return templateListFromApi(
        await request({
          dependencies,
          method: 'GET',
          path: `${CONTRACTOR_MAIL_TEMPLATES_PATH}?mailType=${encodeURIComponent(mailType)}`,
        }),
      )
    },
    async preview(source) {
      return previewFromApi(
        await request({
          body: JSON.stringify(source),
          dependencies,
          method: 'POST',
          path: CONTRACTOR_MAIL_TEMPLATES_PREVIEW_PATH,
        }),
      )
    },
    async setDefault({ templateId, version }) {
      return templateFromApi(
        await request({
          body: JSON.stringify({ version }),
          dependencies,
          method: 'POST',
          path: `${CONTRACTOR_MAIL_TEMPLATES_PATH}/${templateId}/default`,
        }),
      )
    },
    async updateTemplate({ body, templateId }) {
      return templateFromApi(
        await request({
          body: JSON.stringify(body),
          dependencies,
          method: 'PATCH',
          path: `${CONTRACTOR_MAIL_TEMPLATES_PATH}/${templateId}`,
        }),
      )
    },
  }
}

export function getContractorMailTemplatesClient(): ContractorMailTemplatesClient {
  return createContractorMailTemplatesClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
