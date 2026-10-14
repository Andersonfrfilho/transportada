/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Entrada da `worker_thread` do comprovante (spec 265 RNF1, ADR-0053): decodificar, orientar e
 * reencodar uma foto de 12 MP é CPU e memória, e no processo principal pararia a emissão fiscal
 * junto. Sem rede, sem banco e **sem log**.
 */
import { parentPort, workerData } from 'node:worker_threads'

import type { DeliveryProofImageParams } from '../application/delivery-proof-image.port.js'
import { processDeliveryProofImage } from './delivery-proof-image.processing.js'

if (parentPort !== null) {
  /**
   * ⚠️ O Bun não mantém o laço de eventos da thread vivo enquanto o wasm do jsquash instancia: a thread
   * saía com código 13 ("top-level await não resolvido") de forma intermitente — medido 2/3 das vezes
   * com decodificar + reencodar, sem erro nenhum. O temporizador ocioso segura o laço até o resultado
   * sair; o `clearInterval` o solta, e a thread termina sozinha.
   */
  const keepAlive = setInterval(() => undefined, 1_000)
  try {
    parentPort.postMessage({
      result: await processDeliveryProofImage(workerData as DeliveryProofImageParams),
    })
  } finally {
    clearInterval(keepAlive)
  }
}
