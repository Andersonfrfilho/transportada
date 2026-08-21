/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * As categorias da CNH como o CONTRAN as publica, na ordem em que a habilitação sobe: `ACC` é o
 * ciclomotor, e as compostas são as duas letras juntas porque é assim que o documento as imprime.
 * A carga que interessa à transportadora é `D` e `E`, mas a frota tem moto e carro de apoio.
 */
export const LICENSE_CATEGORIES = ['ACC', 'A', 'B', 'AB', 'C', 'AC', 'D', 'AD', 'E', 'AE'] as const

export type LicenseCategory = (typeof LICENSE_CATEGORIES)[number]

export const LICENSE_CATEGORY_MAX_LENGTH = 3
