/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 e spec 247: o que o renderizador do modelo de e-mail da ocorrência recebe.
 */
import type { OccurrenceAmountLine } from './occurrence-amount.policy.js'

/** Um item marcado na ocorrência, com o que a NF-e e o registro dizem dele. */
export type OccurrenceTemplateLine = OccurrenceAmountLine & {
  readonly code: string
  readonly description: string
  /** A quantidade da NF-e: só aparece quando a ocorrência não registrou a sua. */
  readonly nfeQuantity: string
  readonly unit: string
}

export type OccurrenceTemplateValues = {
  /** O nome do embarcador — o que o assunto dos modelos chama de `{{contratante}}`. */
  readonly contractorName: string
  /** O valor pago digitado pela ocorrência inteira (`numeric` cru); ausente é não digitado. */
  readonly declaredAmount?: null | string | undefined
  readonly documentLabel: string
  /** O número da nota sem a série; ausente imprime vazio. */
  readonly documentNumber?: string | undefined
  readonly driverName: string
  /** Vazio na ocorrência da nota inteira: não há item a apontar. */
  readonly itemCode: string
  readonly itemLabel: string
  /** O formato de cada linha de `{{linhasItens}}`; ausente ou vazio usa a linha padrão. */
  readonly itemLineTemplate?: string | undefined
  readonly itemQuantity: string
  /** Os itens marcados, na ordem; ausente é a nota inteira, sem linha a imprimir. */
  readonly lines?: readonly OccurrenceTemplateLine[] | undefined
  /** A observação da ocorrência: o motivo que quem registra digitou. */
  readonly note: string
  readonly occurredOn: string
  readonly recipientName: string
  /** O número do documento do cliente (a NFD) que quem registra digitou. */
  readonly referenceNumber?: string | undefined
  readonly stopLabel: string
  /** `nfe_documents.total_value` cru (`numeric`); o renderizador o formata. */
  readonly totalValue: string
}

/** Os itens que a ocorrência aponta, na ordem em que foram marcados. */
export type OccurrenceTemplateItem = {
  readonly code: string
  readonly description: string
  readonly quantity: number | string
}
