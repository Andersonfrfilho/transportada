/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 295 Fase 4: a foto é conveniência. Ela nunca derruba nem recicla a leitura da CNH, e só nasce
 * do anexo da ficha do motorista (`fleet_driver`), tipo `cnh`.
 */
import { describe, expect, test } from 'bun:test'

import {
  applyCnhProfilePicture,
  type CnhPictureOutcome,
} from '../../src/cnh-face/application/apply-cnh-profile-picture.use-case.js'
import type { CnhFaceResult } from '../../src/cnh-face/domain/cnh-face.types.js'
import { extractAttachmentFields } from '../../src/aggregate-attachment/application/extract-attachment-fields.use-case.js'
import {
  AGGREGATE_ATTACHMENT_EVENT_TYPE,
  type AggregateAttachmentEnvelopeV1,
} from '../../src/messaging/aggregate-attachment-envelope.schema.js'

const COMPANY_ID = crypto.randomUUID()
const ATTACHMENT_ID = crypto.randomUUID()
const IMAGE = new Uint8Array([7, 7, 7])
const GOOD_FACE: CnhFaceResult = {
  candidateImages: 1,
  cropShortSide: 220,
  faceScore: 0.99998,
  facesFound: 1,
  outcome: 'extracted',
  sourceKind: 'pdf_digital',
  webp: IMAGE,
}

function buildHarness(input: {
  readonly appliedByApi?: boolean
  readonly extractFails?: boolean
  readonly face?: CnhFaceResult
  readonly pictureFails?: boolean
}) {
  const applyCalls: { attachmentId: string; companyId: string; image: Uint8Array }[] = []
  const reports: { outcome: CnhPictureOutcome; reason: string }[] = []
  const dependencies = {
    extractor: {
      async extract() {
        if (input.extractFails === true) throw new Error('model exploded')
        return input.face ?? GOOD_FACE
      },
    },
    onOutcome: (report: { outcome: CnhPictureOutcome; reason: string }) => {
      reports.push(report)
    },
    picture: {
      async apply(call: { attachmentId: string; companyId: string; image: Uint8Array }) {
        applyCalls.push(call)
        if (input.pictureFails === true) throw new Error('api down')
        return { applied: input.appliedByApi ?? true }
      },
    },
  }
  return { applyCalls, dependencies, reports }
}

const REQUEST = { attachmentId: ATTACHMENT_ID, bytes: new Uint8Array([1]), companyId: COMPANY_ID }

describe('aplicar a foto da CNH', () => {
  test('rosto aceito vai à API com o anexo e a empresa, e o desfecho é applied', async () => {
    const harness = buildHarness({})

    const outcome = await applyCnhProfilePicture(REQUEST, harness.dependencies)

    expect(outcome).toBe('applied')
    expect(harness.applyCalls).toEqual([
      { attachmentId: ATTACHMENT_ID, companyId: COMPANY_ID, image: IMAGE },
    ])
    expect(harness.reports).toEqual([{ outcome: 'applied', reason: 'extracted' }])
  })

  test('a API não aplicou (foto própria existente ou sem usuário): kept_existing, sem erro', async () => {
    const harness = buildHarness({ appliedByApi: false })

    expect(await applyCnhProfilePicture(REQUEST, harness.dependencies)).toBe('kept_existing')
  })

  test.each(['no_face', 'multiple_faces', 'too_small', 'unsupported'] as const)(
    'desfecho %s pula em silêncio, sem chamar a API',
    async (faceOutcome) => {
      const harness = buildHarness({
        face: { ...GOOD_FACE, facesFound: 0, outcome: faceOutcome, webp: undefined },
      })

      expect(await applyCnhProfilePicture(REQUEST, harness.dependencies)).toBe('skipped')
      expect(harness.applyCalls).toHaveLength(0)
      expect(harness.reports).toEqual([{ outcome: 'skipped', reason: faceOutcome }])
    },
  )

  test('nota abaixo de 0,98 pula mesmo com um rosto só', async () => {
    const harness = buildHarness({ face: { ...GOOD_FACE, faceScore: 0.97 } })

    expect(await applyCnhProfilePicture(REQUEST, harness.dependencies)).toBe('skipped')
    expect(harness.applyCalls).toHaveLength(0)
  })

  test('falha do extrator ou da API vira failed e nunca propaga', async () => {
    for (const failure of [{ extractFails: true }, { pictureFails: true }]) {
      const harness = buildHarness(failure)

      expect(await applyCnhProfilePicture(REQUEST, harness.dependencies)).toBe('failed')
      expect(harness.reports).toEqual([{ outcome: 'failed', reason: 'Error' }])
    }
  })
})

function buildEnvelope(
  subject: 'aggregate_application' | 'fleet_driver',
  type: 'cnh' | 'other',
): AggregateAttachmentEnvelopeV1 {
  return {
    companyId: COMPANY_ID,
    correlationId: 'correlation-295',
    eventId: crypto.randomUUID(),
    occurredAt: new Date(0).toISOString(),
    payload: {
      attachmentId: ATTACHMENT_ID,
      bucket: 'test-bucket',
      objectKey: 'tenants/x/y/z',
      subject,
      type,
    },
    type: AGGREGATE_ATTACHMENT_EVENT_TYPE.EXTRACTION_REQUESTED,
    version: 1,
  }
}

function runExtraction(
  envelope: AggregateAttachmentEnvelopeV1,
  harness: ReturnType<typeof buildHarness>,
  options: { readonly withPicture?: boolean; readonly writes: string[] } = { writes: [] },
) {
  const writeBack = {
    saveExtractedFields: async () => {
      options.writes.push('written')
    },
  }
  return extractAttachmentFields(envelope, {
    ...(options.withPicture === false ? {} : { cnhPicture: harness.dependencies }),
    driverWriteBack: writeBack,
    extraction: { extract: async () => ({ licenseNumber: '1' }) },
    reader: { read: async () => new Uint8Array([1]) },
    writeBack,
  })
}

describe('o gancho no anexo da ficha do motorista', () => {
  test('CNH da ficha: lê, grava os campos e depois aplica a foto', async () => {
    const harness = buildHarness({})
    const writes: string[] = []

    const outcome = await runExtraction(buildEnvelope('fleet_driver', 'cnh'), harness, { writes })

    expect(outcome).toBe('extracted')
    expect(writes).toEqual(['written'])
    expect(harness.applyCalls).toHaveLength(1)
  })

  test('falha da foto não derruba a leitura: o desfecho segue extracted', async () => {
    const harness = buildHarness({ pictureFails: true })

    expect(await runExtraction(buildEnvelope('fleet_driver', 'cnh'), harness)).toBe('extracted')
  })

  test.each([
    ['candidatura do agregado', 'aggregate_application', 'cnh'],
    ['outro tipo de documento da ficha', 'fleet_driver', 'other'],
  ] as const)('%s não gera foto', async (_label, subject, type) => {
    const harness = buildHarness({})

    await runExtraction(buildEnvelope(subject, type), harness)

    expect(harness.applyCalls).toHaveLength(0)
    expect(harness.reports).toHaveLength(0)
  })

  test('sem a credencial da API (cnhPicture ausente) o gancho é inerte', async () => {
    const harness = buildHarness({})

    expect(
      await runExtraction(buildEnvelope('fleet_driver', 'cnh'), harness, {
        withPicture: false,
        writes: [],
      }),
    ).toBe('extracted')
    expect(harness.applyCalls).toHaveLength(0)
  })
})
