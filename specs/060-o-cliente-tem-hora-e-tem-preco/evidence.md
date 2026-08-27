# 060 — o cliente tem hora e tem preço · evidência

> As dezesseis tasks estão fechadas. **Uma coisa que a spec pede não entrou, e é a primeira a ler:**
> a *página* pública do repasse (`/repasse/{token}`) não existe, porque a landing não vive neste
> repositório — as rotas anônimas que ela consome estão prontas e testadas. O resto está no fim.

## O que ficou de pé

| Task | O que entrou                                                                           |
| ---- | -------------------------------------------------------------------------------------- |
| T001 | ADR-0048, e as duas cláusulas em aberto respondidas                                    |
| T002 | cliente, contratante, janela, exceção e feriado do município                           |
| T003 | agendamento da parada, lançamento, regra recorrente, lote e trilha                     |
| T004 | a janela responde "abre?", com exceção do cliente vencendo o feriado                   |
| T005 | a máquina do repasse, com toda transição inválida varrida                              |
| T006 | cliente e contratante nascendo da nota, nos dois caminhos de importação                |
| T007 | as sete rotas do cliente, com busca por documento em igualdade exata                    |
| T008 | contratante e calendário de feriado por município                                       |
| T009 | agendamento da parada, e o despacho recusando pendência com `force` + motivo            |
| T010 | lançamento, regra recorrente e a fila de conferência                                    |
| T011 | o lote por contratante, o relatório e as decisões                                       |
| T012 | as rotas anônimas do lote por token                                                     |
| T013 | hora e protocolo no bolso do motorista, e a ocorrência que vira sugestão                |
| T014 | a tela do cliente e o editor da semana                                                  |
| T015 | a fila de conferência e o fechamento do período                                         |
| T016 | o ciclo inteiro contra Postgres                                                         |

## O que rodou

| Comando                                                | Resultado                       |
| ------------------------------------------------------ | ------------------------------- |
| `make migration-test`                                  | **86** testes, 0 falhas         |
| `bun run --cwd apps/api-transportada test`             | **3475** contratos, 0 falhas    |
| `bun run --cwd apps/api-transportada test:integration` | **166** testes contra Postgres  |
| `bun run --cwd apps/worker-transportada test`          | **742** contratos, 0 falhas     |
| `make worker-integration`                              | **59** testes contra Postgres   |
| `bun run --cwd apps/frontend-transportada test`        | **2084** contratos, 0 falhas    |
| `typecheck` + `lint` + `build`                         | limpos nas três apps            |

## O que cada decisão custou, e como ela está travada

| Decisão                                          | Como ela está travada                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| O cadastro nasce da nota, **sem regra**          | integração no worker: a segunda nota atualiza o nome visto e **não toca** em janela, taxa nem agendamento      |
| Erro no cadastro não derruba a importação        | a escrita corre em `SAVEPOINT` próprio — sem ele, o statement que falha aborta a transação e a nota não entra |
| Exceção do cliente vence feriado do município    | contrato da janela, nos dois sentidos (o CD que abre no feriado, e o que fecha em dia útil)                    |
| A conta do dia da semana não passa por `Date`    | vetor conferido à mão: bissexto, 2000 e 2100 — `new Date('2026-08-27')` é UTC e vira o dia anterior em SP      |
| `suggested` nunca alcança `submitted`            | a máquina varre a tabela **inteira** de estado × ação, não só o caminho feliz                                  |
| O despacho recusa parada sem agendamento         | contrato do portão **e** o E2E, onde o `409` acontece no meio da corrente                                      |
| Uma sugestão por nota e tipo                     | índice parcial — e o CHECK que exige nota na sugestão, sem o qual dois `null` não colidem                     |
| Dinheiro em `numeric` do começo ao fim           | 45,30 + 89,75 = 135,05 somados pelo Postgres; a tela também trata valor como texto                            |
| Quem aprovou é quem tinha o link                 | integração confere `decided_by_token` preenchido e `actor_user_id` **nulo**                                    |
| A página pública não vaza a base                 | o contrato procura id de viagem, id de nota e documento do cliente no corpo servido — byte a byte             |

## Dois defeitos que os testes acharam, e o que mudou por causa deles

1. **A dedupe da sugestão não deduplicava.** O índice parcial é
   `(company_id, trip_document_id, charge_type)`, e no Postgres **dois `null` não colidem**: sugestão
   sem nota escapava em silêncio. Entrou um CHECK — toda sugestão carrega a nota —, e o teste guarda
   os dois lados.
2. **`onSuccess: async` prendia o botão.** Um contrato que já existia no frontend pegou: `isPending`
   só cai quando a promise de `onSuccess` resolve, e aguardar a revalidação faz o operador ler
   trabalho pendente onde já não há — e clicar de novo, arriscando repetir a operação.

## O que ficou de fora

1. **A página pública do repasse não existe como tela.** A landing não vive neste repositório; o que
   entrou foram as **rotas anônimas** (`GET /public/extra-charge-batches/{token}` e `.../decisions`),
   testadas, e o painel interno explicando que o link nasce ao fechar o lote e gira quando ele é
   fechado de novo. Quem for construir a página consome essas duas rotas e nada mais.
2. **A tabela de clientes não implementa o contrato inteiro de `data-tables.md`** — ela tem filtro em
   estado, ordenação natural por id e paginação por cursor, mas não reordenação de colunas
   persistida, nem seleção em massa, nem filtro avançado com grupos E/OU. Foi proporcional ao uso:
   a tela existe para achar um cliente e preencher a regra dele, não para operar em lote. Filtro em
   **query param** (o que a doc exige para link compartilhável) também ficou de fora e é a primeira
   coisa a fazer se a tela crescer.
3. **O painel por cliente (P3) não existe**: tempo mediano medido, taxas do período e entregas fora
   da janela continuam sendo consulta, não tela. A D6 já dizia que a medição é derivada e não vira
   coluna — o que falta é quem a mostre.
4. **A exceção por data não tem tela.** A rota existe (`PUT /delivery-clients/:id/exceptions`) e o
   editor mostra a semana; cadastrar o feriado próprio do cliente ainda é chamada de API.
5. **`GET /delivery-clients/:id/metrics` não existe** — é a rota do P3, e ela caiu junto com o painel.
6. **O calendário de feriado municipal não tem tela**, pelo mesmo motivo: rotas prontas
   (`/municipal-holidays`), cadastro ainda por API.

## Auditoria de segurança (§15 do `code-standart.md`)

- Documento de pessoa (`tax_id`) nunca em log, e a busca é por **igualdade exata** — nunca `LIKE`,
  que permitiria varrer a base oito dígitos por vez.
- A superfície anônima nova serve **um** lote e não devolve identificador interno nem documento do
  cliente; token curto é recusado pelo banco (mínimo de 32 caracteres) e gira quando o lote refecha.
- Toda transição de lançamento é auditada em tabela append-only, com ator **ou** token — nunca um
  `userId` inventado para quem veio de fora.
- Filtro de tenant exercitado contra Postgres em todas as consultas novas.
