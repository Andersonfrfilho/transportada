/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 265 RF12/RF10: o que a tela sabe do envio do comprovante que **está saindo agora** —
 * a porcentagem real (bytes enviados / total) e, depois que o servidor aceita, o estado de
 * processamento. Memória do app, por nota e tipo: a fila (IndexedDB) continua sendo a verdade do
 * "enviado"; isto só alimenta a barra e o aviso "Enviado, processando".
 */
export type ProofProcessingState = 'received' | 'processing'

export type ProofUploadProgressEntry = Readonly<{
  percent: number
  processingState?: ProofProcessingState
}>

type Listener = () => void

/** Pura: a porcentagem de bytes enviados, inteira; só chega a 100 quando o envio terminou de fato. */
export function resolveUploadPercent(input: {
  readonly isDone?: boolean
  readonly loaded: number
  readonly total: number
}): number {
  if (input.isDone === true) return 100
  if (!(input.total > 0)) return 0
  const raw = Math.floor((Math.max(0, input.loaded) / input.total) * 100)
  return Math.min(99, Math.max(0, raw))
}

/** A API devolve `ready` para o que não tem nada a esperar; só `received`/`processing` são avisos. */
export function readProofProcessingState(value: unknown): ProofProcessingState | undefined {
  return value === 'received' || value === 'processing' ? value : undefined
}

export function proofProgressKey(input: { documentId: string; kind: string }): string {
  return `${input.documentId}:${input.kind}`
}

const EMPTY: Readonly<Record<string, ProofUploadProgressEntry>> = {}

export function createProofUploadProgressStore() {
  let entries: Readonly<Record<string, ProofUploadProgressEntry>> = EMPTY
  const listeners = new Set<Listener>()

  function write(key: string, entry: ProofUploadProgressEntry | undefined): void {
    const rest = Object.fromEntries(Object.entries(entries).filter(([name]) => name !== key))
    entries = entry === undefined ? rest : { ...rest, [key]: entry }
    for (const listener of listeners) listener()
  }

  return {
    /** Um envio novo começa do zero e apaga o aviso do anterior. */
    begin(key: string): void {
      write(key, { percent: 0 })
    },
    /** Monotônico: uma medida menor que a anterior (rajada fora de ordem) não faz a barra recuar. */
    report(key: string, input: { loaded: number; total: number; isDone?: boolean }): void {
      const percent = resolveUploadPercent(input)
      const current = entries[key]
      if (current === undefined || current.processingState !== undefined) return
      if (percent <= current.percent) return
      write(key, { percent })
    },
    /** O servidor aceitou: 100% e, se ele disse que ainda processa, o aviso. */
    accepted(key: string, processingState: ProofProcessingState | undefined): void {
      write(key, {
        percent: 100,
        ...(processingState === undefined ? {} : { processingState }),
      })
    },
    /** O envio falhou ou foi recusado: a barra some, e a fila diz o que houve. */
    clear(key: string): void {
      if (entries[key] !== undefined) write(key, undefined)
    },
    get: (key: string): ProofUploadProgressEntry | undefined => entries[key],
    snapshot: (): Readonly<Record<string, ProofUploadProgressEntry>> => entries,
    subscribe: (listener: Listener): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type ProofUploadProgressStore = ReturnType<typeof createProofUploadProgressStore>

/** Um só por app: o cliente grava, a tela lê. */
export const proofUploadProgress: ProofUploadProgressStore = createProofUploadProgressStore()
