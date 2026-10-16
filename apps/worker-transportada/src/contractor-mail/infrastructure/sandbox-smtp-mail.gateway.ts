/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SandboxSmtpRecipientsRejectedError } from '../domain/sandbox-smtp.error.js'

/**
 * Spec 268: o envio do e-mail da contratante fora de produção, pelo SMTP do ambiente (Mailpit). Não usa o
 * `createSmtpEmailProvider` do `email-provider` porque ele aceita um destinatário só e nenhum anexo, e o e-mail
 * de ocorrência tem vários contatos e arquivos. Nenhum log daqui leva endereço, assunto ou corpo.
 */
export type SandboxSmtpAttachment = {
  /** Base64, como o gateway do Resend recebe. */
  readonly content: string
  readonly contentType: string
  readonly fileName: string
}

export type SendSandboxSmtpEmailInput = {
  readonly attachments?: readonly SandboxSmtpAttachment[]
  readonly from: string
  readonly html?: string
  readonly subject: string
  readonly text: string
  readonly to: readonly string[]
}

export type SandboxSmtpMailGateway = {
  sendEmail(input: SendSandboxSmtpEmailInput): Promise<{ readonly id: string }>
}

type SandboxSmtpMessage = {
  readonly attachments?: readonly {
    readonly content: string
    readonly contentType: string
    readonly encoding: 'base64'
    readonly filename: string
  }[]
  readonly from: string
  readonly html?: string
  readonly subject: string
  readonly text: string
  readonly to: readonly string[]
}

/** O recorte do `nodemailer` que este gateway usa; o teste injeta um dublê e o pacote real nunca é carregado. */
export type SandboxSmtpTransport = {
  sendMail(message: SandboxSmtpMessage): Promise<{
    readonly accepted: readonly unknown[]
    readonly messageId: string
    readonly rejected: readonly unknown[]
  }>
}

type NodemailerModule = {
  createTransport(smtpUrl: string): SandboxSmtpTransport
}

const NODEMAILER_MODULE_NAME: string = 'nodemailer'

async function createNodemailerTransport(smtpUrl: string): Promise<SandboxSmtpTransport> {
  const loaded: unknown = await import(NODEMAILER_MODULE_NAME)
  return (loaded as NodemailerModule).createTransport(smtpUrl)
}

export function createSandboxSmtpMailGateway(
  input: Readonly<{ smtpUrl: string }> | Readonly<{ transport: SandboxSmtpTransport }>,
): SandboxSmtpMailGateway {
  let transportPromise: Promise<SandboxSmtpTransport> | undefined
  function resolveTransport(): Promise<SandboxSmtpTransport> {
    if ('transport' in input) return Promise.resolve(input.transport)
    transportPromise ??= createNodemailerTransport(input.smtpUrl)
    return transportPromise
  }

  return {
    async sendEmail(request) {
      const transport = await resolveTransport()
      const result = await transport.sendMail({
        ...(request.attachments === undefined || request.attachments.length === 0
          ? {}
          : {
              attachments: request.attachments.map((attachment) => ({
                content: attachment.content,
                contentType: attachment.contentType,
                encoding: 'base64' as const,
                filename: attachment.fileName,
              })),
            }),
        from: request.from,
        ...(request.html === undefined ? {} : { html: request.html }),
        subject: request.subject,
        text: request.text,
        to: request.to,
      })
      if (result.accepted.length === 0 && result.rejected.length > 0) {
        throw new SandboxSmtpRecipientsRejectedError()
      }
      return { id: result.messageId }
    },
  }
}
