/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 193 CA09, CA10 e CA11 (D9, D10): a leitura do comprovante devolve quem recebeu, da mesma
 * linha do nome (`null` nos antigos); o portal do contratante não ganha o campo; e relação e
 * detalhe nunca vão para log nem para a auditoria do escritório.
 */
import { readdir } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import { readDeliveryProofs } from '../../src/trips/application/read-delivery-proof.use-case.js'

const SOURCE_ROOT = new URL('../../src/', import.meta.url)

async function listSourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(new URL(directory, SOURCE_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.ts')).map((entry) => `${directory}${entry}`)
}

function readSource(path: string): Promise<string> {
  return Bun.file(new URL(path, SOURCE_ROOT)).text()
}

const PROOF = {
  bucket: 'transportada',
  createdAt: '2026-09-25T12:00:00.000Z',
  id: '00000000-0000-4000-8000-0000000000a1',
  kind: 'photo' as const,
  lateRegistration: false,
  mimeType: 'image/jpeg',
  objectKey: 'companies/1/proofs/a1.jpg',
  receiverDocumentMasked: '',
  receiverName: 'Maria',
}

describe('a leitura do comprovante devolve quem recebeu (spec 193 CA09)', () => {
  test('relação e detalhe saem da mesma linha do nome; o antigo sai com null', async () => {
    const views = await readDeliveryProofs({
      companyId: 'company',
      documentId: 'document',
      downloads: {
        createDownloadUrl: async () => ({ expiresAt: PROOF.createdAt, url: 'https://signed' }),
      },
      repository: {
        listDeliveryProofs: async () => [
          { ...PROOF, receivedBy: 'neighbor', receivedByDetail: 'casa 12' },
          { ...PROOF, id: 'antigo', receivedBy: null, receivedByDetail: null },
        ],
      },
      tripId: 'trip',
    })

    expect(
      views.map(({ receivedBy, receivedByDetail, receiverName }) => ({
        receivedBy,
        receivedByDetail,
        receiverName,
      })),
    ).toEqual([
      { receivedBy: 'neighbor', receivedByDetail: 'casa 12', receiverName: 'Maria' },
      { receivedBy: null, receivedByDetail: null, receiverName: 'Maria' },
    ])
  })

  test('a consulta lê as duas colunas do comprovante', async () => {
    const source = await readSource('trips/infrastructure/delivery-proof-read.support.ts')

    expect(source).toContain('receivedBy: tripDeliveryProofs.receivedBy')
    expect(source).toContain('receivedByDetail: tripDeliveryProofs.receivedByDetail')
  })
})

/** D9 (ADR-0050 §4): o portal não mostra comprovante hoje; quando mostrar, o detalhe nunca vai. */
describe('o portal do contratante não ganha quem recebeu (spec 193 CA10)', () => {
  test('nenhum arquivo do portal cita a relação nem o detalhe', async () => {
    const files = await listSourceFiles('contractor-portal/')
    const offenders: string[] = []
    for (const file of files) {
      const source = await readSource(file)
      if (/receivedBy|received_by/u.test(source)) offenders.push(file)
    }

    expect(files.length).toBeGreaterThan(5)
    expect(offenders).toEqual([])
  })
})

/** D10: relação e detalhe são de terceiro — nunca vão para log nem para a trilha do escritório. */
describe('quem recebeu fica fora de log e da auditoria (spec 193 CA11)', () => {
  test('nenhum arquivo que cita o detalhe loga alguma coisa', async () => {
    const files = await listSourceFiles('')
    const offenders: string[] = []
    for (const file of files) {
      const source = await readSource(file)
      if (!/receivedByDetail|recipientContact/u.test(source)) continue
      if (/\b(logger|log|console)\.[a-zA-Z]+\(/u.test(source)) offenders.push(file)
    }

    expect(offenders).toEqual([])
  })

  test('a auditoria do escritório não leva quem recebeu', async () => {
    const files = await listSourceFiles('trips/')
    const auditCalls: string[] = []
    for (const file of files) {
      const source = await readSource(file)
      for (const call of source.split('buildOfficeAuditEntry({').slice(1)) {
        auditCalls.push(call.slice(0, call.indexOf('})')))
      }
    }
    const auditFiles = await Promise.all(
      [
        'trips/application/trip-field-office-audit.port.ts',
        'trips/infrastructure/trip-field-office-audit.persistence.ts',
      ].map(readSource),
    )

    expect(auditCalls.length).toBeGreaterThan(3)
    for (const text of [...auditCalls, ...auditFiles]) {
      expect(text).not.toMatch(/receivedBy|received_by/u)
    }
  })
})
