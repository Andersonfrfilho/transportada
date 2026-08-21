/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Os campos da ficha do motorista aos quais outra tela sabe pedir foco. Não é a lista de campos do
 * formulário: é o contrato de para onde um aviso pode levar, e cada nome aqui tem uma referência
 * ligada no diálogo.
 */
export const DRIVER_FOCUS_FIELDS = ['addressState', 'name', 'rntrc', 'taxId'] as const

export type DriverFocusField = (typeof DRIVER_FOCUS_FIELDS)[number]
