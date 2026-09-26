/* Copyright (c) 2026 Ada Technology. MIT License. */
export type PortalTab = 'charges' | 'deliveries' | 'occurrences'

/** O nome da aba no link, em português, como o usuário vê a URL. */
const TAB_BY_PARAM: Readonly<Record<string, PortalTab>> = {
  cobrancas: 'charges',
  entregas: 'deliveries',
  ocorrencias: 'occurrences',
}

/**
 * Spec 183 RF21: o aviso por e-mail de mensagem nova leva `?aba=ocorrencias`, e o portal abre nela.
 * Sem o parâmetro, ou com um valor que não existe, a aba de sempre: Entregas.
 */
export function initialPortalTab(search: string): PortalTab {
  const param = new URLSearchParams(search).get('aba') ?? ''
  return TAB_BY_PARAM[param] ?? 'deliveries'
}
