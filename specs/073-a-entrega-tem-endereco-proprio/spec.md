# Feature 073 — A entrega tem endereço próprio

## Problema e resultado

A NF-e tem dois endereços de destino, não um. `<enderDest>` é onde o **cliente** está
cadastrado; `<entrega>` é onde a **carga** deve ser deixada, e o emitente só o preenche
quando os dois divergem — venda faturada para a matriz com entrega na loja, para o centro
de distribuição, para a obra.

Nosso importador **já grava os dois**: `resolvePartyByRole` mapeia `document.delivery` para o
papel `delivery`, e a linha entra em `nfe_participants` com o endereço dela em
`nfe_addresses`. O dado está no banco desde sempre.

**Ninguém o lê.** Todo consumidor que decide _para onde o caminhão vai_ filtra
`role = 'recipient'` e ignora a existência do papel `delivery`:

| onde                                                                      | o que decide                           |
| ------------------------------------------------------------------------- | -------------------------------------- |
| `trips/infrastructure/nfe-destination-address.support.ts`                 | a parada da viagem                     |
| `routing/infrastructure/drizzle-route-optimization.repository.ts`         | a parada proposta pelo solver          |
| `mdfe-manifests/infrastructure/mdfe-candidate-document.query.ts`          | o **município de descarga do MDF-e**   |
| `delivery-clients/infrastructure/unscheduled-stop.query.ts`               | a parada sem janela                    |
| `delivery-clients/infrastructure/drizzle-delivery-charge.repository.ts`   | a parada do repasse                    |
| `trips/infrastructure/drizzle-delivery-address-override.repository.ts`    | o endereço-base do desvio              |
| `geocoding-backfill/infrastructure/drizzle-pending-address.repository.ts` | qual endereço se geocodifica adiantado |

⚠️ **Dois candidatos saíram da lista na execução da Fase D.**
`unscheduled-stop.query.ts` e `drizzle-delivery-charge.repository.ts` pareciam decidir parada e não
decidem: **nenhum dos dois lê `nfe_addresses`**. Eles juntam o participante só para chegar ao CNPJ e,
por ele, ao cadastro do cliente de entrega (spec 060). Convertê-los faria a busca casar pelo
documento de quem recebe a carga no galpão — cadastro que quase nunca existe —, e a nota sumiria em
silêncio da consulta que **impede o despacho** por agendamento pendente. Os dois foram para a lista
de fronteira do CA7, com contrato afirmando que continuam sem ler endereço.

Na nota com `<entrega>`, os cinco restantes apontam para o lugar errado. O roteiro leva o
motorista ao cadastro do cliente, a geocodificação paga a coordenada da rua errada, e o
MDF-e declara à SEFAZ um município de descarga que não é o da descarga.

O resultado desta feature: **quando a nota traz `<entrega>`, é ela que manda em tudo que é
físico** — e só nisso. Quem é o cliente, quem paga, quem é o tomador do frete e quem entra
no CT-e continua sendo o destinatário.

⚠️ Nenhuma das 345 notas reais medidas em 2026-09-01 (lote `ID1010506`, um cliente, 100% SP)
traz `<entrega>`. A ausência de sintoma **não** é ausência de defeito: `<entrega>` é o caso
normal em distribuição, e o primeiro emitente que o usar quebra sem aviso — sem erro, sem
log, com o motorista parado na porta errada.

## Fora do escopo

- **Tudo que é fiscal ou comercial do destinatário.** Seleção de lote de CT-e, tomador da
  NFS-e, endereço do tomador, faturamento, regra de frete, portal do contratante e a listagem
  de notas continuam lendo `recipient`. `<entrega>` não muda quem é o cliente.
- **`<retirada>` (`pickup`).** É o outro extremo do mesmo par e tem as mesmas perguntas, mas
  a coleta não é o problema medido e mistura o escopo. Fica registrado, não implementado.
- **Recalcular parada de viagem já criada.** Ver D3.
- **Tela nova.** O operador não escolhe qual endereço vale; o fisco já escolheu.

## Histórias priorizadas

### P1 — A parada da viagem é o endereço de entrega

**Given** uma NF-e com `<entrega>` num CEP diferente do `<enderDest>`
**When** o separador vincula a nota a uma viagem
**Then** a parada é agrupada pelo endereço de **entrega**, e uma nota do mesmo cliente sem
`<entrega>` não cai na mesma parada.

### P2 — O MDF-e declara o município da descarga real

**Given** a mesma nota
**When** ela entra num manifesto
**Then** o `cMunDescarga` é o município do `<entrega>`, não o do cadastro do cliente.

### P3 — A geocodificação paga o endereço certo

**Given** a mesma nota
**When** a rotina de população adiantada roda
**Then** a chave geocodificada é a do endereço de entrega, e o solver recebe a coordenada dele.

### P4 — O desvio manual continua vencendo

**Given** uma nota com `<entrega>` e um `delivery_address_overrides` gravado para o vínculo
**When** a parada é resolvida
**Then** vence o desvio — decisão de pessoa está acima de dado fiscal, e a ordem é
`desvio manual → <entrega> → <enderDest>`.

## Requisitos funcionais

- **RF1** — Uma função só resolve o endereço físico de uma NF-e, e todo consumidor da tabela
  acima passa a chamá-la. Ela devolve o participante `delivery` quando existir com endereço
  utilizável, e `recipient` caso contrário.
