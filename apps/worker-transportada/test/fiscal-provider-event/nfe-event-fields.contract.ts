/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import {
  importarNfeXml,
  type ImportedNfeXml,
  type NfeXmlEvent,
} from '@adatechnology/fiscal-provider'

import {
  CANCELLATION_DETAIL,
  CORRECTION_DETAIL,
  CORRECTION_TEXT,
  EVENT_ACCESS_KEY,
  EVENT_REGISTRATION_PROTOCOL,
  NFE_AUTHORIZATION_PROTOCOL,
  buildProcEventoNfeXml,
} from './nfe-event-xml.fixture.js'

function importEvent(xml: string): NfeXmlEvent {
  const result: ImportedNfeXml = importarNfeXml(xml)
  if (result.kind !== 'nfe-event') throw new Error(`expected nfe-event, received ${result.kind}`)
  return result.event
}

describe('fiscal provider event contract (spec 149 T1)', () => {
  test('procEventoNFe de cancelamento entrega tpEvento, cStat do retEvento e o protocolo do registro', () => {
    const event = importEvent(
      buildProcEventoNfeXml({ type: '110111', detail: CANCELLATION_DETAIL }),
    )

    expect(event).toMatchObject({
      accessKey: EVENT_ACCESS_KEY,
      type: '110111',
      sequence: '1',
      statusCode: '135',
      protocol: EVENT_REGISTRATION_PROTOCOL,
    })
  })

  test.each(['136', '155', '573'])(
    'cStat %s do retEvento chega como veio, sem filtro no pacote',
    (statusCode) => {
      const event = importEvent(
        buildProcEventoNfeXml({
          type: '110112',
          detail: CANCELLATION_DETAIL,
          statusCode,
          reason: 'Motivo',
        }),
      )

      expect(event.type).toBe('110112')
      expect(event.statusCode).toBe(statusCode)
    },
  )

  test('evento sem retEvento chega sem statusCode e com o nProt do detEvento (o da NF-e)', () => {
    const event = importEvent(
      buildProcEventoNfeXml({ type: '110111', detail: CANCELLATION_DETAIL, hasReturn: false }),
    )

    expect(event.statusCode).toBeUndefined()
    expect(event.protocol).toBe(NFE_AUTHORIZATION_PROTOCOL)
  })

  test('CC-e entrega tipo 110110, cStat e protocolo', () => {
    const event = importEvent(buildProcEventoNfeXml({ type: '110110', detail: CORRECTION_DETAIL }))

    expect(event).toMatchObject({
      type: '110110',
      statusCode: '135',
      protocol: EVENT_REGISTRATION_PROTOCOL,
    })
  })

  // Lacuna da D18 no rc.7: quando o pacote passar a entregar o xCorrecao, este teste falha e a H2 grava o texto.
  test('CC-e ainda não expõe o texto da correção (xCorrecao) no evento normalizado — D18 bloqueada', () => {
    const event = importEvent(buildProcEventoNfeXml({ type: '110110', detail: CORRECTION_DETAIL }))

    expect(JSON.stringify(event)).not.toContain(CORRECTION_TEXT)
  })
})
