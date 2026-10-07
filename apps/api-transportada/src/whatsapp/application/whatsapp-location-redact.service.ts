/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type { ApiLogger } from '../../shared/api.types.js'

export const LOCATION_REDACT_BATCH_SIZE = 500

export class WhatsAppLocationRedactArgumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WhatsAppLocationRedactArgumentError'
  }
}

export type WhatsAppLocationRedactOptions = {
  readonly companyId: string
  readonly confirm: boolean
  readonly receivedBefore: Date
}

export type WhatsAppLocationRedactScope = {
  readonly companyId: string
  readonly receivedBefore: Date
}

export type WhatsAppLocationRedactPorts = {
  count(params: WhatsAppLocationRedactScope): Promise<{ counted: number; unreachable: number }>
  redact(
    params: WhatsAppLocationRedactScope & { readonly batchSize: number },
  ): Promise<{ redacted: number }>
}

export type WhatsAppLocationRedactResult =
  | { readonly counted: number; readonly mode: 'dry-run'; readonly unreachable: number }
  | {
      readonly counted: number
      readonly mode: 'confirmed'
      readonly redacted: number
      readonly unreachable: number
    }

const argumentsSchema = z.object({
  company: z.uuid({ error: '--company deve ser um UUID' }),
  receivedBefore: z.iso
    .datetime({ error: '--received-before deve ser ISO 8601', offset: true })
    .optional(),
})

function readValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}

export function parseWhatsAppLocationRedactArguments(params: {
  readonly argv: readonly string[]
  readonly now: Date
}): WhatsAppLocationRedactOptions {
  const { argv, now } = params
  const parsed = argumentsSchema.safeParse({
    company: readValue(argv, 'company'),
    receivedBefore: readValue(argv, 'received-before'),
  })
  if (!parsed.success) {
    throw new WhatsAppLocationRedactArgumentError(
      parsed.error.issues.map((issue) => issue.message).join('; '),
    )
  }

  const receivedBefore =
    parsed.data.receivedBefore === undefined ? now : new Date(parsed.data.receivedBefore)
  if (receivedBefore.getTime() > now.getTime()) {
    throw new WhatsAppLocationRedactArgumentError('--received-before não pode estar no futuro')
  }

  return { companyId: parsed.data.company, confirm: argv.includes('--confirm'), receivedBefore }
}

/** O log leva só empresa e contagens: coordenada, rótulo e telefone nunca passam por aqui. */
export async function runWhatsAppLocationRedaction(params: {
  readonly logger: ApiLogger
  readonly options: WhatsAppLocationRedactOptions
  readonly ports: WhatsAppLocationRedactPorts
}): Promise<WhatsAppLocationRedactResult> {
  const { logger, options, ports } = params
  const scope = { companyId: options.companyId, receivedBefore: options.receivedBefore }

  const { counted, unreachable } = await ports.count(scope)
  logger.info('whatsapp.location.counted', { companyId: options.companyId, counted, unreachable })
  if (!options.confirm) return { counted, mode: 'dry-run', unreachable }

  let redacted = 0
  for (;;) {
    // O lote seguinte depende de o anterior ter commitado: o laço é sequencial de propósito.
    const batch = await ports.redact({ ...scope, batchSize: LOCATION_REDACT_BATCH_SIZE })
    if (batch.redacted === 0) break
    redacted += batch.redacted
  }
  logger.info('whatsapp.location.redacted', { companyId: options.companyId, redacted })

  return { counted, mode: 'confirmed', redacted, unreachable }
}
