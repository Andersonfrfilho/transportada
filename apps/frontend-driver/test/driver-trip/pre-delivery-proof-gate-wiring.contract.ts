/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

const CARD = readSource('src/modules/driver-trip/components/DriverStopCard.component.tsx')
const HOOK = readSource('src/modules/driver-trip/hooks/useDriverTrip.hook.ts')

function slice(input: { readonly from: string; readonly to: string }): string {
  const start = CARD.indexOf(input.from)
  expect(start).toBeGreaterThan(-1)
  const end = CARD.indexOf(input.to, start)
  expect(end).toBeGreaterThan(start)
  return CARD.slice(start, end)
}

function gateSource(): string {
  return slice({ from: 'function PreDeliveryProofGate(', to: 'type DocumentDetailsProps' })
}

function documentRowSource(): string {
  return slice({ from: 'function DocumentRow(', to: 'type PreDeliveryProofGateProps' })
}

/**
 * Spec 218 (RF-A1/RF-A2, P1): com obrigatório no comprovante efetivo, "Entreguei" abre a captura ali
 * mesmo — o **mesmo** `ProofCaptureFields` de depois da entrega — e só "Confirmar entrega", que nasce
 * desabilitado, chama `onDeliver`.
 */
describe('o gate de antes da entrega no cartão da parada (spec 218)', () => {
  it('o gate monta a mesma captura de depois da entrega, sem segunda cópia dos botões', () => {
    const gate = gateSource()
    expect(gate).toInclude('<ProofCaptureFields')
    expect(gate).not.toInclude('<FilePickerButton')
    expect(gate).not.toInclude('function attach(')
  })

  it('"Confirmar entrega" fica desabilitado enquanto listMissingProofFields acusar algo', () => {
    const gate = gateSource()
    expect(gate).toInclude('listMissingProofFields({')
    expect(gate).toInclude('disabled={missingFields.length > 0 || isConfirming}')
    expect(gate).toInclude("'deliveryGate.confirm'")
    /* Aviso, não erro — o mesmo tom do resto do comprovante (spec 203). */
    expect(gate).not.toInclude('role="alert"')
  })

  it('o anexo do gate sai marcado para esperar a entrega na fila (RF-A3)', () => {
    expect(gateSource()).toInclude('awaitingDelivery: true')
  })

  it('o cartão decide pelo plano do comprovante efetivo, nunca pelo lançamento tardio (RF-A4)', () => {
    const row = documentRowSource()
    const decision = row.split('\n').find((line) => line.includes('requiresProofBeforeDelivery('))
    expect(decision).toBeDefined()
    expect(decision).toInclude('resolveProofFormPlan(proofSettings)')
    expect(decision).not.toInclude('isLateRegistration')
    expect(row).toInclude('<PreDeliveryProofGate')
  })

  it('o gate leva a marca do lançamento tardio no anexo, como a seção de depois', () => {
    const row = documentRowSource()
    const gateCall = row.slice(row.indexOf('<PreDeliveryProofGate'))
    expect(gateCall).toInclude('isLateRegistration ? { lateRegistration: true } : {}')
  })

  it('entregar é um caminho só — o toque direto e o "Confirmar entrega" chamam o mesmo onDeliver', () => {
    expect(
      CARD.match(
        /onDeliver\(\{ documentId: document\.id, lateRegistration: isLateRegistration \}\)/gu,
      ),
    ).toHaveLength(1)
    expect(documentRowSource()).toInclude("t('deliver')")
  })
})

describe('a fila solta o anexo quando a entrega entra (spec 218 RF-A3)', () => {
  it('a entrega enfileirada solta os anexos que esperavam por ela', () => {
    const body = HOOK.slice(HOOK.indexOf('function reportWithLocation('))
    expect(body).toInclude("fieldReport.kind === 'deliver'")
    expect(body).toInclude('releaseAttachmentsAwaitingDelivery({')
  })

  it('a foto do gate chega à fila com a marca de espera', () => {
    const body = HOOK.slice(HOOK.indexOf('async function enqueueProof('))
    expect(body).toInclude('awaitingDelivery: input.awaitingDelivery === true')
  })
})

describe('os textos do gate (spec 218)', () => {
  it('existem em pt-BR e en, sem texto no componente', () => {
    for (const locale of [driverTrip, driverTripEn]) {
      for (const key of ['title', 'lead', 'confirm', 'cancel', 'missingLead'] as const) {
        expect(locale.deliveryGate[key]).toBeString()
      }
      expect(locale.deliveryGate.missingLead).toInclude('{{fields}}')
    }
    expect(driverTrip.deliveryGate.confirm).toBe('Confirmar entrega')
  })
})

