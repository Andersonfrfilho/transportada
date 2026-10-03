/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import {
  createDriverTripClient,
  toAttachmentSendOutcome,
} from '../../src/modules/driver-trip/shared/driverTripClient.service'
import {
  DRIVER_RETURN_REASONS,
  type DriverFieldReport,
} from '../../src/modules/driver-trip/shared/driverTrip.types'
import {
  drainQueue,
  enqueueReport,
  type OfflineQueueStore,
  type QueuedReport,
} from '../../src/modules/driver-trip/shared/offlineQueue.service'

const CARD = new URL(
  '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
  import.meta.url,
)
/** Spec 218 (RF-A5): o painel de ocorrência da nota virou o formulário único, fora do cartão. */
const OCCURRENCE_FORM = new URL(
  '../../src/modules/driver-trip/components/DriverOccurrenceRegistrationForm.component.tsx',
  import.meta.url,
)
const CLIENT = new URL(
  '../../src/modules/driver-trip/shared/driverTripClient.service.ts',
  import.meta.url,
)

const PAGE = new URL(
  '../../src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx',
  import.meta.url,
)

function buildClient(response: Response) {
  const seen: Request[] = []
  const client = createDriverTripClient({
    apiUrl: 'https://api.test',
    fetch: (input) => {
      seen.push(input as Request)
      return Promise.resolve(response)
    },
    getAccessToken: () => Promise.resolve('token-de-mentira'),
  })
  return { client, seen }
}

/**
 * Spec 079. Os tipos viraram **cadastro da empresa**, e a tela do motorista escolhe entre eles.
 */
describe('ocorrência de nota na tela do motorista (spec 079)', () => {
  const source = readFileSync(CARD, 'utf8')

  /**
   * ⚠️ **Só rua, e só ativo — e quem filtra é o servidor** (spec 157). A lista vinha de
   * `/company-settings/occurrence-types`, que é `settings.manage`: o motorista levava 403 e o
   * seletor ficava vazio sem aviso. A rota da árvore `/me` devolve só `id` e `name` dos tipos de rua.
   */
  it('lista os tipos pela rota do motorista, não pela da configuração', async () => {
    const { client, seen } = buildClient(
      Response.json({ data: [{ id: 'a', name: 'Recebeu parte' }] }),
    )

    expect(await client.listOccurrenceTypes()).toEqual({
      status: 'loaded',
      types: [{ id: 'a', name: 'Recebeu parte' }],
    })
    expect(new URL(seen[0]?.url ?? '').pathname).toBe('/me/trips/current/occurrence-types')
  })

  it('a nota tem como registrar a ocorrência', () => {
    expect(source).toInclude('onQueuedDocumentOccurrence')
    expect(source).not.toInclude('onDocumentOccurrence(')
    expect(readFileSync(OCCURRENCE_FORM, 'utf8')).toInclude('form.types.map(')
  })

  /**
   * ⚠️ **A sobreposição que a 079 resolveu continua resolvida.** O motorista já dizia o que houve
   * pelo motivo da devolução; o que esta tela acrescenta é o que aconteceu **sem a carga voltar**,
   * e o texto diz isso. Se um dia ela passar a oferecer "recusou tudo", volta a haver dois caminhos
   * para o mesmo fato — e é o texto abaixo que deixa de fazer sentido primeiro.
   */
  it('explica que a carga não volta', () => {
    expect(driverTrip.documentOccurrenceHint.toLowerCase()).toInclude('não volta')
    expect(DRIVER_RETURN_REASONS).toContain('recipient_refused')
  })
})

/**
 * Spec 157 (RF5/CA5). Antes, corpo estranho e recusa do servidor viravam `[]` do mesmo jeito que
 * lista vazia de verdade, e o `.catch(() => undefined)` da página engolia o resto — o motorista via
 * o painel sem opção nenhuma, sem saber se é falha ou se a empresa não cadastrou tipo de rua.
 */
