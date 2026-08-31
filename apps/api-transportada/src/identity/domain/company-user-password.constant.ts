/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O piso da senha que o administrador define pela tela. Ele é **mais alto** que o do fluxo de
 * recuperação de propósito: ali quem digita é o dono da conta, aqui é um terceiro escolhendo a
 * senha de outra pessoa, e uma senha curta escolhida por terceiro circula por um canal que o
 * sistema não controla (recado, papel, mensagem) antes de chegar a quem vai usá-la.
 */
export const COMPANY_USER_PASSWORD_MIN_LENGTH = 12
export const COMPANY_USER_PASSWORD_MAX_LENGTH = 128
