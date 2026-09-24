# Feature 166 — Quantidade por item e multi-item por tipo de ocorrência

## Problema e resultado

A ocorrência de separação já aponta **quais** itens da nota foram atingidos (spec 161/164), mas não
diz **quanto**. "Item avariado — SHAMP MONANGE 325ML" não distingue uma peça amassada de uma caixa
inteira perdida, e é a diferença que decide o valor da tratativa (spec 164) e o que o embarcador
recebe no e-mail.

E a marcação de vários itens vale hoje para **todo** tipo de ocorrência, sem o cadastro poder dizer
o contrário. Há tipo que só faz sentido com um item.

Resultado: cada item apontado carrega uma quantidade com unidade (peça ou caixa), e o cadastro do
tipo decide se aquele tipo aceita mais de um item.

## Fora do escopo

- A conta de valor da avaria. A quantidade é o dado; a cobrança é a spec 164.
- Converter caixa em peça. O sistema **não** sabe quantas peças cabem na caixa desta nota, e
  inventar o fator produziria número crível e falso.
- Quantidade na ocorrência de rua (`delivery`). Só o galpão marca item hoje.
- Quantidade obrigatória. Ela é opcional: ocorrência sem contagem continua válida.

## Ordem de publicação — não é detalhe de implementação

⚠️ **O validador do frontend recusa resposta com campo que ele não conhece** (lista fechada em
`isTripOccurrence`). API à frente do bundle não é "degradar", é **quebrar**: a chamada responde 201,
grava tudo, e a tela diz que falhou. Foi o que aconteceu em staging em 22/09 às 19:03 — ocorrência e
foto gravadas, tela dizendo `TRIP_RESPONSE_INVALID`, e a segunda foto nunca enviada porque o id da
ocorrência foi jogado fora junto com a resposta.

Por isso a Fase 1 desta spec é só **tolerância no frontend**, publicada sozinha, antes de qualquer
campo novo sair da API.

## Histórias priorizadas

### P1 — O separador diz quanto foi

**Given** um tipo de ocorrência que aceita vários itens
**When** o separador marca dois itens da nota
**Then** cada um tem seu próprio campo de quantidade, com a unidade (peça ou caixa) à escolha, e
deixar em branco continua permitido.

### P2 — O cadastro decide se o tipo é de um item só

**Given** um tipo cadastrado com "aceita vários itens" desligado
**When** o separador registra uma ocorrência desse tipo
**Then** o campo de item aceita **um** item, e trocar a escolha substitui em vez de somar.

### P3 — Quem lê a ocorrência vê a contagem

**Given** uma ocorrência registrada com quantidade
**When** alguém abre a ocorrência na viagem
**Then** cada item aparece com a quantidade e a unidade; item sem contagem aparece sem número, nunca
com zero.

## Requisitos funcionais

- **RF1** `trip_document_occurrence_products` ganha `quantity` (numérico, escala 3) e
  `quantity_unit` (`unit` | `box`), ambos anuláveis. Os dois andam juntos: ou os dois existem, ou
  nenhum — quantidade sem unidade é número sem significado.
- **RF2** Quantidade gravada é maior que zero. Zero é "não aconteceu", e isso se diz não registrando
  o item.
- **RF3** `company_occurrence_types` ganha `allows_multiple_items` (booleano, padrão **`true`**). O
  padrão preserva o comportamento de hoje: nenhuma instalação muda de comportamento ao migrar.
- **RF4** O registro aceita a quantidade por item, alinhada à lista de itens já existente.
  Comprimento divergente entre as listas é `400`, nunca alinhamento por adivinhação.
- **RF5** A resposta de registro e a leitura da ocorrência publicam `products`: `{ code, quantity,
unit }` por item. `productCodes` **continua saindo**, inalterado — é o que os bundles antigos
  leem.
- **RF6** O frontend aceita `products` como chave **opcional** antes de a API mandá-la (Fase 1), e
  ignora o que não conhece nesse campo.
- **RF7** A tela de registro mostra um campo de quantidade por item marcado, com seletor de unidade.
  Em branco é o padrão.
- **RF8** Com `allows_multiple_items` desligado, o campo de item vira seleção única.
- **RF9** O cadastro de tipos de ocorrência ganha o interruptor "aceita vários itens".
- **RF10** Textos em pt-BR; en onde a seção já existir.

## Requisitos não funcionais

- Migration **aditiva**: colunas anuláveis e coluna com padrão. Sem reescrever linha existente.
- `companyId` do contexto autenticado, como todo o resto.
- Nenhuma quantidade em log.

## Casos extremos e falhas

- **Ocorrência antiga**: itens sem quantidade continuam válidos e aparecem sem número.
- **Tipo vira de item único com ocorrências antigas de vários itens**: o passado não é reescrito. A
  restrição vale para registro novo.
- **Quantidade sem item**: impossível pela forma do payload — a quantidade é do item.
- **Unidade desconhecida** vinda do cliente: `400`, sem cair em `unit` por padrão.
- **Bundle antigo** depois da Fase 2: continua funcionando, porque `products` é chave nova e o
  validador tolerante da Fase 1 já estará publicado.

## Critérios de aceite

- **CA01** Migration aplica e reverte em Postgres descartável (`make migration-test`).
- **CA02** Gravar item com quantidade e unidade persiste os dois; sem quantidade persiste dois nulos.
- **CA03** Quantidade sem unidade (ou o contrário) é recusada pelo banco e pela API.
- **CA04** Quantidade zero ou negativa é `400`.
- **CA05** Listas de tamanho diferente entre itens e quantidades é `400`.
- **CA06** A resposta traz `products` **e** `productCodes`.
- **CA07** O validador do frontend aceita a resposta com `products` e também sem ela.
- **CA08** Tipo com `allows_multiple_items` falso registra com um item; dois itens é `422`.
- **CA09** A tela mostra um campo de quantidade por item e envia o que foi digitado.
- **CA10** O cadastro de tipos salva e lê o interruptor.

## Dúvidas

Nenhuma. As três decisões abertas foram respondidas em 22/09: quantidade **por item**, unidade
**peça ou caixa à escolha**, multi-item **configurado no tipo**.
