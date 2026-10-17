/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 (ADR-0106, D3): quem grava a escolha do modelo — no tipo ou na exceção da contratante — segura o
 * modelo com `FOR KEY SHARE` na mesma transação. Arquivar trava o modelo `FOR UPDATE`, então os dois
 * serializam: o arquivamento só confere o uso depois que a gravação terminou, e nunca perde a escolha.
 */
import { and, eq, sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import { ContractorMailTemplateNotUsableError } from '../../contractor-mail/domain/contractor-mail-template.error.js'
import { OCCURRENCE_MAIL_TYPE } from '../../contractor-mail/domain/mail-template-catalog.constant.js'
import { contractorMailTemplates } from '../../database/contractor-mail.schema.js'
import type { TripQueryable } from './trip-queryable.type.js'

const CHOICE_FIELD = 'contractorMailTemplateId'

/**
 * Inexistente, de outra empresa, arquivado ou de outro tipo de e-mail: a mesma resposta
 * (`CONTRACTOR_MAIL_TEMPLATE_NOT_USABLE`), para nunca revelar que o id existe em outro tenant.
 */
export async function lockUsableOccurrenceMailTemplate(
  transaction: TripQueryable,
  params: { readonly companyId: string; readonly templateId: string },
): Promise<void> {
  const [row] = await transaction
    .select({ id: contractorMailTemplates.id })
    .from(contractorMailTemplates)
    .where(
      and(
        eq(contractorMailTemplates.companyId, params.companyId),
        eq(contractorMailTemplates.id, params.templateId),
        eq(contractorMailTemplates.mailType, OCCURRENCE_MAIL_TYPE),
        eq(contractorMailTemplates.status, 'active'),
      ),
    )
    .for('key share')
  if (row === undefined) throw new ContractorMailTemplateNotUsableError(CHOICE_FIELD)
}

/**
 * O momento da escolha (decisão de 2026-10-17): troca para um id diferente carimba `now()`, o mesmo id
 * mantém o carimbo e `null` o limpa. Só vale em UPDATE, onde a coluna do lado direito é o valor antigo.
 */
export function buildTemplateSelectedAtChange(params: {
  readonly selectedAtColumn: PgColumn
  readonly templateColumn: PgColumn
  readonly templateId: null | string
}): SQL | null {
  if (params.templateId === null) return null
  return sql`case when ${params.templateColumn} is distinct from ${params.templateId}::uuid then now() else ${params.selectedAtColumn} end`
}
