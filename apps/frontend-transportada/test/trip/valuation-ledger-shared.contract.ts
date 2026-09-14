import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

/**
 * Spec 110 D8: **a criação manual e a proposta contam a mesma conta, com o mesmo componente.**
 *
 * ⚠️ Duas implementações da mesma conta divergem **caladas**: foi assim que o preço do combustível
 * passou a ler só o ajuste manual enquanto a ficha do veículo lia o efetivo (spec 100). Este
 * contrato é por texto de fonte porque a segunda implementação **compila igual** — ela só aparece
 * quando os dois números discordam na tela de alguém.
 */
function readSource(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('valuation ledger shared contract', () => {
  test('a criação manual desenha a conta pelo razão compartilhado', async () => {
    const source = await readSource(
      'src/modules/trip/components/TripValuationPreview.component.tsx',
    )

    expect(source).toContain('ValuationLedger')
    expect(source).toContain('@/modules/trip-financials/components/ValuationLedger.component')
  })

  /**
   * ⚠️ A separação entre operação e imposto (ADR-0049 §4) mora **num lugar só**. Ela viveu em
   * `trip/shared/valuationSteps.service.ts` enquanto a conta era só da criação manual; com a
   * proposta usando a mesma conta, duas cópias da mesma regra fiscal seriam duas margens.
   */
  test('a separação de operação e imposto não tem segunda cópia', async () => {
    const ledger = await readSource('src/modules/trip-financials/shared/valuationLedger.service.ts')

    expect(ledger).toContain('TAX_KINDS')
    expect(
      await Bun.file(
        new URL('src/modules/trip/shared/valuationSteps.service.ts', APPLICATION_ROOT),
      ).exists(),
    ).toBe(false)
  })

  test('a marca de conta incompleta depende de hasGaps e de nada mais', async () => {
    const source = await readSource(
      'src/modules/trip-financials/components/ValuationLedger.component.tsx',
    )

    expect(source).toContain('ledger.hasGaps ?')
    /** Uma segunda condição é o caminho pelo qual a marca some sem ninguém notar. */
    expect(source).not.toContain('hasGaps &&')
  })
})