- **RF2** — "Endereço utilizável" é o mesmo critério que a parada já usa hoje
  (`buildStopAddressKey` consegue montar chave: município, CEP e número). `<entrega>` presente
  mas incompleto **cai para o destinatário** — meio endereço é pior que o endereço do cadastro.
- **RF3** — A resolução é uma junção SQL, não um segundo `select` por nota: os consumidores são
  consultas de listagem e o N+1 aqui é caro (ver `code-standart.md` §15).
- **RF4** — A origem do endereço é **legível**: quem consulta uma parada sabe se ela veio de
  `<entrega>` ou de `<enderDest>`. Sem isso, "o roteiro está errado" é indepurável.
- **RF5** — A precedência do desvio manual (`delivery_address_overrides`) não muda: ele
  continua vencendo os dois.
- **RF6** — O `cMunDescarga` do MDF-e sai da mesma resolução (RF1).
- **RF7** — A rotina de população adiantada da spec 069 passa a enfileirar o endereço
  resolvido, não o do destinatário.
- **RF8** — Nenhum consumidor **fiscal ou comercial** muda de papel. A lista do "Fora do
  escopo" é contrato: um teste falha se um deles passar a chamar a resolução da RF1.

## Requisitos não funcionais

- **RNF1** — Nenhum campo de endereço em log, em nível nenhum (`security.md` §1). Vale para a
  origem da RF4: ela é o rótulo `delivery`/`recipient`, nunca o endereço.
- **RNF2** — A resolução respeita `company_id` como toda consulta do produto; contrato negativo
  de isolamento em cada consulta tocada (`CLAUDE.md`, regra de repositório).
- **RNF3** — Custo de consulta não regride: a listagem de notas e a seleção de parada seguem
  numa consulta só.

## Casos extremos e falhas

- **Nota sem `<entrega>`** — o caso de 345/345 medidos. Comportamento idêntico ao de hoje; é o
  que garante que esta feature não é uma migração.
- **`<entrega>` igual ao `<enderDest>`** — emitente que preenche os dois com o mesmo endereço.
  A chave de parada é a mesma, então nada muda; não vale código para detectar.
- **`<entrega>` sem número, ou sem CEP** — cai para o destinatário (RF2).
- **`<entrega>` em UF fora do extract OSRM** — problema da spec 069, não desta: a coordenada
  desce a cascata e a parada entra marcada. Aqui só se troca _qual_ endereço desce a cascata.
- **Nota já vinculada a viagem despachada** — congelada, ver D3.
- **Duas notas do mesmo cliente, uma com `<entrega>` e outra sem** — viram **duas paradas**, e é
  o certo: são dois portões.

## Critérios de aceite

- **CA1** — Nota com `<entrega>` divergente vincula numa parada agrupada pelo endereço de
  entrega. (P1)
- **CA2** — Nota sem `<entrega>` mantém exatamente a parada de hoje. (regressão)
- **CA3** — `<entrega>` incompleto cai para o destinatário. (RF2)
- **CA4** — O desvio manual vence `<entrega>`. (P4)
- **CA5** — O `cMunDescarga` do MDF-e é o do `<entrega>`. (P2)
- **CA6** — A chave enfileirada pela população adiantada é a do endereço resolvido. (P3)
- **CA7** — Contrato de fronteira: nenhum consumidor fiscal/comercial da lista do "Fora do
  escopo" chama a resolução da RF1. (RF8)
- **CA8** — Contrato negativo de isolamento em cada consulta tocada. (RNF2)
- **CA9** — Nenhum campo de endereço aparece em log. (RNF1)
- **CA10** — A origem (`delivery`/`recipient`) é observável na parada. (RF4)

## Decisões

- **D1 — `<entrega>` vence `<enderDest>` quando presente e completo.** É a semântica da NF-e: o
  emitente só emite `<entrega>` quando ele difere, e a SEFAZ trata o `cMunDescarga` do MDF-e
  como o município da entrega efetiva. Não há escolha de operador aqui.
- **D2 — Não há backfill, porque não há dado — e o caminho de escrita ainda não foi provado.**
  Medido em produção em 2026-09-01: 1628 notas, **zero** participantes `delivery` (e zero
  `pickup`); só `recipient`, `emitter` e `carrier`, 1628 cada. O papel está no importador desde
  `4e74a25e` (spec 013, 2026-07-28), antes de todas elas — então o zero é ausência de
  `<entrega>` nas notas, não código faltando. Confirma a amostra de 345 notas reais (0/345).
  ⚠️ Consequência: **o caminho de escrita nunca rodou contra nota real.** Provar que o
  importador persiste o papel `delivery` é pré-requisito de converter qualquer leitor — sem
  isso, sete consumidores passariam a ler uma linha que talvez nunca seja escrita. É a T002.
  O parser, esse, já foi medido: `importarNfeXml` sobre uma nota real com `<entrega>` injetado
  devolve o endereço completo, com município e CEP divergentes do destinatário.
- **D3 — Viagem já despachada não recalcula parada.** `dispatched` é porta de não-retorno
  (spec 056): o roteiro congela em `trip_dispatch_snapshots` e o motorista já está na rua.
  Trocar o endereço de uma parada em trânsito é incidente, não correção. Viagem em `draft`,
  `route_planned` ou `separating` recalcula ao vincular a próxima nota, pelo caminho normal.

## Dúvidas

Nenhuma bloqueante.
