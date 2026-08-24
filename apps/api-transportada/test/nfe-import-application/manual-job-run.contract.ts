/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  COMPANY_ID,
  IMPORT_ID,
  QUEUED_IMPORT,
  type NfeImportSummary,
} from '../fixtures/nfe-import-application.fixture'
import {
  createRequestNfeImportUseCaseFixture,
  type NfeImportItemDraft,
} from '../fixtures/nfe-import-use-case.fixture'

const REPLAY_FINGERPRINT = 'fingerprint-manual-job-run'
const CORRELATION_ID = 'correlation-manual-job-run'
const IDEMPOTENCY_KEY = 'idempotency-manual-job-run'

/**
 * O botão de busca remota é a **mesma** rotina disparada antes da hora, e por isso ele deixa a mesma
 * linha de histórico que a janela deixa — distinguida só pela origem. Sem esta gravação a tela
 * mostraria "última execução" pulando o clique, e o operador concluiria que o botão não fez nada.
 */
describe('manual distribution job run contract', () => {
  test('records a closed manual execution for the distribution routine and reschedules it', async () => {
    const unitOfWork = new UnitOfWorkFixture()
    const useCase = await createRequestNfeImportUseCaseFixture({
      fingerprintService: { create: async () => REPLAY_FINGERPRINT },
      unitOfWork,
    })

    await useCase.execute({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      source: 'distribution',
      stagedSources: [],
    })

    expect(unitOfWork.jobRuns).toEqual([
      {
        companyId: COMPANY_ID,
        correlationId: CORRELATION_ID,
        counters: { enqueuedImports: 1 },
        job: 'nfe.distribution.pull',
        outcome: 'succeeded',
        requestedBy: COMPANY_CONTEXT.userId,
      },
    ])
  })

  test('leaves no execution behind when the import came from an upload', async () => {
    const unitOfWork = new UnitOfWorkFixture()
    const useCase = await createRequestNfeImportUseCaseFixture({
      fingerprintService: { create: async () => REPLAY_FINGERPRINT },
      unitOfWork,
    })

    await useCase.execute({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      source: 'upload',
      stagedSources: [],
    })

    expect(unitOfWork.jobRuns).toEqual([])
  })

  /** Repetir a chave devolve a resposta guardada sem enfileirar nada — e histórico do que não correu
   * é histórico falso. */
  test('records nothing when the idempotency key replays an earlier request', async () => {
    const unitOfWork = new UnitOfWorkFixture()
    unitOfWork.replay = QUEUED_IMPORT
    const useCase = await createRequestNfeImportUseCaseFixture({
      fingerprintService: { create: async () => REPLAY_FINGERPRINT },
      unitOfWork,
    })

    await useCase.execute({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      source: 'distribution',
      stagedSources: [],
    })

    expect(unitOfWork.jobRuns).toEqual([])
  })
})

class UnitOfWorkFixture {
  public readonly jobRuns: unknown[] = []
  public replay: NfeImportSummary | null = null

  async createImport(): Promise<NfeImportSummary> {
    return QUEUED_IMPORT
  }

  async createItems(input: {
    readonly importId: string
    readonly items: readonly NfeImportItemDraft[]
  }): Promise<void> {
    expect(input.importId).toBe(IMPORT_ID)
  }

  async findIdempotency(): Promise<{
    readonly fingerprint: string
    readonly response: NfeImportSummary
  } | null> {
    return this.replay === null ? null : { fingerprint: REPLAY_FINGERPRINT, response: this.replay }
  }

  async recordManualJobRun(input: unknown): Promise<void> {
    this.jobRuns.push(structuredClone(input))
  }

  async saveIdempotency(): Promise<void> {}

  async saveOutbox(): Promise<void> {}
}
