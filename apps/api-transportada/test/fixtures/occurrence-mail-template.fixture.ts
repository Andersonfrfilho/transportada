/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269: semeia modelos de e-mail para os testes de integração do tipo, da exceção e do envio.
 */
import { contractorMailTemplates } from '../../src/database/database.schema.js'
import type {
  ContractorMailTemplateStatus,
  ContractorMailTemplateType,
} from '../../src/contractor-mail/domain/mail-template-catalog.constant.js'
import type { Company, TestDatabase } from './trip-field-office-database.fixture.js'

type SeedOccurrenceMailTemplateParams = {
  readonly closing?: string
  readonly itemText?: string
  readonly intro?: string
  readonly mailType?: ContractorMailTemplateType
  readonly name?: string
  readonly status?: ContractorMailTemplateStatus
  readonly subject?: string
}

export async function seedOccurrenceMailTemplate(
  database: TestDatabase,
  company: Pick<Company, 'companyId' | 'userId'>,
  params: SeedOccurrenceMailTemplateParams = {},
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(contractorMailTemplates).values({
    actorUserId: company.userId,
    closing: params.closing ?? 'Qualquer dúvida, responda.',
    companyId: company.companyId,
    id,
    intro: params.intro ?? 'Olá {contratante}, ocorrência na nota {numero_nota}.',
    itemText: params.itemText ?? '{codigo_item} - {item}',
    mailType: params.mailType ?? 'occurrence',
    name: params.name ?? `Modelo ${id.slice(0, 8)}`,
    status: params.status ?? 'active',
    subject: params.subject ?? 'Ocorrência {numero_nota}',
  })
  return id
}
