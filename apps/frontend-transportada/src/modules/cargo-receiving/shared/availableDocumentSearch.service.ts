/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { AvailableCargoDocument } from './cargoArrival.types'

const COMBINING_MARKS = /\p{M}/gu

function foldText(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()
}

/** Busca por número, destinatário ou cidade, sem acento nem caixa, sobre as notas já carregadas. */
export function filterAvailableDocuments(
  input: Readonly<{ documents: readonly AvailableCargoDocument[]; query: string }>,
): readonly AvailableCargoDocument[] {
  const needle = foldText(input.query.trim())
  if (needle === '') return input.documents
  return input.documents.filter((document) =>
    [document.number, document.recipientName ?? '', document.cityName ?? ''].some((value) =>
      foldText(value).includes(needle),
    ),
  )
}
