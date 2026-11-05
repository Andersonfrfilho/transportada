/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Dono da thread permanente do OCR do canhoto. Spec 294 C6: a thread sobe no boot (`start`) e carrega os modelos com
 * prazo próprio; até avisar que está pronta, toda leitura é `busy` na hora — a carga nunca come o prazo de uma leitura.
 * Atende **uma foto por vez** (o pico de memória é de uma leitura) e cada leitura tem teto de tempo: estourou, a thread
 * é encerrada e uma nova sobe e carrega de novo. Spec 294 S7: uma lendo e uma esperando, e uma por empresa; o resto é
 * `busy` na hora, nunca fila longa.
 */
import { Worker } from 'node:worker_threads'

import {
  CanhotoOcrError,
  type CanhotoOcrReaderPort,
  type ReadCanhotoParams,
} from '../application/canhoto-ocr-reader.port.js'
import {
  CANHOTO_OCR_DEFAULT_TIMEOUT_MILLISECONDS,
  CANHOTO_OCR_MAX_PENDING,
  CANHOTO_OCR_READY_TIMEOUT_MILLISECONDS,
} from '../domain/canhoto-ocr.constant.js'
import type { CanhotoOcrResult } from '../domain/canhoto-ocr.types.js'
import type { CanhotoOcrThreadReady, CanhotoOcrThreadResponse } from './canhoto-ocr.worker.js'

export const CANHOTO_OCR_WORKER_URL = import.meta.url.endsWith('.ts')
  ? new URL('./canhoto-ocr.worker.ts', import.meta.url)
  : new URL('./canhoto-ocr/infrastructure/canhoto-ocr.worker.js', import.meta.url)

type ThreadState = {
  readonly ready: Promise<boolean>
  isReady: boolean
  readonly worker: Worker
}

const isReadyMessage = (message: unknown): message is CanhotoOcrThreadReady =>
  typeof message === 'object' && message !== null && 'ready' in message && message.ready === true

export function createThreadedCanhotoOcrReader(
  options: Readonly<{
    modelDirectory: string
    readyTimeoutMilliseconds?: number
    timeoutMilliseconds?: number
    /** Para testes: dado extra da thread (o dublê lê o atraso da carga daqui). */
    workerData?: Record<string, unknown>
    workerUrl?: URL
  }>,
): CanhotoOcrReaderPort {
  const timeoutMilliseconds =
    options.timeoutMilliseconds ?? CANHOTO_OCR_DEFAULT_TIMEOUT_MILLISECONDS
  const readyTimeoutMilliseconds =
    options.readyTimeoutMilliseconds ?? CANHOTO_OCR_READY_TIMEOUT_MILLISECONDS
  let current: ThreadState | undefined
  let tail: Promise<unknown> = Promise.resolve()
  let pending = 0
  const pendingByKey = new Map<string, number>()
  let nextId = 0

  function discard(state: ThreadState): void {
    if (current === state) current = undefined
    void state.worker.terminate()
  }

  function spawn(): ThreadState {
    const worker = new Worker(options.workerUrl ?? CANHOTO_OCR_WORKER_URL, {
      workerData: { ...options.workerData, modelDirectory: options.modelDirectory },
    })
    // A thread ociosa não segura o processo: o encerramento do worker não espera por ela.
    worker.unref()
    let settleReady: (ready: boolean) => void = () => undefined
    const state: ThreadState = {
      isReady: false,
      ready: new Promise<boolean>((resolve) => {
        settleReady = resolve
      }),
      worker,
    }
    const readyTimer = setTimeout(() => {
      settleReady(false)
      discard(state)
    }, readyTimeoutMilliseconds)
    const onReady = (message: unknown): void => {
      if (!isReadyMessage(message)) return
      clearTimeout(readyTimer)
      worker.off('message', onReady)
      state.isReady = true
      settleReady(true)
    }
    worker.on('message', onReady)
    worker.once('error', () => discard(state))
    worker.once('exit', () => {
      clearTimeout(readyTimer)
      settleReady(false)
      if (current === state) current = undefined
    })
    return state
  }

  const ensureThread = (): ThreadState => (current ??= spawn())

  function run(params: ReadCanhotoParams): Promise<CanhotoOcrResult> {
    return new Promise((resolve, reject) => {
      const state = current
      // A thread caiu enquanto a foto esperava: a nova ainda vai carregar.
      if (state === undefined || !state.isReady) {
        ensureThread()
        reject(new CanhotoOcrError('busy'))
        return
      }
      const active = state.worker
      const id = (nextId += 1)
      const settle = (action: () => void): void => {
        clearTimeout(timer)
        active.off('message', onMessage)
        active.off('error', onError)
        active.off('exit', onExit)
        action()
      }
      const fail = (reason: 'engine_failed' | 'timeout'): void => {
        discard(state)
        settle(() => reject(new CanhotoOcrError(reason)))
      }
      const timer = setTimeout(() => fail('timeout'), timeoutMilliseconds)
      const onMessage = (response: CanhotoOcrThreadResponse): void => {
        if (response.id !== id) return
        settle(() =>
          response.ok ? resolve(response.result) : reject(new CanhotoOcrError('engine_failed')),
        )
      }
      const onError = (): void => fail('engine_failed')
      const onExit = (): void => fail('engine_failed')
      active.on('message', onMessage)
      active.once('error', onError)
      active.once('exit', onExit)
      active.postMessage({ bytes: params.bytes, candidates: params.candidates, id })
    })
  }

  function release(key: string | undefined): void {
    pending -= 1
    if (key === undefined) return
    const left = (pendingByKey.get(key) ?? 1) - 1
    if (left === 0) pendingByKey.delete(key)
    else pendingByKey.set(key, left)
  }

  return {
    async close() {
      const closing = current
      current = undefined
      await closing?.worker.terminate()
    },
    read(params) {
      const { queueKey } = params
      const isKeyBusy = queueKey !== undefined && pendingByKey.has(queueKey)
      if (!ensureThread().isReady || pending >= CANHOTO_OCR_MAX_PENDING || isKeyBusy) {
        return Promise.reject(new CanhotoOcrError('busy'))
      }
      pending += 1
      if (queueKey !== undefined) pendingByKey.set(queueKey, 1)
      const result = tail.then(() => run(params))
      tail = result.catch(() => undefined)
      return result.finally(() => release(queueKey))
    },
    start() {
      return ensureThread().ready
    },
  }
}
