/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 274 (D3): a porta do modelo padrão de e-mail do módulo de notificação (`standardEmail.render`). O app só monta
 * os valores (texto, nunca HTML); o SDK resolve o modelo da empresa (ou o embutido, versão `0`) e renderiza. Os tipos
 * espelham `StandardEmailInput`/`RenderedStandardEmail` de `@adatechnology/notification-contracts` — o adaptador que
 * liga o pacote (T3.1, depois da publicação) é o único lugar que importa dele.
 */
export type StandardEmailLogo =
  | { readonly contentId: string; readonly kind: 'cid' }
  | { readonly kind: 'initials' }

/** Só texto: nenhum HTML entra aqui. */
export type StandardEmailInput = {
  readonly attachments: readonly { readonly name: string }[]
  readonly bodyText: string
  readonly footer: {
    readonly platformMarkUrl?: string | undefined
    readonly platformNote: string
    readonly productMarkUrl?: string | undefined
  }
  readonly identity: { readonly displayName: string; readonly logo: StandardEmailLogo }
  readonly replyHint?: string | undefined
  readonly signer: { readonly name: string; readonly role?: string | undefined }
  readonly values?: Readonly<Record<string, string>> | undefined
}

export type StandardEmailRendered = {
  readonly bytes: number
  readonly html: string
  readonly template: {
    readonly key: string
    readonly source: 'builtin' | 'company'
    readonly version: number
  }
  readonly text: string
  readonly tooLarge: boolean
}

export type StandardEmailRendererPort = {
  render(params: {
    readonly companyId: string
    readonly input: StandardEmailInput
  }): Promise<StandardEmailRendered>
}
