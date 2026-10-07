/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { isValidElement, useState, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { OccurrenceItemRow } from '@/modules/driver-trip/components/OccurrenceItemRow.component'
import { OccurrenceItemsField } from '@/modules/driver-trip/components/OccurrenceItemsField.component'
import { useOccurrenceValues } from '@/modules/driver-trip/hooks/useOccurrenceValues.hook'
import enLocale from '@/modules/driver-trip/locales/driverTrip.en.locale.json'
import ptLocale from '@/modules/driver-trip/locales/driverTrip.locale.json'
import type {
  DriverNfeProduct,
  DriverOccurrenceType,
} from '@/modules/driver-trip/shared/driverTrip.types'

/**
 * Spec 247 (T7.3x, pedido do usuário): o botão "Total da nota" preenche a quantidade devolvida com tudo o
 * que a nota tem do produto. Sem DOM nesta app: o clique é o `onClick` do `<button>` real da linha, achado
 * na árvore que `OccurrenceItemRow` devolve e chamado dentro do render de um arnês que usa o hook de verdade
 * (`useOccurrenceValues`) — a soma, a conta e o "pressionado" saem do mesmo caminho do campo.
 */
function buildProduct(overrides: Partial<DriverNfeProduct> & { readonly code: string }) {
  return {
    description: 'Produto',
    hasVaryingUnitValue: false,
    quantity: '1.0000',
    unit: 'UN',
    unitValue: '10.0000',
    ...overrides,
  } satisfies DriverNfeProduct
}

const BISCUIT = buildProduct({
  code: 'P1',
  description: 'Biscoito',
  quantity: '3.0000',
  unit: 'CX',
  unitValue: '19.9950',
})
const CAKE = buildProduct({
  code: 'P2',
  description: 'Bolo',
  quantity: '5.0000',
  unitValue: '57.2000',
})
const TYPE: DriverOccurrenceType = {
  declaredAmountLabel: 'Valor pago pela loja',
  declaredAmountMode: 'off',
  declaredAmountScope: 'item',
  flow: 'document',
  id: 'type-1',
  itemsMode: 'required',
  name: 'Devolução parcial',
}

type Scenario = {
  /** Produto cujo botão é clicado. */
  readonly clickCode?: string
  readonly products: readonly DriverNfeProduct[]
  readonly selected: readonly string[]
  readonly typed?: Readonly<Record<string, string>>
}

function findButton(node: ReactNode): ReactElement<Record<string, unknown>> | undefined {
  if (!isValidElement(node)) {
    return Array.isArray(node)
      ? node.map(findButton).find((found) => found !== undefined)
      : undefined
  }
  const element = node as ReactElement<Record<string, unknown>>
  if (element.type === 'button') return element
  return findButton(element.props.children as ReactNode)
}

function Harness({ scenario }: { readonly scenario: Scenario }) {
  const form = useOccurrenceValues({ products: scenario.products, type: TYPE })
  const [step, setStep] = useState(0)
  const clickedLine = form.values.lines.find((line) => line.product.code === scenario.clickCode)
  const row = OccurrenceItemRow({
    declaredAmountLabel: '',
    form,
    isAmountVisible: false,
    line: clickedLine ?? form.values.lines[0]!,
  })

  if (step === 0) {
    scenario.selected.forEach((code) => form.handleItemToggle(code))
    setStep(1)
  } else if (step === 1) {
    Object.entries(scenario.typed ?? {}).forEach(([code, text]) =>
      form.handleItemQuantityChange({ code, text }),
    )
    setStep(2)
  } else if (step === 2) {
    if (scenario.clickCode !== undefined) {
      const onClick = findButton(row)?.props.onClick as (() => void) | undefined
      onClick?.()
    }
    setStep(3)
  }

  return <OccurrenceItemsField declaredAmountLabel={undefined} form={form} isRequired />
}

function render(scenario: Scenario): string {
  return renderToStaticMarkup(<Harness scenario={scenario} />)
}

const BOTH = [BISCUIT, CAKE]

describe('o botão "Total da nota" da linha do produto (spec 247 T7.3x)', () => {
  test('com 1 digitado a conta é a de 1 CX, e o botão oferece o total da nota', () => {
    const html = render({ products: BOTH, selected: ['P1'], typed: { P1: '1' } })

    expect(html).toContain('value="1"')
    expect(html).toContain('1 CX × R$ 19,995 =')
    expect(html).toContain('R$ 20,00')
    expect(html).toContain('>Total da nota<')
    expect(html).toContain('aria-label="Devolver tudo: 3 CX"')
    expect(html).toContain('aria-pressed="false"')
  })

  test('o clique põe 3 no campo e a conta, a soma da linha e a soma geral seguem', () => {
    const html = render({
      clickCode: 'P1',
      products: BOTH,
      selected: ['P1'],
      typed: { P1: '1' },
    })

    expect(html).toContain('value="3"')
    expect(html).toContain('3 CX × R$ 19,995 =')
    expect(html).toContain('R$ 59,99')
    expect(html).not.toContain('R$ 20,00')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('<dd>R$ 59,99</dd>')
  })

  test('a quantidade já no total deixa o botão pressionado, com o mesmo rótulo', () => {
    const html = render({ products: BOTH, selected: ['P1'], typed: { P1: '3,0' } })

    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('>Total da nota<')
    expect(html).toContain('aria-label="Devolver tudo: 3 CX"')
  })

  test('o clique de um produto não mexe no campo do outro', () => {
    const html = render({
      clickCode: 'P2',
      products: BOTH,
      selected: ['P1', 'P2'],
      typed: { P1: '2' },
    })

    expect(html).toContain('value="2"')
    expect(html).toContain('value="5"')
    expect(html).toContain('2 CX × R$ 19,995 =')
    expect(html).toContain('5 UN × R$ 57,20 =')
    expect(html).not.toContain('value="3"')
  })

  test('sem quantidade na nota não há botão', () => {
    const empty = buildProduct({ code: 'P3', quantity: '0.0000' })
    const html = render({ products: [empty], selected: ['P3'] })

    expect(html).not.toContain('Total da nota')
    expect(html).not.toContain('Devolver tudo')
  })

  test('produto não marcado não tem campo nem botão', () => {
    const html = render({ products: BOTH, selected: [] })

    expect(html).not.toContain('Total da nota')
  })
})

describe('o botão "Total da nota" sem literal de tela (spec 247 T7.3x)', () => {
  test('rótulo e aria-label existem em pt-BR e en, e o TSX usa só as chaves', () => {
    expect(ptLocale.occurrenceRegistration.items.fillTotal).toBe('Total da nota')
    expect(ptLocale.occurrenceRegistration.items.fillTotalAria).toContain('{{quantity}}')
    expect(enLocale.occurrenceRegistration.items.fillTotal).not.toBe('')
    expect(enLocale.occurrenceRegistration.items.fillTotalAria).toContain('{{unit}}')

    const source = readFileSync(
      new URL(
        '../../src/modules/driver-trip/components/OccurrenceItemRow.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    expect(source).toContain("t('occurrenceRegistration.items.fillTotal')")
    expect(source).not.toContain('Total da nota')
    expect(source).toContain('handleFillTotalQuantity')
  })
})
