/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import {
  appendCanhotoDuplicateNotices,
  collectCanhotoDuplicateNotices,
  dismissCanhotoDuplicateNotice,
} from '../../src/modules/driver-trip/shared/canhotoDuplicateNotice.service'
import {
  discardRefusedCanhoto,
  isCanhotoReplacement,
  markCanhotoReplaceConfirmed,
  resolveCanhotoReplacePrompt,
} from '../../src/modules/driver-trip/shared/canhotoReplacePrompt.service'
import { resolveRejectionCauseLabelKey } from '../../src/modules/driver-trip/shared/rejectionCauseLabel.service'
import {
  createDriverTripClient,
  toAttachmentSendOutcome,
} from '../../src/modules/driver-trip/shared/driverTripClient.service'
import { buildEventQueueView } from '../../src/modules/driver-trip/shared/eventQueueView.service'
import type { QueuedAttachment } from '../../src/modules/driver-trip/shared/offlineAttachments.service'
import type { QueuedReport } from '../../src/modules/driver-trip/shared/offlineQueue.service'

const REFUSED = '409 TRIP_CANHOTO_ALREADY_ATTACHED'

function photo(extra: Partial<QueuedAttachment> = {}): QueuedAttachment {
  return {
    attachmentKey: 'a1',
    blob: new Blob([new Uint8Array(8)], { type: 'image/jpeg' }),
    capturedAt: '2026-11-05T12:00:00.000Z',
    documentId: 'doc-1',
    fileName: 'canhoto.jpg',
    kind: 'photo',
    ...extra,
  }
}

function deliverItem(): QueuedReport {
  return {
    attempts: 0,
    createdAt: '2026-11-05T12:00:00.000Z',
    report: {
      documentId: 'doc-1',
      idempotencyKey: 'k-deliver',
      kind: 'deliver',
      lateRegistration: false,
      location: null,
    },
  }
}

function proofClient(respond: () => Response, forms: FormData[] = []) {
  return createDriverTripClient({
    apiUrl: 'https://api.test',
    fetch: async (request) => {
      forms.push(await (request as Request).formData())
      return respond()
    },
    getAccessToken: () => Promise.resolve('token'),
  })
}

const CREATED = () =>
  new Response(JSON.stringify({ data: { id: 'p1', punctuality: 'on_time' } }), {
    headers: { 'content-type': 'application/json' },
    status: 201,
  })

/** Spec 294 RF26/RF27: o app não manda `replaceCanhoto` às cegas — o 409 é perguntado e a troca é confirmada. */
describe('trocar o canhoto só com a confirmação (RF26)', () => {
  it('o anexo do canhoto não leva replaceCanhoto sem a confirmação', async () => {
    const forms: FormData[] = []
    await proofClient(CREATED, forms).attachProof({
      documentId: 'doc-1',
      file: new File([new Uint8Array(8)], 'c.jpg', { type: 'image/jpeg' }),
      kind: 'photo',
    })
    expect(forms[0]?.has('replaceCanhoto')).toBe(false)
  })

  it('com a confirmação o anexo leva replaceCanhoto', async () => {
    const forms: FormData[] = []
    await proofClient(CREATED, forms).attachProof({
      documentId: 'doc-1',
      file: new File([new Uint8Array(8)], 'c.jpg', { type: 'image/jpeg' }),
      kind: 'photo',
      replaceCanhoto: true,
    })
    expect(forms[0]?.get('replaceCanhoto')).toBe('true')
  })

  it('o 409 vira recusa do anexo com o código, e não some', async () => {
    const client = proofClient(
      () =>
        new Response(
          JSON.stringify({ error: { code: 'TRIP_CANHOTO_ALREADY_ATTACHED', message: 'x' } }),
          { headers: { 'content-type': 'application/json' }, status: 409 },
        ),
    )
    let caught: unknown
    try {
      await client.attachProof({
        documentId: 'doc-1',
        file: new File([new Uint8Array(8)], 'c.jpg', { type: 'image/jpeg' }),
        kind: 'photo',
      })
    } catch (error) {
      caught = error
    }
    expect(toAttachmentSendOutcome(caught)).toEqual({ cause: REFUSED, kind: 'rejected' })
  })

  it('a recusa abre "Trocar o canhoto?" com o evento ainda na fila ou já enviado', () => {
    const withEvent = buildEventQueueView({
      attachments: [['k-deliver', [photo({ rejectionCause: REFUSED })]]],
      queued: [deliverItem()],
    })
    expect(resolveCanhotoReplacePrompt(withEvent)).toEqual({ eventKey: 'k-deliver' })

    const orphan = buildEventQueueView({
      attachments: [['k-deliver', [photo({ rejectionCause: REFUSED })]]],
      queued: [],
    })
    expect(resolveCanhotoReplacePrompt(orphan)).toEqual({ eventKey: 'k-deliver' })
  })

  it('outra recusa do anexo não abre o diálogo', () => {
    const view = buildEventQueueView({
      attachments: [
        ['k-deliver', [photo({ rejectionCause: '422 TRIP_DELIVERY_PROOF_TOO_LARGE' })]],
      ],
      queued: [],
    })
    expect(resolveCanhotoReplacePrompt(view)).toBeUndefined()
  })

  it('"Trocar o canhoto" volta a foto com a confirmação; "Manter" a tira do aparelho', () => {
    const refused = photo({ attempts: 2, rejectionCause: REFUSED })
    const cargo = photo({ attachmentKey: 'a2', kind: 'cargo', rejectionCause: REFUSED })

    const [confirmed, untouchedCargo] = markCanhotoReplaceConfirmed([refused, cargo])
    expect(confirmed).toMatchObject({ attempts: 0, replaceCanhoto: true })
    expect(confirmed?.rejectionCause).toBeUndefined()
    expect(untouchedCargo?.replaceCanhoto).toBeUndefined()

    expect(discardRefusedCanhoto([refused, cargo])).toEqual([cargo])
  })
})

