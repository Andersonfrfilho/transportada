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

## T006 — ícone em toda ação da viagem ✅

Catorze botões estavam sem ícone (separar, carregar e devolver na linha e no lote; limpar seleção;
registrar/enviar/cancelar ocorrência; corrigir/salvar/cancelar no mapa; ver comprovante), enquanto
seis já levavam. A mesma ação recebeu o mesmo símbolo nos dois lugares — `check`, `truck`,
`arrow-up`.

O contrato varre por glob os componentes de `trip` e `trip-financials`, então botão novo entra na
conferência sem ninguém lembrar. **Mutação:** removido um ícone → 2 reprovações; restaurado → verde.
Gates: 2405 testes do frontend, lint, typecheck, format.

## T007 — o número volta ao rótulo da parada ✅

O conserto do rótulo já existia (`stop-label.policy.ts`, 02/09 17:02). O que faltava era dado:
`trip_stops.label` é gravado **uma vez**, na criação, e nunca recalculado — parada criada antes
daquela hora guarda o texto velho, e foi isso que apareceu na tela.

O rótulo passou a ser derivado na leitura, de `address.label` (que `chooseNfeDestinationRow` já
monta com `buildStopLabel`). Uma consulta a mais por viagem, em lote, na forma de
`listDeliveryContacts` — nunca uma por parada.

⚠️ **Descartada a migration em SQL**: seria a quarta grafia de endereço nesta base, e a terceira já
divergiu em silêncio (T001). **Mutação:** servido o gravado → reprova; derivado → verde.
Gates: 4071 testes da API, lint, typecheck, format.

## T008 — emitir CT-e pela seleção ✅

`POST /trips/:id/cte-batches` emite o lote da **viagem inteira**: `createTripCteBatch` deriva as
notas de `selectPendingCteDocuments(readiness)` e não aceita subconjunto. Um botão na linha da nota
que dissesse "esta nota" e emitisse todas seria pior que o painel de hoje.

Decisão pendente: emitir por nota (mudança de API — corpo com `documentIds`, e o que fazer quando o
subconjunto some com o lote em voo) ou manter a emissão por viagem e apenas aproximar a ação da
lista.

**Decidido:** emitir pela seleção que a tela já tem, com a API aceitando o recorte.

- **API** (`933ed668`): o corpo aceita `tripDocumentIds` e **continua opcional** — ausente e vazio
  são a viagem inteira, que é o que o painel de prontidão faz. Recorte por `tripDocumentId`, que é
  o que a tela tem em mãos; o lote segue montado com `nfeDocumentId`. Escolha não pendente é
  recusada **nomeada** em `details`, nunca descartada.
- **Tela** (`39101a75`): o botão aparece na barra de seleção só quando o marcado tem CT-e a emitir.
  `PENDING_CTE_REASONS` é cópia por valor com contrato restatando a lista dos dois lados.

⚠️ **O primeiro contrato da tela era decoração.** A mutação que removia a checagem de
`expectedDocument` não reprovava nada: a razão pendente já barrava a NFS-e do único caso que a
exercitava. Só depois de entrar o caso que isola a condição — razão pendente com documento esperado
diferente de CT-e — a mutação passou a reprovar. Sem a exigência de mutação do goal, teria passado
por cobertura.

⚠️ **As edições da tela foram feitas na árvore errada.** `cd` relativo resolve contra o diretório
principal, que o shell restaura a cada comando — o trabalho caiu no checkout de `staging` em vez do
worktree. Ao mover, `git diff` saiu **resumido** pelo filtro do RTK, e o `git checkout --` que veio
depois apagou as alterações que eu acreditava ter salvo em patch. Foram refeitas com caminho
absoluto. Duas lições: caminho absoluto sempre, e saída de `git diff` filtrada não serve como
backup.
