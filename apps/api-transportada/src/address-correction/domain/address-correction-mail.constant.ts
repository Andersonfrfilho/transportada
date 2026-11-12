/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Cores dos blocos de endereço do e-mail de correção (RF9–RF11), copiadas de `email-template.html` (spec 150) —
 * a referência visual aprovada pelo usuário em 2026-09-15. O resto do layout (cabeçalho, textos, rodapé) mora no
 * modelo do módulo de notificação (spec 286); só os blocos são montados aqui, como o HTML do sistema.
 */
export const ADDRESS_CORRECTION_MAIL_COLOR = {
  amber: '#8a4f1d',
  border: '#d9d4ca',
  copperRule: '#d58a47',
  footerBorder: '#e6e1d8',
  greenAccent: '#3f7a5d',
  greenBar: '#6aae8c',
  headerBackground: '#10222c',
  headerText: '#f0f2ee',
  ink: '#10222c',
  rowLabel: '#f7f5f0',
  slate: '#6b7c85',
} as const

export const ADDRESS_CORRECTION_MAIL_FONT_FAMILY = 'Arial,Helvetica,sans-serif'

/**
 * Nome da operação de idempotência do envio (T304/RF6), repetido entre o caso de uso e o
 * repositório — extraído para não divergir (§16 do padrão de código).
 */
export const ADDRESS_CORRECTION_SEND_MAIL_OPERATION = 'address-correction.send-mail'
