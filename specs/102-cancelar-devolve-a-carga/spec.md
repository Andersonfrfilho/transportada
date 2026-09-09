# Feature 102 — Cancelar devolve a carga

> Registrada em 2026-09-08, a partir de pedido do usuário olhando `/trips` com doze viagens, duas
> delas rascunhos de teste de 03/09.

## Problema e resultado

O pedido foi "select de apagar viagem". **Apagar não existe, e é de propósito:** não há
`DELETE /trips/:id`, e a única saída é `POST /trips/:id/cancel`. `trip_dispatch_snapshots` é
append-only, o resultado financeiro congela ao fechar, e a ADR-0043 chama cancelar de _incidente, não
fluxo_ — apagar faria a operação de um dia sumir da conta.

Mas o cancelamento tem um buraco que só aparece na segunda tentativa de usar a carga:

**`markCancelled` só troca `trips.status` para `cancelled`** (`drizzle-trip-route.repository.ts:109`).
Ele não toca em `trip_documents`. E quem decide se uma nota está disponível
(`findUnavailableDocumentIds`) olha **`released_at is null`**, nunca o status da viagem
(`drizzle-multi-vehicle-suggestion.repository.ts:93`).

Consequência medida na base do usuário: **cancelar uma viagem prende a carga dela para sempre.** A
nota não volta ao pool, não entra em sugestão nova, não pode ser vinculada a outra viagem — e nada
na tela diz por quê.

**Resultado esperado:** cancelar libera as notas ainda vinculadas, elas voltam a ser selecionáveis, e
a viagem cancelada continua no registro.

## D0 — O segundo buraco, achado só ao testar

⚠️ **Corrigir `markCancelled` não bastou, e a spec original não sabia disso.** Depois de cancelar as
viagens com o código novo, o operador **continuou sem conseguir selecionar as notas**.

A causa é uma consulta que a spec não tinha olhado: `findTripLinks`
(`cte-batches/infrastructure/cte-batch-selection.query.ts`), que diz à listagem de notas se a nota
está em viagem, **não filtrava `released_at`**. Ela devolvia o vínculo mais recente da nota,
liberado ou não. O cancelamento fazia a parte dele no banco — a nota estava solta —, e a tela
continuava recebendo `tripId` preenchido; a montagem de roteiro, que filtra `document.tripId ===
null`, a descartava como "já em viagem".

Medido em 2026-09-08, depois da migration: **0 notas presas** e **324 vínculos liberados ainda
visíveis**. O dado estava certo e a leitura estava errada.

A irmã `buildActiveNfseLinkFilters` fica **dez linhas abaixo no mesmo arquivo** e sempre filtrou
`cancelled_at is null` pelo mesmo motivo — era a de viagem que estava fora do padrão. O filtro virou
`buildActiveTripLinkFilters`, no mesmo molde.

**Lição de método:** a spec verificou a **escrita** (o cancelamento solta) e não a **leitura** (quem
pergunta se a nota está livre). Toda spec que muda o que um campo significa precisa varrer os
leitores dele, não só o escritor — `released_at` tinha dois, e um deles não sabia da regra.

## D1 — Liberar é marcar, nunca apagar

A linha de `trip_documents` **permanece**, com `released_at` preenchido e `stop_id` nulo — o mesmo
que `releaseTripDocument` já faz ao desvincular à mão (`drizzle-trip.repository.ts:427`).

É isto que atende "deixe no histórico da nota": o vínculo com a viagem cancelada continua gravado, e
é consultável. Apagar a linha destruiria a única prova de que aquela nota chegou a ser carregada.

⚠️ **Não existe tela de histórico da nota** — o módulo `nfe-documents` não lê `trip_documents`.
Construí-la é spec própria; aqui a garantia é que o dado sobrevive para ela existir depois.

## D2 — Uma transação, e a nota entregue não volta

O `UPDATE` das notas e o do status da viagem acontecem **na mesma transação**: uma falha no meio
deixaria a viagem cancelada com a carga presa, que é exatamente o defeito que esta spec corrige.

