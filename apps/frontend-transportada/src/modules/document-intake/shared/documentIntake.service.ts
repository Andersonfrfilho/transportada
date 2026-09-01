/* Copyright (c) 2026 Ada Technology. MIT License. */

import type { FleetVehicleFormState } from '../../fleet/shared/fleet.types'
import { readCrlvVehicle, type CrlvRemark } from './crlvVehicle.service'
import {
  identifyDocumentKind,
  readPdfTextLayer,
  type DocumentKind,
  type PdfGetDocument,
} from '@adatechnology/document-intake'

/**
 * Spec 048: um caso de uso, sem React, sem rede e **sem log** — nem em `debug`. O que passa por aqui
 * é o documento de um veículo com o CPF do proprietário impresso nele; a § Privacidade da spec só
 * vale se a PII não vazar por um `console.log` esquecido.
 */
export type DocumentIntakeResult = Readonly<{
  kind: DocumentKind
  remarks: readonly CrlvRemark[]
  values: Partial<FleetVehicleFormState>
}>

const EMPTY_RESULT = { remarks: [], values: {} } as const

export async function readVehicleDocument(input: {
  data: Uint8Array
  getDocument: PdfGetDocument
}): Promise<DocumentIntakeResult> {
  const page = await readPdfTextLayer(input)
  const kind = identifyDocumentKind(page)
  if (kind !== 'crlv') return { ...EMPTY_RESULT, kind }

  return { ...readCrlvVehicle(page), kind }
}

/** O arquivo vira bytes na memória da aba e morre com ela: nada de `FileReader` para servidor. */
export async function toDocumentBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}
