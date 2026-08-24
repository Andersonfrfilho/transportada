/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createGetLastJobRunUseCase } from '../../src/nfe-imports/application/get-last-job-run.use-case.js'
import type {
  JobRunSnapshot,
  LastJobRunReaderPort,
} from '../../src/nfe-imports/application/nfe-import.types.js'
import { COMPANY_CONTEXT, COMPANY_ID } from '../fixtures/nfe-import-application.fixture'

const SCHEDULED_RUN: JobRunSnapshot = {
  counters: { enqueuedImports: 3 },
  finishedAt: '2026-08-24T09:05:00.000Z',
  origin: 'schedule',
  outcome: 'succeeded',
  startedAt: '2026-08-24T09:00:00.000Z',
}

/**
 * O cartão da aba Remota conta a história das duas origens no mesmo lugar: a janela e o botão. Sem
 * isto, apertar o botão não mudaria nada na tela, e o operador apertaria de novo.
 */
describe('last distribution job run contract', () => {
  test('reads the routine of the remote pull, scoped to the caller company', async () => {
    const reader = new ReaderFixture(SCHEDULED_RUN)
    const useCase = createGetLastJobRunUseCase({ reader })

    expect(await useCase.execute({ context: COMPANY_CONTEXT })).toEqual(SCHEDULED_RUN)
    expect(reader.calls).toEqual([{ companyId: COMPANY_ID, job: 'nfe.distribution.pull' }])
  })

  test('says nothing happened yet instead of inventing an empty execution', async () => {
    const useCase = createGetLastJobRunUseCase({ reader: new ReaderFixture(null) })

    expect(await useCase.execute({ context: COMPANY_CONTEXT })).toBeNull()
  })
})

class ReaderFixture implements LastJobRunReaderPort {
  public readonly calls: { readonly companyId: string; readonly job: string }[] = []

  public constructor(private readonly snapshot: JobRunSnapshot | null) {}

  async readLastRun(input: {
    readonly companyId: string
    readonly job: string
  }): Promise<JobRunSnapshot | null> {
    this.calls.push({ companyId: input.companyId, job: input.job })
    return this.snapshot
  }
}
