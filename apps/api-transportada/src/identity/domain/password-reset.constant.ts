/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Tentativas erradas por pedido. Esgotado o limite, nem o código certo passa: só pedir de novo. */
export const PASSWORD_RESET_MAX_ATTEMPTS = 5

/**
 * Quinze minutos, e não os dois dias do convite: aqui a pessoa está na frente da tela agora,
 * esperando o e-mail. Janela longa é código válido esquecido numa caixa de entrada.
 */
export const PASSWORD_RESET_TTL_MINUTES = 15