describe('aviso quando a lista de tipos falha (spec 157 RF5)', () => {
  const cardSource = readFileSync(OCCURRENCE_FORM, 'utf8')
  const pageSource = readFileSync(PAGE, 'utf8')
  const clientSource = readFileSync(CLIENT, 'utf8')

  it('resposta 500 vira estado de falha, sem lançar', async () => {
    const { client } = buildClient(Response.json({ error: { code: 'INTERNAL' } }, { status: 500 }))

    expect(await client.listOccurrenceTypes()).toEqual({ status: 'failed' })
  })

  it('corpo inválido vira estado de falha, sem lançar', async () => {
    const { client } = buildClient(Response.json({ data: { unexpected: true } }))

    expect(await client.listOccurrenceTypes()).toEqual({ status: 'failed' })
  })

  /** Sem sinal é o caso mais comum no campo: o `fetch` rejeita antes de haver resposta. */
  it('rede caída vira estado de falha, sem lançar', async () => {
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
      getAccessToken: () => Promise.resolve('token-de-mentira'),
    })

    expect(await client.listOccurrenceTypes()).toEqual({ status: 'failed' })
  })

  /** Rede presa não pode deixar o painel carregando para sempre — o pedido tem teto. */
  it('o pedido da lista tem teto de tempo', async () => {
    const { client, seen } = buildClient(Response.json({ data: [] }))

    await client.listOccurrenceTypes()

    expect(seen[0]?.signal).toBeDefined()
    expect(clientSource).toInclude('AbortSignal.timeout(')
  })

  it('item sem id ou nome em texto vira falha, não um botão vazio', async () => {
    const { client } = buildClient(Response.json({ data: [{ id: 'a' }] }))

    expect(await client.listOccurrenceTypes()).toEqual({ status: 'failed' })
  })

  it('lista vazia de verdade fica marcada como carregada, não como falha', async () => {
    const { client } = buildClient(Response.json({ data: [] }))

    expect(await client.listOccurrenceTypes()).toEqual({ status: 'loaded', types: [] })
  })

  it('a página não engole mais o erro com .catch(() => undefined)', () => {
    expect(pageSource).not.toInclude('.catch(() => undefined)')
  })

  it('o painel mostra o aviso de falha com o botão de tentar de novo', () => {
    expect(cardSource).toInclude('documentOccurrenceTypesFailed')
    expect(cardSource).toInclude('documentOccurrenceTypesRetry')
    expect(cardSource).toInclude('onRetryOccurrenceTypes')
  })

  /** O botão some ao tocar (vira carregando): o foco volta ao painel, não cai no `body`. */
  it('tentar de novo devolve o foco ao painel da ocorrência', () => {
    expect(cardSource).toInclude('panelRef.current?.focus()')
  })

  it('o painel mostra o texto de lista vazia quando não há tipo cadastrado', () => {
    expect(cardSource).toInclude('documentOccurrenceTypesEmpty')
  })

  it('o aviso de falha não assusta e diz que entregar e devolver continuam funcionando', () => {
    const text = driverTrip.documentOccurrenceTypesFailed.toLowerCase()
    expect(text).toInclude('entregar')
    expect(text).toInclude('devolver')
    expect(text).toInclude('continuam funcionando')
  })

  it('o texto de lista vazia orienta a falar com o escritório', () => {
    expect(driverTrip.documentOccurrenceTypesEmpty.toLowerCase()).toInclude('escritório')
  })

  it('o botão de tentar de novo tem o rótulo padrão do produto', () => {
    expect(driverTrip.documentOccurrenceTypesRetry).toBe('Tentar de novo')
  })
})

/**
 * Spec 226. A ocorrência de nota sem foto era chamada direta (`registerDocumentOccurrence`): sem
 * rede o toque falhava com alerta, o texto digitado se perdia e a chave nascia nova a cada toque —
 * uma resposta perdida seguida de novo toque podia duplicar a ocorrência. Agora ela é o item
 * `documentOccurrence` da fila com `photo: null`, e a chave nasce uma vez, no toque.
 */
describe('a ocorrência de nota sem foto vai pela fila (spec 226)', () => {
  function buildReport(): Extract<DriverFieldReport, { kind: 'documentOccurrence' }> {
    return {
      documentId: 'document-1',
      idempotencyKey: 'chave-do-toque',
      kind: 'documentOccurrence',
      location: null,
      note: 'Portão sem número',
      occurrenceTypeId: 'type-1',
      occurrenceTypeName: 'Endereço',
      photo: null,
      productCode: '',
    }
  }

  it('o send leva a chave do item e nenhum anexo', async () => {
    const { client, seen } = buildClient(new Response('{"data":{}}', { status: 201 }))

    await client.send({ report: buildReport(), stamp: undefined })

    expect(seen).toHaveLength(1)
    expect(new URL(seen[0]?.url ?? '').pathname).toBe(
      '/me/trips/current/documents/document-1/occurrences',
    )
    expect(seen[0]?.headers.get('idempotency-key')).toBe('chave-do-toque')
    expect(await seen[0]?.json()).toEqual({
      location: null,
      note: 'Portão sem número',
      occurrenceTypeId: 'type-1',
      productCode: '',
    })
  })

  /** Reenviar o mesmo item é a mesma chave: o servidor casa e não duplica. */
  it('o reenvio do mesmo item repete a chave', async () => {
    const keys: (string | null)[] = []
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: (input) => {
        keys.push((input as Request).headers.get('idempotency-key'))
        return Promise.resolve(new Response('{"data":{}}', { status: 201 }))
      },
      getAccessToken: () => Promise.resolve('token-de-mentira'),
    })

    await client.send({ report: buildReport(), stamp: undefined })
    await client.send({ report: buildReport(), stamp: undefined })

    expect(keys).toEqual(['chave-do-toque', 'chave-do-toque'])
  })

  it('sem rede o texto fica na fila para a próxima drenagem', async () => {
    let items: readonly QueuedReport[] = []
    const store: OfflineQueueStore = {
      read: () => Promise.resolve(items),
      update: (mutate) => {
        items = [...mutate(items)]
        return Promise.resolve(items)
      },
    }
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
      getAccessToken: () => Promise.resolve('token-de-mentira'),
    })
    await enqueueReport({ now: new Date(), report: buildReport(), store })

    const result = await drainQueue({
      send: async ({ report }) => {
        try {
          await client.send({ report, stamp: undefined })
          return 'sent'
        } catch (error) {
          return toAttachmentSendOutcome(error).kind
        }
      },
      store,
    })

    expect(result).toEqual({ rejected: [], remaining: 1, sent: 0 })
    expect(items[0]?.report).toMatchObject({ note: 'Portão sem número' })
  })

  it('a tela e o cliente não têm mais a chamada direta', () => {
    expect(readFileSync(PAGE, 'utf8')).not.toInclude('registerDocumentOccurrence')
    expect(readFileSync(CLIENT, 'utf8')).not.toInclude('registerDocumentOccurrence')
  })
})
