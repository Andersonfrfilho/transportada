/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Atributos que o produto grava no usuário do Keycloak. São lidos na reconciliação e escritos no
 * convite, na edição de perfil e no backfill — quatro lugares, então o nome vive num só.
 *
 * ⚠️ `TAX_ID` e `PHONE` guardam dado pessoal **em claro** no realm, por decisão registrada em
 * `docs/SECURITY.md`. O documento existe para a reconciliação casar a mesma pessoa dos dois lados:
 * a pessoa tem um documento só e pode ter vários e-mails, então sem ele o casamento cai no e-mail e
 * fica ambíguo.
 *
 * ⚠️ `PICTURE` guarda a imagem **inteira**, como `data:` URI, e não um endereço. A URL anterior
 * apontava para a nossa rota autenticada: nenhum consumidor do provedor conseguia buscá-la, porque
 * `<img src>` não manda `Authorization`. O conteúdo cabe porque a rota já recusa acima de 256 KiB.
 *
 * ⚠️ **Nenhum destes três tem mapper de claim no realm**, e isso não é acaso: só `company_id` entra
 * no token. Mapear `picture` poria centenas de kilobytes dentro de cada token emitido.
 */
export const IDENTITY_USER_ATTRIBUTE = {
  COMPANY_ID: 'company_id',
  PHONE: 'phone',
  PICTURE: 'picture',
  TAX_ID: 'tax_id',
} as const
