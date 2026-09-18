import { describe, expect, it } from 'bun:test'

import { resolveFieldAuthorshipText } from '../../src/modules/trip/shared/fieldAuthorship.service'
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
 * Spec 158 D7: a frase de autoria única (`fieldAuthorship.service.ts`, namespace `authorship.*`) —
 * `TripOccurrences` e a linha do tempo consomem a mesma função. Migrado de
 * `occurrence.authorship.*` (spec 156 T9).
 */
describe('autoria de campo por canal (spec 158 D7)', () => {
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

  it('whatsapp com nome: "por <nome> pelo WhatsApp"', () => {
    const text = resolveFieldAuthorshipText(
      { actorName: 'Marina Alves', channel: 'whatsapp' },
      translate,
    )
    expect(text).toBe('por Marina Alves pelo WhatsApp')
  })

  it('whatsapp sem nome: a frase genérica que já existia, sem null/undefined', () => {
    const text = resolveFieldAuthorshipText({ channel: 'whatsapp' }, translate)
    expect(text).not.toBeNull()
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('null')
  })

  it('backoffice (D2): "por <usuária>", sem selo de motorista', () => {
    const text = resolveFieldAuthorshipText(
      { actorName: 'Marina Alves', channel: 'backoffice' },
      translate,
    )
    expect(text).toBe('por Marina Alves')
    expect(text).not.toContain('motorista')
  })

  it('canal null (não registrado, D3): "por <usuária>", igual ao backoffice', () => {
    const text = resolveFieldAuthorshipText({ actorName: 'Marina Alves', channel: null }, translate)
    expect(text).toBe('por Marina Alves')
  })

  it('ator removido (actorName: null) em backoffice: "por usuário removido", nunca id/null/undefined', () => {
    const text = resolveFieldAuthorshipText({ actorName: null, channel: 'backoffice' }, translate)
    expect(text).toBe('por usuário removido')
    expect(text).not.toContain('null')
    expect(text).not.toContain('undefined')
  })

  it('ator removido (actorName: null) em canal não registrado: "por usuário removido"', () => {
    const text = resolveFieldAuthorshipText({ actorName: null, channel: null }, translate)
    expect(text).toBe('por usuário removido')
  })

  it('a frase de "pelo sistema" não existe (ADR-0068): nenhum canal produz esse texto', () => {
    for (const channel of ['office', 'driver_app', 'whatsapp', 'backoffice', null] as const) {
      const text = resolveFieldAuthorshipText({ actorName: 'Marina Alves', channel }, translate)
      expect(text).not.toContain('sistema')
    }
  })

  it('as chaves de autoria existem nos dois idiomas', () => {
    const keys = [
      'office',
      'officeWithoutActor',
      'driverApp',
      'driverAppWithoutActor',
      'whatsapp',
      'whatsappWithActor',
      'backoffice',
      'notRegistered',
      'removedActor',
      'unknownDriver',
    ]
    for (const key of keys) {
      expect(trip.authorship[key as keyof typeof trip.authorship]).toBeTruthy()
      expect(tripEn.authorship[key as keyof typeof tripEn.authorship]).toBeTruthy()
    }
  })
})
