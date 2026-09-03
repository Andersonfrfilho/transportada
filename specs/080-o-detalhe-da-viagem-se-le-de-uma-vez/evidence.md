# Evidência — 080

## T001 — por que a parada não tem coordenada

**Status:** investigação concluída em parte. Uma causa confirmada por leitura; a segunda exige
consulta ao banco de staging, que esta sessão não alcança (Docker fora do ar, MCP de Postgres sem
conexão).

### A hipótese inicial estava errada

Supus que só a sugestão de roteiro populasse `geocoded_addresses`. **Não é o caso:** existe a
rotina `geocoding.backfill` (`geocoding-backfill.routine.ts`), registrada no catálogo de jobs, que
varre `nfe_addresses` de participante `recipient`/`delivery` com CEP de oito dígitos e geocodifica
o que ainda não tem linha. Ou seja, a população existe e é independente da sugestão.

### A causa confirmada: a chave do endereço tem três grafias, e uma não tem contrato

A parada da viagem procura a coordenada por `address_key`. Essa chave é escrita em **três** lugares:

| onde                                                            | como                               |
| --------------------------------------------------------------- | ---------------------------------- |
| `api-transportada/src/trips/domain/stop-address-key.ts`         | TS, normaliza número               |
| `worker-transportada/src/routing/domain/pool-address-key.ts`    | TS, cópia com contrato de paridade |
| `worker-transportada/.../drizzle-pending-address.repository.ts` | **SQL cru, sem contrato**          |

As duas primeiras têm contrato comparando-as linha a linha. A terceira — a que **grava** — é SQL
dentro da consulta de endereços pendentes, e diverge:

- O TS mapeia `SN`, `S.N.`, `S/N` e `SEM NÚMERO` para a mesma chave `S/N`
  (`NO_NUMBER_PATTERN`). O SQL só troca **string vazia** por `S/N`: `SN` continua `SN`.
- O TS retira prefixo do número (`NUMBER_PREFIX_PATTERN`, para `Nº 123`) e colapsa espaço interno.
  O SQL não faz nem um nem outro.

**Consequência:** todo endereço cujo número não seja um token simples é geocodificado sob uma chave
que a parada nunca vai consultar. A coordenada existe na tabela, e o mapa continua vazio para
aquela parada — falha silenciosa, e invisível em teste de caminho feliz, porque `123` casa nas três
grafias.

### O que falta para fechar a T001

Consulta em staging comparando, para as paradas desta viagem, a chave que a API monta com as
chaves presentes em `geocoded_addresses`. Ela decide se o que morde aqui é a divergência acima ou
se a rotina simplesmente ainda não alcançou esses endereços (ela é paginada, com teto de lotes por
execução).

### Task que nasce daqui

Unificar a terceira grafia com as duas primeiras — e cobri-la com o mesmo contrato de paridade que
já existe entre as outras duas. Sem isso, o conserto do mapa fica de pé sobre uma chave que volta
a divergir na próxima mudança.
