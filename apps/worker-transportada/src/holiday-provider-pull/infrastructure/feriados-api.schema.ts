/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A guarda da resposta da FeriadosAPI, escrita só com as chaves que a documentação pública descreve
 * (`data` em `DD/MM/AAAA`, `nome`, `tipo`; `id` e `bancario` opcionais). O envelope exato não está
 * documentado: aceita-se a lista pelada ou a lista em `data`, e qualquer outra forma é recusada inteira.
 * A mensagem do Zod nunca sai daqui — ela ecoa o valor recusado, e o valor pode ser o token.
 */
import { z } from 'zod'

import {
  HOLIDAY_NAME_MAX_LENGTH,
  HOLIDAY_PROVIDER_TYPES,
} from '../domain/holiday-provider.constant.js'
import type { ProviderHolidayItem } from '../domain/holiday-provider.types.js'
import { parseProviderDate } from '../domain/provider-date.policy.js'

const providerDateSchema = z
  .string()
  .transform((text) => parseProviderDate(text))
  .pipe(z.string())

const providerNameSchema = z
  .string()
  .trim()
  .min(1)
  .transform((text) => Array.from(text).slice(0, HOLIDAY_NAME_MAX_LENGTH).join('').trim())

const providerItemSchema = z
  .object({
    bancario: z.boolean().nullish(),
    data: providerDateSchema,
    id: z.union([z.string(), z.number()]).nullish(),
    nome: providerNameSchema,
    tipo: z.enum(HOLIDAY_PROVIDER_TYPES),
  })
  .transform(
    (raw): ProviderHolidayItem => ({
      date: raw.data,
      externalId: raw.id === undefined || raw.id === null || raw.id === '' ? null : String(raw.id),
      isBanking: raw.bancario ?? false,
      name: raw.nome,
      providerType: raw.tipo,
    }),
  )

const providerResponseSchema = z.union([
  z.array(providerItemSchema),
  z.object({ data: z.array(providerItemSchema) }).transform((envelope) => envelope.data),
])

/** `undefined` quando a resposta não tem a forma esperada — o chamador a recusa inteira. */
export function readProviderItems(body: unknown): readonly ProviderHolidayItem[] | undefined {
  const parsed = providerResponseSchema.safeParse(body)
  return parsed.success ? parsed.data : undefined
}
