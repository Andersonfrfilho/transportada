-- Spec 252 (T3.2 / T6.1): índice por `(company_id, participant_id)` em `nfe_addresses`. A FK composta
-- `nfe_addresses_company_participant_fk` não cria índice no lado filho, então a junção
-- `nfe_participants` ⋈ `nfe_addresses` fazia `Seq Scan` na tabela inteira da empresa. Três leitores entram por ela:
-- a descoberta do worker (`holiday.provider.pull`), `listStopAddresses` (detalhe da viagem) e a junção do aviso de
-- feriado do motorista em `GET /me/trips/current`. Medida e planos antes/depois: `specs/252-*/evidence.md`
-- § "Índice de nfe_addresses".
--
-- Aditiva e só isto: um índice. Nenhuma coluna, constraint ou linha muda.
--
-- Custo de lock (`CREATE INDEX` comum, o único que cabe aqui):
--   * Toma SHARE em `nfe_addresses` até o COMMIT. Leitura segue; INSERT/UPDATE/DELETE esperam — isto é, a importação
--     de NF-e (`upload` e `distribution`) fica parada enquanto o lote constrói. Nenhuma escrita do motorista toca
--     esta tabela.
--   * O migrador (`runDatabaseMigrations`) aplica TODAS as migrations pendentes numa transação só: o SHARE fica
--     retido até o COMMIT do lote inteiro, não até o fim deste arquivo. `CREATE INDEX CONCURRENTLY` aborta dentro de
--     transação (25001), por isso não é usado.
--   * Medido (Postgres 18.4, 201 mil endereços, 28 MB de heap): 0,2 s e 9,8 MB de índice. A construção é linear no
--     tamanho da tabela; o `statement_timeout` de 8 s é o da API em pé, e é nela que uma escrita esperando o SHARE
--     falha (57014), não no migrador.
--   * `lock_timeout` limita só a ESPERA pelo lock (aborta a migration em 3 s em vez de enfileirar o tráfego atrás de uma
--     transação longa); não limita quanto tempo o SHARE fica retido.
--
-- PRODUÇÃO (exige aprovação própria do usuário; esta migration só foi autorizada para STAGING):
--   1. Medir `select count(*) from nfe_addresses` no banco certo (`Postgres-Hqfu`; o serviço "Postgres" é outro).
--   2. ANTES do PR que traz esta migration, criar o índice à mão, fora de transação e fora do migrador:
--        CREATE INDEX CONCURRENTLY IF NOT EXISTS nfe_addresses_company_participant_idx
--          ON nfe_addresses (company_id, participant_id);
--      (`psql` em autocommit; não escreve em transação, não bloqueia escrita.)
--   3. Conferir que ficou VÁLIDO: `select indisvalid from pg_index where indexrelid =
--      'nfe_addresses_company_participant_idx'::regclass;` deve dar `t`. CONCURRENTLY interrompido deixa índice
--      INVÁLIDO, que `IF NOT EXISTS` aceitaria calado: a verificação abaixo recusa o deploy nesse caso.
--      Se for `f`: `DROP INDEX CONCURRENTLY nfe_addresses_company_participant_idx;` e refazer o passo 2.
--   4. A migration então vira no-op (`IF NOT EXISTS`), só registra o journal.
--
-- Reverter: só o índice cai (rollback.sql); sem ele a consulta volta a varrer a tabela, nenhum dado se perde.
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "pg_index" WHERE "indexrelid" = to_regclass('nfe_addresses_company_participant_idx') AND NOT "indisvalid"
  ) THEN
    RAISE EXCEPTION 'O índice nfe_addresses_company_participant_idx existe INVÁLIDO: apague-o e recrie antes de migrar (passo 3 do cabeçalho desta migration)';
  END IF;
END
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nfe_addresses_company_participant_idx" ON "nfe_addresses" ("company_id","participant_id");--> statement-breakpoint
-- A pasta roda na mesma transação das migrations seguintes: devolve o prazo ao padrão da sessão.
SET LOCAL lock_timeout = DEFAULT;
