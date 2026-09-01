/* Copyright (c) 2026 Ada Technology. MIT License. */

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export const TEMPLATE_TEST_ERROR = {
  NOT_FOUND: 'NOTIFICATION_TEMPLATE_NOT_FOUND',
  REQUEST_FAILED: 'NOTIFICATION_TEST_REQUEST_FAILED',
} as const

/**
 * Dispara o envio de teste do template aberto.
 *
 * ⚠️ **Não há destinatário no corpo, e isso é a regra inteira**: o envio vai para quem está
 * autenticado. Um campo de destino transformaria a tela de edição de template num jeito de mandar
 * e-mail com a marca da empresa para qualquer endereço.
 */
export function createTemplateTestClient(dependencies: ClientDependencies) {
  return {
    async sendTest(templateKey: string): Promise<void> {
      const accessToken = await dependencies.getAccessToken()

      let response: Response
      try {
        response = await dependencies.fetch(
          new Request(
            `${dependencies.apiUrl}/notification-templates/${encodeURIComponent(templateKey)}/test`,
            {
              cache: 'no-store',
              headers: { authorization: `Bearer ${accessToken}` },
              method: 'POST',
            },
          ),
        )
      } catch {
        throw new Error(TEMPLATE_TEST_ERROR.REQUEST_FAILED)
      }

      if (response.ok) return

      /** O código do servidor atravessa: "não encontrado" e "falhou" pedem coisas diferentes. */
      const body = (await response.json().catch(() => undefined)) as
        | { readonly error?: { readonly code?: string } }
        | undefined
      throw new Error(body?.error?.code ?? TEMPLATE_TEST_ERROR.REQUEST_FAILED)
    },
  }
}
