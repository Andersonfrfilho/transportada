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
import { FERIADOS_API_PAGE_SIZE } from '../domain/holiday-provider-pull.constant.js'
import { parseProviderDate } from '../domain/provider-date.policy.js'

const providerDateSchema = z
  .string()
  .transform((text) => parseProviderDate(text))
  .pipe(z.string())

/** Caracteres de controle (NUL, quebra de linha) e de formato (RLO, zero-width) não entram em nome nem em id. */
const CONTROL_AND_FORMAT_CHARACTERS = /[\p{Cc}\p{Cf}]/gu

const NAME_MAX_RAW_LENGTH = 1000
const EXTERNAL_ID_MAX_LENGTH = 64

const stripControlCharacters = (text: string) => text.replace(CONTROL_AND_FORMAT_CHARACTERS, '')

const providerNameSchema = z
  .string()
  .max(NAME_MAX_RAW_LENGTH)
  .transform(stripControlCharacters)
  .pipe(z.string().trim().min(1))
  .transform((text) => Array.from(text).slice(0, HOLIDAY_NAME_MAX_LENGTH).join('').trim())

function toExternalId(id: string | number | null | undefined): string | null {
  if (id === undefined || id === null) return null
  const cleaned = stripControlCharacters(String(id))
  return cleaned === '' ? null : cleaned
}

const providerItemSchema = z
  .object({
    bancario: z.boolean().nullish(),
    data: providerDateSchema,
    id: z.union([z.string().max(EXTERNAL_ID_MAX_LENGTH), z.number()]).nullish(),
    nome: providerNameSchema,
    tipo: z.enum(HOLIDAY_PROVIDER_TYPES),
  })
  .transform(
    (raw): ProviderHolidayItem => ({
      date: raw.data,
      externalId: toExternalId(raw.id),
      isBanking: raw.bancario ?? false,
      name: raw.nome,
      providerType: raw.tipo,
    }),
  )

/** Uma página tem no máximo `limit` itens: mais que isso não é a resposta que pedimos. */
const providerPageSchema = z.array(providerItemSchema).max(FERIADOS_API_PAGE_SIZE)

const providerResponseSchema = z.union([
  providerPageSchema,
  z.object({ data: providerPageSchema }).transform((envelope) => envelope.data),
])

/** `undefined` quando a resposta não tem a forma esperada — o chamador a recusa inteira. */
export function readProviderItems(body: unknown): readonly ProviderHolidayItem[] | undefined {
  const parsed = providerResponseSchema.safeParse(body)
  return parsed.success ? parsed.data : undefined
}
