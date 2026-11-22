/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Thread **permanente** do canhoto (ADR 0113 §5): os modelos carregam uma vez, ao subir, e a thread fica
 * viva atendendo uma foto por vez. Decodificar e ler 12 MP é CPU e memória (~740 MB de pico medido no
 * spike) e no processo principal pararia a emissão fiscal junto. Sem rede, sem banco e **sem log**.
 *
 * Dois pedidos, a mesma thread (um só motor na memória): `match` é o do bot (casa com as notas conhecidas,
 * spec 294); `identity` é a passada da rotina `trip.canhoto.read` (lê o Nº/Série impresso, spec 344). Nos
 * dois, só o veredito sai daqui.
 */
import { parentPort, workerData } from 'node:worker_threads'

import sharp from 'sharp'

import type { CanhotoNumberOcrResult } from '../../canhoto-read/application/canhoto-number-ocr-reader.port.js'
import { extractCanhotoIdentity } from '../../canhoto-read/domain/canhoto-identity.policy.js'
import { evaluateCanhotoText } from '../domain/canhoto-ocr-match.policy.js'
import { CANHOTO_OCR_LONG_SIDE } from '../domain/canhoto-ocr.constant.js'
import type { CanhotoOcrCandidate, CanhotoOcrResult } from '../domain/canhoto-ocr.types.js'
import { openCanhotoImage } from './canhoto-image.decoder.js'
import { loadOcrEngine, readOcrLines } from './paddle-ocr.engine.js'
import type { OcrEngine } from './paddle-ocr.types.js'

export type CanhotoOcrThreadRequest = Readonly<
  | { bytes: Uint8Array; candidates: readonly CanhotoOcrCandidate[]; id: number; kind?: 'match' }
  | { bytes: Uint8Array; id: number; kind: 'identity' }
>
export type CanhotoOcrThreadResponse = Readonly<
  | { id: number; ok: true; result: CanhotoOcrResult }
  | { id: number; ok: true; result: CanhotoNumberOcrResult }
  | { id: number; ok: false }
>
/** Spec 294 C6: a thread avisa uma vez, quando os modelos terminaram de carregar. */
export type CanhotoOcrThreadReady = Readonly<{ ready: true }>

/** Spec 344 D2: o reserva gira 90° — 180° e 270° o motor já resolve sozinho (confiança e forma das caixas). */
const RESERVE_ROTATION_DEGREES = 90

async function readIdentity(engine: OcrEngine, bytes: Uint8Array): Promise<CanhotoNumberOcrResult> {
  // A foto é aberta uma vez, reduzida e endireitada pelo EXIF; falhar aqui é da foto, não do motor.
  let prepared: Buffer
  try {
    prepared = await openCanhotoImage(bytes)
      .rotate()
      .resize(CANHOTO_OCR_LONG_SIDE, CANHOTO_OCR_LONG_SIDE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 1 })
      .toBuffer()
  } catch {
    return { kind: 'unreadable' }
  }

  const first = extractCanhotoIdentity(
    (await readOcrLines(engine, prepared)).map((line) => line.text),
  )
  if (first !== null) return { identity: first, kind: 'read' }

  const turned = await sharp(prepared)
    .rotate(RESERVE_ROTATION_DEGREES)
    .png({ compressionLevel: 1 })
    .toBuffer()
  const reserve = extractCanhotoIdentity(
    (await readOcrLines(engine, turned)).map((line) => line.text),
  )
  return { identity: reserve, kind: 'read' }
}

if (parentPort !== null) {
  const port = parentPort
  const engine = await loadOcrEngine((workerData as { modelDirectory: string }).modelDirectory)
  port.postMessage({ ready: true } satisfies CanhotoOcrThreadReady)
  port.on('message', (request: CanhotoOcrThreadRequest) => {
    const work: Promise<CanhotoOcrResult | CanhotoNumberOcrResult> =
      request.kind === 'identity'
        ? readIdentity(engine, request.bytes)
        : readOcrLines(engine, request.bytes).then((lines) =>
            evaluateCanhotoText({
              candidates: request.candidates,
              lines: lines.map((line) => line.text),
            }),
          )
    void work.then(
      (result) => port.postMessage({ id: request.id, ok: true, result }),
      () => port.postMessage({ id: request.id, ok: false }),
    )
  })
}
