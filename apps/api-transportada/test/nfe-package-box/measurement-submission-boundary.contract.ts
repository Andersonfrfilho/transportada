/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parsePackageBoxMeasurement } from '../../src/nfe-documents/presentation/package-box.schema.js'

/**
 * ⚠️ **A outra metade do contrato de fronteira (T14, 2ª revisão).** A fixture da raiz é gerada e
 * conferida pela app que monta o corpo
 * (`apps/frontend-transportada/test/nfe-workspace/package-box-submission-boundary.contract.ts`);
 * aqui ela passa pelo schema **real** da rota. Nenhuma app importa código-fonte de outra, e nenhuma
 * das duas metades sozinha teria pego o defeito que reprovou a 1ª revisão: o motor devolvia `float`
 * e `z.number().int()` recusava toda gravação pela câmera com `400`.
 */
const FIXTURE_URL = new URL(
  '../../../../test/fixtures/package-box-measurement-submission.fixture.json',
  import.meta.url,
)

type FixtureCase = Readonly<{ body: Record<string, unknown>; name: string }>

const fixture = (await Bun.file(FIXTURE_URL).json()) as Readonly<{ cases: readonly FixtureCase[] }>

describe('o corpo que o formulário da câmera envia é aceito pelo schema da rota (spec 152 T14)', () => {
  test('a fixture não está vazia — contrato sem caso nenhum é verde de mentira', () => {
    expect(fixture.cases.length).toBeGreaterThan(0)
  })

  for (const fixtureCase of fixture.cases) {
    test(`grava: ${fixtureCase.name}`, () => {
      const parsed = parsePackageBoxMeasurement(fixtureCase.body)

      expect(parsed.source).toBe(fixtureCase.body.source as typeof parsed.source)
      expect(parsed.camera).toBeDefined()
    })
  }
})
