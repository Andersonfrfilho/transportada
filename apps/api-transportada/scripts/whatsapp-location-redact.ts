/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  CountInboundLocationsUseCase,
  MessageRepository,
  RedactInboundLocationsUseCase,
} from '@adatechnology/meta-whatsapp-module'
import { createLogger } from '@adatechnology/logger'

import { parseEnvironment } from '../src/config/environment.schema.js'
import { createDatabaseProvider } from '../src/database/database-client.service.js'
import { shouldPrettyPrintLogs } from '../src/logging/log-format.policy.js'
import {
  parseWhatsAppLocationRedactArguments,
  runWhatsAppLocationRedaction,
  WhatsAppLocationRedactArgumentError,
  type WhatsAppLocationRedactResult,
} from '../src/whatsapp/application/whatsapp-location-redact.service.js'

const CLOSE_CEILING_MS = 5_000

/**
 * Spec 245 RF5: redige o legado — a coordenada já gravada em `meta_whatsapp.messages.payload.location`
 * e o rótulo em `content`. Escrita irreversível de dado pessoal: sem `--confirm` só conta.
 *
 *   bun run scripts/whatsapp-location-redact.ts --company <uuid> [--received-before <ISO>]
 *   bun run scripts/whatsapp-location-redact.ts --company <uuid> [--received-before <ISO>] --confirm
 */
async function main(): Promise<void> {
  const options = parseOptions()
  if (options === undefined) return
  const config = parseEnvironment(process.env)
  const logger = createLogger({
    logLevel: config.logLevel,
    pretty: shouldPrettyPrintLogs(config.appEnv),
    projectName: 'transportada-api-scripts',
    version: '0.1.0',
  })

  const provider = createDatabaseProvider({ pool: config.databasePool, url: config.databaseUrl })
  try {
    const messages = new MessageRepository(provider.db as never)
    const count = new CountInboundLocationsUseCase(messages)
    const redact = new RedactInboundLocationsUseCase(messages)

    const result = await runWhatsAppLocationRedaction({
      logger,
      options,
      ports: {
        count: (scope) => count.execute(scope),
        redact: (params) => redact.execute(params),
      },
    })
    process.stdout.write(formatResult({ companyId: options.companyId, result }))
  } finally {
    await Promise.race([
      provider.close(),
      new Promise<void>((resolve) => setTimeout(resolve, CLOSE_CEILING_MS)),
    ])
  }
}

function parseOptions(): ReturnType<typeof parseWhatsAppLocationRedactArguments> | undefined {
  try {
    return parseWhatsAppLocationRedactArguments({ argv: process.argv.slice(2), now: new Date() })
  } catch (error) {
    if (!(error instanceof WhatsAppLocationRedactArgumentError)) throw error
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 2
    return undefined
  }
}

function formatResult(params: {
  readonly companyId: string
  readonly result: WhatsAppLocationRedactResult
}): string {
  const { companyId, result } = params
  const lines = [
    `empresa      ${companyId}`,
    `counted      ${result.counted}`,
    `unreachable  ${result.unreachable}`,
  ]
  if (result.mode === 'dry-run') {
    lines.push(
      `${result.counted} linha(s) seriam redigidas. nada foi escrito. repita com --confirm para redigir.`,
    )
  } else {
    lines.push(`redacted     ${result.redacted}`)
  }

  return `${lines.join('\n')}\n`
}

await main()