Só volta ao pool a nota **ainda vinculada**: `released_at is null` **e** `delivered_at is null`. Nota
já entregue não é carga disponível — ela chegou ao destino, e devolvê-la ao pool a ofereceria para
uma segunda entrega.

⚠️ A parada esvaziada é reconciliada **depois** de a nota perder o `stop_id`, nunca antes — senão ela
mesma se conta como razão para a parada continuar ocupada (a lição da spec 056).

## D3 — Cancelar continua idempotente, e liberar não muda isso

`cancelTrip` devolve `unchanged` para viagem já cancelada e **não escreve de novo**. Uma viagem
cancelada antes desta spec, com notas ainda presas, **não é destravada por um segundo cancelamento**.

⚠️ Isso deixa um passivo: as viagens já canceladas na base continuam segurando carga. Corrigi-las é
migration de dados, e ela **não** entra aqui por decisão explícita — é escrita retroativa sobre
vínculo, e quem a rodar precisa saber quantas notas vai soltar. Fica registrado como pendência.

## D4 — A tela ganha seleção e filtro, não um botão de apagar

- **Seleção em massa** na tabela de viagens, com ação de cancelar as selecionadas — o padrão que
  `docs/frontend/data-tables.md` exige e que esta tabela não tem (nenhum checkbox hoje).
- ⚠️ **O filtro de situação saiu do escopo, medido.** O molde de `CTE_ITEM_DEFAULT_HIDDEN_STATUSES`
  é um filtro **multivalor no servidor** (`statuses: readonly CteItemStatus[]`), e a viagem só tem
  `statusEq` — um valor só. Esconder no cliente, com paginação por cursor do servidor, produziria um
  contador errado ("12 na página" contando o que a tela não mostra), que é exatamente o tipo de
  número plausível-e-falso que este produto recusa. Fica para spec própria, junto do `statuses[]`
  na rota de listagem.
- Viagem `completed` não é oferecida para cancelar: `checkTripTransition` a recusa, e oferecer o que
  vai dar `409` é atrito puro.

## D5 — Confirmação nomeia o que vai acontecer com a carga

O diálogo nomeia a consequência para a **carga**, não só a mudança de status: quem cancela quatro
viagens está soltando a carga delas de volta ao pool, e é isso que muda o dia seguinte.

⚠️ **Sem número, e de propósito.** `Trip` (item da listagem) não traz contagem de notas — publicá-la
é mudança na rota de listagem, e buscar por viagem seriam N requisições ao abrir um diálogo. Dizer
"dezenas" ou estimar seria inventar. O texto afirma o **fato** (a carga volta ao pool, o vínculo
vira histórico) sem afirmar uma quantidade que a tela não sabe.

⚠️ **Liberar é irreversível para o vínculo:** cancelar por engano não devolve a nota à viagem; ela
vira uma viagem nova. Aceitável porque cancelar já é terminal, mas o texto do diálogo diz isso.

## Fora de escopo

- `DELETE /trips/:id` — recusado por desenho (ver Problema).
- Migration que solta a carga das viagens já canceladas (D3).
- Tela de histórico da nota (D1).
- Filtro de situação na listagem, que exige `statuses[]` na rota (D4).
- Contagem de notas por viagem na listagem, que o diálogo usaria (D5).

## Aceite

1. Cancelar libera as notas ainda vinculadas, na mesma transação do status.
2. A linha de `trip_documents` **permanece**, com `released_at` — contrato que falha se ela sumir.
3. Nota entregue **não** é liberada.
4. A nota liberada volta a ser oferecida pela sugestão e pelo vínculo manual — e **some da
   listagem como "em viagem"**, que é o que a D0 corrige.
5. A tabela de viagens tem seleção em massa e ação de cancelar; `completed` não é oferecida.
6. O diálogo diz que a carga volta ao pool e que o vínculo vira histórico.

## 🤖 Modelo recomendado

| etapa                                                       | modelo    |
| ----------------------------------------------------------- | --------- |
| A transação do cancelamento e a regra de quais notas voltam | `opus` 🧠 |
| Seleção, filtro, diálogo e rótulos                          | `sonnet`  |
