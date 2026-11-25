/**
 * A fatura do cartão de crédito conta como conta da empresa por padrão (decisão do Anderson, 25/11/2026). Quando ela repete
 * gasto já lançado nas contas do veículo, `excludeCardInvoice=true` a tira do resultado e o valor volta em
 * `excluded.category`. A categoria é a "Cartão de crédito" do cadastro (sem acento e caixa).
 */
export function isCardInvoiceCategoryName(name: string | undefined): boolean {
  if (name === undefined) return false
  const plain = name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  return plain === 'cartao de credito'
}
