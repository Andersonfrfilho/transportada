/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * A raiz da chave das listas de perfis de recebimento. Dois módulos leem o mesmo dado com guardas próprias
 * (`cargo-receiving` e `delivery-clients`) e cada um guarda a sua lista sob esta raiz; quem grava um perfil
 * invalida a raiz, e as duas listas se atualizam sem um módulo conhecer o outro.
 */
export const RECEIVING_PROFILES_QUERY_KEY = 'receiving-profiles'
