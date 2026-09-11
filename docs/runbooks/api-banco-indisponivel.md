# API sem resposta nas rotas que usam banco

Spec 137. Vale para a API (`apps/api-transportada`).

## Como aparece hoje

- Rota autenticada responde **503** com `{"error":{"code":"DATABASE_UNAVAILABLE",…}}` em até
  `DATABASE_QUERY_TIMEOUT_MS` (8 s por padrão), e o log traz `database_unavailable` com
  `correlationId` e `reason`:
  - `query_timeout` — a consulta (ou a espera por conexão livre) passou do prazo;
  - `pool_exhausted` — o Bun recusou a espera por conexão;
  - `connection_failed` — não houve conexão com o Postgres.
- `/health/ready` responde **503** em até 2 s com `dependencies.database: "down"`.

Se o sintoma for o antigo — pedido pendurado ~10 s e **resposta vazia sem log** —, a API está
rodando código anterior à spec 137: o socket fecha pelo `server.timeout` de 10 s antes de qualquer
resposta.

## O que medir

1. `curl -w '%{http_code} %{time_total}\n' <api>/health/live` e `/health/ready`. `live` 200 com
   `ready` 503 é banco (ou identidade/migrations — o corpo diz qual).
2. No Postgres, a contagem por estado. Conexões **ociosas** da API com pedidos pendurados é o padrão
   do incidente de 11/09/2026 (consultas presas no cliente, não no servidor):

   ```sql
   select state, count(*) from pg_stat_activity where datname = current_database() group by 1;
   ```

3. O `reason` do log `database_unavailable`: muitos `query_timeout` com o servidor ocioso aponta para
   o cliente; `connection_failed` aponta para rede/credencial/servidor fora do ar.

## O que ajustar

- `DATABASE_POOL_MAX` (padrão 10) — conexões por instância da API. Some todas as instâncias contra o
  `max_connections` do Postgres.
- `DATABASE_QUERY_TIMEOUT_MS` (padrão 8000, teto 9000) — prazo por consulta, também aplicado como
  `statement_timeout`. Tem de ficar abaixo dos 10 s da requisição.
- `DATABASE_CONNECT_TIMEOUT_SECONDS` (padrão 5) — abrir conexão nova.

⚠️ Não religue as instruções preparadas do Bun (`prepare`) sem medir de novo: com elas o Bun SQL
1.3.14 deixava consultas concorrentes sem resolver para sempre. ⚠️ Não use o `idleTimeout` do Bun
como prazo de espera por conexão: medido, ele recusa consulta que já está rodando.
