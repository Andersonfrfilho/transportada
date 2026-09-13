# Evidências

## T001 — 2026-09-13

Respondida pela documentação oficial do Postmark, sem conta:

- `postmarkapp.com/developer/webhooks/inbound-webhook`: o resultado de DKIM/SPF vem em
  `Headers[]` → `X-Spam-Tests` (marcas do SpamAssassin); a retentativa segue a escala de 1 min a
  6 h; um `403` interrompe as retentativas.
- `postmarkapp.com/developer/webhooks/webhooks-overview`: não há assinatura HMAC; o webhook aceita
  Basic Auth na URL; os IPs estão em `support/article/800-ips-for-firewalls#webhooks`.
- `postmarkapp.com/developer/user-guide/inbound/inbound-domain-forwarding`: MX para
  `inbound.postmarkapp.com` com prioridade 10; `InboundDomain` gravado pelo `PUT /server`.
- `postmarkapp.com/developer/api/domains-api`: a verificação de DKIM exige
  `X-Postmark-Account-Token`.

Consequências registradas: o portão usa `DKIM_VALID_AU` (ADR-0063 §3), a configuração vira página
(ADR-0063 §7, P0), e a captura com e-mail real passou a ser a T012.

## T002 — 2026-09-13

- `docs/SECURITY.md`: três achados abertos com data (webhook de entrada sem HMAC, corpo de 12 MiB
  na rota do webhook, respostas guardadas sem prazo de descarte) — commit `41fda8dc`.
- ADR-0063 aceita pelo usuário em 2026-09-13, depois da explicação do DNS: raiz no Zoho, DNS na
  Cloudflare, respostas pelo subdomínio `resposta.` para não tocar no MX raiz.

## T001 e T002, emenda — 2026-09-13

O usuário informou que o domínio já envia pelo Resend, e o provedor trocou no mesmo dia.

- DNS de `fernandes-transportadora.com.br` (Cloudflare): `resend._domainkey` publicado, `send.` com
  SPF `include:amazonses.com` e MX `feedback-smtp.sa-east-1.amazonses.com`. MX raiz e SPF raiz do
  Zoho, intocados. `resposta.` sem MX.
- `resend.com/docs/dashboard/receiving/introduction` e `…/create-receiving-webhook`: evento
  `email.received` só com metadados; conteúdo pela API de recebidos.
- `resend.com/docs/api-reference/emails/retrieve-received-email`: `headers`, `text`, `html` e
  `raw.download_url` (MIME original, URL assinada com expiração).
- `resend.com/docs/dashboard/webhooks/verify-webhooks-requests`: assinatura Svix (`svix-id`,
  `svix-timestamp`, `svix-signature`), sobre o corpo cru.
- `resend.com/docs/api-reference/emails/send-email`: `reply_to`, `headers` e `Idempotency-Key`.
- `npm view mailauth`: 5.0.3, MIT, postalsys, publicada em 2026-09-03, `engines.node >= 22.19.0` —
  a compatibilidade com o Bun é a T004.

Consequência: a antiga T004 (corpo de 12 MiB) saiu, porque o webhook do Resend não traz corpo; o
DKIM passa a ser verificado por nós sobre o MIME bruto.
