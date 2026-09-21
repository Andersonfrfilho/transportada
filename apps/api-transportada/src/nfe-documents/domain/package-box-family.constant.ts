/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 160 (extra) — a lista fechada de prefixos que a unidade comercial usa para embalagem.
 */

/**
 * Prefixos de embalagem observados em produção (799 caixas): CX 578 · FR 97 · FD 52 · DP 47 ·
 * EV 13 · UN 7 (sempre `UN1`) · PC 5 — nenhum outro prefixo existe. Lista fechada, não regex
 * genérico: `M2`/`M3` (metro quadrado/cúbico) e `ML300`/`G500` são unidades válidas de NF-e que
 * terminam em dígito sem serem embalagem, e um regex genérico as leria como "2 unidades".
 */
export const PACKAGING_UNIT_COUNT_PREFIXES = ['CX', 'FR', 'FD', 'DP', 'EV', 'PC', 'UN'] as const

/** Teto explícito: o maior valor medido em produção é 240 (`CX240`); acima disto é dado corrompido. */
export const PACKAGING_UNIT_COUNT_MAXIMUM = 1000
