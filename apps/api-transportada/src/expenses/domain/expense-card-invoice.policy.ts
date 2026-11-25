/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A fatura do cartão de crédito repete gasto já lançado nas contas do veículo (combustível, por exemplo): por padrão ela
 * fica **fora** do resultado (pedido do Anderson, 25/11/2026) e volta à vista em `excluded.category`. A categoria é a
 * "Cartão de crédito" do cadastro (sem acento e caixa); `includeCardInvoice=true` na consulta a conta de volta.
 */
export function isCardInvoiceCategoryName(name: string | undefined): boolean {
  if (name === undefined) return false
  const plain = name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  return plain === 'cartao de credito'
}
