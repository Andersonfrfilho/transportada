# Spec 311 — Liberar o envio de XML por domínio de e-mail

Pedido do Anderson (09/11/2026): em vez de cadastrar cada contato, liberar um domínio (`@empresa.com.br`).

- RF1. A empresa tem uma lista de domínios liberados (`nfe_xml_allowed_email_domains`, `active`/`inactive`).
- RF2. Remetente de e-mail cujo domínio está ativo na lista é aceito, desde que o DKIM esteja alinhado (exigência da 301, antes da autorização). Subdomínio **não** herda.
- RF3. Domínio de provedor público (gmail, hotmail, outlook, yahoo etc.) não entra na lista: CHECK no banco.
- RF4. A importação sai com o ator da caixa; o remetente fica gravado no recibo.
- RF5. O WhatsApp não muda.

Fora desta entrega: tela/rota de cadastro (por ora, script de operação `tmp/ops/liberar-dominio-xml.sh`).
