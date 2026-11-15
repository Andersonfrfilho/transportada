# Evidência — 339

## T0 — investigação (2026-11-15)

- `trip_stops` não guarda cidade (só `address_key` e `label`) e não tem `kind` de coleta: a parada física de coleta fica para
  a T6b; a T2 grava o vínculo (`pickup_requests.trip_id`) e o estado `scheduled`.
- O portal resolve o contratante pela sessão (`resolveContractorScope`); a rota nova segue o mesmo padrão e nunca recebe id de cliente.
- A permissão do portal é `pickup.request` (só o papel `contractor`); decidir é `pickup.manage` (`company-admin`, `operator`).

## T1 — banco

`pickup_requests` (aditiva, rollback guardado que recusa com pedido gravado), snapshot gerado por `db:generate`,
tabela na poda da staging (`window` por `created_at`, dado pessoal). Contratos: `static-migration`, `schema-snapshot`,
`staging-refresh-prune` — 63 passam.

## T2 — API

Política de estados (`requested → accepted|refused|canceled|expired → scheduled → done`), casos de uso, repositório com
`UPDATE … WHERE status = :from` (quem grava primeiro vence), rotas do portal e do escritório, permissões e testes
(`test/pickup-requests/pickup-request.contract.ts`, 10 passam; `authorization`, `rate-limited-routes`,
`contractor-portal-schema` ajustados). Painel: `pickup.request`/`pickup.manage` na lista ordenada e nos grupos de permissão.

## T5 e T6 (telas)

- Portal (`apps/frontend-client`): aba "Coletas", formulário, lista e cancelamento; `test/pickup-requests.contract.test.ts`.
- Painel (`apps/frontend-transportada`): workspace `/coletas` ("Pedidos de coleta e entrega", `pickup.manage`, grupo Operações): filtro por situação, lista, detalhe, aceitar (janela e valor opcionais), recusar (motivo obrigatório) e, depois do aceite, "Encaixar nesta viagem" nas viagens abertas ou "Criar nova viagem". `bun run test` do painel: 1496 pass, 0 fail; eslint limpo nos arquivos novos; contratos de menu e de acesso atualizados.
- ⚠️ Falta o print de design (claro/escuro, 1440/375) e criar a viagem já preenchida a partir do pedido (hoje leva à tela de Viagens).

## Pendente neste PR

T3 (cadastro do cliente anônimo, depende da 338), T6b (parada física na viagem), T7, T8.
