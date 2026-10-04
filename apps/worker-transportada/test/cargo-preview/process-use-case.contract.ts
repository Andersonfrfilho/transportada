/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.3: a leitura da prévia no worker com dublês — arquivo ruim é prévia `failed` com o
 * código (resultado, a mensagem fecha), nada parcial; arquivo bom vira itens, com a linha recusada
 * `invalid` e o dia planejado pelo `RoutingDate` mais frequente.
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'

import type {
  CargoPreviewWorkerRepositoryPort,
  PreviewToProcess,
} from '../../src/cargo-preview/application/cargo-preview-worker.port.js'
import { createInProcessCargoPreviewWorkbookReader } from '../../src/cargo-preview/application/read-cargo-preview-workbook.service.js'
import { CargoPreviewValueOutOfRangeError } from '../../src/cargo-preview/application/cargo-preview-value-out-of-range.error.js'
import { processCargoPreview } from '../../src/cargo-preview/application/process-cargo-preview.use-case.js'
import type { PreviewItemsPlan } from '../../src/cargo-preview/domain/cargo-preview-items.policy.js'
import {
  CARGO_PREVIEW_EVENT_TYPE,
  type CargoPreviewProcessEnvelope,
} from '../../src/messaging/cargo-preview-envelope.schema.js'
import {
  buildCargoPreviewWorkbook,
  FR_COLUMN_MAP,
} from '../fixtures/cargo-preview-workbook.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000a1'
const CONTRACTOR_ID = '00000000-0000-4000-8000-0000000000a2'
const PREVIEW_ID = '00000000-0000-4000-8000-0000000000a3'

const ENVELOPE: CargoPreviewProcessEnvelope = {
  companyId: COMPANY_ID,
  correlationId: 'correlation-1',
  eventId: '00000000-0000-4000-8000-0000000000a4',
  occurredAt: '2026-10-04T12:00:00.000Z',
  payload: {
    bucket: 'private',
    contractorId: CONTRACTOR_ID,
    objectKey: `tenants/${COMPANY_ID}/cargo-previews/x`,
    previewId: PREVIEW_ID,
  },
  type: CARGO_PREVIEW_EVENT_TYPE.PROCESS,
  version: 1,
}

/** 46297 = 02/10/2026 (duas linhas) e 46296 = 01/10 (uma): o dia planejado é 02/10. */
const WORKBOOK = buildCargoPreviewWorkbook({
  rows: [
    { RouteName: 'FR.S.CAR', RoutingDate: 46297 },
    { 'PESO TOTAL': 10.5, RouteName: 'FR.S.CAR', RoutingDate: 46297, VALOR: 100.1 },
    { 'PESO TOTAL': 2, RouteName: 'FR.S.CAR', RoutingDate: 46297, VALOR: 50 },
    { 'PESO TOTAL': 'muito', RouteName: 'FR.MATAO', RoutingDate: 46296, VALOR: 20 },
  ],
})

function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function createFixture(input: {
  readonly bytes?: Uint8Array | undefined
  readonly preview?: Partial<PreviewToProcess> | null
  readonly profile?: boolean
  readonly storeError?: Error
}) {
  const calls = {
    failed: [] as string[],
    processing: 0,
    reads: 0,
    stored: [] as PreviewItemsPlan[],
  }
  const bytes = 'bytes' in input ? input.bytes : WORKBOOK
  const repository: CargoPreviewWorkerRepositoryPort = {
    findPreview: async () =>
      input.preview === null
        ? null
        : {
            contractorId: CONTRACTOR_ID,
            fileSha256: sha(WORKBOOK),
            status: 'queued',
            ...input.preview,
          },
    findReadingProfile: async () =>
      input.profile === false ? null : { columnMap: FR_COLUMN_MAP, sheetName: 'IMPORTAÇÃO' },
    async markFailed({ errorCode }) {
      calls.failed.push(errorCode)
    },
    async markProcessing() {
      calls.processing += 1
    },
    reevaluate: async () => ({ aliasConflicts: 0, changedItems: 0, previews: 0 }),
    async storeParsed({ plan }) {
      if (input.storeError !== undefined) throw input.storeError
      calls.stored.push(plan)
      return { aliasConflicts: 0, changedItems: 0, previews: 1 }
    },
  }
  const run = (delivery?: { readonly redelivered: boolean }) =>
    processCargoPreview(
      ENVELOPE,
      {
        now: () => new Date('2026-10-04T12:00:00.000Z'),
        reader: {
          read: async () => {
            calls.reads += 1
            return bytes
          },
        },
        repository,
        workbook: createInProcessCargoPreviewWorkbookReader({ clock: () => 0 }),
      },
      delivery,
    )
  return { calls, run }
}

