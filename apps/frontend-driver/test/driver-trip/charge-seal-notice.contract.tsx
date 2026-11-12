/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, describe, expect, test } from 'bun:test'

import { i18n } from '@/modules/shared/i18n/i18n.service'
import { DriverChargeSealNotice } from '@/modules/driver-trip/components/DriverChargeSealNotice.component'
import { readClientChargeSeal } from '@/modules/driver-trip/shared/driverTripResponse.validation'

/**
 * Spec 317 (E7, RF13, T14a): o selo de possível cobrança é aviso somente leitura (sem botão nem foco), tolerante na
 * leitura — ausente ou malformado some, e quem decide mostrar é o servidor.
 */
function textOf(html: string): string {
  return html
    .replaceAll(/<svg[\s\S]*?<\/svg>/gu, '')
    .replaceAll(/<[^>]+>/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim()
}

afterAll(async () => {
  await i18n.changeLanguage('pt-BR')
})

describe('selo de possível cobrança na parada (spec 317 T14a)', () => {
  test('sem selo não renderiza nada', () => {
    expect(renderToStaticMarkup(<DriverChargeSealNotice seal={undefined} />)).toBe('')
  })

  test('com selo mostra o texto nos dois idiomas, sem botão nem link', async () => {
    const seal = { flaggedAt: '2026-11-01T00:00:00.000Z' }
    await i18n.changeLanguage('pt-BR')
    const pt = renderToStaticMarkup(<DriverChargeSealNotice seal={seal} />)
    expect(textOf(pt)).toContain('possível cobrança na entrega')
    expect(pt).not.toMatch(/<(button|a)[\s>]/u)
    await i18n.changeLanguage('en')
    expect(textOf(renderToStaticMarkup(<DriverChargeSealNotice seal={seal} />))).toContain(
      'possible charge on delivery',
    )
  })

  test('a leitura tolera ausente e malformado', () => {
    expect(readClientChargeSeal(undefined)).toBeUndefined()
    expect(readClientChargeSeal({ flaggedAt: 1 })).toBeUndefined()
    expect(readClientChargeSeal('x')).toBeUndefined()
    expect(readClientChargeSeal({ flaggedAt: '2026-11-01T00:00:00.000Z' })).toEqual({
      flaggedAt: '2026-11-01T00:00:00.000Z',
    })
  })
})
