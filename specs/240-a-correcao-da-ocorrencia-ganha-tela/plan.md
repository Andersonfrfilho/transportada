# Plano técnico

## Contexto e premissas

> **Revisado em 2026-10-02 pela Fase 0:** as leituras não publicam `corrections` nem
> `cancellation`. A Fase 0.5 acrescenta essa leitura à API (só leitura, sem migration, em lote).
> O texto abaixo é o plano original, válido para tudo o que não for a leitura.

Spec de uma app só: **nada muda na API**. Tudo o que a tela precisa já está servido, e a primeira
task é provar isso por chamada real antes de escrever componente — se algum detalhe do contrato não
bater com o que a 167 escreveu, é melhor descobrir na task 1 que na task 9.

O que foi conferido no código antes de planejar:

- `PATCH .../occurrences/:occurrenceId/items` e `POST .../occurrences/:occurrenceId/cancellation`,
  as duas sob `TRIP_MANAGE_POLICY`, com `Idempotency-Key` e limite de 60 em 300s
  (`trip.routes.ts:1721` e `:1743`).
- O corpo da correção chega como `{ items: [{ code, quantity?, unit? }] }` e é achatado em
  `productCodes` / `productQuantities` / `productQuantityUnits` (`occurrence.schema.ts:417`).
- O cancelamento é `{ reason }`, `strict` (`occurrence.schema.ts:429`).
- A resposta das duas rotas é a ocorrência, e a leitura devolve `corrections` e `cancellation`
  (`drizzle-occurrence-correction.repository.ts:350`).
- O painel **já tem os tipos**: `corrections?: readonly OccurrenceCorrection[]` e
  `cancellation?: null | OccurrenceCancellation` (`trip.types.ts:195`). A Fase 1 da 167 foi feita.
- Não há nenhuma chamada a essas rotas em `tripClient.service.ts`, nem string de correção nas
  traduções. É isso que falta.

⚠️ O `tasks.md` da 167 está com as **22 tasks desmarcadas**, incluindo as de API que claramente
foram executadas. A lista não serve como mapa do que existe; o código serve.

## Arquitetura e arquivos afetados

Só `apps/frontend-transportada`:

- `src/modules/trip/shared/tripClient.service.ts` — as duas chamadas novas.
- `src/modules/trip/queries/` — mutações com invalidação de detalhe, feed e linha do tempo.
- `src/modules/trip/pages/TripOccurrenceDetail.page.tsx` — os dois botões, o estado desabilitado
  com motivo e o histórico.
- `src/modules/trip/components/` — `TripOccurrenceCorrectionForm.component.tsx` (reaproveitando o
  formulário de itens que o registro já usa) e `TripOccurrenceCancelDialog.component.tsx`.
- `src/modules/trip/shared/tripOccurrenceDetail.service.ts` — as funções puras: quando os botões
  podem agir, e o texto do motivo quando não podem.
- `src/modules/trip/locales/trip.locale.json` e `trip.en.locale.json`.
- A marca de cancelada em `tripOccurrenceFeed.service.ts` e `tripOccurrenceTimeline.service.ts`.

A decisão de habilitar mora numa **função pura** do `.service.ts`, não espalhada em JSX: é ela que
o contrato cobra, e é o que impede a terceira cópia da mesma conta quando a marca de cancelada for
para o feed e para a linha do tempo.

## Contratos/API/eventos

Nenhum contrato novo. A tela consome o que existe:

| Chamada                                 | Corpo                                     | Resposta   |
| --------------------------------------- | ----------------------------------------- | ---------- |
| `PATCH .../occurrences/:id/items`       | `{ items: [{ code, quantity?, unit? }] }` | ocorrência |
| `POST .../occurrences/:id/cancellation` | `{ reason }`                              | ocorrência |

Erros tratados por código estável: tratativa aberta (409), já cancelada (409), teto de item (422),
quantidade inválida (400), ocorrência de outra empresa (404).

## Dados, migration e rollback

Nenhuma migration. Nenhuma escrita direta em banco. Se esta spec precisar de uma, o escopo
escorregou.

## Segurança e tenant

`trip.manage` é exigida pela API e repetida na tela apenas para **não oferecer** o que seria
recusado — a tela escondendo o botão nunca é a garantia (regra de segurança §8: a API valida
sempre). `companyId` continua do contexto. Motivo de cancelamento não vai para log do navegador.

## Idempotência e concorrência

`Idempotency-Key` por tentativa, gerada no cliente como as demais escritas do painel. Reenvio do
mesmo clique não cria correção dupla; dois operadores diferentes criam duas correções, e as duas
aparecem no histórico — desenho da 167.

## Observabilidade

Nada novo no servidor. No painel, o erro mostrado é o código estável, o que torna o relato do
usuário ("deu LEAD\_... na tela") suficiente para achar a causa.

## Estratégia de testes

- Contrato do painel para cada critério de aceite, com a resposta da API dublada.
- **CA03 e CA05 são os que merecem atenção**: afirmar o atributo `disabled` ou a existência da
  chave de tradução não prova nada. O contrato confere o **texto renderizado** do motivo e de cada
  uma das quatro mensagens de erro. Contrato de parede que afirma a fonte, e não o comportamento,
  já passou verde sobre regra arrancada nesta base.
- Mutação em duas: arrancar a condição de "tratativa aberta" tem de deixar a CA03 vermelha;
  trocar a mensagem de `409` pela genérica tem de deixar a CA05 vermelha. Execução vermelha
  registrada em `evidence.md`, não a afirmação de que falharia.
- Teste novo **entra na lista do `package.json`** da app, senão não roda.
- O comando é `bun run --cwd apps/frontend-transportada test`, nunca `bun test` cru — o cru varre
  junto os `.smoke.spec.ts` do Playwright e devolve dezenas de falhas que não são defeito.

## Riscos

- **O maior risco é de escopo**: a tela encosta em regra de negócio em cinco pontos (janela,
  cancelada, teto, histórico, e-mail). Qualquer um deles que "pareça errado" durante a execução é
  conversa para outra spec, não conserto aqui.
- O formulário de itens é reaproveitado do registro; se divergir, duas telas passam a editar o
  mesmo conjunto de maneiras diferentes.
- A marca de cancelada em três lugares é onde a conta se duplica — daí a função pura única.
