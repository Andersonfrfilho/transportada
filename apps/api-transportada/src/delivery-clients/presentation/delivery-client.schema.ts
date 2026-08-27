/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { DELIVERY_CLIENT_STATUSES } from '../../database/delivery-client.schema.js'
import { buildTaxIdSchema } from '../../shared/tax-id.schema.js'
import { TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
import { parseBody } from '../../http/request-parsing.service.js'
import type {
  DeliveryClientListFilters,
  DeliveryClientWriteInput,
} from '../application/delivery-client.port.js'
import type {
  DeliveryDateException,
  DeliveryWeeklyWindow,
} from '../domain/delivery-window.policy.js'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
/** `HH:MM` ou `HH:MM:SS`: a tela manda sem segundos, o banco devolve com. */
const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/u
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u
/** Dinheiro com quatro casas, como o resto do produto. Nunca `number`: float perde centavo. */
const AMOUNT_PATTERN = /^[0-9]{1,10}(\.[0-9]{1,4})?$/u

const timeSchema = z.string().regex(TIME_PATTERN)

const writeSchema = z
  .object({
    defaultServiceTimeMinutes: z.number().int().positive().nullable().optional(),
    deliveryFeeAmount: z.string().regex(AMOUNT_PATTERN).nullable().optional(),
    displayName: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
    requiresScheduling: z.boolean().optional(),
    status: z.enum(DELIVERY_CLIENT_STATUSES).optional(),
  })
  .strict()

const createSchema = writeSchema.extend({ taxId: buildTaxIdSchema(TAX_ID_PATTERN) }).strict()

const windowSchema = z
  .object({
    closesAt: timeSchema,
    opensAt: timeSchema,
    weekday: z.number().int().min(0).max(6),
  })
  .strict()
  /** A janela crescente é regra do banco; recusá-la aqui dá o erro no campo, não um 500 com CHECK. */
  .refine((window) => window.opensAt < window.closesAt, {
    message: 'The window must open before it closes',
    path: ['closesAt'],
  })

const exceptionSchema = z
  .object({
    closesAt: timeSchema.nullable().default(null),
    exceptionOn: z.string().regex(DATE_PATTERN),
    kind: z.enum(['closed', 'open']),
    opensAt: timeSchema.nullable().default(null),
    reason: z.string().trim().max(200).default(''),
  })
  .strict()
  .refine(
    (exception) =>
      exception.kind === 'closed'
        ? exception.opensAt === null && exception.closesAt === null
        : exception.opensAt !== null &&
          exception.closesAt !== null &&
          exception.opensAt < exception.closesAt,
    { message: 'An open exception requires a valid interval', path: ['kind'] },
  )

export async function parseCreateDeliveryClient(request: Request): Promise<{
  readonly taxId: string
  readonly values: DeliveryClientWriteInput
}> {
  const { taxId, ...values } = await parseBody(createSchema, request)
  return { taxId, values: toWriteInput(values) }
}

export async function parseUpdateDeliveryClient(
  request: Request,
): Promise<DeliveryClientWriteInput> {
  return toWriteInput(await parseBody(writeSchema, request))
}

/**
 * `exactOptionalPropertyTypes`: chave presente com `undefined` é diferente de chave ausente, e o
 * repositório usa exatamente essa diferença para saber o que **não** tocar.
 */
function toWriteInput(parsed: z.infer<typeof writeSchema>): DeliveryClientWriteInput {
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined),
  ) as DeliveryClientWriteInput
}

export async function parseDeliveryWindows(
  request: Request,
): Promise<readonly DeliveryWeeklyWindow[]> {
  const body = z.object({ windows: z.array(windowSchema).max(50) }).strict()
  return (await parseBody(body, request)).windows
}

export async function parseDeliveryExceptions(
  request: Request,
): Promise<readonly DeliveryDateException[]> {
  const body = z.object({ exceptions: z.array(exceptionSchema).max(200) }).strict()
  return (await parseBody(body, request)).exceptions
}

export function parseDeliveryClientList(url: URL): { readonly filters: DeliveryClientListFilters } {
  const parameters = url.searchParams
  const status = parameters.get('status')
  const requiresScheduling = parameters.get('requiresScheduling')
  const nameContains = parameters.get('nameContains')
  const cursor = parameters.get('cursor')

  return {
    filters: {
      ...(cursor === null ? {} : { cursor }),
      limit: parseLimit(parameters.get('limit')),
      ...(nameContains === null || nameContains.trim().length === 0
        ? {}
        : { nameContains: nameContains.trim() }),
      ...(requiresScheduling === null ? {} : { requiresScheduling: requiresScheduling === 'true' }),
      ...(status === null ? {} : { status: z.enum(DELIVERY_CLIENT_STATUSES).parse(status) }),
    },
  }
}

function parseLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT
  const parsed = z.coerce.number().int().min(1).max(MAX_LIMIT).parse(raw)
  return parsed
}
