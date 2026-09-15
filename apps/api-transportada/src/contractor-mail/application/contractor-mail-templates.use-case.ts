/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T402 (RF13–RF15): cadastro dos modelos de e-mail. `companyId` e ator vêm sempre do
 * contexto autenticado. A validação das variáveis mora aqui, e não no schema HTTP, porque o `PATCH`
 * só conhece o tipo do modelo depois de lê-lo.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  ContractorMailTemplateArchivedError,
  ContractorMailTemplateInvalidError,
  ContractorMailTemplateNotFoundError,
  ContractorMailTemplateVersionConflictError,
} from '../domain/contractor-mail-template.error.js'
import {
  CONTRACTOR_MAIL_TEMPLATE_TYPES,
  MAIL_TEMPLATE_CATALOG,
  type ContractorMailTemplateType,
  type MailTemplateCatalogEntry,
  type MailTemplateContent,
} from '../domain/mail-template-catalog.constant.js'
import { validateMailTemplate } from '../domain/mail-template-render.policy.js'
import type {
  ContractorMailTemplate,
  ContractorMailTemplateChanges,
  ContractorMailTemplateRepositoryPort,
} from './contractor-mail-template.port.js'

export type MailTemplatePreview = {
  readonly html: string
  readonly subject: string
  readonly text: string
}

/** Cada tipo sabe montar o próprio e-mail com dados de exemplo; nada é enviado. */
export type MailTemplatePreviewRenderer = (content: MailTemplateContent) => MailTemplatePreview

export type MailTemplateCatalogView = MailTemplateCatalogEntry & {
  readonly mailType: ContractorMailTemplateType
}

export type MailTemplatePreviewSource =
  | { readonly templateId: string }
  | { readonly content: MailTemplateContent; readonly mailType: ContractorMailTemplateType }

type ContextInput = { readonly context: CompanyContext }

export type ContractorMailTemplatesUseCase = Readonly<{
  catalog: () => readonly MailTemplateCatalogView[]
  create: (
    input: ContextInput & {
      readonly content: MailTemplateContent
      readonly mailType: ContractorMailTemplateType
      readonly name: string
    },
  ) => Promise<ContractorMailTemplate>
  list: (
    input: ContextInput & { readonly mailType: ContractorMailTemplateType | undefined },
  ) => Promise<readonly ContractorMailTemplate[]>
  preview: (
    input: ContextInput & { readonly source: MailTemplatePreviewSource },
  ) => Promise<MailTemplatePreview>
  read: (input: ContextInput & { readonly templateId: string }) => Promise<ContractorMailTemplate>
  setDefault: (
    input: ContextInput & { readonly expectedVersion: bigint; readonly templateId: string },
  ) => Promise<ContractorMailTemplate>
  update: (
    input: ContextInput & {
      readonly changes: ContractorMailTemplateChanges
      readonly expectedVersion: bigint
      readonly templateId: string
    },
  ) => Promise<ContractorMailTemplate>
}>

export function createContractorMailTemplatesUseCase(dependencies: {
  readonly previewRenderers: Readonly<
    Record<ContractorMailTemplateType, MailTemplatePreviewRenderer>
  >
  readonly repository: ContractorMailTemplateRepositoryPort
}): ContractorMailTemplatesUseCase {
  const { previewRenderers, repository } = dependencies

  async function requireActiveTemplate(
    context: CompanyContext,
    templateId: string,
  ): Promise<ContractorMailTemplate> {
    const template = await requireTemplate({ context, repository, templateId })
    if (template.status !== 'active') throw new ContractorMailTemplateArchivedError()
    return template
  }

  return {
    catalog: () =>
      CONTRACTOR_MAIL_TEMPLATE_TYPES.map((mailType) => ({
        mailType,
        ...MAIL_TEMPLATE_CATALOG[mailType],
      })),
    create: async ({ content, context, mailType, name }) => {
      assertValidContent(mailType, content)
      return repository.create({
        actorUserId: context.userId,
        companyId: context.companyId,
        mailType,
        name,
        ...content,
      })
    },
    list: ({ context, mailType }) =>
      repository.list({
        companyId: context.companyId,
        ...(mailType === undefined ? {} : { mailType }),
      }),
    preview: async ({ context, source }) => {
      if ('templateId' in source) {
        const template = await requireTemplate({
          context,
          repository,
          templateId: source.templateId,
        })
        return previewRenderers[template.mailType](pickContent(template))
      }
      assertValidContent(source.mailType, source.content)
      return previewRenderers[source.mailType](source.content)
    },
    read: ({ context, templateId }) => requireTemplate({ context, repository, templateId }),
    setDefault: async ({ context, expectedVersion, templateId }) => {
      await requireActiveTemplate(context, templateId)
      const updated = await repository.setDefault({
        actorUserId: context.userId,
        companyId: context.companyId,
        expectedVersion,
        templateId,
      })
      if (updated === undefined) throw new ContractorMailTemplateVersionConflictError()
      return updated
    },
    update: async ({ changes, context, expectedVersion, templateId }) => {
      const current = await requireActiveTemplate(context, templateId)
      assertValidContent(current.mailType, { ...pickContent(current), ...changes })
      const updated = await repository.update({
        actorUserId: context.userId,
        changes,
        companyId: context.companyId,
        expectedVersion,
        templateId,
      })
      if (updated === undefined) throw new ContractorMailTemplateVersionConflictError()
      return updated
    },
  }
}

async function requireTemplate(params: {
  readonly context: CompanyContext
  readonly repository: ContractorMailTemplateRepositoryPort
  readonly templateId: string
}): Promise<ContractorMailTemplate> {
  const template = await params.repository.find({
    companyId: params.context.companyId,
    templateId: params.templateId,
  })
  if (template === undefined) throw new ContractorMailTemplateNotFoundError()
  return template
}

function assertValidContent(
  mailType: ContractorMailTemplateType,
  content: MailTemplateContent,
): void {
  const errors = validateMailTemplate({ content, mailType })
  if (errors.length > 0) throw new ContractorMailTemplateInvalidError(errors)
}

function pickContent(template: MailTemplateContent): MailTemplateContent {
  return {
    closing: template.closing,
    intro: template.intro,
    itemText: template.itemText,
    subject: template.subject,
  }
}
