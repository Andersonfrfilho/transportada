/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  formatOccurrenceSettlementAmount,
  isPositiveDecimalAmount,
  maskAmountFromDecimal,
  maskAmountInput,
  sumOccurrenceSettlementAmounts,
  unmaskAmountInput,
} from '@/modules/trip/shared/occurrenceSettlementMoney.service'

const STYLES = new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url)

const PANEL = new URL(
  '../../src/modules/trip/components/OccurrenceSettlementPanel.component.tsx',
  import.meta.url,
)

/**
 * Spec 164 T23 (RF34): dinheiro nunca em float no cliente — soma e formatação passam por `BigInt`
 * escalado (`occurrenceSettlementMoney.service.ts`), nunca `parseFloat`/`number` na conta.
 */
describe('spec 164 T23: dinheiro do acerto', () => {
  test('a soma nunca usa float — dez centavos dez vezes bate exato', () => {
    const amounts = Array.from({ length: 10 }, () => '0.10')
    expect(sumOccurrenceSettlementAmounts(amounts)).toBe('1.0000')
  })

  test('item sem valor (vazio) conta como zero na soma', () => {
    expect(sumOccurrenceSettlementAmounts(['10.50', '', '5.25'])).toBe('15.7500')
  })

  test('valor zero ou negativo não é positivo — item assim não entra no envio', () => {
    expect(isPositiveDecimalAmount('0')).toBeFalse()
    expect(isPositiveDecimalAmount('0.0000')).toBeFalse()
    expect(isPositiveDecimalAmount('-1')).toBeFalse()
    expect(isPositiveDecimalAmount('')).toBeFalse()
    expect(isPositiveDecimalAmount('1.50')).toBeTrue()
  })

  test('a formatação pt-BR sai em Real, a partir do decimal', () => {
    expect(formatOccurrenceSettlementAmount('1234.50')).toBe('R$ 1.234,50')
  })
})

describe('spec 164 T23 (RF34): painel de acerto', () => {
  /**
   * Revisão de design da T30 (A3): a linha incompleta **não some mais em silêncio**. Antes ela era
   * filtrada no envio e o item desaparecia do acerto sem dizer nada; agora ela marca o campo e o
   * envio inteiro para.
   */
  test('item sem valor ou sem código para o envio, marcando o campo em vez de sumir', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('isPositiveDecimalAmount(unmaskAmountInput(row.amount))')
    expect(panel).toContain('row.productCode.trim().length > 0')
    expect(panel).toContain('if (hasInvalidRow) return')
    expect(panel).toContain('aria-invalid={amountInvalid}')
    expect(panel).toContain('aria-invalid={productCodeInvalid}')
    expect(panel).toContain("t('occurrenceSettlement.invalidRows')")
  })

  test('transportadora (carrier) não oferece o botão, e o item ressarcido vira selo com a data', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('item.reimbursedAt !== null ? (')
    expect(panel).toContain("t('occurrenceSettlement.reimbursedOn'")
    expect(panel).toContain("item.payerKind === 'carrier' ? null : (")
  })

  test('amountSource é sempre manual — esta tela não tem de onde ler o valor da nota', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain("amountSource: 'manual'")
  })

  test('usa Select/Button/Icon do design system para o seletor de pagador', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain("from '@/components/ui/select'")
    expect(panel).toContain("from '@/components/ui/button'")
    expect(panel).not.toMatch(/<select[\s>]/u)
  })
})

/**
 * Achado 2 da revisão (spec 164): `GET /trip-occurrences/:id/case/settlement` — o painel deixa de
 * nascer sempre vazio e passa a carregar o acerto já gravado.
 */
describe('spec 164 (achado 2): GET do acerto já gravado', () => {
  test('usa o hook de consulta do acerto, habilitado só com a permissão de resolver', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('useOccurrenceSettlementQuery')
    expect(panel).toContain('enabled: canResolve, occurrenceId')
  })

  test('carrega o rascunho e o resultado a partir da consulta, uma vez por ocorrência', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('loadedOccurrenceIdRef')
    expect(panel).toContain('setLastResult(settlementQuery.data)')
  })

  test('mostra um estado de carregamento com Skeleton do design system', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('settlementQuery.isLoading')
    expect(panel).toContain("from '@/components/ui/skeleton'")
  })
})

