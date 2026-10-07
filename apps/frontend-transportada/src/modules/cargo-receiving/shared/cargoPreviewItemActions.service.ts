/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CargoPreviewItem, CargoPreviewItemAction } from './cargoPreview.types'

/** As mensagens em inglês do leitor da planilha que a tela sabe dizer em português. */
const ROW_ERROR_KEYS: Readonly<Record<string, string>> = {
  'A value is required': 'required',
  'Must be a non-negative decimal number': 'decimal',
}

export function resolveRowErrorKey(message: string): string | undefined {
  return ROW_ERROR_KEYS[message]
}

/**
 * O que o operador pode fazer com a linha (RF5a item 9). Confirmar é só da sugestão; desvincular, só da
 * vinculada; vincular à mão, do que ainda espera uma nota. A linha inválida não tem o que decidir: o
 * erro é da planilha, e o conserto é reenviá-la. Sem `trip.manage` nada aparece.
 */
export function resolveCargoPreviewItemActions(
  input: Readonly<{ canManage: boolean; item: CargoPreviewItem }>,
): readonly CargoPreviewItemAction[] {
  if (!input.canManage) return []
  switch (input.item.matchState) {
    case 'matched':
      return ['unlink']
    case 'suggested':
      return ['confirm', 'link']
    case 'awaiting_xml':
    case 'ambiguous':
      return ['link']
    case 'invalid':
      return []
  }
}

/** Desvincular age no grupo inteiro: as linhas que fecham a mesma nota são soltas juntas. */
export function countLinkedGroupRows(
  input: Readonly<{ item: CargoPreviewItem; items: readonly CargoPreviewItem[] }>,
): number {
  const key = input.item.matchGroupKey
  if (key === null) return 1
  return input.items.filter((candidate) => candidate.matchGroupKey === key).length
}
