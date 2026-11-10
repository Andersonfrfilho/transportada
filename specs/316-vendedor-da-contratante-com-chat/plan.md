# Plano técnico — 316 O vendedor da contratante e o chat com ele

## Contexto e premissas

- Staging `origin/staging`, 2026-11-10. Cliente de entrega = `delivery_clients` (por `company_id` + `tax_id`); contratante =
  `contractors`; o portal da contratante é `frontend-client` com `contractor_portal_bindings` (ADR-0050).
- Conversa por ocorrência vem do módulo `occurrence-conversation` (183/211) com participantes; o `client` (283) e o canal por
  participante (287 RF6b) são o molde. WhatsApp pelo Evolution (281); chat direto 1:1 pela 308 (`groupInbound` "grupo de um só").
- E-mail pelo modelo padrão (274) e modelos do módulo de notificação (269/271/272). Proibido layout de e-mail em código.
- Premissas abertas: ver "Dúvidas" da spec. O plano segue as recomendações; mudar uma resposta muda só a tarefa apontada.

## Arquitetura e arquivos afetados

- **API** (`apps/api-transportada/src`): módulo novo `salespeople/` (domain/application/infrastructure/presentation, padrão
  `contractor-portal`); `database/salesperson.schema.ts`; ajustes em `occurrence-conversation/` (participante `salesperson`,
  catálogo de canais), no registro de ocorrência (resolução do vendedor) e em `whatsapp/` (reconhecimento do telefone, 308 D2).
- **Painel** (`apps/frontend-transportada`): tela Vendedores (cadastro, ligação, carteira); campo no editor de tipos
  (`/ocorrencias` aba Tipos); aba/coluna "Vendedor" na conversa da ocorrência; chip "sem vendedor".
- **Área do vendedor** (`apps/frontend-client`): módulo `salesperson` (lista da carteira, chat).
- **Worker**: envio por e-mail/WhatsApp pelo trilho existente (sem novo consumidor, salvo o que a T6 medir).
- **Realm** (`deploy/keycloak/realm.json` + reconciliação): papel `salesperson`. Nunca ajuste manual em produção.
- Documentação: `apps/api-transportada/CLAUDE.md`, `docs/ai-context/`, runbook (`docs/runbooks/producao.md` se tocar produção),
  ADR nova (papel `salesperson` e carteira N:N).

## Contratos/API/eventos

- `GET/POST/PATCH /v1/salespeople`, `.../:id/contractors/:contractorId` (ligação), `.../:id/clients` (carteira, em lote) — escritório.
- `GET /v1/me/salesperson/occurrences`, `GET/POST /v1/me/salesperson/occurrences/:id/messages` — vendedor (`salesperson.*`).
- `GET/POST /occurrences/:id/salesperson/messages` com `channel: 'whatsapp' | 'email'` — escritório (espelha RF1 da 287).
- `PUT /company-settings/occurrence-types`: campos `notifySalesperson`, `salespersonMailTemplateKey` (`.strict()`, ausente não altera).
- Eventos: `salesperson.linked`, `salesperson.client_assigned`, `occurrence.salesperson_notified`, `occurrence.salesperson_missing`.

## Dados, migration e rollback

Tabelas novas: `contractor_salespeople` (id, company_id, name, email, whatsapp_e164, status, membership_id nulo),
`contractor_salesperson_links` (company_id, salesperson_id, contractor_id; FK composta por empresa; único por par),
`contractor_salesperson_clients` (link_id, company_id, tax_id; **único por (contractor_id, tax_id) titular**), histórico de carteira.
Colunas novas no tipo: `notify_salesperson boolean not null default false`, `salesperson_mail_template_key text null`.
Migration aditiva; rollback derruba tabelas/colunas novas (teste `make migration-test`). "Endereço incorreto" passa a `true` por
**script de ops com aprovação**, não pela migration (liberação gradual como a 266).

## Segurança e tenant

Guarda no servidor em toda rota do vendedor: carteira ∩ contratantes ligadas; contratos negativos cruzando vendedor, contratante
e empresa. Papel `salesperson` não herda `contractor` nem `trip.*`. Dados de contato mascarados em lista/log. O bot só encaminha
número de vendedor à conversa; nunca menu. Convite e sessão pelo Keycloak versionado (sessão e prazos em `deploy/keycloak/realm.json`).

## Idempotência e concorrência

Envio por chave de mensagem (274/287). Atribuição de carteira com índice único + 409. Resolução do vendedor lê a carteira na
transação do registro e grava o resultado na ocorrência (a mudança posterior de carteira não reescreve).

## Observabilidade

Contadores de aviso enviado/sem vendedor/falhou por canal; log sem número, e-mail ou texto. Alerta de ocorrência "sem vendedor" no painel.

## Estratégia de testes

Contrato antes da implementação (carteira, roteamento, isolamento, `.strict()`); integração com Postgres (roteamento, webhook
WhatsApp reconhecendo vendedor, e-mail); frontend por app (script `test`, nunca `bun test` cru); smoke Playwright das telas em
claro/escuro, desktop/celular; roteiro em staging com número do Anderson. Arquivos de teste novos entram na lista explícita do `package.json`.

## Riscos

- Carteira inicial vazia: sem importação, tudo cai em "sem vendedor" (Dúvida 7).
- Mesmo telefone em dois papéis (motorista/vendedor) — ordem do reconhecimento da 308.
- Mexer no mesmo editor de tipos e no mesmo `PUT` de specs em voo (269/270): rebasear antes de abrir PR.
- Escopo grande: por isso as Fases abaixo, cada uma entregável sozinha em staging.
