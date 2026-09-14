/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type WhatsAppMenuPolicyViolationRule =
  | 'invalid_page'
  | 'page_out_of_range'
  | 'title_too_long'
  | 'too_many_options'

/**
 * Lançada quando `planChoiceMessage` recebe um nó estático (`source: 'graph'`) fora do que
 * `validateFlowGraphForWhatsApp` deveria ter recusado na publicação — nunca deveria acontecer em
 * runtime. Truncar em silêncio esconderia o defeito; a mensagem quebrada na Meta é pior que o erro.
 */
export class WhatsAppMenuPolicyViolationError extends Error {
  public readonly actual: number | undefined
  public readonly limit: number | undefined
  public readonly optionId: string | undefined
  public readonly rule: WhatsAppMenuPolicyViolationRule

  public constructor(input: {
    readonly actual?: number
    readonly limit?: number
    readonly optionId?: string
    readonly rule: WhatsAppMenuPolicyViolationRule
  }) {
    super(`WhatsApp menu policy violation: ${input.rule}.`)
    this.name = 'WhatsAppMenuPolicyViolationError'
    this.actual = input.actual
    this.limit = input.limit
    this.optionId = input.optionId
    this.rule = input.rule
  }
}
