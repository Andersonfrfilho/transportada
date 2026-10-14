/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 T006/T011, RF5/RF7/RF8: o processador do comprovante. Original grande vira reduzido +
 * miniatura + leitura; falha deixa o original e `processing_failed`; reentrega é no-op; o original só
 * sai do bucket e da linha quando tudo terminou, e falha ao apagá-lo o mantém.
 */
import { describe, expect, test } from 'bun:test'

import { DeliveryProofProcessingError } from '../../src/delivery-proof-processing/application/delivery-proof-processing.error.js'
import {
  processDeliveryProof,
  type ProcessDeliveryProofDependencies,
} from '../../src/delivery-proof-processing/application/process-delivery-proof.use-case.js'
import { PROOF_ORIGINAL_MAX_BYTES } from '../../src/delivery-proof-processing/domain/delivery-proof-processing.constant.js'
import { buildAccessKey } from '../fixtures/canhoto-access-key.fixture.js'
import {
  buildEnvelope,
  BUCKET,
  COMPANY_ID,
  createBarcodeDoubles,
  createFakeImagePort,
  createInMemoryObjectStorage,
  createInMemoryProofRepository,
  createRecordingLogger,
  DOCUMENT_ID,
  ORIGINAL_BYTES,
  ORIGINAL_KEY,
  ORIGINAL_OBJECT_ID,
  processedResult,
  PROOF_ID,
  REDUCED_BYTES,
  THUMBNAIL_BYTES,
  TRIP_ID,
} from '../fixtures/delivery-proof-processing-doubles.fixture.js'

const ACCESS_KEY = buildAccessKey({ number: 1234, series: 1 })
const TRIP_DOCUMENTS = [
  { accessKey: ACCESS_KEY, id: DOCUMENT_ID, nfeNumber: '1234', nfeSeries: '1', releasedAt: null },
] as const

function setup(
  options: {
    readonly barcode?: ReturnType<typeof createBarcodeDoubles>
    readonly image?: ReturnType<typeof createFakeImagePort>
    readonly proof?: Parameters<typeof createInMemoryProofRepository>[0]
    readonly withoutBarcode?: boolean
  } = {},
) {
  const repo = createInMemoryProofRepository(options.proof)
  const storage = createInMemoryObjectStorage(
    new Map([[`${BUCKET}/${ORIGINAL_KEY}`, ORIGINAL_BYTES]]),
  )
  const image = options.image ?? createFakeImagePort(processedResult({ barcodeText: ACCESS_KEY }))
  const barcode = options.barcode ?? createBarcodeDoubles(TRIP_DOCUMENTS)
  const { entries, logger } = createRecordingLogger()
  let sequence = 0
  const dependencies: ProcessDeliveryProofDependencies = {
    ...(options.withoutBarcode === true ? {} : { barcode: barcode.barcode }),
    image: image.port,
    logger,
    newObjectId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    now: () => new Date('2026-10-14T12:00:00.000Z'),
    objects: storage.storage,
    repository: repo.repository,
  }
  return { barcode, dependencies, entries, image, repo, storage }
}

