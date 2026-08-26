/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import type { TripFiscalReadinessSnapshot } from '../../src/trips/application/read-trip-fiscal-readiness.use-case.js'
import {
  checkTripAcceptsManifest,
  MAX_DISCHARGE_CITIES_PER_MANIFEST,
  shouldIssueAutomatically,
  TRIP_MANIFEST_BLOCKS,
} from '../../src/trips/domain/trip-manifest.policy.js'

function readiness(state: TripFiscalReadinessSnapshot['state']): TripFiscalReadinessSnapshot {
  return { documents: [], readyCount: 1, state, totalCount: 1 }
}

describe('o portão da emissão do manifesto', () => {
  it('deixa passar a viagem despachada e pronta', () => {
    expect(
      checkTripAcceptsManifest({
        dischargeCityCount: 3,
        readiness: readiness('ready'),
        tripStatus: 'dispatched',
      }),
    ).toBeNull()
  })

  /**
   * A premissa que esta spec fechou: **o manual também exige despacho**. Permitir antes reabriria o
   * buraco que a garantia fecha — o manifesto declara dez CT-e e alguém vincula a décima primeira.
   * Se a operação real exigir o contrário, é este teste que muda junto com a política.
   */
  it('recusa a viagem que ainda não foi despachada, mesmo pronta', () => {
    for (const status of ['draft', 'route_planned', 'separating', 'loading'] as const) {
      expect(
        checkTripAcceptsManifest({
          dischargeCityCount: 1,
          readiness: readiness('ready'),
          tripStatus: status,
        }),
      ).toBe(TRIP_MANIFEST_BLOCKS.tripNotDispatched)
    }
  })

  /** O despacho vem antes de propósito: mandar conferir CT-e numa viagem em rascunho é mandar procurar problema que não existe. */
  it('o motivo do despacho vem antes do da prontidão', () => {
    expect(
      checkTripAcceptsManifest({
        dischargeCityCount: 1,
        readiness: readiness('incomplete'),
        tripStatus: 'draft',
      }),
    ).toBe(TRIP_MANIFEST_BLOCKS.tripNotDispatched)
  })

  it('recusa quando falta CT-e em alguma nota', () => {
    expect(
      checkTripAcceptsManifest({
        dischargeCityCount: 1,
        readiness: readiness('incomplete'),
        tripStatus: 'dispatched',
      }),
    ).toBe(TRIP_MANIFEST_BLOCKS.readinessIncomplete)
  })

  it('recusa quando já existe manifesto vivo, e também quando ele divergiu', () => {
    for (const state of ['manifested', 'divergent'] as const) {
      expect(
        checkTripAcceptsManifest({
          dischargeCityCount: 1,
          readiness: readiness(state),
          tripStatus: 'dispatched',
        }),
      ).toBe(TRIP_MANIFEST_BLOCKS.manifestAlreadyLive)
    }
  })

  /** O layout limita a 50, e a recusa é nossa — nunca a rejeição da SEFAZ traduzida do jeito dela. */
  it('recusa acima de cinquenta municípios de descarregamento', () => {
    expect(
      checkTripAcceptsManifest({
        dischargeCityCount: MAX_DISCHARGE_CITIES_PER_MANIFEST + 1,
        readiness: readiness('ready'),
        tripStatus: 'dispatched',
      }),
    ).toBe(TRIP_MANIFEST_BLOCKS.dischargeCitiesOverLimit)
  })

  it('cinquenta exatos passam', () => {
    expect(
      checkTripAcceptsManifest({
        dischargeCityCount: MAX_DISCHARGE_CITIES_PER_MANIFEST,
        readiness: readiness('ready'),
        tripStatus: 'dispatched',
      }),
    ).toBeNull()
  })
})

describe('a emissão automática', () => {
  it('não age com a opção desligada, mesmo com tudo pronto', () => {
    expect(
      shouldIssueAutomatically({
        isAutomaticEnabled: false,
        readiness: readiness('ready'),
        tripStatus: 'dispatched',
      }),
    ).toBe(false)
  })

  /** Mesmo ligada, ela só age depois de a carga sair — é a garantia que fecha o buraco. */
  it('não age com a carga ainda no barracão, mesmo ligada e pronta', () => {
    expect(
      shouldIssueAutomatically({
        isAutomaticEnabled: true,
        readiness: readiness('ready'),
        tripStatus: 'route_planned',
      }),
    ).toBe(false)
  })

  /**
   * O caso que faz o automático existir nesta operação: o lote autoriza com o caminhão na rua, ou
   * depois de ele voltar. Se ele não agisse aí, não agiria nunca.
   */
  it('age com a carga na rua e com a viagem já concluída', () => {
    for (const status of ['in_transit', 'completed'] as const) {
      expect(
        shouldIssueAutomatically({
          isAutomaticEnabled: true,
          readiness: readiness('ready'),
          tripStatus: status,
        }),
      ).toBe(true)
    }
  })

  it('não age duas vezes: viagem já manifestada não emite de novo', () => {
    expect(
      shouldIssueAutomatically({
        isAutomaticEnabled: true,
        readiness: readiness('manifested'),
        tripStatus: 'dispatched',
      }),
    ).toBe(false)
  })

  it('age com a opção ligada, a viagem despachada e tudo pronto', () => {
    expect(
      shouldIssueAutomatically({
        isAutomaticEnabled: true,
        readiness: readiness('ready'),
        tripStatus: 'dispatched',
      }),
    ).toBe(true)
  })
})
