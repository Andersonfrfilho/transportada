/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O texto do aviso mora **só** no módulo de notificações: o tipo de ocorrência seleciona o modelo
 * pela **chave**, e é a chave que vai gravada (`emailTemplateKey`). Nada de assunto/corpo aqui.
 */
import type { NotificationTemplateView } from '@/modules/notification/queries/useEmailTemplates.query'

/** O valor sentinela do select: tipo sem e-mail — nada é gravado como chave. */
export const OCCURRENCE_TEMPLATE_NONE = '' as const

export type OccurrenceEmailTemplateOption = Readonly<{
  key: string
  label: string
}>

/**
 * Só template de e-mail ativo vira opção: canal que a ocorrência não usa não entra na lista.
 * A consulta devolve uma linha por variante da mesma chave — sem a dobra por `key`, cada modelo
 * aparecia quadruplicado no select (medido em staging).
 */
export function buildOccurrenceEmailTemplateOptions(
  templates: readonly NotificationTemplateView[],
): readonly OccurrenceEmailTemplateOption[] {
  const seenKeys = new Set<string>()
  return templates
    .filter((template) => {
      if (template.channel !== 'email' || !template.active) return false
      if (seenKeys.has(template.key)) return false
      seenKeys.add(template.key)
      return true
    })
    .map((template) => ({
      key: template.key,
      label:
        template.subject === undefined || template.subject === '' ? template.key : template.subject,
    }))
}
