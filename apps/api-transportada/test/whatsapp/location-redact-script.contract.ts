/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 245 T2.4 (RF5, CA4): o script que redige o legado. A lógica mora no serviço, então o contrato
 * a exercita sem processo e sem banco; a prova contra o Postgres é a integração
 * `whatsapp-location-redact.integration.ts`.
 */
import { describe, expect, test } from 'bun:test'

import {
  LOCATION_REDACT_BATCH_SIZE,
  parseWhatsAppLocationRedactArguments,
  runWhatsAppLocationRedaction,
  WhatsAppLocationRedactArgumentError,
  type WhatsAppLocationRedactPorts,
} from '../../src/whatsapp/application/whatsapp-location-redact.service.js'

const COMPANY_ID = '0b9a7c1e-3f4d-4a52-9b6e-1d2c3b4a5f60'
const NOW = new Date('2026-10-06T12:00:00.000Z')
const SECRET_LABEL = 'Rua Secreta 123'

type LogEntry = { readonly level: string; readonly message: string; readonly metadata: unknown }

function createCapturedLogger(): {
  readonly entries: LogEntry[]
  readonly logger: Parameters<typeof runWhatsAppLocationRedaction>[0]['logger']
} {
  const entries: LogEntry[] = []
  const record = (level: string) => (message: string, metadata?: Record<string, unknown>) => {
    entries.push({ level, message, metadata })
  }
  return {
    entries,
    logger: { error: record('error'), info: record('info'), warn: record('warn') },
  }
}

function createPorts(batches: readonly number[]): {
  readonly ports: WhatsAppLocationRedactPorts
  readonly calls: { count: number; redact: unknown[] }
} {
  const calls = { count: 0, redact: [] as unknown[] }
  const queue = [...batches]
  return {
    calls,
    ports: {
      async count() {
        calls.count += 1
        return { counted: 7, unreachable: 2 }
      },
      async redact(params) {
        calls.redact.push(params)
        return { redacted: queue.shift() ?? 0 }
      },
    },
  }
}

describe('spec 245 T2.4 — argumentos do script de redação do legado', () => {
  test('sem --company a execução é recusada', () => {
    expect(() => parseWhatsAppLocationRedactArguments({ argv: [], now: NOW })).toThrow(
      WhatsAppLocationRedactArgumentError,
    )
  })

  test('--company que não é UUID é recusado antes de qualquer consulta', () => {
    expect(() =>
      parseWhatsAppLocationRedactArguments({ argv: ['--company', 'abc'], now: NOW }),
    ).toThrow(WhatsAppLocationRedactArgumentError)
  })

  test('o padrão é dry-run e o corte é agora', () => {
    const options = parseWhatsAppLocationRedactArguments({
      argv: ['--company', COMPANY_ID],
      now: NOW,
    })

    expect(options).toEqual({ companyId: COMPANY_ID, confirm: false, receivedBefore: NOW })
  })

  test('--confirm liga a escrita e --received-before fixa o corte', () => {
    const options = parseWhatsAppLocationRedactArguments({
      argv: ['--company', COMPANY_ID, '--received-before', '2026-10-01T00:00:00.000Z', '--confirm'],
      now: NOW,
    })

    expect(options.confirm).toBe(true)
    expect(options.receivedBefore).toEqual(new Date('2026-10-01T00:00:00.000Z'))
  })

  test('data no futuro é recusada', () => {
    expect(() =>
      parseWhatsAppLocationRedactArguments({
        argv: ['--company', COMPANY_ID, '--received-before', '2026-10-07T00:00:00.000Z'],
        now: NOW,
      }),
    ).toThrow(WhatsAppLocationRedactArgumentError)
  })

  test('data que não é ISO é recusada', () => {
    expect(() =>
      parseWhatsAppLocationRedactArguments({
        argv: ['--company', COMPANY_ID, '--received-before', 'ontem'],
        now: NOW,
      }),
    ).toThrow(WhatsAppLocationRedactArgumentError)
  })
})

describe('spec 245 T2.4 — execução da redação do legado', () => {
  test('sem --confirm só conta: nunca chama redact', async () => {
    const { ports, calls } = createPorts([5])
    const { logger } = createCapturedLogger()

    const result = await runWhatsAppLocationRedaction({
      logger,
      options: { companyId: COMPANY_ID, confirm: false, receivedBefore: NOW },
      ports,
    })

    expect(result).toEqual({ counted: 7, mode: 'dry-run', unreachable: 2 })
    expect(calls.redact).toHaveLength(0)
  })

  test('com --confirm redige em lotes de 500 até o lote devolver 0 e soma o total', async () => {
    const { ports, calls } = createPorts([500, 500, 120])
    const { logger } = createCapturedLogger()

    const result = await runWhatsAppLocationRedaction({
      logger,
      options: { companyId: COMPANY_ID, confirm: true, receivedBefore: NOW },
      ports,
    })

    expect(result).toEqual({ counted: 7, mode: 'confirmed', redacted: 1120, unreachable: 2 })
    expect(calls.redact).toHaveLength(4)
    expect(calls.redact[0]).toEqual({
      batchSize: LOCATION_REDACT_BATCH_SIZE,
      companyId: COMPANY_ID,
      receivedBefore: NOW,
    })
    expect(LOCATION_REDACT_BATCH_SIZE).toBe(500)
  })

  test('segunda execução devolve 0', async () => {
    const { ports } = createPorts([])
    const { logger } = createCapturedLogger()

    const result = await runWhatsAppLocationRedaction({
      logger,
      options: { companyId: COMPANY_ID, confirm: true, receivedBefore: NOW },
      ports,
    })

    expect(result).toMatchObject({ mode: 'confirmed', redacted: 0 })
  })

  test('o log leva só empresa, contagens e o evento; nenhuma coordenada, rótulo ou telefone', async () => {
    const { ports } = createPorts([3])
    const captured = createCapturedLogger()
    const poisoned: WhatsAppLocationRedactPorts = {
      count: async () =>
        ({ counted: 3, unreachable: 0, latitude: -23.5, label: SECRET_LABEL }) as never,
      redact: ports.redact,
    }

    await runWhatsAppLocationRedaction({
      logger: captured.logger,
      options: { companyId: COMPANY_ID, confirm: true, receivedBefore: NOW },
      ports: poisoned,
    })

    const serialized = JSON.stringify(captured.entries)
    expect(serialized).not.toContain(SECRET_LABEL)
    expect(serialized).not.toContain('-23.5')
    expect(captured.entries.map((entry) => entry.message)).toContain('whatsapp.location.redacted')
    const redactedEntry = captured.entries.find(
      (entry) => entry.message === 'whatsapp.location.redacted',
    )
    expect(redactedEntry?.metadata).toEqual({ companyId: COMPANY_ID, redacted: 3 })
  })

  test('o dry-run registra a contagem e nunca o evento de redação', async () => {
    const { ports } = createPorts([])
    const captured = createCapturedLogger()

    await runWhatsAppLocationRedaction({
      logger: captured.logger,
      options: { companyId: COMPANY_ID, confirm: false, receivedBefore: NOW },
      ports,
    })

    expect(captured.entries.map((entry) => entry.message)).not.toContain(
      'whatsapp.location.redacted',
    )
  })
})
