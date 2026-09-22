/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T402: modelos de e-mail, com `settings.manage` (a mesma permissão da configuração do
 * e-mail) e `no-store` como as rotas vizinhas. `companyId` e ator vêm sempre do token.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  invalidRequest,
  parseOption,
  parseUuidPathIdentifier,
  readListQuery,
} from '../../http/request-parsing.service.js'
import {
  API_CONTRACTOR_MAIL_TEMPLATES_CATALOG_PATH,
  API_CONTRACTOR_MAIL_TEMPLATES_PATH,
  API_CONTRACTOR_MAIL_TEMPLATES_PREVIEW_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  ContractorMailTemplate,
  ContractorMailTemplateChanges,
} from '../application/contractor-mail-template.port.js'
import type {
  ContractorMailTemplatesUseCase,
  MailTemplatePreviewSource,
} from '../application/contractor-mail-templates.use-case.js'
import {
  CONTRACTOR_MAIL_TEMPLATE_PREVIEW_RATE_LIMIT,
  CONTRACTOR_MAIL_TEMPLATE_TYPES,
  type ContractorMailTemplateType,
  type MailTemplateContent,
} from '../domain/mail-template-catalog.constant.js'
import {
  parseCreateContractorMailTemplateRequest,
  parsePreviewContractorMailTemplateRequest,
  parseSetDefaultContractorMailTemplateRequest,
  parseUpdateContractorMailTemplateRequest,
  type PreviewContractorMailTemplateBody,
  type UpdateContractorMailTemplateBody,
} from './contractor-mail-templates.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }
const TEMPLATE_PATH = `${API_CONTRACTOR_MAIL_TEMPLATES_PATH}/:templateId`
const TEMPLATE_DEFAULT_PATH = `${TEMPLATE_PATH}/default`
const LIST_QUERY_KEYS = new Set(['mailType'])
const CHANGE_KEYS = ['closing', 'intro', 'itemText', 'name', 'status', 'subject'] as const

type Dependencies = Readonly<{ templates: ContractorMailTemplatesUseCase }>

type CreateInput = Readonly<{
  content: MailTemplateContent
  mailType: ContractorMailTemplateType
  name: string
}>
type UpdateInput = Readonly<{
  changes: ContractorMailTemplateChanges
  expectedVersion: bigint
  templateId: string
}>
type SetDefaultInput = Readonly<{ expectedVersion: bigint; templateId: string }>

export function createContractorMailTemplateRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const { templates } = dependencies
  return [
    defineRoute<undefined>({
      async handle(): Promise<Response> {
        return jsonResponse({ data: templates.catalog() })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_CONTRACTOR_MAIL_TEMPLATES_CATALOG_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<Readonly<{ mailType: ContractorMailTemplateType | undefined }>>({
      async handle({ context, input }): Promise<Response> {
        const list = await templates.list({ context: context.scope, mailType: input.mailType })
        return jsonResponse({ data: list.map(serializeTemplate) })
      },
      method: 'GET',
      parse: ({ request }) => {
        const query = readListQuery(new URL(request.url), LIST_QUERY_KEYS)
        return { mailType: parseOption(query.get('mailType'), CONTRACTOR_MAIL_TEMPLATE_TYPES) }
      },
      pathname: API_CONTRACTOR_MAIL_TEMPLATES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<Readonly<{ templateId: string }>>({
      async handle({ context, input }): Promise<Response> {
        const template = await templates.read({ context: context.scope, ...input })
        return jsonResponse({ data: serializeTemplate(template) })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        templateId: parseUuidPathIdentifier(pathParameters.templateId ?? ''),
      }),
      pathname: TEMPLATE_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<CreateInput>({
      async handle({ context, input }): Promise<Response> {
        const template = await templates.create({ context: context.scope, ...input })
        return jsonResponse({ data: serializeTemplate(template) }, 201)
      },
      method: 'POST',
      async parse({ request }) {
        const { closing, intro, itemText, mailType, name, subject } =
          await parseCreateContractorMailTemplateRequest(request)
        return { content: { closing, intro, itemText, subject }, mailType, name }
      },
      pathname: API_CONTRACTOR_MAIL_TEMPLATES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<UpdateInput>({
      async handle({ context, input }): Promise<Response> {
        const template = await templates.update({ context: context.scope, ...input })
        return jsonResponse({ data: serializeTemplate(template) })
      },
      method: 'PATCH',
      async parse({ pathParameters, request }) {
        const templateId = parseUuidPathIdentifier(pathParameters.templateId ?? '')
        const body = await parseUpdateContractorMailTemplateRequest(request)
        return { changes: toChanges(body), expectedVersion: BigInt(body.version), templateId }
      },
      pathname: TEMPLATE_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<SetDefaultInput>({
      async handle({ context, input }): Promise<Response> {
        const template = await templates.setDefault({ context: context.scope, ...input })
        return jsonResponse({ data: serializeTemplate(template) })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const templateId = parseUuidPathIdentifier(pathParameters.templateId ?? '')
        const body = await parseSetDefaultContractorMailTemplateRequest(request)
        return { expectedVersion: BigInt(body.version), templateId }
      },
      pathname: TEMPLATE_DEFAULT_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<Readonly<{ source: MailTemplatePreviewSource }>>({
      async handle({ context, input }): Promise<Response> {
        const preview = await templates.preview({ context: context.scope, source: input.source })
        return jsonResponse({
          data: { html: preview.html, subject: preview.subject, text: preview.text },
        })
      },
      method: 'POST',
      async parse({ request }) {
        const body = await parsePreviewContractorMailTemplateRequest(request)
        return { source: toPreviewSource(body) }
      },
      pathname: API_CONTRACTOR_MAIL_TEMPLATES_PREVIEW_PATH,
      policy: SETTINGS_MANAGE_POLICY,
      // Segurança L2 (revisão final da Fase 4): a prévia renderiza a cada tecla que troca o modelo
      // selecionado — sem teto, um cliente com bug vira busy-loop nesta rota. Em memória (por
      // instância) porque é limitador de abuso do cliente, não trilha compartilhada como o envio.
      rateLimit: { ...CONTRACTOR_MAIL_TEMPLATE_PREVIEW_RATE_LIMIT, store: 'memory' },
    }),
  ]
}

function toChanges(body: UpdateContractorMailTemplateBody): ContractorMailTemplateChanges {
  const changes: Record<string, string> = {}
  for (const key of CHANGE_KEYS) {
    const value = body[key]
    if (value !== undefined) changes[key] = value
  }
  return changes as ContractorMailTemplateChanges
}

function toPreviewSource(body: PreviewContractorMailTemplateBody): MailTemplatePreviewSource {
  if (body.templateId !== undefined) return { templateId: body.templateId }
  const { closing, intro, itemText, mailType, subject } = body
  if (
    closing === undefined ||
    intro === undefined ||
    itemText === undefined ||
    mailType === undefined ||
    subject === undefined
  ) {
    throw invalidRequest()
  }
  return { content: { closing, intro, itemText, subject }, mailType }
}

/** Lista fechada: nunca `companyId` nem `actorUserId`; `version` como texto (bigint). */
function serializeTemplate(template: ContractorMailTemplate): Record<string, unknown> {
  return {
    closing: template.closing,
    id: template.id,
    intro: template.intro,
    isDefault: template.isDefault,
    itemText: template.itemText,
    mailType: template.mailType,
    name: template.name,
    status: template.status,
    subject: template.subject,
    updatedAt: template.updatedAt.toISOString(),
    version: template.version.toString(),
  }
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: NO_STORE_HEADERS, status })
}
