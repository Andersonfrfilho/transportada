# Evidência — 079

Execução em 2026-09-02, uma sessão, pelo plano ultragoal `spec-079` (23 histórias).

## O que entrou

| #           | O que                                              | Prova por mutação                                                           |
| ----------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| T001        | Peso da nota com a origem junto                    | Estimar o volume zerado dentro de nota declarada reprova                    |
| T002        | O peso na tela, com a marca de estimativa          | Apagar a marca reprova; segunda condição reprova                            |
| T004        | `GET .../proof` — o operador lê o comprovante      | Vazar a chave do objeto no corpo reprova                                    |
| T005        | Quatro estados da entrega, não dois                | Fundir "sem comprovante" com "não entregue" reprova                         |
| T006 · T025 | O painel do comprovante, aberto pela linha da nota | Desmontar o painel reprova                                                  |
| T010        | Progresso e previsão de término                    | Baixar o mínimo para uma amostra reprova                                    |
| T011        | Animação e previsão na barra que já existia        | Esconder a linha sem previsão reprova                                       |
| T012        | Projeção das paradas                               | Divisão por amplitude zero reprova; sumir com parada sem coordenada reprova |
| T013        | O mapa na tela, pelo primitivo `VectorMap`         | Descartar `stopsWithoutLocation` reprova                                    |
| T014        | Os quatro elementos novos em 375px                 | Largura fixa no mapa reprova                                                |
| T015        | A tela não lê dado pessoal do motorista            | Imprimir a CNH ao lado do nome reprova                                      |
| T017        | Número da nota no lugar do UUID                    | Devolver o UUID como caminho normal reprova                                 |
| T018        | Ícone por pendência fiscal                         | Recusa com ícone de "em andamento" reprova                                  |
| T019        | Os itens da nota                                   | Esconder os itens antes da entrega reprova                                  |
| T020        | Ocorrência com dono e catálogo                     | `trip.manage` para todo tipo reprova                                        |
| T021        | Vincular e agir antes da lista                     | Devolver as ações ao rodapé reprova                                         |
| T023        | Correção manual do ponto                           | Tirar `encodeURIComponent` reprova                                          |
| T024        | Reordenar a proposta                               | Deixar a distância sobreviver reprova                                       |
| —           | Polling com duas condições + botão                 | Regra só-por-estado reprova                                                 |
| —           | Guarda contra religar a escrita órfã               | Religar `main.ts` reprova                                                   |

**Respondidas sem código, por já existirem:** T003 (o desenho do veículo e a animação vieram na
spec 076), T007 (`nfe_products` não tem coluna de peso), T008 (cancelada pela T007), T009 (a
coordenada chega — medido: 51 813 m em staging).

## O que ficou de fora, e por quê

**Ocorrência de entrega (parte da T020).** É `trip.report`, e uma rota do escritório com essa
permissão deixaria o motorista alcançar **qualquer** viagem da empresa. Quem pegou foi
`test/driver-trip/me-routes.contract.ts`, que afirma que nenhuma rota do escritório é alcançável
pelo papel `driver`. Ela precisa da árvore `/me/current-trip`, que resolve o motorista e escopa pela
viagem ativa dele — task própria. A de **separação** entrou inteira.

**T022 — contato do cliente e contratante.** Atrás da ADR do contato do destinatário: telefone vindo
de XML fiscal usado para contato é finalidade nova sob a LGPD.

**T026 — coordenada por estado.** Atrás da feature de consentimento e de uma decisão de retenção. ⚠️
**Correção do que a task dizia:** ela afirmava exigir migration, e não exige — `trip_stop_events` já
guarda `latitude`, `longitude`, `accuracy_meters` e `captured_at` por evento. O bloqueio é de
privacidade, não técnico: este rastro **não se apagaria** com a viagem, ao contrário do que
`purgeByTrip` faz hoje (ADR-0050 §5), e seria rastro do trabalhador mais duradouro que o consentido.

**A cadeia órfã de `deliverDocument` não foi removida.** `test/integration/trip-repository.
integration.ts` a usa para preparar o estado "nota entregue" e provar que o `release` a recusa e que
o tenant vizinho não escreve na nota alheia. Trocá-la por um `UPDATE` cru contradiria a regra do
produto e enfraqueceria cobertura de isolamento por causa de uma limpeza. O contrato que impede a
religação entrou no lugar.

## A medição que fechou a sobreposição

**Em 2026-09-03, nos dois ambientes:** `trip_stop_occurrences` tinha **zero linhas**, e produção
tinha **zero viagens** e **zero devoluções**. O módulo de viagens nunca rodou em produção.

Foi essa medição que transformou o conserto pela metade em conserto inteiro. A primeira versão
mexeu só na tela — o CHECK do banco continuou aceitando `damaged_goods`, `address_not_found` e
`customer_closed` — porque **não havia como medir**: o MCP do Postgres não estava conectado, o banco
não tem proxy TCP público (e criar um para uma consulta seria expor o banco à internet), e listar as
variáveis do serviço imprimiria a `DATABASE_URL` no terminal, o que queima o segredo.

O caminho que funcionou foi `railway ssh`, que roda **dentro** da rede da Railway: a credencial
nunca sai do processo, e o banco continua sem exposição pública. Com o número em mãos — zero — o
CHECK encolheu junto com o catálogo, porque conviver com valor que a tela não oferece é deixar a
porta fechada por fora e aberta por dentro.

## ⚠️ O que não foi verificado

**A migration `20260902170000_trip_document_occurrences` não rodou contra Postgres.** O Docker não
estava no ar nesta sessão, e `make migration-test` falhou no `postgres-up`. O CHECK dos sete tipos é
conferido por **leitura do SQL** (`test/trip-occurrence/catalog.contract.ts`), o que pega tipo
esquecido mas **não** pega erro de sintaxe nem de constraint. **Rodar `make migration-test` antes de
publicar em produção.** O mesmo vale para `20260903100000_occurrence_notification_settings` e
`20260903120000_stop_occurrence_kind_overlap`, escritas na mesma sessão e pelo mesmo motivo sem
prova contra banco.

## O que a execução ensinou

**Sete tasks pediam para criar o que já existia** — `TripProgressBar`, o desenho do veículo com a
animação, `VectorMap`, a rota de correção do ponto, o `refetchInterval`, o comprovante do lado do
motorista, a projeção do portal. A conferência de existência deixou de ser recomendação e virou o
primeiro passo de toda task.

**Cinco contratos meus não pegavam o defeito, e só a mutação revelou.** Uma âncora `isWeightEstimated ?`
que o `&&` fazia sumir; `toInclude('<TripDeliveryProof')` que sobrevive a renomear o componente;
`toInclude('isReordered')` que passa com a constante `false`; um caso de ordenação que passava com a
implementação errada; e uma asserção de `aria-hidden` cobrada no consumidor em vez do primitivo.
Contrato que nunca viu o defeito é decoração — e escrevê-lo antes não basta, é preciso quebrá-lo.

**O contrato pegou dois defeitos meus antes de mim:** a previsão de término que apontava para o
passado num caminhão parado, e a rota de ocorrência de rua que abriria a viagem alheia ao motorista.

**Um script meu truncou 14 tasks do `tasks.md`** e o estrago só apareceu duas histórias depois, ao
procurar a T024. Restaurado do git. Edição de arquivo por script merece a mesma conferência que
edição de código.
