# Tasks — 278 A linha do tempo mostra o automático

> Gate: typecheck + lint por app, contratos e integração da API e do worker com `--env-file` sem skip, script `test` do
> painel, `prettier --check` nos arquivos tocados.

- [x] **T1** Motivo do evento (D1, D2): contrato vermelho de `resolveContractorReplyEventReason` (cópia idêntica no
      worker), constante `CONTRACTOR_REPLY_EVENT_REASONS` nas duas apps, CHECK do evento e migration aditiva com
      `rollback.sql` que recusa com dado; repositórios da API (portal) e do worker gravam o motivo. Integração da API e do
      worker.
- [x] **T2** Linha do tempo na API (D3–D6): contrato da política (ordem, marcos, `awaitingAttachment`), consulta das
      entregas ao motorista, da leitura e da conferência; integração contra Postgres com isolamento por empresa.
- [x] **T3** Painel (CA5): tipos, parser, frases e detalhes, filtro Automático, locales pt-BR/en; contratos.
- [x] **T4** Aba Tipos (D7): aviso "Configuração salva. Vale para as próximas ocorrências." depois da edição; contratos do
      hook e do painel.
