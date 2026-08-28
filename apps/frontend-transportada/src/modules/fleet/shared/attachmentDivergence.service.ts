/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  AggregateApplication,
  AggregateApplicationAttachment,
} from './aggregateApplicationClient.service'

export type AttachmentDivergence = Readonly<{
  declared: string
  field: string
  read: string
}>

/** O rótulo que o operador leu na tela, nunca a chave interna do campo. */
export const ATTACHMENT_FIELD_LABEL: Readonly<Record<string, string>> = {
  cnpj: 'CNPJ',
  legalName: 'Razão social',
  openedAt: 'Data de abertura',
  tradeName: 'Nome fantasia',
}

function readCompanyField(application: AggregateApplication, field: string): string {
  const company = application.declaredData.company
  if (typeof company !== 'object' || company === null) return ''
  const value = (company as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : ''
}

function normalize(value: string): string {
  return value.replace(/[^0-9A-Za-zÀ-ÿ]/gu, '').toUpperCase()
}

/**
 * O que o **servidor** leu do arquivo contra o que a candidatura declarou. Duas coisas que não são
 * divergência, e tratá-las como tal treinaria o operador a ignorar o aviso: campo que a leitura não
 * achou (ausência nunca é conflito) e campo que ninguém declarou (não há o que conferir).
 *
 * A comparação é canônica — máscara é do teclado, não do dado, e comparar `30.213.061/0001-06` com
 * `30213061000106` acusaria divergência em documento correto.
 */
export function listAttachmentDivergences(
  input: Readonly<{
    application: AggregateApplication
    attachment: AggregateApplicationAttachment
  }>,
): readonly AttachmentDivergence[] {
  const extracted = input.attachment.extractedFields
  if (extracted === null) return []

  const pairs: readonly Readonly<{ declared: string; field: string }>[] = [
    { declared: input.application.taxId, field: 'cnpj' },
    { declared: readCompanyField(input.application, 'legalName'), field: 'legalName' },
    { declared: readCompanyField(input.application, 'openedAt'), field: 'openedAt' },
    { declared: readCompanyField(input.application, 'tradeName'), field: 'tradeName' },
  ]

  return pairs.flatMap(({ declared, field }) => {
    const read = extracted[field] ?? ''
    if (declared === '' || read === '' || read === null) return []
    if (normalize(declared) === normalize(read)) return []

    return [{ declared, field, read }]
  })
}
