/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/**
 * Os cinco tipos de chave Pix que o Bacen reconhece — os quatro identificadores e a chave
 * aleatória (EVP), que não tem formato: é um UUID gerado pelo banco na hora do cadastro.
 */
export const PIX_KEY_TYPES = ['cpf', 'cnpj', 'email', 'phone', 'random'] as const
export type PixKeyType = (typeof PIX_KEY_TYPES)[number]

export const PIX_KEY_MAX_LENGTH = 140