describe('o canhoto repetido (RF26)', () => {
  it('a resposta 200 com duplicate chega ao app e vira aviso por nota', async () => {
    const client = proofClient(
      () =>
        new Response(
          JSON.stringify({
            data: {
              duplicate: { attachedAt: '2026-11-05T14:32:00.000Z', documentId: 'doc-9' },
              id: 'p1',
              punctuality: 'on_time',
            },
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
    )
    const result = await client.attachProof({
      documentId: 'doc-1',
      file: new File([new Uint8Array(8)], 'c.jpg', { type: 'image/jpeg' }),
      kind: 'photo',
    })
    expect(result.duplicate).toEqual({ attachedAt: '2026-11-05T14:32:00.000Z' })

    if (result.duplicate === undefined) throw new Error('duplicate esperado')
    const notices = collectCanhotoDuplicateNotices([
      { documentId: 'doc-1', duplicate: result.duplicate },
      { documentId: 'doc-2' },
    ])
    expect(notices).toEqual([{ attachedAt: '2026-11-05T14:32:00.000Z', documentId: 'doc-1' }])
    expect(appendCanhotoDuplicateNotices(notices, notices)).toHaveLength(1)
    expect(dismissCanhotoDuplicateNotice(notices, 'doc-1')).toEqual([])
  })

  it('a resposta sem duplicate (201) não tem o campo', async () => {
    const result = await proofClient(CREATED).attachProof({
      documentId: 'doc-1',
      file: new File([new Uint8Array(8)], 'c.jpg', { type: 'image/jpeg' }),
      kind: 'photo',
    })
    expect(result.duplicate).toBeUndefined()
  })

  it('os textos existem nos dois idiomas', () => {
    for (const locale of [driverTrip, driverTripEn]) {
      expect(Object.keys(locale.canhotoReplace).sort()).toEqual([
        'body',
        'confirm',
        'keep',
        'title',
      ])
      expect(Object.keys(locale.canhotoDuplicate).sort()).toEqual(['dismiss', 'notice'])
    }
    expect(driverTrip.canhotoReplace.title).toBe('Trocar o canhoto?')
    expect(driverTrip.canhotoDuplicate.notice).toContain('Esse canhoto já tinha chegado')
  })
})

const HOOK_SOURCE = new URL(
  '../../src/modules/driver-trip/hooks/useDriverTrip.hook.ts',
  import.meta.url,
)
const CARD_SOURCE = new URL(
  '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
  import.meta.url,
)

/**
 * Produção, 06/11: o motorista tocou "Substituir" num canhoto já enviado e a foto nova voltou
 * "409 TRIP_CANHOTO_ALREADY_ATTACHED". O toque em "Substituir" já é a confirmação da troca: a foto
 * sai com `replaceCanhoto`, sem o servidor recusar e sem perguntar de novo.
 */
describe('"Substituir" o canhoto já enviado é a confirmação da troca', () => {
  it('foto do canhoto que já está no servidor (ou já subiu) e não está mais na fila: é troca', () => {
    expect(isCanhotoReplacement({ hasPhoto: true, isProofQueued: false, kind: 'photo' })).toBe(true)
  })

  it('primeira foto, foto ainda na fila ("Refazer") ou outro tipo de anexo: não é troca', () => {
    expect(isCanhotoReplacement({ hasPhoto: false, isProofQueued: false, kind: 'photo' })).toBe(
      false,
    )
    expect(isCanhotoReplacement({ hasPhoto: true, isProofQueued: true, kind: 'photo' })).toBe(false)
    expect(isCanhotoReplacement({ hasPhoto: true, isProofQueued: false, kind: 'signature' })).toBe(
      false,
    )
  })

  it('o cartão manda a troca e a fila a leva até o envio', () => {
    expect(readFileSync(CARD_SOURCE, 'utf8')).toContain('isCanhotoReplacement(')
    expect(readFileSync(HOOK_SOURCE, 'utf8')).toContain(
      '...(input.replaceCanhoto === true ? { replaceCanhoto: true as const } : {})',
    )
  })

  it('a recusa sai em frase do motorista, nunca o código cru', () => {
    expect(resolveRejectionCauseLabelKey(REFUSED)).toBe('eventQueue.cause.canhotoAlreadyAttached')
    for (const locale of [driverTrip, driverTripEn]) {
      expect(locale.eventQueue.cause.canhotoAlreadyAttached).not.toContain('TRIP_')
      expect(locale.eventQueue.status.attachmentRejected).not.toMatch(
        /servidor|server|evento|event/u,
      )
    }
    expect(driverTrip.eventQueue.cause.canhotoAlreadyAttached).toBe(
      'esta nota já tem um canhoto; na tela da viagem, escolha trocar ou manter o que já está lá',
    )
  })
})
