/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079: o modelo de e-mail do tipo de ocorrência pode nascer de um template do módulo de
 * notificações — escolher um preenche assunto e corpo, e os campos seguem editáveis. O que se
 * grava no tipo continua sendo `emailSubject`/`emailBody`; o template é só o ponto de partida.
 */
import type { NotificationTemplateView } from '@/modules/notification/queries/useEmailTemplates.query'

import { OCCURRENCE_TEMPLATE_PLACEHOLDERS } from './occurrence.constant'

export const OCCURRENCE_TEMPLATE_FROM_SCRATCH = '' as const

export type OccurrenceEmailTemplateOption = Readonly<{
  body: string
  id: string
  label: string
  subject: string
}>

/** Só template de e-mail ativo vira opção: canal que a ocorrência não usa não entra na lista. */
export function buildOccurrenceEmailTemplateOptions(
  templates: readonly NotificationTemplateView[],
): readonly OccurrenceEmailTemplateOption[] {
  return templates
    .filter((template) => template.channel === 'email' && template.active)
    .map((template) => ({
      body: template.body,
      id: template.id,
      label:
        template.subject === undefined || template.subject === '' ? template.key : template.subject,
      subject: template.subject ?? '',
    }))
}

/**
 * Os marcadores do texto que não existem em `OCCURRENCE_TEMPLATE_PLACEHOLDERS`. O salvar já recusa
 * marcador fora da lista — o aviso ao lado existe para o operador não descobrir isso só no erro.
 */
export function findUnknownTemplatePlaceholders(text: string): readonly string[] {
  const known = new Set<string>(OCCURRENCE_TEMPLATE_PLACEHOLDERS)
  const unknown = new Set<string>()
  for (const match of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const name = match[1] ?? ''
    if (!known.has(name)) unknown.add(name)
  }
  return [...unknown]
}