/**
 * Spec 218 (T19, RF-C3): o comprovante chega resolvido em três camadas no snapshot — a precedência
 * (geral → contratante → destinatário) é do servidor. Nenhum arquivo do app a reimplementa.
 */
describe('o app só lê o comprovante resolvido (spec 218 T19)', () => {
  it('nenhum arquivo de src/ fala de exceção por contratante ou destinatário', () => {
    const sourceRoot = new URL('../../src/', import.meta.url)
    const files = readdirSync(sourceRoot, { recursive: true })
      .map(String)
      .filter((path) => /\.(ts|tsx)$/u.test(path))
    expect(files.length).toBeGreaterThan(0)
    const offenders = files.filter((path) =>
      /contractorOverride|recipientOverride|resolveWithOverrides|overridesByContractor/u.test(
        readFileSync(new URL(path, sourceRoot), 'utf8'),
      ),
    )
    expect(offenders).toEqual([])
  })
})

/**
 * Relato de 15/10 (staging, celular): foto salva "sobe com a entrega" e "Confirmar entrega" esmaecido,
 * sem dizer o porquê. O toque já estava na fila; a trava de 10 s soltava e o botão voltava a aceitar
 * um segundo `deliver` com o primeiro ainda pendente.
 */
describe('Confirmar entrega fica travado enquanto o deliver da nota está na fila', () => {
  const item = (kind: string, documentId: string, status: unknown) =>
    ({ attachmentCount: 0, documentId, idempotencyKey: 'k', kind, queuedAt: 't', status }) as never

  it('deliver desta nota na fila trava; recusado, foto, outra nota ou fila vazia não', async () => {
    const { resolveQueuedDeliverState } = await import(
      '../../src/modules/driver-trip/shared/eventQueueView.service'
    )
    expect(resolveQueuedDeliverState([item('deliver', 'd1', { state: 'queued' })], 'd1')).toBe(
      'waiting',
    )
    expect(
      resolveQueuedDeliverState([item('deliver', 'd1', { attempts: 2, state: 'failed' })], 'd1'),
    ).toBe('retrying')
    // recusa do servidor não volta sozinha: o botão não pode ficar preso para sempre
    expect(
      resolveQueuedDeliverState([item('deliver', 'd1', { cause: 'x', state: 'rejected' })], 'd1'),
    ).toBe('none')
    expect(resolveQueuedDeliverState([item('deliver', 'd2', { state: 'queued' })], 'd1')).toBe(
      'none',
    )
    expect(resolveQueuedDeliverState([item('proof', 'd1', { state: 'queued' })], 'd1')).toBe('none')
    expect(resolveQueuedDeliverState([], 'd1')).toBe('none')
  })

  it('o cartão trava o botão pela fila, diz o porquê e oferece "Enviar agora" — nos dois idiomas', () => {
    expect(CARD).toContain("resolveQueuedDeliverState(queueView, document.id) !== 'none'")
    expect(CARD).toContain("'deliveryGate.confirming'")
    expect(CARD).toContain("'deliveryGate.retrying'")
    expect(CARD).toContain("'deliveryGate.sending'")
    expect(CARD).toContain("t('deliveryGate.sendNow')")
    expect(readSource('src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx')).toContain(
      'onSendAllNow={driverTrip.sendAllNow}',
    )
    for (const locale of [driverTrip, driverTripEn]) {
      expect(locale.deliveryGate.confirming.length).toBeGreaterThan(0)
      expect(locale.deliveryGate.retrying.length).toBeGreaterThan(0)
      expect(locale.deliveryGate.sendNow.length).toBeGreaterThan(0)
      expect(locale.deliveryGate.sending.length).toBeGreaterThan(0)
    }
  })
})

