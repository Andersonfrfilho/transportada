/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.3: o corpus ANONIMIZADO das planilhas FR-24-09 e FR-28-09 e dos 277 XMLs de 23/09 e
 * 25/09. Gerado fora do repositório: razão social vira `Destinatário NNN`, CEP vira `00NNNNNN`
 * (faixa sem uso), CNPJ/CPF vira `990000NNNNNNNN`, código de cliente, pedido e número da nota são
 * remapeados; endereço e bairro não entram. Igualdade preservada (mesmo real ⇒ mesmo falso). Ficam
 * roteiro, valor, peso, volume, cidade, `NroCarga` e datas, que não identificam pessoa.
 */
import { z } from 'zod'

import type {
  CargoPreviewCandidateDocument,
  CargoPreviewMatchItem,
} from '../../src/cargo-receiving/domain/cargo-preview-matching.types.js'

const optionalText = z
  .string()
  .nullable()
  .transform((value) => value ?? undefined)

const corpusItemSchema = z
  .object({
    city: optionalText,
    contractorReference: optionalText,
    postalCode: optionalText,
    recipientCode: optionalText,
    recipientName: optionalText,
    routeName: z.string(),
    routingDate: z.string(),
    rowNumber: z.number().int(),
    state: optionalText,
    value: z.string(),
    volumeM3: optionalText,
    weightKg: z.string(),
  })
  .strict()

const corpusDocumentSchema = z
  .object({
    grossWeightKg: optionalText,
    id: z.string(),
    issuedAt: z.string(),
    loadReference: optionalText,
    number: z.string(),
    recipientCity: optionalText,
    recipientName: optionalText,
    recipientPostalCode: optionalText,
    recipientTaxId: optionalText,
    totalValue: z.string(),
  })
  .strict()

export type CorpusItem = z.infer<typeof corpusItemSchema>

export const CORPUS_SHEETS = [
  { day: '2026-09-23', file: 'fr-24-09.items.json', name: 'FR-24-09' },
  { day: '2026-09-25', file: 'fr-28-09.items.json', name: 'FR-28-09' },
] as const

export const CORPUS_DIRECTORY = new URL('./cargo-preview-corpus/', import.meta.url)

async function readJson(file: string): Promise<unknown> {
  return Bun.file(new URL(file, CORPUS_DIRECTORY)).json()
}

export async function loadCorpusItems(file: string): Promise<readonly CorpusItem[]> {
  return z.array(corpusItemSchema).parse(await readJson(file))
}

export async function loadCorpusDocuments(): Promise<readonly CargoPreviewCandidateDocument[]> {
  return z.array(corpusDocumentSchema).parse(await readJson('documents.json'))
}

export function toMatchItem(item: CorpusItem): CargoPreviewMatchItem {
  return {
    city: item.city,
    itemKey: String(item.rowNumber),
    postalCode: item.postalCode,
    recipientCode: item.recipientCode,
    recipientName: item.recipientName,
    routeName: item.routeName,
    value: item.value,
    weightKg: item.weightKg,
  }
}
