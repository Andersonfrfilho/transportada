/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 279 T6 (RF6/RF9): quando o botão existe. O boleto precisa ter chegado ao motorista, e a recusa do tipo
 * desligado (409) ou da ocorrência inalcançável (404) o esconde; erro de rede não.
 */
import { describe, expect, it } from 'bun:test'

import type { DriverTrip } from '../../src/modules/driver-trip/shared/driverTrip.types'
import {
  collectBoletoAcceptedIds,
  hasBoletoArrived,
  isButtonHiddenByServer,
  looksLikeEmailAddress,
} from '../../src/modules/client-email/shared/clientBoletoEmailVisibility.service'
import { resolveSendErrorKey } from '../../src/modules/client-email/hooks/useClientBoletoEmailSend.hook'
import { DriverConversationRequestError } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import clientEmailEnglish from '../../src/modules/client-email/locales/clientEmail.en.locale.json'
import clientEmailPortuguese from '../../src/modules/client-email/locales/clientEmail.locale.json'

function flattenKeys(value: unknown, prefix = ''): readonly string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

describe('visibilidade do "Enviar ao cliente" no app do motorista (spec 279 T6)', () => {
  it('o aceite do boleto é o mesmo do painel, lido da viagem', () => {
    const trip = {
      stops: [
        {
          documents: [
            {
              registeredOccurrences: [
                { contractorReply: { status: 'reply_received' }, id: 'aceito' },
                { contractorReply: { status: 'awaiting_contractor' }, id: 'esperando' },
                { contractorReply: { status: 'delivered' }, id: 'entregue' },
                { contractorReply: null, id: 'sem-retorno' },
              ],
            },
            {},
          ],
        },
      ],
    } as unknown as DriverTrip
    const accepted = collectBoletoAcceptedIds([trip])
    expect([...accepted].toSorted()).toEqual(['aceito', 'entregue'])
    expect(hasBoletoArrived(null, accepted, 'aceito')).toBe(true)
    expect(hasBoletoArrived(null, accepted, 'esperando')).toBe(false)
    expect(hasBoletoArrived(undefined, accepted, undefined)).toBe(false)
  })

  it('só com o boleto entregue ao motorista', () => {
    expect(hasBoletoArrived('contractor_reply_delivered')).toBe(true)
    expect(hasBoletoArrived('case_closed')).toBe(false)
    expect(hasBoletoArrived(null)).toBe(false)
    expect(hasBoletoArrived(undefined)).toBe(false)
  })

  it('a recusa do servidor esconde o botão e a queda de rede não', () => {
    expect(isButtonHiddenByServer(409)).toBe(true)
    expect(isButtonHiddenByServer(404)).toBe(true)
    expect(isButtonHiddenByServer(503)).toBe(false)
    expect(isButtonHiddenByServer(undefined)).toBe(false)
  })

  it('reconhece a forma de um e-mail sem aceitar texto solto', () => {
    expect(looksLikeEmailAddress(' financeiro@mercado.com.br ')).toBe(true)
    expect(looksLikeEmailAddress('financeiro@mercado')).toBe(false)
    expect(looksLikeEmailAddress('financeiro mercado.com')).toBe(false)
    expect(looksLikeEmailAddress('')).toBe(false)
  })

  it('traduz a recusa da API em frase para o motorista', () => {
    expect(resolveSendErrorKey(new DriverConversationRequestError('X', 409))).toBe('unavailable')
    expect(resolveSendErrorKey(new DriverConversationRequestError('X', 400))).toBe('invalid')
    expect(resolveSendErrorKey(new Error('boom'))).toBe('failed')
  })

  it('pt-BR e en têm as mesmas chaves', () => {
    expect(flattenKeys(clientEmailEnglish).toSorted()).toEqual(
      flattenKeys(clientEmailPortuguese).toSorted(),
    )
  })
})
