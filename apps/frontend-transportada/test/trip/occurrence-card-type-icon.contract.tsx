/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 255 RF6/CA1: o cartão da ocorrência mostra o ícone do tipo ao lado do nome; sem ícone
 * conhecido o markup é idêntico ao de antes.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { TripOccurrences } from '@/modules/trip/components/TripOccurrences.component'
import type { TripOccurrence } from '@/modules/trip/shared/trip.types'

function buildOccurrence(extra: Readonly<Record<string, unknown>> = {}): TripOccurrence {
  return {
    createdAt: '2026-10-07T10:00:00Z',
    id: 'occurrence-001',
    note: 'Item danificado',
    occurrenceTypeId: 'type-001',
    productCode: '',
    stage: 'delivery',
    typeName: 'Item avariado',
    ...extra,
  }
}

function render(occurrence: TripOccurrence, canOpenOccurrence: boolean): string {
  return renderToStaticMarkup(
    <TripOccurrences
      canOpenOccurrence={canOpenOccurrence}
      canRegister={false}
      email={null}
      isRegistering={false}
      occurrences={[occurrence]}
      onReset={() => undefined}
      onRegister={() => Promise.resolve({ hasFailure: false })}
      photoSendState={[]}
      products={[]}
      types={[]}
    />,
  )
}

describe('cartão da ocorrência com o ícone do tipo (spec 255 RF6)', () => {
  for (const canOpenOccurrence of [false, true]) {
    const label = canOpenOccurrence ? 'com link' : 'sem link'

    it(`tipo com ícone do catálogo: ícone decorativo antes do nome (${label})`, () => {
      const html = render(buildOccurrence({ typeIconName: 'truck' }), canOpenOccurrence)
      const iconIndex = html.indexOf('<svg')
      const nameIndex = html.indexOf('Item avariado')

      expect(iconIndex).toBeGreaterThan(-1)
      expect(iconIndex).toBeLessThan(nameIndex)
      expect(html).toContain('aria-hidden="true"')
    })

    for (const typeIconName of [undefined, null, 'nao-existe']) {
      it(`typeIconName ${String(typeIconName)}: markup idêntico ao de antes (${label})`, () => {
        const without = render(buildOccurrence(), canOpenOccurrence)
        const withKey = render(buildOccurrence({ typeIconName }), canOpenOccurrence)

        expect(withKey).toBe(without)
        expect(withKey).not.toContain('<svg')
      })
    }
  }
})
