# Plano técnico — Feature 318

## Contexto e premissas

- Aviso automático hoje: `occurrence-conversation/application/send-automatic-occurrence-mail.use-case.ts` (spec 183 T802).
  O contato já tem `preferredChannel: 'email' | 'whatsapp'`, mas WhatsApp "ainda não envia": cai no e-mail.
- Envio em grupo com marca já existe: `whatsapp/infrastructure/evolution-mention-text.gateway.ts` (spec 292).
- Evolution só em staging. Meta oficial não posta em grupo.

## Arquitetura e arquivos afetados

- Novo: política de canal da contratante (`resolveOccurrenceNoticeChannel`) em `occurrence-conversation/domain`.
- Novo: porta `OccurrenceGroupNoticePort` + adapter sobre o gateway do Evolution (`whatsapp/infrastructure`).
- Alterado: o caso de uso do aviso automático decide o canal depois de achar a contratante; `whatsapp_group` vai ao
  grupo, `email` segue igual. Resultado ganha `outcome: 'sent_group'` e motivos de falha.
- Alterado: tela da contratante no painel (canal, grupo, número, reserva, teste) com componentes padrão.

## Contratos/API/eventos

- `GET/PUT /contractors/:id/occurrence-notice-channel` (permissão de gestão de contratante).
- `POST /contractors/:id/occurrence-notice-channel/test` envia a mensagem de teste ao grupo.
- Lista de grupos: reaproveita a rota de grupos do Evolution da ficha do motorista.

## Dados, migration e rollback

- Tabela `contractor_occurrence_notice_channels` (`company_id`, `contractor_id`, `channel`, `group_jid`, `mention_phone`,
  `email_fallback`); CHECKs de canal, de `group_jid` e de telefone; único por contratante e por grupo.
- Migration aditiva; padrão `email` não muda ninguém. Rollback: derrubar a tabela (nada depende dela fora do aviso).

## Segurança e tenant

- Toda leitura/escrita por `company_id`. Telefone e `group_jid` fora de logs. Permissão exigida na rota.

## Idempotência e concorrência

- Chave `occurrence-auto-mail:` reaproveitada; reenvio com a mesma chave não posta de novo.

## Observabilidade

- Resultado (enviado, falha, reserva) na linha do tempo da ocorrência; alerta à operação quando esgotar tentativas.

## Estratégia de testes

- Contrato antes do código: canal grupo não envia e-mail; canal e-mail inalterado; idempotência; falha vira reserva.
- Teste do gateway com `fetch` injetado; teste de migration (CHECKs); painel com prints (claro/escuro, desktop/celular).
- Roteiro manual em staging com grupo de teste.

## Riscos

- Evolution é não oficial (risco de bloqueio do número; volume baixo). Dependência de staging até a decisão de produção.
