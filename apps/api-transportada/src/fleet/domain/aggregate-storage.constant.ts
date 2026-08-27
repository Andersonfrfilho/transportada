/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O provedor gravado na linha do objeto. Era constante local do upload de documento; passou a ser
 * usada também pelo anexo de candidatura, e string repetida vira constante (code-standart §16) —
 * duas cópias divergiriam no dia em que o provedor mudasse.
 */
export const AGGREGATE_STORAGE_PROVIDER = 'object-storage'