/** Pedido do usuário (15/10): confirmar a entrega não trava — a nota vale como entregue e a fila envia. */
describe('a entrega confirmada vale na hora, com selo de envio (15/10)', () => {
  const stop = (id: string, documentIds: readonly string[], completedAt: string | null = null) =>
    ({
      completedAt,
      documents: documentIds.map((documentId) => ({ id: documentId, separationStatus: 'pending' })),
      id,
    }) as never

  it('a parada com toda nota entregue na fila vira concluída; com nota faltando, segue aberta', async () => {
    const { applyLocalDeliveries } = await import(
      '../../src/modules/driver-trip/shared/driverTripView.service'
    )
    const trip = { id: 't', stops: [stop('s1', ['a', 'b']), stop('s2', ['c'])] } as never
    const partial = applyLocalDeliveries({
      deliveredAtByDocumentId: new Map([['a', '2026-10-15T10:00:00Z']]),
      trip,
    }) as unknown as {
      stops: { completedAt: string | null; documents: { separationStatus: string }[] }[]
    }
    expect(partial.stops[0]?.documents[0]?.separationStatus).toBe('delivered')
    expect(partial.stops[0]?.completedAt).toBeNull()
    const full = applyLocalDeliveries({
      deliveredAtByDocumentId: new Map([
        ['a', '2026-10-15T10:00:00Z'],
        ['b', '2026-10-15T10:05:00Z'],
      ]),
      trip,
    }) as unknown as typeof partial
    expect(full.stops[0]?.completedAt).toBe('2026-10-15T10:05:00Z')
    expect(full.stops[1]?.completedAt).toBeNull()
  })

  it('a entrega recusada não conta como entregue; a na fila e a já enviada contam', async () => {
    const { collectLocallyDelivered } = await import(
      '../../src/modules/driver-trip/shared/documentActivity.service'
    )
    const queueView = [
      { documentId: 'q', idempotencyKey: 'kq', kind: 'deliver', status: { state: 'queued' } },
      {
        documentId: 'f',
        idempotencyKey: 'kf',
        kind: 'deliver',
        status: { attempts: 2, state: 'failed' },
      },
      {
        documentId: 'r',
        idempotencyKey: 'kr',
        kind: 'deliver',
        status: { cause: 'x', state: 'rejected' },
      },
    ] as never
    const result = collectLocallyDelivered({
      deliverKeyByDocumentId: new Map([['s', { at: '2026-10-15T09:00:00Z', key: 'ks' }]]),
      nowIso: '2026-10-15T11:00:00Z',
      queueView,
      sentReportKeys: new Set(['ks']),
    })
    expect([...result.keys()].sort()).toEqual(['f', 'q', 's'])
    expect(result.get('s')).toBe('2026-10-15T09:00:00Z')
  })

  it('o cartão concluído mostra o selo, o aviso de falha e "Enviar agora"; o texto diz "aguardando envio"', () => {
    const settled = CARD.slice(CARD.indexOf('if (isDocumentSettled(document)) {\n    return ('))
    expect(settled).toContain('deliverActivity === undefined')
    expect(settled).toContain("'activity.deliveredQueued'")
    expect(settled).toContain("t('deliveryGate.sendNow')")
    expect(readSource('src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx')).toContain(
      'applyLocalDeliveries(',
    )
    expect(driverTrip.activity.deliveredQueued).toInclude('aguardando envio')
  })
})

/** Pedido do usuário (15/10): faixa "Sincronizando eventos" / "Sincronizado" no topo da viagem. */
describe('a faixa de sincronização da viagem (15/10)', () => {
  const item = (state: string, kind = 'deliver') =>
    ({ idempotencyKey: `${kind}-${state}`, kind, status: { state } }) as never

  it('em curso conta fila e falha; recusa fica à parte e nunca vira "Sincronizado"', async () => {
    const { resolveTripSyncBanner } = await import(
      '../../src/modules/driver-trip/shared/tripSyncBanner.service'
    )
    expect(resolveTripSyncBanner({ justSynced: false, queueView: [] })).toEqual({ kind: 'idle' })
    expect(resolveTripSyncBanner({ justSynced: true, queueView: [] })).toEqual({ kind: 'synced' })
    expect(
      resolveTripSyncBanner({
        justSynced: false,
        queueView: [item('queued'), item('failed', 'proof'), item('unverified')],
      }),
    ).toEqual({ kind: 'syncing', syncing: 2 })
    expect(
      resolveTripSyncBanner({ justSynced: true, queueView: [item('rejected'), item('queued')] }),
    ).toEqual({ kind: 'rejected', rejected: 1, syncing: 1 })
  })

  it('a viagem monta a faixa no topo e os dois idiomas têm os textos', () => {
    expect(readSource('src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx')).toContain(
      '<DriverTripSyncBanner queueView={driverTrip.queueView} />',
    )
    for (const locale of [driverTrip, driverTripEn]) {
      expect(locale.tripSync.synced.length).toBeGreaterThan(0)
      expect(locale.tripSync.syncing_other.length).toBeGreaterThan(0)
      expect(locale.tripSync.rejected_one.length).toBeGreaterThan(0)
    }
  })
})
