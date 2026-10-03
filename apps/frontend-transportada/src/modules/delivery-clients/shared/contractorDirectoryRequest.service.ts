/* Copyright (c) 2026 Ada Technology. MIT License. */

export type ContractorApiErrorDetail = Readonly<{ field: string; message: string }>

/**
 * `web.md` §11: o 400 da API diz qual campo recusou, e o cliente que joga isso fora deixa o operador
 * com "não foi possível salvar" numa ficha cheia. A `message` segue sendo o código, porque é por ele
 * que a tela escolhe o texto do aviso.
 */
export class ContractorDirectoryRequestError extends Error {
  public readonly details: readonly ContractorApiErrorDetail[]

  public constructor(code: string, details: readonly ContractorApiErrorDetail[] = []) {
    super(code)
    this.name = 'ContractorDirectoryRequestError'
    this.details = details
  }
}

export type ContractorDirectoryDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export async function requestContractorApi(
  input: Readonly<{ dependencies: ContractorDirectoryDependencies; path: string }>,
): Promise<unknown> {
  void input
  throw new Error('NOT_IMPLEMENTED')
}