/**
 * Revisão de segurança da Fase 4a (S1): a reentrega do broker (o processo caiu sem confirmar) de uma
 * leitura que já começou não relê o arquivo — reler o que derrubou o processo é laço de queda.
 */
describe('a leitura interrompida não é relida (spec 237, segurança S1)', () => {
  test('reentrega com a prévia em processing ⇒ failed PREVIEW_PROCESSING_INTERRUPTED, sem ler', async () => {
    const { calls, run } = createFixture({ preview: { status: 'processing' } })
    expect(await run({ redelivered: true })).toBe('failed')
    expect(calls.failed).toEqual(['PREVIEW_PROCESSING_INTERRUPTED'])
    expect(calls.reads).toBe(0)
    expect(calls.stored).toEqual([])
  })

  test('reentrega de prévia que nem começou (queued) é lida normalmente', async () => {
    const { calls, run } = createFixture({ preview: { status: 'queued' } })
    expect(await run({ redelivered: true })).toBe('ready')
    expect(calls.failed).toEqual([])
  })

  test('nova tentativa da fila (não é reentrega) relê a prévia em processing', async () => {
    const { calls, run } = createFixture({ preview: { status: 'processing' } })
    expect(await run({ redelivered: false })).toBe('ready')
    expect(calls.reads).toBe(1)
  })
})

describe('a leitura da prévia no worker (spec 237 T4.3)', () => {
  test('arquivo bom vira itens; a linha recusada é invalid com a coluna, sem o valor', async () => {
    const { calls, run } = createFixture({})
    expect(await run()).toBe('ready')
    const [plan] = calls.stored
    expect(plan?.plannedDate).toBe('2026-10-02')
    expect(plan?.rowCount).toBe(3)
    expect(plan?.items.map((item) => [item.rowNumber, item.matchState, item.value])).toEqual([
      [6, 'awaiting_xml', '100.10'],
      [7, 'awaiting_xml', '50.00'],
      [8, 'invalid', null],
    ])
    expect(plan?.items[2]?.rowError).toEqual([
      { column: 'PESO TOTAL', field: 'weightKg', message: 'Must be a non-negative decimal number' },
    ])
    expect(JSON.stringify(plan?.items[2])).not.toContain('muito')
    expect(calls.processing).toBe(1)
  })

  test.each([
    ['perfil desligado', { profile: false }, 'PREVIEW_NOT_ENABLED'],
    ['objeto sumido do bucket', { bytes: undefined }, 'PREVIEW_FILE_MISSING'],
    [
      'bytes trocados no bucket',
      { bytes: buildCargoPreviewWorkbook({ rows: [] }) },
      'PREVIEW_FILE_CORRUPTED',
    ],
  ] as const)('%s ⇒ failed %s, nada gravado', async (_label, fixture, code) => {
    const { calls, run } = createFixture(fixture)
    expect(await run()).toBe('failed')
    expect(calls.failed).toEqual([code])
    expect(calls.stored).toEqual([])
  })

  test('o código do leitor vira o código da prévia (arquivo que não é planilha)', async () => {
    const notAWorkbook = new TextEncoder().encode('PK\u0003\u0004 não é zip de verdade')
    const { calls, run } = createFixture({
      bytes: notAWorkbook,
      preview: { fileSha256: sha(notAWorkbook) },
    })
    expect(await run()).toBe('failed')
    expect(calls.failed).toEqual(['PREVIEW_NOT_A_WORKBOOK'])
  })

  test('prévia já lida ou falhada não é lida de novo (reentrega idempotente)', async () => {
    for (const status of ['ready', 'failed'] as const) {
      const { calls, run } = createFixture({ preview: { status } })
      expect(await run()).toBe('already_done')
      expect(calls).toEqual({ failed: [], processing: 0, reads: 0, stored: [] })
    }
    expect(await createFixture({ preview: null }).run()).toBe('missing')
  })

  test('número que estoura a coluna no banco: failed com código, nunca retry infinito (H2)', async () => {
    const { calls, run } = createFixture({ storeError: new CargoPreviewValueOutOfRangeError() })
    expect(await run()).toBe('failed')
    expect(calls.failed).toEqual(['PREVIEW_VALUE_OUT_OF_RANGE'])
  })

  test('outro erro do banco ao gravar sobe para a fila', async () => {
    const { calls, run } = createFixture({ storeError: new Error('connection reset') })
    expect(await run().catch((error: Error) => error.message)).toBe('connection reset')
    expect(calls.failed).toEqual([])
  })
})
