/**
 * Contrato do bloco de entrega do detalhe da NFS-e. A emissão é automática e não existe botão de
 * transmitir: sem este bloco a nota parada na tela é indistinguível de uma nota esquecida, e o
 * operador procura um botão que não vai encontrar. O que se guarda aqui é o que a tela precisa
 * dizer — tentativa, causa da última falha e quando vem a próxima.
 */
import { describe, expect, test } from 'bun:test'

import {
  NFSE_INVOICE_DELIVERY_KEYS,
  NFSE_INVOICE_DETAIL_KEYS,
} from '../../src/modules/nfse-invoice/shared/nfseInvoice.constant'
import { NFSE_DELIVERY_STATUSES } from '../../src/modules/nfse-invoice/shared/nfseInvoice.types'
import {
  describeNfseDeliveryFailure,
  hasPendingNfseDelivery,
} from '../../src/modules/nfse-invoice/shared/nfseInvoiceDelivery.service'
import { createNfseInvoiceResponseAdapters } from '../../src/modules/nfse-invoice/shared/nfseInvoiceResponse.validation'

import { INVOICE_DELIVERY, INVOICE_DETAIL, REJECTED_INVOICE_DETAIL } from './nfse-invoice.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const DIALOG_PATH = 'src/modules/nfse-invoice/components/NfseInvoiceDetailDialog.component.tsx'
const LOCALE_PATHS = [
  'src/modules/nfse-invoice/locales/nfseInvoice.locale.json',
  'src/modules/nfse-invoice/locales/nfseInvoice.en.locale.json',
] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('nfse detail delivery response contract', () => {
  test('o detalhe carrega o estado da entrega', () => {
    const adapters = createNfseInvoiceResponseAdapters()

    const detail = adapters.invoiceDetailFromApi(INVOICE_DETAIL)

    expect(detail.delivery?.attemptCount).toBe(INVOICE_DELIVERY.attemptCount)
    expect(detail.delivery?.status).toBe(INVOICE_DELIVERY.status)
    expect(detail.delivery?.nextAttemptAt).toBe(INVOICE_DELIVERY.nextAttemptAt)
  })

  /** Nota recém-criada ainda não tem tentativa nenhuma: o bloco inteiro vem nulo, e isso é válido. */
  test('nota sem tentativa nenhuma passa com a entrega nula', () => {
    const adapters = createNfseInvoiceResponseAdapters()

    const detail = adapters.invoiceDetailFromApi({ ...INVOICE_DETAIL, delivery: null })

    expect(detail.delivery).toBeNull()
  })

  test('detalhe sem o campo de entrega é resposta quebrada, não entrega ausente', () => {
    const adapters = createNfseInvoiceResponseAdapters()
    const withoutDelivery = Object.fromEntries(
      Object.entries(INVOICE_DETAIL).filter(([key]) => key !== 'delivery'),
    )

    expect(() => adapters.invoiceDetailFromApi(withoutDelivery)).toThrow()
  })

  test('situação fora do vocabulário da emissão é recusada', () => {
    const adapters = createNfseInvoiceResponseAdapters()

    expect(() =>
      adapters.invoiceDetailFromApi({
        ...INVOICE_DETAIL,
        delivery: { ...INVOICE_DELIVERY, status: 'inventada' },
      }),
    ).toThrow()
  })

  test('a chave da entrega entra na lista estrita do detalhe', () => {
    expect(NFSE_INVOICE_DETAIL_KEYS).toContain('delivery')
    expect(NFSE_INVOICE_DELIVERY_KEYS).toHaveLength(7)
  })
})

describe('nfse delivery failure contract', () => {
  /** A prefeitura fala por código e mensagem: esse texto sai literal, sem passar por dicionário. */
  test('a palavra da prefeitura vence a causa classificada', () => {
    const failure = describeNfseDeliveryFailure(REJECTED_INVOICE_DETAIL.delivery)

    expect(failure).toEqual({
      kind: 'message',
      text: 'E0142 — Atividade não habilitada para o prestador',
    })
  })

  test('sem palavra da prefeitura sobra a causa classificada do gateway', () => {
    const failure = describeNfseDeliveryFailure(INVOICE_DELIVERY)

    expect(failure).toEqual({ cause: 'transport_failure', kind: 'cause' })
  })

  /** Nota autorizada entregou: falha anterior ali é história, e história assusta sem motivo. */
  test('nota autorizada não mostra falha nenhuma', () => {
    const failure = describeNfseDeliveryFailure({
      ...INVOICE_DELIVERY,
      status: 'authorized',
    })

    expect(failure).toBeNull()
  })

  test('entrega sem erro registrado não inventa falha', () => {
    const failure = describeNfseDeliveryFailure({
      ...INVOICE_DELIVERY,
      lastErrorCause: null,
      status: 'in_flight',
    })

    expect(failure).toBeNull()
  })

  test('a próxima tentativa só aparece enquanto a entrega ainda anda', () => {
    expect(hasPendingNfseDelivery(INVOICE_DELIVERY)).toBe(true)
    expect(hasPendingNfseDelivery({ ...INVOICE_DELIVERY, status: 'authorized' })).toBe(false)
    expect(hasPendingNfseDelivery({ ...INVOICE_DELIVERY, nextAttemptAt: null })).toBe(false)
  })
})

describe('nfse detail delivery dialog contract', () => {
  test('o diálogo mostra tentativa, causa da última falha e próxima tentativa', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(dialog).toContain("{t('delivery.attempts')}")
    expect(dialog).toContain("{t('delivery.failure')}")
    expect(dialog).toContain("{t('delivery.next')}")
    expect(dialog).toContain('hasPendingNfseDelivery(delivery)')
  })

  /** A causa é vocabulário aberto: classificação nova do gateway aparece crua em vez de sumir. */
  test('causa sem tradução cai no próprio código em vez de desaparecer', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(dialog).toContain('defaultValue: failure.cause')
  })

  test('a falha é anunciada ao leitor de tela', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(dialog).toMatch(
      /failure !== null && \(\s*<p className=\{styles\.placeholder\} role="alert"/,
    )
  })

  test('toda situação da emissão tem rótulo nos dois idiomas', async () => {
    const locales = await Promise.all(LOCALE_PATHS.map(readApplicationFile))

    for (const locale of locales) {
      const parsed = JSON.parse(locale) as {
        delivery: { cause: Record<string, string>; status: Record<string, string> }
      }
      for (const status of NFSE_DELIVERY_STATUSES) {
        expect(parsed.delivery.status[status]).toBeString()
      }
      expect(parsed.delivery.cause.transport_failure).toBeString()
      expect(parsed.delivery.cause.timeout).toBeString()
    }
  })
})
