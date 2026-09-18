import { describe, expect, it } from 'bun:test'

import { resolveFieldAuthorshipText } from '../../src/modules/trip/shared/fieldOccurrenceAuthorship.service'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'

function translate(key: string, options?: Record<string, unknown>): string {
  const parts = key.split('.')
  let value: unknown = trip
  for (const part of parts) {
    value =
      value !== null && typeof value === 'object'
        ? (value as Record<string, unknown>)[part]
        : undefined
  }
  if (typeof value !== 'string') throw new Error(`missing locale key: ${key}`)
  if (options === undefined) return value
  return Object.entries(options).reduce(
    (text, [name, replacement]) => text.replaceAll(`{{${name}}}`, String(replacement)),
    value,
  )
}

/**
 * Spec 156 T9 (D3): a frase de autoria que a linha do tempo imprime, por canal — a leitura só
 * publica `channel`/`actorName`/`onBehalfOfDriverName` a partir desta task (M1: campos opcionais).
 */
describe('autoria da linha do tempo por canal (spec 156 T9, D3)', () => {
  it('sem channel (registro anterior à ADR-0067, ou API antiga): sem frase', () => {
    expect(resolveFieldAuthorshipText({}, translate)).toBeNull()
  })

  it('office com ator resolvido: os dois nomes', () => {
    const text = resolveFieldAuthorshipText(
      { actorName: 'Marina Alves', channel: 'office', onBehalfOfDriverName: 'João Pereira' },
      translate,
    )
    expect(text).toContain('Marina Alves')
    expect(text).toContain('João Pereira')
  })

  it('office sem vínculo ativo do ator: nunca imprime id, cai no rótulo genérico', () => {
    const text = resolveFieldAuthorshipText(
      { actorName: null, channel: 'office', onBehalfOfDriverName: 'João Pereira' },
      translate,
    )
    expect(text).not.toBeNull()
    expect(text).toContain('João Pereira')
    expect(text).not.toContain('null')
    expect(text).not.toContain('undefined')
  })

  it('driver_app: pelo próprio motorista, marcado como aplicativo', () => {
    const text = resolveFieldAuthorshipText(
      { actorName: 'João Pereira', channel: 'driver_app' },
      translate,
    )
    expect(text).toContain('João Pereira')
  })

  it('whatsapp: sem nome nenhum, só o canal', () => {
    const text = resolveFieldAuthorshipText({ channel: 'whatsapp' }, translate)
    expect(text).not.toBeNull()
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('null')
  })

  it('as chaves de autoria existem nos dois idiomas', () => {
    const keys = ['office', 'officeWithoutActor', 'driverApp', 'driverAppWithoutActor', 'whatsapp']
    for (const key of keys) {
      expect(
        trip.occurrence.authorship[key as keyof typeof trip.occurrence.authorship],
      ).toBeTruthy()
      expect(
        tripEn.occurrence.authorship[key as keyof typeof tripEn.occurrence.authorship],
      ).toBeTruthy()
    }
  })
})
