/* Cópia por valor de apps/frontend-transportada/src/components/ui/barcodeDecoder.worker.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { decodeBarcodeFrame, type BarcodeFrame } from './barcodeDecoder.service'

export type BarcodeWorkerAnswer = Readonly<{ text: string | null }>

type WorkerScope = {
  onmessage: ((event: Readonly<{ data: BarcodeFrame }>) => void) | null
  postMessage: (message: BarcodeWorkerAnswer) => void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event) => {
  scope.postMessage({ text: decodeBarcodeFrame(event.data) })
}