/**
 * Revisão de design da spec 164 (T30). B3: quem pagou é escolhido pelo **nome**; A1: uma grade só
 * para o bloco, com a célula do motorista sempre presente; A2: rótulo visível; A3: máscara pt-BR.
 */
describe('spec 164 T30: o acerto depois da revisão de design', () => {
  test('B3: o motorista vem da lista da frota, com busca, e nunca do UUID digitado', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('useDriverOptions')
    expect(panel).toContain("searchPlaceholder={t('occurrenceSettlement.payerSearch')}")
    expect(panel).toContain('label: driver.name')
    expect(panel).toContain('value: driver.id')
  })

  test('B3: sem fleet.read o campo de texto continua, mas com o nome resolvido ao lado', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('driverOptions.canReadDrivers ? (')
    expect(panel).toContain('payerNameOf(row.payerId)')
    expect(panel).toContain("t('occurrenceSettlement.payerManualHint')")
  })

  test('A1: a célula do motorista existe sempre — desabilitada quando não se aplica', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('disabled={!isDriverPayer}')
    expect(panel).not.toContain("row.payerKind === 'driver' ? (")
    expect(panel).toContain('styles.settlementRemove')
  })

  test('A1: rascunho e itens gravados usam a mesma grade', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel.match(/styles\.settlementGrid/gu)).toHaveLength(2)
    expect(panel.match(/styles\.settlementColumns/gu)).toHaveLength(2)
  })

  test('A2: cabeçalho de colunas no desktop e rótulo por campo no celular', () => {
    const styles = readFileSync(STYLES, 'utf8')
    expect(styles).toContain('.settlementColumns {\n  display: none;\n}')
    expect(styles).toContain('@media (min-width: 40rem)')
    const desktop = styles.slice(styles.indexOf('.settlementColumns,\n  .settlementRow {'))
    expect(desktop).toContain('display: contents')
    expect(desktop).toContain('.settlementFieldLabel {\n    display: none;\n  }')
  })

  test('A3: o campo mostra o valor mascarado, e o decimal só nasce no envio', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('maskAmountInput(event.target.value)')
    expect(panel).toContain('amount: unmaskAmountInput(row.amount)')
    expect(panel).toContain('maskAmountFromDecimal(item.amount)')
  })

  test('a linha tem id próprio — key={index} fazia o foco pular ao remover a do meio', () => {
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('key={row.id}')
    expect(panel).not.toContain('key={index}')
  })

  test('o botão destrutivo alcança os 44px de alvo no toque', () => {
    const styles = readFileSync(STYLES, 'utf8')
    expect(styles).toContain('.settlementRemove button {\n  min-height: var(--control-height);\n}')
  })
})

/** A máscara é a mesma conta do resto do dinheiro desta tela: inteiro escalado, nunca float. */
describe('spec 164 T30 A3: máscara de moeda pt-BR', () => {
  test('só dígito entra, e os dois últimos são sempre os centavos', () => {
    expect(maskAmountInput('8990')).toBe('89,90')
    expect(maskAmountInput('1')).toBe('0,01')
    expect(maskAmountInput('12345678')).toBe('123.456,78')
    expect(maskAmountInput('abc')).toBe('')
  })

  test('o decimal que a API lê sai do texto mascarado', () => {
    expect(unmaskAmountInput('123.456,78')).toBe('123456.78')
    expect(unmaskAmountInput('')).toBe('')
  })

  test('o valor gravado volta ao campo mascarado, nunca como 10.0000', () => {
    expect(maskAmountFromDecimal('10.0000')).toBe('10,00')
    expect(maskAmountFromDecimal('1234.5000')).toBe('1.234,50')
  })
})
