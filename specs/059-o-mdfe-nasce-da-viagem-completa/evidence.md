# 059 — O MDF-e nasce da viagem completa · evidência

> ⚠️ **Parcial. A spec NÃO está concluída.** O caminho manual está inteiro e verificado; o **gatilho
> automático não existe** — o evento `cte.authorized.v1` e o consumer não foram construídos. O que
> falta está listado no fim, e é a primeira coisa a ler.

## O que está pronto e verificado

| Task | O que entrou                                                                          |
| ---- | --------------------------------------------------------------------------------------- |
| T001 | ADR-0046, revisando a ADR-0023 por extenso; `fiscal-integration.md` com a regra escrita  |
| T002 | índice `cte_batch_items (company_id, nfe_document_id)` — o caminho da nota até o CT-e    |
| T003 | `trips.fiscal_readiness_state`, derivado, com o comentário dizendo que não é fonte       |
| T004 | unique parcial: **um manifesto vivo por viagem**                                        |
| T005 | `automatic_mdfe_on_completion`, desligado por padrão                                     |
| T006 | a prontidão por nota, com o motivo, numa consulta só                                    |
| T007 | o portão da emissão num lugar só, com quatro recusas nomeadas                           |
| T008 | `GET /trips/:id/fiscal-readiness`                                                       |
| T011 | o corpo do manifesto vira parcial: CT-e, veículo e condutores saem da viagem            |
| T013 | o painel de prontidão na tela de viagem                                                 |

## O que rodou

| Comando                                                | Resultado                          |
| ------------------------------------------------------ | ------------------------------------ |
| `make migration-test`                                  | **86** testes, 0 falhas             |
| `bun run --cwd apps/api-transportada test`             | **3284** contratos, 0 falhas        |
| `bun run --cwd apps/api-transportada test:integration` | **152** testes contra Postgres      |
| `bun run --cwd apps/frontend-transportada test`        | **2035** contratos, 0 falhas        |
| `typecheck` + `lint` + `build`                         | limpos; CSP inalterada              |

## O que cada verificação provou

| Decisão                                            | Como ela está travada                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Um manifesto vivo por viagem**                   | unique parcial exercitado contra Postgres nos dois sentidos: o segundo vivo é recusado, e depois de rejeitado a viagem manifesta de novo |
| A migration não cria a trava em silêncio           | ela confere antes e **falha nomeando as viagens** com dois manifestos vivos — qual vale é decisão humana                       |
| A prontidão responde por nota                      | contrato por motivo de bloqueio + integração com três desfechos fiscais reais (autorizado, rejeitado com cStat, sem CT-e)     |
| Autorizado vence tudo entre várias tentativas      | o `collapseByDocument` tem ranking, e a integração cobre a nota com tentativa rejeitada **e** documento autorizado            |
| O erro só aparece quando é o motivo                | nota autorizada depois de retry não mostra o `lastErrorCode` da tentativa que falhou                                          |
| **O manual também exige `dispatched`**             | contrato próprio, nomeado — é a premissa que esta spec fechou, e é ele que muda se a operação real for outra                  |
| Os CT-e saem da prontidão, não do corpo            | `documentIds` foi **removido** do schema da rota; contrato prova que o manifesto nasce da viagem                              |
| A recusa carrega o que falta                       | `details` do erro trazem nota e motivo — um `409` mudo mandaria o operador abrir a outra tela                                 |
| A tela não engole resposta estranha                | motivo e estado fora do vocabulário viram recusa: é a resposta que decide se o botão de emissão fiscal aparece                |

## Uma correção à spec, com o código como evidência

A **D4b** afirma que uma viagem carregada por `freight_calculations` "não tem CT-e por nota e portanto
não tem o que manifestar por este caminho". **Não é o caso.** `freight_calculations.nfe_document_id` é
`not null`, e o `cteAuthorizedExpression()` que já existia atravessa os dois vínculos. Uma viagem de
cálculo de frete **tem** nota e pode ter CT-e.

Tratá-la como beco sem saída faria exatamente o que a D4b queria evitar — viagem que some da lista sem
ninguém entender. A implementação segue o código; a spec fica anotada aqui.

## O que ficou de fora — e o primeiro item é grande

1. **O gatilho automático não existe.** Sem `cte.authorized.v1` e sem o consumer
   `trip-fiscal-readiness`, a última autorização **não acende nada**: o operador precisa abrir a
   viagem para ver a prontidão. As histórias P1 "a última autorização acende o botão" e P2
   "automático para quem escolheu" **não estão entregues**. `automatic_mdfe_on_completion` existe na
   tabela e **nada o lê** — a coluna está lá para a fase que falta, e uma empresa que a ligasse hoje
   não veria diferença nenhuma.
2. **`trips.fiscal_readiness_state` nunca é escrito.** Ele nasce `incomplete` e fica. Quem recalcula
   seria o consumer. Nada depende dele hoje — a consulta é a verdade —, mas o semáforo e o filtro da
   lista (T015) dependem, e por isso eles também não existem.
3. **Nenhuma notificação** (T012). "Ficou pronta", "emitido" e "divergiu" não saem.
4. **A lista de manifestos da viagem com XML e DAMDFE (T014, D4c) não existe.** É a única parte da
   spec que atende "fiscalização em barreira" e "por que esse não valeu?", e continua faltando.
5. **Sem E2E da nota ao manifesto autorizado** (T016). O caminho tem contrato e integração por
   pedaço; a costura inteira não foi exercitada de ponta a ponta.
6. **Encerramento automático do MDF-e** quando a viagem vai a `completed` — declarado fora de escopo
   pela própria spec, e registrado como dívida no `fiscal-integration.md`. Manifesto não encerrado é
   pendência na SEFAZ e trava o próximo.
7. **A validação de certificado válido antes de enfileirar** (caso extremo da spec) não entrou no
   portão: hoje quem recusa é a emissão, mais adiante.

## Auditoria de segurança (§15 do `code-standart.md`)

- Nenhuma chave de acesso em log; o que sobe do erro são código e motivo por nota, com id opaco.
- O filtro de tenant da prontidão é exercitado contra Postgres, não suposto.
- Nenhum valor arbitrário na tela nova; texto em `*.locale.json` nas duas línguas.
