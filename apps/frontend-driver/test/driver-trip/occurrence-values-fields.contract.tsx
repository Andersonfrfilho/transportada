/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { OccurrenceItemsField } from '@/modules/driver-trip/components/OccurrenceItemsField.component'
import { OccurrenceRegisterAction } from '@/modules/driver-trip/components/OccurrenceRegisterAction.component'
import type { OccurrenceValuesForm } from '@/modules/driver-trip/hooks/useOccurrenceValues.hook'
import type {
  DriverNfeProduct,
  DriverOccurrenceType,
} from '@/modules/driver-trip/shared/driverTrip.types'
import {
  evaluateOccurrenceValues,
  type OccurrenceItemDrafts,
} from '@/modules/driver-trip/shared/occurrenceDraftValues.service'
import { resolveOccurrenceRequirements } from '@/modules/driver-trip/shared/occurrenceRequirements.service'

/**
 * Spec 247 (T5.3, RF11, CA07): a tela do motorista mostra os produtos, a soma da linha e a geral, o
 * valor pago conforme o escopo e o motivo do botão — por texto, sem DOM e sem rede.
 */
const PRODUCTS: readonly DriverNfeProduct[] = [
  {
    code: 'P1',
    description: 'Biscoito',
    hasVaryingUnitValue: false,
    quantity: '3.0000',
    unit: 'CX',
    unitValue: '19.9950',
  },
  {
    code: 'P2',
    description: 'Bolo',
    hasVaryingUnitValue: false,
    quantity: '1.0000',
    unit: 'UN',
    unitValue: '57.2000',
  },
  {
    code: 'P3',
    description: 'Fardo de água',
    hasVaryingUnitValue: true,
    quantity: '2.0000',
    unit: 'FD',
    unitValue: '10.0000',
  },
]

function buildType(overrides: Partial<DriverOccurrenceType>): DriverOccurrenceType {
  return {
    declaredAmountLabel: 'Valor pago pela loja',
    declaredAmountMode: 'off',
    declaredAmountScope: 'item',
    flow: 'document',
    id: 'type-1',
    itemsMode: 'required',
    name: 'Devolução parcial',
    ...overrides,
  }
}

function buildForm(input: {
  readonly drafts: OccurrenceItemDrafts
  readonly type: DriverOccurrenceType
}): OccurrenceValuesForm {
  return {
    declaredAmountText: '',
    handleDeclaredAmountChange: () => undefined,
    handleItemAmountChange: () => undefined,
    handleItemQuantityChange: () => undefined,
    handleItemToggle: () => undefined,
    handleReferenceNumberChange: () => undefined,
    referenceNumberText: '',
    values: evaluateOccurrenceValues({
      drafts: input.drafts,
      products: PRODUCTS,
      requirements: resolveOccurrenceRequirements(input.type),
      texts: { declaredAmount: '', referenceNumber: '' },
    }),
  }
}

function renderItems(input: {
  readonly drafts: OccurrenceItemDrafts
  readonly type: DriverOccurrenceType
}): string {
  const isAmountOn = input.type.declaredAmountMode !== 'off'
  return renderToStaticMarkup(
    <OccurrenceItemsField
      declaredAmountLabel={isAmountOn ? input.type.declaredAmountLabel : undefined}
      form={buildForm(input)}
      isRequired={input.type.itemsMode === 'required'}
    />,
  )
}

const SELECTED = { declaredAmountText: '', isSelected: true, quantityText: '1' } as const

describe('a lista de produtos da nota (RF11)', () => {
  test('cada produto é uma caixa com rótulo (a linha inteira é o alvo), código, descrição e o que a nota tem', () => {
    const html = renderItems({ drafts: {}, type: buildType({}) })

    expect(html).toContain('Produtos devolvidos (obrigatório)')
    expect(html).toContain('type="checkbox"')
    expect(html.match(/<label><input[^>]*type="checkbox"/gu)).toHaveLength(3)
    expect(html).toContain('P1')
    expect(html).toContain('Biscoito')
    expect(html).toContain('Na nota: 3 CX × R$ 19,995')
    expect(html).toContain('Na nota: 1 UN × R$ 57,20')
  })

  test('produto desmarcado não mostra campo nem conta', () => {
    const html = renderItems({ drafts: {}, type: buildType({}) })

    expect(html).not.toContain('Quantidade devolvida')
    expect(html).not.toMatch(/ =</u)
    expect(html).not.toContain('R$ 19,995 =')
  })

  test('produto marcado mostra a quantidade na unidade da nota e a conta da linha', () => {
    const html = renderItems({
      drafts: { P1: { declaredAmountText: '', isSelected: true, quantityText: '3' }, P2: SELECTED },
      type: buildType({}),
    })

    expect(html).toContain('Quantidade devolvida (CX)')
    expect(html).toContain('Quantidade devolvida (UN)')
    expect(html).toContain('3 CX × R$ 19,995 =')
    expect(html).toContain('R$ 59,99')
    expect(html).toContain('1 UN × R$ 57,20 =')
    expect(html).toContain('R$ 57,20')
  })

  test('o rótulo de cada campo é ligado a ele (for/id) — nunca um texto solto', () => {
    const html = renderItems({ drafts: { P2: SELECTED }, type: buildType({}) })

    const labelFor = /<label[^>]*for="([^"]+)"[^>]*>Quantidade devolvida \(UN\)<\/label>/u.exec(
      html,
    )
    expect(labelFor?.[1]).toBeString()
    expect(html).toContain(`id="${labelFor?.[1] ?? ''}"`)
    expect(html).toContain('inputMode="decimal"')
  })

  test('a soma geral e a linha do valor pago: 57,20 + 59,99 = R$ 117,19', () => {
    const html = renderItems({
      drafts: { P1: { declaredAmountText: '', isSelected: true, quantityText: '3' }, P2: SELECTED },
      type: buildType({ declaredAmountMode: 'optional' }),
    })

    expect(html).toContain('Soma dos produtos (NF-e)')
    expect(html).toContain('R$ 117,19')
    expect(html).toContain('Valor pago pela loja')
  })

  test('sem nada marcado a soma é R$ 0,00', () => {
    const html = renderItems({ drafts: {}, type: buildType({ declaredAmountMode: 'optional' }) })

    expect(html.match(/R\$ 0,00/gu)).toHaveLength(2)
  })

  test('valor pago desligado: a segunda linha diz que é o valor do e-mail, e nenhuma linha o pede', () => {
    const html = renderItems({ drafts: { P2: SELECTED }, type: buildType({}) })

    expect(html).toContain('Valor no e-mail')
    expect(html).not.toContain('obrigatório</label>')
    expect(html).not.toContain('se diferente')
  })
})

