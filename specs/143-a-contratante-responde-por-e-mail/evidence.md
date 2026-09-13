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
