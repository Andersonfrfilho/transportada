# Tasks — spec 340

- [x] T1 Tabela `integration_api_keys` + coluna `pickup_requests.integration_key_id` (migration `20261115150000`, rollback guardado, `prune-source.sql` = `empty`).
- [x] T2 Política da chave (geração, hash, leitura do Bearer) e casos de uso (criar, listar, revogar, autenticar) com auditoria sem a chave.
- [x] T3 Rotas de administração `/integration-keys` (`settings.manage`).
- [x] T4 Rotas `/integration/freight-quotes` e `/integration/pickup-requests[/:id[/cancel]]`, baldes por IP e por chave.
- [x] T5 Documento para o integrador: `docs/integracao/api-de-integracao.md`.
- [ ] T6 Webhook assinado entregue pelo worker (D8).
- [ ] T7 Tela de chaves no painel.
- [ ] T8 Conferir em staging: criar chave, cotar, pedir, aceitar no painel, consultar.
