/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { CteEmissionProfileDetail } from '../../src/cte-profiles/application/cte-emission-profile.port.js'
import { CteBatchPreviewProfileCatalogFixture, createProfileFixture } from './preview-support.js'
import {
  BATCH_NAME,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  CteBatchUnitOfWorkFixture,
  DOCUMENT_ID,
  FINGERPRINT,
  IDEMPOTENCY_KEY,
  createCteBatchUseCaseForTest,
} from './support.js'

/**
 * O catálogo de perfis mora no seu próprio repositório, que abre a própria transação na mesma
 * instância de `db`. Chamá-lo de dentro da transação do lote pede uma segunda conexão ao pool
 * enquanto a primeira segue presa: com o pool cheio, ninguém devolve e a criação trava para
 * sempre, em `idle in transaction`.
 */
class TransactionAwareCatalogFixture extends CteBatchPreviewProfileCatalogFixture {
  public readonly callsInsideTransaction: boolean[] = []

  public constructor(
    private readonly unitOfWork: CteBatchUnitOfWorkFixture,
    profiles: readonly CteEmissionProfileDetail[],
  ) {
    super(profiles)
  }

  public override async listProfiles(
    input: Record<string, unknown>,
  ): Promise<readonly CteEmissionProfileDetail[]> {
    this.callsInsideTransaction.push(this.unitOfWork.isInsideTransaction)
    return super.listProfiles(input)
  }
}

describe('CT-e batch transaction scope contract', () => {
  test('resolves the emission profile catalog before opening the batch transaction', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    const profiles = new TransactionAwareCatalogFixture(unitOfWork, [createProfileFixture({})])
    const useCase = await createCteBatchUseCaseForTest(unitOfWork, FINGERPRINT, profiles)

    await useCase.create({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      documentIds: [DOCUMENT_ID],
      idempotencyKey: IDEMPOTENCY_KEY,
      name: BATCH_NAME,
    })

    expect(profiles.callsInsideTransaction).toEqual([false])
    expect(profiles.queries).toEqual([{ companyId: COMPANY_CONTEXT.companyId }])
  })
})
