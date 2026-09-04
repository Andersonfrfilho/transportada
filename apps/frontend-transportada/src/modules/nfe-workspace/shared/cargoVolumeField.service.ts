/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O campo do fator de cubagem, nos dois sentidos — e a razão de ele ser serviço puro em vez de
 * duas linhas dentro do componente.
 *
 * ⚠️ **Defeito medido em staging (2026-09-02):** a base guardava `0.035000` e o campo mostrava
 * `0,04`, inclusive depois de recarregar a página — um `Intl.NumberFormat` de duas casas
 * reformatava o valor já salvo. Quem digitava `0,035` lia `0,04`, concluía que o sistema tinha
 * recusado, e digitava `0,04` de novo: a tela ensinava a estragar o dado recém-acertado.
 *
 * Duas decisões que fecham isso:
 *
 * - **A exibição nunca arredonda.** Ela corta zero à direita do decimal guardado, e só isso.
 *   Formatar por casas máximas é o que produz a mentira, em qualquer casa que se escolha.
 * - **O que a tela mostra, ela aceita de volta** (`FIELD_SCALE`). Aceitar mais casas do que se
 *   sabe mostrar devolve o mesmo defeito uma casa adiante — o limite tem de ser um número só.
 *
 * A coluna é `numeric(12,6)`; a tela usa três casas porque um mililitro por caixa não é decisão
 * que alguém tome. Fator antigo com quarta casa não vira erro em silêncio: ele aparece por
 * inteiro e o campo o recusa até ser corrigido, que é o comportamento honesto para um valor que
 * esta tela não sabe representar.
 */
const STORAGE_SCALE = 6
const FIELD_SCALE = 3

/** O decimal guardado, como a pessoa o lê: vírgula, e sem zero à direita. */
export function formatCargoVolumeField(stored: string): string {
  const [whole = '0', fraction = ''] = stored.split('.')
  const trimmed = fraction.replace(/0+$/, '')
  return trimmed.length === 0 ? whole : `${whole},${trimmed}`
}

/**
 * O que foi digitado, na forma que o banco guarda — ou `null` quando não é fator nenhum.
 *
 * Tudo por texto: converter para número em ponto flutuante traria erro binário para dentro de um
 * decimal, e o repositório proíbe isso para decimal desde o começo.
 */
export function parseCargoVolumeField(typed: string): string | null {
  const normalized = typed.trim().replace(',', '.')
  if (!/^\d*\.?\d*$/.test(normalized) || normalized.replace('.', '').length === 0) return null

  const [whole = '', fraction = ''] = normalized.split('.')
  if (fraction.length > FIELD_SCALE) return null
  if (/^0*$/.test(whole + fraction)) return null

  return `${whole.length === 0 ? '0' : whole}.${fraction.padEnd(STORAGE_SCALE, '0')}`
}