describe('o valor pago por linha (escopo "por produto")', () => {
  test('obrigatório: o rótulo do tipo, "obrigatório", e a soma da linha como sugestão', () => {
    const html = renderItems({
      drafts: { P2: SELECTED },
      type: buildType({ declaredAmountMode: 'required' }),
    })

    expect(html).toContain('Valor pago pela loja · obrigatório')
    expect(html).toContain('placeholder="57,20"')
  })

  test('opcional: "se diferente"', () => {
    const html = renderItems({
      drafts: { P2: SELECTED },
      type: buildType({ declaredAmountMode: 'optional' }),
    })

    expect(html).toContain('Valor pago pela loja · se diferente')
  })

  test('preço que varia na nota: avisa e passa a exigir o valor naquela linha, mesmo sendo opcional', () => {
    const html = renderItems({
      drafts: { P3: SELECTED },
      type: buildType({ declaredAmountMode: 'optional' }),
    })

    expect(html).toContain('O valor unitário varia nesta nota')
    expect(html).toContain('Valor pago pela loja · obrigatório')
  })

  test('escopo da ocorrência: nenhuma linha leva campo de valor pago', () => {
    const html = renderItems({
      drafts: { P2: SELECTED },
      type: buildType({ declaredAmountMode: 'required', declaredAmountScope: 'occurrence' }),
    })

    expect(html).not.toContain('Valor pago pela loja · obrigatório')
    expect(html).toContain('Valor pago pela loja')
  })
})

describe('quantidade inválida fica dita na linha', () => {
  test('acima da nota: diz quanto a nota tem, e o campo é marcado como inválido', () => {
    const html = renderItems({
      drafts: { P2: { declaredAmountText: '', isSelected: true, quantityText: '2' } },
      type: buildType({}),
    })

    expect(html).toContain('A nota tem só 1 UN.')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toMatch(/aria-describedby="[^"]+-error"/u)
  })

  test('vazia: pede a quantidade', () => {
    const html = renderItems({
      drafts: { P2: { declaredAmountText: '', isSelected: true, quantityText: '' } },
      type: buildType({}),
    })

    expect(html).toContain('Informe a quantidade, maior que zero.')
  })
})

describe('o botão desabilitado diz o que falta, com os rótulos do tipo (CA07)', () => {
  function renderAction(missingFields: readonly string[]): string {
    return renderToStaticMarkup(
      <OccurrenceRegisterAction
        canRegister={false}
        missingContext={{
          declaredAmountLabel: 'Valor pago pela loja',
          itemsMinimumCount: 2,
          referenceNumberLabel: 'Número da NFD',
        }}
        missingFields={missingFields as never}
        onCancel={() => undefined}
        onRegister={() => undefined}
        photoMinimumCount={1}
        rendersRegister
      />,
    )
  }

  test('os campos novos entram pelo rótulo que o tipo deu', () => {
    const html = renderAction([
      'productsMinimum',
      'productQuantity',
      'itemDeclaredAmount',
      'referenceNumber',
    ])

    expect(html).toMatch(/<button[^>]*disabled/u)
    expect(html).toContain(
      'Para registrar, falta: mais produtos (mínimo de 2), a quantidade dos produtos marcados, “Valor pago pela loja” de cada produto marcado, “Número da NFD”.',
    )
  })

  test('o valor pago da ocorrência', () => {
    expect(renderAction(['declaredAmount'])).toContain('falta: “Valor pago pela loja”.')
  })
})

describe('a tela segue o design system do app', () => {
  const FILES = [
    'OccurrenceItemRow.component.tsx',
    'OccurrenceItemsField.component.tsx',
    'OccurrenceTextField.component.tsx',
    'OccurrenceTotals.component.tsx',
    'OccurrenceValuesSection.component.tsx',
  ].map((name) =>
    readFileSync(
      new URL(`../../src/modules/driver-trip/components/${name}`, import.meta.url),
      'utf8',
    ),
  )

  test('sem estilo em linha, sem React.FC e sem literal de tela no TSX', () => {
    for (const source of FILES) {
      expect(source).not.toMatch(/\sstyle=\{/u)
      expect(source).not.toContain('React.FC')
      expect(source).not.toMatch(/>\s*R\$/u)
      expect(source).not.toMatch(/['"]R\$ /u)
    }
  })

  test('o estado do formulário nunca guarda a soma: ela é derivada', () => {
    const hook = readFileSync(
      new URL('../../src/modules/driver-trip/hooks/useOccurrenceValues.hook.ts', import.meta.url),
      'utf8',
    )

    expect(hook).not.toMatch(/useState[^)]*[Ss]um/u)
    expect(hook).not.toMatch(/useEffect/u)
  })
})
