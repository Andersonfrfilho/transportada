/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { OccurrenceMoneyField } from '@/modules/driver-trip/components/OccurrenceMoneyField.component'
import { OccurrenceItemsField } from '@/modules/driver-trip/components/OccurrenceItemsField.component'
import { OccurrenceRegisterAction } from '@/modules/driver-trip/components/OccurrenceRegisterAction.component'
import enLocale from '@/modules/driver-trip/locales/driverTrip.en.locale.json'
import ptLocale from '@/modules/driver-trip/locales/driverTrip.locale.json'
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
    expect(html).toContain('Na nota: 3 CX × R$\u00a019,995')
    expect(html).toContain('Na nota: 1 UN × R$\u00a057,20')
  })

  test('produto desmarcado não mostra campo nem conta', () => {
    const html = renderItems({ drafts: {}, type: buildType({}) })

    expect(html).not.toContain('Quantidade devolvida')
    expect(html).not.toMatch(/ =</u)
    expect(html).not.toContain('R$\u00a019,995 =')
  })

  test('produto marcado mostra a quantidade na unidade da nota e a conta da linha', () => {
    const html = renderItems({
      drafts: { P1: { declaredAmountText: '', isSelected: true, quantityText: '3' }, P2: SELECTED },
      type: buildType({}),
    })

    expect(html).toContain('Quantidade devolvida (CX)')
    expect(html).toContain('Quantidade devolvida (UN)')
    expect(html).toContain('3 CX × R$\u00a019,995 =')
    expect(html).toContain('R$\u00a059,99')
    expect(html).toContain('1 UN × R$\u00a057,20 =')
    expect(html).toContain('R$\u00a057,20')
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

  test('a soma geral e a linha do valor pago: 57,20 + 59,99 = R$\u00a0117,19', () => {
    const html = renderItems({
      drafts: { P1: { declaredAmountText: '', isSelected: true, quantityText: '3' }, P2: SELECTED },
      type: buildType({ declaredAmountMode: 'optional' }),
    })

    expect(html).toContain('Soma dos produtos (NF-e)')
    expect(html).toContain('R$\u00a0117,19')
    expect(html).toContain('Valor pago pela loja')
  })

  test('sem nada marcado a soma é R$\u00a00,00', () => {
    const html = renderItems({ drafts: {}, type: buildType({ declaredAmountMode: 'optional' }) })

    expect(html.match(/R\$\u00a00,00/gu)).toHaveLength(2)
  })

  test('valor pago desligado: a segunda linha diz que é o valor do e-mail, e nenhuma linha o pede', () => {
    const html = renderItems({ drafts: { P2: SELECTED }, type: buildType({}) })

    expect(html).toContain('Total que vai no e-mail')
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
    expect(html).toContain('Total que vai no e-mail')
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

describe('quantidade com casas a mais: a tela marca, não corta (T7.2)', () => {
  function renderQuantity(quantityText: string): string {
    return renderItems({
      drafts: { P2: { declaredAmountText: '', isSelected: true, quantityText } },
      type: buildType({}),
    })
  }

  test('4 casas: o texto digitado fica no campo, aria-invalid e a mensagem "no máximo 3 casas"', () => {
    const html = renderQuantity('0,5555')

    expect(html).toContain('value="0,5555"')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('no máximo 3 casas')
  })

  test('mais de 9 dígitos inteiros também é dito', () => {
    expect(renderQuantity('1234567890')).toContain('no máximo 9 dígitos')
  })

  test('3 casas é válido: sem erro', () => {
    expect(renderQuantity('0,555')).not.toContain('aria-invalid')
  })
})

describe('dinheiro nunca quebra depois do "R$" (T7.2, B1a)', () => {
  test('todo "R$" dos textos da tela é seguido de espaço não separável, em pt-BR e em inglês', () => {
    for (const locale of [ptLocale, enLocale]) {
      const texts = JSON.stringify(locale.occurrenceRegistration)
      expect(texts).toContain('R$\u00a0')
      expect(texts).not.toMatch(/R\$ /u)
    }
  })

  test('a conta da linha e o "pago" levam o espaço não separável', () => {
    const html = renderItems({
      drafts: { P2: { declaredAmountText: '99,00', isSelected: true, quantityText: '1' } },
      type: buildType({ declaredAmountMode: 'optional' }),
    })

    expect(html).toContain('· pago R$\u00a099,00')
    expect(html).not.toMatch(/R\$ \d/u)
  })
})

describe('o total diz de onde vem (T7.2, B1b, RF9)', () => {
  const PAID = { declaredAmountText: '50,00', isSelected: true, quantityText: '1' } as const

  test('nada digitado: é a soma calculada pela nota', () => {
    const html = renderItems({
      drafts: { P2: SELECTED },
      type: buildType({ declaredAmountMode: 'optional' }),
    })

    expect(html).toContain('Total que vai no e-mail')
    expect(html).toContain('Calculado pela nota (quantidade × valor unitário).')
    expect(html).not.toContain('Valor pago pela loja</dt>')
  })

  test('misturado: diz quantas linhas são digitadas e que as outras são calculadas', () => {
    const html = renderItems({
      drafts: { P1: { declaredAmountText: '', isSelected: true, quantityText: '3' }, P2: PAID },
      type: buildType({ declaredAmountMode: 'optional' }),
    })

    expect(html).toContain('R$\u00a0109,99')
    expect(html).toContain(
      '1 de 2 linhas com valor pago digitado; as outras, calculadas pela nota.',
    )
  })

  test('todas digitadas', () => {
    const html = renderItems({
      drafts: { P2: PAID },
      type: buildType({ declaredAmountMode: 'optional' }),
    })

    expect(html).toContain('Valor pago digitado em todas as linhas.')
  })
})

describe('o campo do valor pago (máscara de centavos, T7.2)', () => {
  function renderMoney(value: string): string {
    return renderToStaticMarkup(
      <OccurrenceMoneyField
        label="Valor pago"
        onChange={() => undefined}
        placeholder="0,00"
        value={value}
      />,
    )
  }

  test('teclado numérico, e o texto mascarado é o que o campo mostra', () => {
    const html = renderMoney('1.234,56')

    expect(html).toContain('inputMode="numeric"')
    expect(html).toContain('value="1.234,56"')
  })

  test('no teto a tela diz, em região viva — nunca ignora calada', () => {
    const html = renderMoney('9.999.999.999,99')

    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Limite do campo')
  })

  test('abaixo do teto a região viva fica vazia', () => {
    expect(renderMoney('15,00')).not.toContain('Limite do campo')
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

describe('o botão liberado anuncia que está tudo preenchido (T7.2, B1c)', () => {
  function renderReady(input: { readonly hasRequiredFields: boolean; readonly missing: boolean }) {
    return renderToStaticMarkup(
      <OccurrenceRegisterAction
        canRegister={!input.missing}
        hasRequiredFields={input.hasRequiredFields}
        missingFields={input.missing ? ['note'] : []}
        onCancel={() => undefined}
        onRegister={() => undefined}
        photoMinimumCount={1}
        rendersRegister
      />,
    )
  }

  test('com algo exigido e tudo preenchido: região viva com a mensagem positiva', () => {
    const html = renderReady({ hasRequiredFields: true, missing: false })

    expect(html).toMatch(/role="status"[^>]*>.*Tudo o que o tipo pede está preenchido\./u)
    expect(html).not.toContain('Para registrar, falta')
  })

  test('faltando algo: a mensagem é a do que falta, nunca a positiva', () => {
    const html = renderReady({ hasRequiredFields: true, missing: true })

    expect(html).toContain('Para registrar, falta: a observação.')
    expect(html).not.toContain('Tudo o que o tipo pede')
  })

  test('nada exigido: sem mensagem positiva, mas a região viva continua montada', () => {
    const html = renderReady({ hasRequiredFields: false, missing: false })

    expect(html).not.toContain('Tudo o que o tipo pede')
    expect(html).toContain('role="status"')
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
