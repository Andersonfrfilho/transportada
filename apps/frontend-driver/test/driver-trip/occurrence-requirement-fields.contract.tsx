/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { OccurrenceProductsField } from '@/modules/driver-trip/components/OccurrenceProductsField.component'
import { OccurrenceRegisterAction } from '@/modules/driver-trip/components/OccurrenceRegisterAction.component'
import { OccurrenceSignatureField } from '@/modules/driver-trip/components/OccurrenceSignatureField.component'
import enLocale from '@/modules/driver-trip/locales/driverTrip.en.locale.json'
import ptLocale from '@/modules/driver-trip/locales/driverTrip.locale.json'
import type { OccurrenceMissingField } from '@/modules/driver-trip/shared/occurrenceRequirements.service'

/**
 * Spec 246 (T4.1, RF7, CA05): o botão "Registrar" desabilitado **diz por quê**, em texto à vista e
 * ligado a ele por `aria-describedby`; o `SignaturePad` só existe depois que o motorista abre; os
 * produtos têm alvo de toque de botão. Renderização estática: sem DOM, sem rede.
 */
function renderAction(input: {
  readonly canRegister: boolean
  readonly missingFields: readonly OccurrenceMissingField[]
  readonly photoMinimumCount?: number
  readonly rendersRegister?: boolean
}): string {
  return renderToStaticMarkup(
    <OccurrenceRegisterAction
      canRegister={input.canRegister}
      missingFields={input.missingFields}
      onCancel={() => undefined}
      onRegister={() => undefined}
      photoMinimumCount={input.photoMinimumCount ?? 1}
      rendersRegister={input.rendersRegister ?? true}
    />,
  )
}

describe('o botão desabilitado diz o motivo, em texto à vista (RF7)', () => {
  test('falta a assinatura: botão desabilitado, ligado ao motivo por aria-describedby', () => {
    const html = renderAction({ canRegister: false, missingFields: ['signature'] })

    const describedBy = /aria-describedby="([^"]+)"/u.exec(html)?.[1]
    expect(html).toMatch(/<button[^>]*disabled/u)
    expect(describedBy).toBeString()
    expect(html).toContain(`id="${describedBy}"`)
    expect(html).toContain('role="status"')
    expect(html).toContain('Para registrar, falta: a assinatura.')
    expect(html).toContain(ptLocale.occurrenceSend)
  })

  test('vários campos faltando: todos aparecem, na ordem em que o formulário pergunta', () => {
    const html = renderAction({
      canRegister: false,
      missingFields: ['note', 'products', 'photoMinimum', 'signature'],
      photoMinimumCount: 3,
    })

    expect(html).toContain(
      'Para registrar, falta: a observação, a marcação dos produtos, mais fotos (mínimo de 3), a assinatura.',
    )
  })

  test('nada falta: o botão habilita e não há motivo nem ligação', () => {
    const html = renderAction({ canRegister: true, missingFields: [] })

    expect(html).not.toMatch(/<button[^>]*disabled/u)
    expect(html).not.toContain('aria-describedby')
    expect(html).not.toContain('Para registrar, falta')
  })

  test('sem tipo escolhido: só o Cancelar', () => {
    const html = renderAction({ canRegister: false, missingFields: [], rendersRegister: false })

    expect(html).not.toContain(ptLocale.occurrenceSend)
    expect(html).toContain(ptLocale.occurrenceRegistration.cancel)
  })
})

describe('a assinatura da ocorrência (RF9, T4.1)', () => {
  function renderSignature(input: { readonly isOpen: boolean; readonly isRequired: boolean }) {
    return renderToStaticMarkup(
      <OccurrenceSignatureField
        hasSignature={false}
        isOpen={input.isOpen}
        isRequired={input.isRequired}
        onCancel={() => undefined}
        onConfirm={() => undefined}
        onOpen={() => undefined}
        previewUrl={undefined}
      />,
    )
  }

  test('fechada: o botão para colher, e nenhum canvas — o SignaturePad nem monta', () => {
    const html = renderSignature({ isOpen: false, isRequired: true })

    expect(html).toContain(ptLocale.signature.open)
    expect(html).not.toContain('<canvas')
  })

  test('aberta: o SignaturePad monta com o canvas', () => {
    expect(renderSignature({ isOpen: true, isRequired: true })).toContain('<canvas')
  })

  test('o título diz se é obrigatória ou opcional', () => {
    expect(renderSignature({ isOpen: false, isRequired: true })).toContain(
      ptLocale.occurrenceRegistration.signature.titleRequired,
    )
    expect(renderSignature({ isOpen: false, isRequired: false })).toContain(
      ptLocale.occurrenceRegistration.signature.title,
    )
  })
})

describe('os produtos da nota (RF1b, T4.1b)', () => {
  test('um botão de alvo de toque que se marca e desmarca, com o estado dito', () => {
    const unmarked = renderToStaticMarkup(
      <OccurrenceProductsField isMarked={false} onToggle={() => undefined} />,
    )
    const marked = renderToStaticMarkup(
      <OccurrenceProductsField isMarked onToggle={() => undefined} />,
    )

    expect(unmarked).toContain('role="checkbox"')
    expect(unmarked).toContain('aria-checked="false"')
    expect(marked).toContain('aria-checked="true"')
    expect(unmarked).toContain(ptLocale.documentOccurrenceWholeDocument)
    expect(unmarked).toContain(ptLocale.occurrenceRegistration.products.title)
  })
})

function listKeys(value: unknown, prefix = ''): readonly string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    listKeys(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

describe('os textos novos existem nos dois idiomas', () => {
  test('occurrenceRegistration tem as mesmas chaves em português e em inglês', () => {
    expect([...listKeys(enLocale.occurrenceRegistration)].sort()).toEqual(
      [...listKeys(ptLocale.occurrenceRegistration)].sort(),
    )
  })
})