describe('processador do comprovante enviado sem redução (spec 265)', () => {
  test('original grande vira versão leve, miniatura e leitura; o original sai quando ready', async () => {
    const { barcode, dependencies, image, repo, storage } = setup()

    const result = await processDeliveryProof(buildEnvelope(), dependencies)

    expect(result.outcome).toBe('ready')
    expect(result.barcode).toBe('reported')
    expect(result.originalBytes).toBe(ORIGINAL_BYTES.byteLength)
    expect(result.reducedBytes).toBe(REDUCED_BYTES.byteLength)
    expect(result.thumbnailBytes).toBe(THUMBNAIL_BYTES.byteLength)
    // A leitura foi pedida sobre o original, junto com a miniatura (a linha não tinha uma).
    expect(image.requests[0]).toMatchObject({
      mediaType: 'image/jpeg',
      readBarcode: true,
      withThumbnail: true,
    })
    expect(image.requests[0]?.bytes.byteLength).toBe(ORIGINAL_BYTES.byteLength)
    // A API recebeu a leitura do robô da 222.
    expect(barcode.reports).toEqual([
      {
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        reading: {
          readDocumentId: DOCUMENT_ID,
          readNumber: '1234',
          readSeries: '1',
          readSource: 'barcode',
        },
        tripId: TRIP_ID,
      },
    ])
    // Estado final: ready, sem referência ao original, objeto leve e miniatura apontados.
    expect(repo.proof.state).toBe('ready')
    expect(repo.proof.originalObjectId).toBeNull()
    expect(repo.proof.objectId).not.toBe(ORIGINAL_OBJECT_ID)
    expect(repo.proof.thumbnailObjectId).not.toBeNull()
    expect(repo.objects.get(ORIGINAL_OBJECT_ID)?.status).toBe('deleted')
    expect(storage.has(ORIGINAL_KEY)).toBe(false)
    const reduced = repo.objects.get(repo.proof.objectId)
    expect(reduced).toMatchObject({ mimeType: 'image/jpeg', sizeBytes: REDUCED_BYTES.byteLength })
    expect(storage.has(reduced?.objectKey ?? '')).toBe(true)
    // Os objetos novos usam a convenção opaca da API, no mesmo evento.
    expect(reduced?.objectKey).toMatch(
      new RegExp(`^tenants/${COMPANY_ID}/delivery-proofs/[0-9a-f-]{36}/[0-9a-f-]{36}$`),
    )
  })

  test('a ordem é: grava os objetos, troca a linha, lê, apaga o original, e só então fecha ready', async () => {
    const { dependencies, repo, storage } = setup()

    await processDeliveryProof(buildEnvelope(), dependencies)

    expect(storage.calls).toEqual(['read', 'store', 'store', 'remove'])
    expect(repo.calls).toEqual(['load', 'markProcessing', 'swapToReduced', 'finalizeReady'])
  })

  test('sem código legível a máquina carimba a tentativa, e o ready segue', async () => {
    const barcode = createBarcodeDoubles(TRIP_DOCUMENTS)
    const { dependencies, repo } = setup({
      barcode,
      image: createFakeImagePort(processedResult({ barcodeText: null })),
    })

    const result = await processDeliveryProof(buildEnvelope(), dependencies)

    expect(result).toMatchObject({ barcode: 'unusable', outcome: 'ready' })
    expect(barcode.stamped).toEqual([PROOF_ID])
    expect(barcode.reports).toEqual([])
    expect(repo.proof.state).toBe('ready')
  })

  test('falha ao reportar a leitura não segura o ready: a rotina agendada a refaz sobre o objeto leve', async () => {
    const barcode = createBarcodeDoubles(TRIP_DOCUMENTS, { reportFailure: new Error('api down') })
    const { dependencies, entries, repo } = setup({ barcode })

    const result = await processDeliveryProof(buildEnvelope(), dependencies)

    expect(result).toMatchObject({ barcode: 'failed', outcome: 'ready' })
    expect(repo.proof.state).toBe('ready')
    // Só a classe do erro no log — nunca a mensagem nem o texto lido.
    const warning = entries.find((entry) => entry.message === 'delivery_proof_barcode_failed')
    expect(warning?.metadata).toEqual({ proofId: PROOF_ID, reason: 'Error' })
    expect(JSON.stringify(entries)).not.toContain(ACCESS_KEY)
  })

  test('canhoto fora da fila de leitura (já lido, assinatura, carga) não pede leitura', async () => {
    const { barcode, dependencies, image } = setup({ proof: { canhotoReadable: false } })

    const result = await processDeliveryProof(buildEnvelope(), dependencies)

    expect(result).toMatchObject({ barcode: 'skipped', outcome: 'ready' })
    expect(image.requests[0]?.readBarcode).toBe(false)
    expect(barcode.reports).toEqual([])
    expect(barcode.stamped).toEqual([])
  })

  test('instalação sem o crachá do robô reduz e fecha ready sem ler', async () => {
    const { dependencies, image } = setup({ withoutBarcode: true })

    const result = await processDeliveryProof(buildEnvelope(), dependencies)

    expect(result).toMatchObject({ barcode: 'skipped', outcome: 'ready' })
    expect(image.requests[0]?.readBarcode).toBe(false)
  })

  test('a miniatura que o aparelho já mandou não é refeita', async () => {
    const image = createFakeImagePort(processedResult({ thumbnail: false }))
    const { dependencies, repo } = setup({ image, proof: { hasThumbnail: true } })

    const result = await processDeliveryProof(buildEnvelope(), dependencies)

    expect(image.requests[0]?.withThumbnail).toBe(false)
    expect(result.outcome).toBe('ready')
    expect(repo.proof.thumbnailObjectId).toBeNull()
  })

  test('miniatura que não coube no teto não é condição do comprovante (220 RF19)', async () => {
    const image = createFakeImagePort(processedResult({ thumbnail: false }))
    const { dependencies, repo } = setup({ image })

    const result = await processDeliveryProof(buildEnvelope(), dependencies)

    expect(result.outcome).toBe('ready')
    expect(repo.proof.state).toBe('ready')
    expect(repo.proof.thumbnailObjectId).toBeNull()
  })

  /** T011 / RF6: arquivo que não é imagem não adianta repetir — o original fica e a linha explica por código. */
  test('imagem recusada deixa o original e marca processing_failed só com o código', async () => {
    const image = createFakeImagePort({ code: 'IMAGE_UNREADABLE', kind: 'rejected' })
    const { dependencies, repo, storage } = setup({ image })

    const result = await processDeliveryProof(buildEnvelope(), dependencies)

    expect(result).toMatchObject({ errorCode: 'IMAGE_UNREADABLE', outcome: 'failed' })
    expect(repo.proof.state).toBe('processing_failed')
    expect(repo.proof.processingError).toBe('IMAGE_UNREADABLE')
    // O original e a referência a ele continuam; a tela segue abrindo o mesmo objeto.
    expect(repo.proof.originalObjectId).toBe(ORIGINAL_OBJECT_ID)
    expect(repo.proof.objectId).toBe(ORIGINAL_OBJECT_ID)
    expect(repo.objects.get(ORIGINAL_OBJECT_ID)?.status).toBe('final')
    expect(storage.has(ORIGINAL_KEY)).toBe(true)
    expect(storage.calls).not.toContain('remove')
  })

  test('original acima do teto da API nem é baixado', async () => {
    const { dependencies, repo, storage } = setup({
      proof: { sizeBytes: PROOF_ORIGINAL_MAX_BYTES + 1 },
    })

    const result = await processDeliveryProof(buildEnvelope(), dependencies)

    expect(result).toMatchObject({ errorCode: 'ORIGINAL_TOO_LARGE', outcome: 'failed' })
    expect(storage.calls).not.toContain('read')
    expect(repo.proof.state).toBe('processing_failed')
  })

  test('formato que o decodificador não lê (HEIC) é recusado sem baixar', async () => {
    const { dependencies, storage } = setup({ proof: { mimeType: 'image/heic' } })

    const result = await processDeliveryProof(buildEnvelope(), dependencies)

    expect(result).toMatchObject({ errorCode: 'IMAGE_UNSUPPORTED', outcome: 'failed' })
    expect(storage.calls).not.toContain('read')
  })

  test('original ausente do bucket é falha de infraestrutura: rejeita para o trilho tentar de novo', async () => {
    const { dependencies, repo, storage } = setup()
    storage.blobs.clear()

    const failure = await processDeliveryProof(buildEnvelope(), dependencies).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(DeliveryProofProcessingError)
    expect((failure as DeliveryProofProcessingError).code).toBe('ORIGINAL_MISSING')
    // Nada foi marcado como falho: o trilho decide quando as tentativas acabam.
    expect(repo.proof.state).toBe('processing')
  })

  /** RF7: reentrega do RabbitMQ depois de pronto não duplica objeto nem leitura. */
  test('reentrega de comprovante ready é no-op', async () => {
    const first = setup()
    await processDeliveryProof(buildEnvelope(), first.dependencies)
    const storedBefore = first.storage.blobs.size
    const reportsBefore = first.barcode.reports.length
    const requestsBefore = first.image.requests.length

    const again = await processDeliveryProof(buildEnvelope(), first.dependencies)

    expect(again.outcome).toBe('already_ready')
    expect(first.storage.blobs.size).toBe(storedBefore)
    expect(first.barcode.reports.length).toBe(reportsBefore)
    expect(first.image.requests.length).toBe(requestsBefore)
    expect(first.repo.proof.state).toBe('ready')
  })

  test('comprovante que subiu já leve (estado nulo) e comprovante apagado são no-op', async () => {
    const light = setup({ proof: { originalObjectId: null, state: null } })
    expect((await processDeliveryProof(buildEnvelope(), light.dependencies)).outcome).toBe(
      'not_applicable',
    )
    expect(light.image.requests).toEqual([])
  })

  /** Recaptura: o evento é de um arquivo que já não é o da linha. */
  test('evento velho (outro objeto no comprovante) é descartado sem tocar em nada', async () => {
    const { dependencies, image, repo, storage } = setup()

    const result = await processDeliveryProof(
      buildEnvelope({ objectKey: `${ORIGINAL_KEY}-old` }),
      dependencies,
    )

    expect(result.outcome).toBe('stale')
    expect(image.requests).toEqual([])
    expect(storage.calls).toEqual([])
    expect(repo.proof.state).toBe('received')
  })

  test('troca que perde a corrida apaga os objetos novos e não fecha ready', async () => {
    const { dependencies, repo, storage } = setup()
    repo.loseTheSwap()

    const result = await processDeliveryProof(buildEnvelope(), dependencies)

    expect(result.outcome).toBe('superseded')
    expect(storage.blobs.size).toBe(1) // só o original sobrou
    expect(storage.has(ORIGINAL_KEY)).toBe(true)
    expect(repo.proof.state).toBe('processing')
  })

  test('falha ao trocar no banco apaga os objetos novos e propaga', async () => {
    const { dependencies, repo, storage } = setup()
    repo.failSwapWith(new Error('db down'))

    await expect(processDeliveryProof(buildEnvelope(), dependencies)).rejects.toThrow('db down')

    expect(storage.blobs.size).toBe(1)
    expect(storage.has(ORIGINAL_KEY)).toBe(true)
    expect(repo.proof.originalObjectId).toBe(ORIGINAL_OBJECT_ID)
  })

  /** T011: falha ao apagar o original o MANTÉM — a referência e o estado ficam como estavam. */
  test('falha ao apagar o original do bucket mantém o original e a referência (RF8)', async () => {
    const { dependencies, repo, storage } = setup()
    storage.failRemoveOfOriginalWith(new Error('storage down'))

    await expect(processDeliveryProof(buildEnvelope(), dependencies)).rejects.toThrow(
      'storage down',
    )

    expect(repo.proof.state).toBe('processing')
    expect(repo.proof.originalObjectId).toBe(ORIGINAL_OBJECT_ID)
    expect(repo.objects.get(ORIGINAL_OBJECT_ID)?.status).toBe('final')
    expect(storage.has(ORIGINAL_KEY)).toBe(true)
    expect(repo.calls).not.toContain('finalizeReady')
  })

  test('a reentrega depois da troca retoma só a finalização, sem reler nem reprocessar', async () => {
    const { dependencies, image, repo, storage } = setup()
    storage.failRemoveOfOriginalWith(new Error('storage down'))
    await expect(processDeliveryProof(buildEnvelope(), dependencies)).rejects.toThrow()
    storage.failRemoveOfOriginalWith(undefined)
    const requestsBefore = image.requests.length

    const result = await processDeliveryProof(buildEnvelope(), dependencies)

    expect(result.outcome).toBe('ready')
    expect(image.requests.length).toBe(requestsBefore)
    expect(repo.proof.state).toBe('ready')
    expect(repo.proof.originalObjectId).toBeNull()
    expect(storage.has(ORIGINAL_KEY)).toBe(false)
    expect(repo.objects.get(ORIGINAL_OBJECT_ID)?.status).toBe('deleted')
  })

  test('falha ao fechar ready depois de apagar o original: a reentrega fecha sem precisar do original', async () => {
    const { dependencies, repo, storage } = setup()
    repo.failFinalizeWith(new Error('db down'))
    await expect(processDeliveryProof(buildEnvelope(), dependencies)).rejects.toThrow('db down')
    expect(storage.has(ORIGINAL_KEY)).toBe(false)
    repo.failFinalizeWith(undefined)

    const result = await processDeliveryProof(buildEnvelope(), dependencies)

    expect(result.outcome).toBe('ready')
    expect(repo.proof.state).toBe('ready')
  })

  test('processing_failed pode ser reprocessado por um evento novo (reprocesso manual)', async () => {
    const { dependencies, repo } = setup({
      proof: { processingError: 'IMAGE_UNREADABLE', state: 'processing_failed' },
    })

    const result = await processDeliveryProof(buildEnvelope(), dependencies)

    expect(result.outcome).toBe('ready')
    expect(repo.proof.processingError).toBeNull()
  })
})
