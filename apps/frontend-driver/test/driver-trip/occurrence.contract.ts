/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import { createDriverTripClient } from '../../src/modules/driver-trip/shared/driverTripClient.service'
import {
  DRIVER_RETURN_REASONS,
  type DriverTripDocument,
  type DriverTripStop,
} from '../../src/modules/driver-trip/shared/driverTrip.types'
import { findOccurrencePhotoDocument } from '../../src/modules/driver-trip/shared/driverTripView.service'

const CARD = new URL(
  '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
  import.meta.url,
)
/** Spec 209: o formulário do "Deu problema" saiu do cartão. */
const STOP_OCCURRENCE_FORM = new URL(
  '../../src/modules/driver-trip/components/DriverStopOccurrenceForm.component.tsx',
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
    expect(source).toInclude('onDocumentOccurrence')
    expect(source).toInclude('occurrenceTypes.types.map(')
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

  /** Falhar aqui não muda o estado da nota, e o aviso diz isso. */
  it('avisa sem assustar quando o registro falha', () => {
    expect(driverTrip.documentOccurrenceFailed.toLowerCase()).toInclude('continua como estava')
  })
})

/**
 * Spec 157 (RF5/CA5). Antes, corpo estranho e recusa do servidor viravam `[]` do mesmo jeito que
 * lista vazia de verdade, e o `.catch(() => undefined)` da página engolia o resto — o motorista via
 * o painel sem opção nenhuma, sem saber se é falha ou se a empresa não cadastrou tipo de rua.
 */
describe('aviso quando a lista de tipos falha (spec 157 RF5)', () => {
  const cardSource = readFileSync(CARD, 'utf8')
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
    expect(cardSource).toInclude('occurrencePanelRef.current?.focus()')
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

function buildDocument(overrides: Partial<DriverTripDocument> = {}): DriverTripDocument {
  return {
    accessKey: '0'.repeat(44),
    deliveredAt: null,
    deliveryProof: null,
    grossWeight: '10.000',
    id: 'document-1',
    number: '1001',
    proofPending: false,
    recipientDisplayName: 'Destinatário',
    recipientIsCompany: false,
    recipientName: 'Destinatário',
    returnReason: null,
    separationStatus: 'loaded',
    series: '1',
    totalAmount: '100.00',
    volumeCount: '1',
    ...overrides,
  }
}

function buildStop(documents: readonly DriverTripDocument[]): DriverTripStop {
  return {
    arrivedAt: null,
    completedAt: null,
    deliveryProof: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents,
    id: 'stop-1',
    label: 'Rua A, 1',
    latitude: null,
    longitude: null,
    schedule: null,
    sequence: 1,
  }
}

/**
 * Revisão 082 (item 8): a nota da prévia do aviso é UMA escolha, no serviço. Spec 209: a foto deixou
 * de pegar carona no comprovante dessa nota — a escolha ficou só para a prévia.
 */
describe('a nota que aparece na prévia do aviso da ocorrência', () => {
  const source = readFileSync(STOP_OCCURRENCE_FORM, 'utf8')

  it('escolhe a primeira nota em aberto; sem aberta, a primeira da lista', () => {
    const open = buildDocument({ id: 'aberta' })
    const settled = buildDocument({ id: 'entregue', separationStatus: 'delivered' })

    expect(findOccurrencePhotoDocument(buildStop([settled, open]))?.id).toBe('aberta')
    expect(findOccurrencePhotoDocument(buildStop([settled]))?.id).toBe('entregue')
    expect(findOccurrencePhotoDocument(buildStop([]))).toBeUndefined()
  })

  /** Spec 209: sobrou só a prévia — a foto deixou de pegar carona no comprovante desta nota. */
  it('a tela usa o serviço só na prévia, sem cópia inline da escolha', () => {
    const usages = source.match(/findOccurrencePhotoDocument\(stop\)/gu) ?? []
    expect(usages).toHaveLength(1)
    expect(source).not.toInclude('stop.documents.find((item) => !isDocumentSettled(item))')
  })
})

/**
 * Spec 179 T200 passou a exigir `Idempotency-Key` na ocorrência de nota do motorista. Sem ela a API
 * responde 400 e o toque do motorista não registra nada — e cada toque é uma chave nova, porque
 * repetir o toque depois de uma falha é o conserto.
 */
describe('a ocorrência de nota leva a chave de idempotência', () => {
  const input = { documentId: 'document-1', occurrenceTypeId: 'type-1', productCode: 'SKU-1' }

  it('o pedido carrega o cabeçalho idempotency-key', async () => {
    const { client, seen } = buildClient(new Response('{"data":{}}', { status: 201 }))

    await client.registerDocumentOccurrence(input)

    const key = seen[0]?.headers.get('idempotency-key') ?? ''
    expect(key.trim()).not.toBe('')
  })

  it('dois toques são duas chaves', async () => {
    const seen: Request[] = []
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: (request) => {
        seen.push(request as Request)
        return Promise.resolve(new Response('{"data":{}}', { status: 201 }))
      },
      getAccessToken: () => Promise.resolve('token-de-mentira'),
    })

    await client.registerDocumentOccurrence(input)
    await client.registerDocumentOccurrence(input)

    expect(seen[0]?.headers.get('idempotency-key')).not.toBe(
      seen[1]?.headers.get('idempotency-key'),
    )
  })
})
