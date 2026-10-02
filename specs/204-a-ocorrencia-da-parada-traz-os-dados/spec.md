# Feature 204 — A ocorrência da parada traz os dados

- **Origem:** pedido do usuário em 2026-09-25, no "Deu problema" da parada na app do motorista.
  **Revisada** no mesmo dia depois da crítica (sete achados MAJOR) e das respostas do usuário: a lista
  de taxas fica em `company_occurrence_types`, o recibo é sempre obrigatório, e a taxa confirmada vira
  custo da viagem.
- **ADR:** `docs/adr/0086-a-cobranca-da-parada-chega-com-valor-e-a-espera-conta-da-chegada.md`
  (proposta; vira `aceita` na T0.1).
  - Revisa a **ADR-0045 §6.1** só em `unexpected_charge` e só no valor.
  - **Não** revisa a 060 D4: quem lança continua sendo o escritório.
- **Depende de:** spec **209** ("a foto da ocorrência não vira canhoto", P0 do orquestrador). A pasta
  está criada e ainda vazia em 2026-09-25. Ela entrega:
  - `attachmentObjectId` em qualquer motivo de `POST /me/trips/current/stops/:stopId/occurrences`;
  - a rota de upload por parada;
  - uma forma só de item de ocorrência de parada com foto, e um `send` só;
  - "fila cheia → o relato sobe sem a foto, com aviso".

  Esta spec **não recria** nada disso.

- **Numeração:** 204 e ADR-0086, conferidos em 2026-09-25 com `git fetch`, `git log --all`, `ls specs/`
  e os worktrees de `git worktree list`. A ADR-0085 fica reservada para a 203.

## Problema e resultado

Dois motivos do "Deu problema" chegam ao escritório sem o dado que ele precisa para agir.

1. **"Cobrança inesperada" nunca vira cobrança quando vem do motorista.**
   - A app manda `documentId: null` na ocorrência de parada (`DriverTripWorkspace.page.tsx:466`), e sem
     nota não há sugestão (`report-stop-occurrence.use-case.ts:145-153`). A taxa não aparece em
     `/repasses`.
   - Quando o escritório informa a nota, a sugestão nasce na categoria `other` com `'0'`
     (`suggest-delivery-charges.use-case.ts:68-79`).
   - O recibo, quando fotografado, sobe como canhoto da primeira nota pendente. A 209 tira a foto dessa
     trilha.
2. **"Espera longa" não diz quanto tempo.** `long_wait` só grava e avisa ("Espera longa na parada X às
   14:25"). O motorista marcou "Cheguei" às 13:05, e ninguém faz a conta.

**Resultado:**

- A cobrança chega com:
  - **tipo da taxa**, escolhido numa lista que a empresa cadastra junto dos tipos de ocorrência;
  - **valor obrigatório** em R$;
  - **recibo obrigatório**.
- O valor entra como **valor sugerido**. A cobrança fica `suggested` até o escritório confirmar e, uma
  vez confirmada, **entra na margem da viagem**.
- A espera chega com a **chegada de referência** e a **duração** até o toque. O motorista vê "Esperando
  há 1 h 20 min, desde a chegada às 13:05". O escritório vê a duração na ocorrência e no sino.
- Nada disso trava a entrega nem perde relato. Sem rede, tudo vai para a fila.

## O que já existe (conferido no código em 2026-09-25)

| Peça                              | Onde                                                                                                                                                | Uso aqui                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `trip_stop_occurrences`           | `api/src/database/trip.schema.ts:1159-1271`                                                                                                         | ganha hora do toque, valor, tipo congelado e espera             |
| motivos da parada                 | `TRIP_STOP_OCCURRENCE_KINDS` (`trip.schema.ts:1150-1156`)                                                                                           | não muda                                                        |
| cadastro de tipos de ocorrência   | `company_occurrence_types` (`trip.schema.ts:1898-1987`), `GET`/`PUT /company-settings/occurrence-types`, `OccurrenceTypeCatalogPanel.component.tsx` | ganha a etapa `charge`: a lista de taxas mora aqui              |
| leitores de `stage`               | todos comparam com valor positivo (ADR-0086 §2)                                                                                                     | um tipo `charge` fica fora deles sem mudança                    |
| bootstrap do catálogo             | `seedOccurrenceTypeCatalog`, `shared/occurrence-type-catalog.constant.ts` (a 208 mexe nele)                                                         | molde do seed da etapa `charge`, com constante própria          |
| sugestão de cobrança              | `suggest-delivery-charges.use-case.ts`; `delivery_charges` (`delivery-client.schema.ts:386-541`)                                                    | nasce do relato, com vínculo à ocorrência                       |
| dedupe da 060 D4c                 | `delivery_charges_suggested_unique` e `transition-trip-document.use-case.ts:152-157`                                                                | passa a valer só para a regra; a regra pula quando já há relato |
| lançamento manual                 | `POST /trips/:id/documents/:documentId/charges` (`delivery-charge.routes.ts:33`, `deliveryChargeRecordSchema`, JSON)                                | ganha `stopOccurrenceId` para o "recibo pendente"               |
| custo da viagem                   | parcela `delivery_charges` (`read-trip-valuation.use-case.ts:531-535`; `trip-valuation.query.ts:467-479`)                                           | já soma o que foi confirmado; nada novo                         |
| hora limitada do aparelho         | `resolveTimeReference` (`delivery-proof-punctuality.policy.ts:60-71`); `missingAfterHours` (`company_delivery_proof_settings`, 24 por padrão)       | molde da trava de `occurredAt`                                  |
| dia fiscal                        | `formatFiscalDay` (`api/src/shared/fiscal-day.service.ts`, `America/Sao_Paulo`)                                                                     | `charged_on` do relato                                          |
| chegada                           | `trip_stop_events` (`captured_at`, `created_at`); `trip_stops.arrived_at` (hora do servidor)                                                        | ponta inicial da espera                                         |
| avisos                            | templates no banco; seed só insere o que falta (`notification-template-seed.service.ts:52-80`)                                                      | duas chaves novas                                               |
| feed, linha do tempo, `/repasses` | `trip-occurrence-feed.query.ts:379-471`, `trip-timeline-stop.query.ts:222-241`, `ExtraChargeWorkspace.page.tsx:66-144`                              | mostram os campos novos                                         |
| máscara de R$                     | painel: `decimalAmount.service.ts` (`maskTypedAmount`, `TYPED_AMOUNT_MAX_DIGITS = 15`)                                                              | cópia por valor na app, com teto de 7 dígitos                   |
| duração                           | painel: `formatDuration` (`assemblyLeg.service.ts:152-158`)                                                                                         | cópia por valor na app                                          |
| redução e limites da foto         | `reduceOccurrencePhotoToJpeg`; `occurrence-attachment.policy.ts` (512 KiB imagem, 896 KiB PDF)                                                      | o recibo                                                        |

**Não existe, e esta spec cria:**

- a etapa `charge` no cadastro;
- a hora do toque, o valor e a espera na ocorrência;
- a sugestão a partir do relato do motorista.

**Não existe, e esta spec não cria:** cobrança de estadia (D12).

## Fora do escopo

- **Rota de upload por parada, `attachmentObjectId`, a forma do item com foto e a foto fora da trilha de
  canhoto.** É a spec 209, pré-requisito.
- **Cobrança de estadia a partir da espera** (D12).
- **Repartir uma taxa entre notas.** O escritório reparte à mão.
- **O diálogo "em nome de" do escritório** (`TripStopOccurrenceDialog.component.tsx`). Ele continua sem
  valor, e o escritório lança pela rota manual.
- **O motorista anexar o recibo depois** do relato com recibo pendente. Também não entra o escritório
  anexar o papel digitalizado: a rota manual é JSON.
- **O módulo legado `/minha-viagem` do painel** (ADR-0075 §6). Ele manda o corpo antigo, que continua
  aceito.
- **`toDeliveryDate` (UTC) da regra recorrente** (`transition-trip-document.use-case.ts:155`). Ela tem o
  mesmo defeito de fuso do D13 e fica como continuação.
- **Taxa `rejected` pelo contratante sai da margem** (`trip-valuation.query.ts:478`), embora a
  transportadora a tenha pago. Registrado como continuação.
- **`occurredAt` no "Cheguei".** A chegada sem GPS usa a hora do servidor (R2). Levar a hora do toque
  também para a chegada é continuação, para a 196 ou a 205.

## Decisões

- **D1 — O motorista informa o valor, e ele é sugestão.**
  - O valor é obrigatório em `unexpected_charge`, com máscara de R$, e é gravado em `numeric(14,4)`.
  - Ele vira `amount` de `delivery_charges` `suggested`, origem `occurrence`.
  - O escritório confirma pela fila, com o valor editável.
- **D2 — A lista de taxas é a etapa `charge` de `company_occurrence_types`.** A decisão é do usuário
  (junto dos tipos de ocorrência); o desenho é da ADR-0086 §2.
  - A tabela ganha a coluna `delivery_charge_type` (categoria do relatório).
  - Um CHECK de forma fixa, para tipo `charge`: `attachment_mode = 'required'`, sem aviso, sem e-mail,
    sem template, `redelivery_policy = 'unset'` e sem "deixa a nota para trás".
  - `TripOccurrenceStage` fica com dois valores; `CompanyOccurrenceTypeStage` ganha o terceiro.
  - Flag, subcategoria, tabela própria e a 169 foram descartadas (ADR-0086, alternativas).
- **D3 — Nome da empresa, categoria do produto, os dois congelados.** A ocorrência guarda
  `charge_occurrence_type_id`, `charge_type` (categoria) e `charge_type_name` do momento do toque.
- **D4 — Catálogo padrão por etapa.** No pré-deploy, só a empresa **sem nenhum tipo `charge`** (nem
  aposentado) recebe seis, numa constante própria (`charge-type-catalog.constant.ts`, não a da 208):

  | Nome               | Categoria    |
  | ------------------ | ------------ |
  | Descarga           | `unloading`  |
  | Chapa              | `unloading`  |
  | Agendamento        | `scheduling` |
  | Taxa de plataforma | `platform`   |
  | Estacionamento     | `parking`    |
  | Outra taxa         | `other`      |

- **D5 — O recibo é sempre obrigatório para a cobrança.**
  - Formatos: foto (reduzida a 512 KiB) ou PDF até 896 KiB. PDF maior é recusado **no toque**, com texto.
  - "Tirar foto" e "Anexar"; sem câmera, "Anexar" abre a galeria e os arquivos.
  - A tela não registra sem recibo.
- **D6 — Recibo pendente: o relato grava, a cobrança não nasce.**
  - Quando a fila do aparelho não comporta a foto (regra da 209), a ocorrência sobe com valor, tipo e
    nota, e **sem** recibo. O estado é derivado: `charge_amount` preenchido e `attachment_object_id` nulo.
  - Não nasce linha em `delivery_charges`.
  - O painel mostra "Recibo pendente — lance à mão quando o papel chegar", e o lançamento manual leva
    `stopOccurrenceId`.
  - Justificativa na ADR-0086 §4: a regra proíbe a **cobrança** sem recibo, não o **fato**.
- **D7 — Dedupe pela ocorrência.**
  - A sugestão do relato é única por `stop_occurrence_id`.
  - `delivery_charges_suggested_unique` passa a valer só com `origin = 'recurring'`.
  - `onDelivered` pula quando já existe cobrança da mesma nota e categoria com `origin = 'occurrence'` e
    status diferente de `dismissed`.
  - Relato depois da regra: as duas convivem, e `/repasses` mostra o valor da regra ao lado.
  - Descarga e Chapa na mesma nota: duas sugestões.
- **D8 — A nota.** A tela oferece as notas da parada; com uma só, ela é implícita; com várias, o
  motorista escolhe, sem pré-seleção. O servidor exige só que a nota seja **da viagem**.
- **D9 — Sem lista de tipos, "Outra taxa".** Se a lista falha e não há cópia no aparelho, o formulário
  oferece só "Outra taxa" (`chargeOccurrenceTypeId: null`, categoria `other`, nome nulo). Valor e recibo
  continuam obrigatórios.
- **D10 — Corpo antigo aceito.** Corpo sem `charge` e sem `occurredAt` grava como hoje e loga
  `stop_charge_without_amount`. Com `documentId`, que só o escritório e o módulo legado mandam, a
  sugestão continua `other`/`'0'`, agora vinculada por `stop_occurrence_id`.
- **D11 — A hora do toque.**
  - O corpo leva `occurredAt` (hora do aparelho, com ou sem GPS).
  - O servidor limita a `[recebimento − missingAfterHours, recebimento + 2 min]` e grava em `occurred_at`.
  - O canal `office` não manda: o schema do escritório continua `.strict()`.
- **D12 — A espera é gravada, e não gera cobrança.**
  - Ela vai de `captured_at ?? created_at` do primeiro `arrived` até `occurred_at ?? created_at`.
  - Grava `wait_started_at`, `wait_duration_seconds`, `wait_clock` (`device`/`server`) e `wait_state`
    (`measured`, `no_arrival`, `clock_mismatch`).
  - Sem "Cheguei": `no_arrival`, sem bloquear. Duração negativa: `clock_mismatch`.
  - Termina no toque e não é atualizada. O canal `office` não mede.
  - Por que gravar e não derivar na leitura: ADR-0086 §8.
  - Não entra na amostra da 198 D14 nem na mediana da 060 D6, que já contêm a espera. É a métrica por
    cliente da 060 D4c, para uma leitura futura.
  - Não gera cobrança de estadia, porque ela não existe.
- **D13 — `charged_on` é `formatFiscalDay(occurred_at ?? created_at)`.** Hoje é
  `new Date().toISOString().slice(0, 10)`, em UTC.
- **D14 — A taxa confirmada é custo pela parcela `delivery_charges`.** Ela já soma `recorded` em
  diante. Não se grava `trip_cost_entries`, que é a parcela `manual`, para não contar duas vezes.
- **D15 — Aviso com chaves novas.**
  - As chaves são `trip.occurrence-unexpected-charge-amount` e `trip.occurrence-long-wait-duration`.
  - O notificador escolhe a nova quando tem o dado e a antiga no caminho legado.
  - O "às HH:MM" usa `occurred_at`. Placeholder ausente vira "".
- **D16 — Drenagem: grava e marca, não recusa.**
  - Tipo desconhecido vira "Outra taxa" e loga `stop_charge_type_unknown`.
  - Nota fora da viagem vira relato sem nota, e o painel diz "sem nota".
  - Sem recibo: D6.
  - Só forma inválida (cliente com defeito) responde 400.
- **D17 — FK `ON DELETE SET NULL (stop_occurrence_id)`.** Postgres 17.10 na CI e 18 em produção.
  ADR-0086 §9.
- **D18 — Campos novos na resposta chegam sempre presentes, com `null` quando não se aplicam.** Os
  validadores aceitam a chave ausente (API anterior, durante a janela do push 1) e aceitam `null`.
- **D19 — Rollback.** Depois do push 3, a API não volta para antes do push 2: a PWA em cache manda
  `charge` e `occurredAt`, e o schema antigo `.strict()` responderia 400. Reverte-se a app primeiro e
  espera-se a fila drenar.

## Histórias priorizadas

### P1 — A taxa chega com número e recibo

**Given** a Loja Centro cobrou R$ 150,00 de chapa, com recibo, numa parada de uma nota **When** o
motorista abre "Deu problema" → "Cobrança inesperada", toca "Chapa", digita 150,00, tira a foto e
registra **Then** a ocorrência grava valor, nome e recibo, e `/repasses` mostra "Descarga · R$ 150,00 ·
Motorista informou R$ 150,00 (Chapa) · Ver recibo".

### P1 — Sem valor ou sem recibo não registra a cobrança, e a entrega segue

**Given** o formulário sem valor ou sem recibo **When** o motorista toca "Registrar" **Then** a tela diz
"Falta: valor" ou "Falta: recibo" e não envia, e "Entreguei" da mesma nota continua funcionando.

### P1 — A espera diz quanto tempo foi

**Given** "Cheguei" às 13:05 e agora 14:25 **When** o motorista abre "Espera longa" **Then** vê
"Esperando há 1 h 20 min, desde a chegada às 13:05", registra, e o escritório vê "1 h 20 min, desde a
chegada às 13:05" na ocorrência e no sino.

### P1 — Confirmada, a taxa entra na margem

**Given** uma sugestão do relato de R$ 150,00 **When** o escritório a confirma **Then** a parcela
`delivery_charges` da valoração da viagem soma R$ 150,00. Antes da confirmação, ela não entrava.

### P2 — Sem sinal, tudo vai para a fila

**Given** o celular sem rede **When** o motorista registra a cobrança com a foto **Then** o item entra na
fila com a foto e a hora do toque, a tela diz "na fila", e na drenagem a ocorrência grava com o recibo,
`occurred_at` do toque e `charged_on` do dia do toque, e a sugestão nasce uma vez só.

### P2 — Fila cheia: o relato não se perde

**Given** a fila sem espaço para a foto **When** o motorista registra a cobrança **Then** a tela avisa
"A fila está cheia. O relato vai sem o recibo, e a taxa só é cobrada quando o escritório receber o
papel.", a ocorrência grava com o recibo pendente, e nenhuma cobrança nasce.

### P2 — A empresa cadastra os nomes que ela usa

**Given** um administrador em Configurações → Tipos de ocorrência **When** ele cria a taxa "Pedágio
urbano" na categoria "Outra" **Then** o motorista a vê na próxima carga da lista, e ela nunca aparece
como motivo de ocorrência de nota.

### P3 — Sem "Cheguei", a espera vai sem duração

**Given** a parada sem "Cheguei" **When** o motorista registra "Espera longa" **Then** a tela avisa "Você
não marcou 'Cheguei' nesta parada. A espera vai sem a duração.", a ocorrência grava, e o escritório vê
"Chegada não marcada".

## Requisitos funcionais

### API

- **RF1 — A etapa `charge` no cadastro.**
  - `company_occurrence_types` ganha a etapa `charge` e `delivery_charge_type`.
  - `PUT /company-settings/occurrence-types` aceita `stage: 'charge'` com `deliveryChargeType` do
    vocabulário manual.
  - Os campos que não se aplicam são recusados com 400 quando vêm com valor diferente do fixo.
  - `returned_goods` é recusado.
  - O `GET` devolve `deliveryChargeType` (nulo fora de `charge`).
- **RF2 — `GET /me/trips/current/charge-types`**, com `trip.report`.
  - Devolve `{ data: [{ id, name }] }` dos tipos `charge` ativos da empresa do token, por nome.
  - Usa o mesmo caso de uso de `listFieldOccurrenceTypes`, parametrizado pela etapa.
  - Conta sem motorista recebe `DRIVER_NOT_REGISTERED`.
- **RF3 — Bootstrap no `runPreDeploy`:** o catálogo de D4, só para empresa sem tipo `charge`, em lote.
  O seed local (`local-occurrence-type-seed.service.ts`) também o recebe.
- **RF4 — O corpo de `POST /me/trips/current/stops/:stopId/occurrences`** (com o `attachmentObjectId`
  da 209) ganha:
  - `occurredAt`: ISO 8601, opcional, em qualquer motivo;
  - `charge: { amount, chargeOccurrenceTypeId }`: opcional, `.strict()`, **só** em
    `unexpected_charge`. `amount` segue `MONEY_DECIMAL` (quatro casas), maior que zero, até
    `99999.9999`. `chargeOccurrenceTypeId` é uuid ou `null`.
  - Forma inválida responde 400.
- **RF5 — Com `charge`, o servidor grava e marca** (D16):
  - `charge_amount`;
  - o tipo e o nome congelados, só se o tipo for `charge` da empresa; senão, "Outra taxa" com log;
  - a nota, só se for da viagem; senão, sem nota;
  - o recibo, se veio.
- **RF6 — `occurredAt` limitado** (D11) em `occurred_at`. Sem ele, `occurred_at` fica nulo.
- **RF7 — Derivação da cobrança**, depois da transação, só com `charge`, nota **e** recibo:
  - cria `suggested`, origem `occurrence`, com `amount` do motorista, `stop_occurrence_id` e
    `charged_on` (D13);
  - idempotente pelo índice único de `stop_occurrence_id`;
  - falha loga `delivery_charge_suggestion_failed` e não desfaz o relato;
  - `proof_object_id` não é usado: o recibo mora na ocorrência.
- **RF8 — `onDelivered` pula** a regra quando já existe cobrança da mesma nota e categoria com
  `origin = 'occurrence'` e status diferente de `dismissed`.
- **RF9 — Espera** (D12), só no canal `driver_app`, dentro da transação do relato.
- **RF10 — Aviso** (D15), com as duas chaves novas no catálogo da API e no seed.
  - `chargeLabel`: "R$ 150,00 · Chapa", ou "R$ 150,00 · Chapa · recibo pendente".
  - `waitLabel`: "1 h 20 min desde a chegada às 13:05", "chegada não marcada" ou "duração não aferida".
  - `occurredAt` vem de `occurred_at`.
- **RF11 — Lançamento manual:** `deliveryChargeRecordSchema` ganha `stopOccurrenceId` opcional.
  - A ocorrência tem de ser da empresa, `unexpected_charge` e da mesma nota; senão, 422
    `STOP_OCCURRENCE_CHARGE_MISMATCH`.
  - Ocorrência já vinculada responde 409 `STOP_OCCURRENCE_ALREADY_CHARGED`.
- **RF12 — Feed** (`GET /trip-occurrences`), no item de parada. Sempre presentes, `null` fora do motivo:
  - `charge: { amount, category, typeName, receiptPending, suggestionStatus }`, com `suggestionStatus`
    igual ao status da cobrança vinculada ou `none`;
  - `wait: { startedAt, durationSeconds, clock, state }`;
  - `occurredAt`.
- **RF13 — Linha do tempo:** a referência `occurrence` do `stop.occurrence` ganha os mesmos `charge`,
  `wait` e `occurredAt`.
- **RF14 — `GET /delivery-charges`:** o item ganha, sempre presentes:
  - `stopOccurrence: { id, reportedAmount, typeName, hasReceipt } | null`;
  - `ruleAmount: string | null`: o valor da regra ativa do cliente naquela categoria;
  - `siblingRuleCharge: { status, amount } | null`: cobrança da regra na mesma nota e categoria.
- **RF15 — Tenant:** tudo por `companyId` do contexto, com os `tenant-safety` das consultas tocadas.

### App do motorista

- **RF16** O formulário do "Deu problema" sai de `DriverStopCard.component.tsx` para arquivo próprio antes
  de crescer, **só movendo código**. Se a 209 já o extraiu, reaproveita-se o arquivo dela.
- **RF17 — Cobrança inesperada:**
  - chips de tipo vindos de RF2, com cópia por dono no aparelho;
  - valor com máscara de R$, dígitos entrando pela direita, teto de 7 dígitos (R$ 99.999,99), enviado com
    quatro casas (`"150.0000"`);
  - nota, só com mais de uma na parada;
  - recibo obrigatório, com "Tirar foto" e "Anexar";
  - descrição opcional;
  - o texto "O escritório confere o valor antes de cobrar do cliente.";
  - "Registrar" diz o que falta.
- **RF18 — Espera longa:**
  - "Esperando há X, desde a chegada às HH:MM", atualizado por minuto, com o temporizador limpo ao fechar;
  - a chegada vem do snapshot ou do item `arrive` da fila, com "(na fila)";
  - o aviso sem chegada;
  - "O tempo conta até você registrar.".
- **RF19 — A fila.**
  - O item de ocorrência de parada (a forma da 209) ganha `occurredAt` (hora do toque) e `charge?`.
  - Item antigo continua válido.
  - Fila cheia com cobrança: a regra da 209 manda o relato sem a foto, e a tela usa o texto do P2.
- **RF20 — Textos** em pt-BR e en. A prévia do aviso (`occurrenceNoticePreview.service.ts`, na app e na
  cópia do módulo legado) passa a usar as chaves novas, com os contratos de paridade.

### Painel

- **RF21 — Tolerância antes** (push 1, no molde do commit `694de05b5`):
  - `isOccurrenceType` aceita a etapa `charge` e a chave opcional `deliveryChargeType`;
  - o validador da referência `occurrence` da linha do tempo aceita `charge`, `wait` e `occurredAt`
    opcionais e anuláveis;
  - tipo errado continua reprovando.
- **RF22 — Seção "Tipos de taxa"** em Configurações, na tela de tipos de ocorrência: os tipos da etapa
  `charge` (nome, categoria, ativo), com criar, renomear, trocar a categoria e aposentar. A lista de
  tipos de ocorrência existente passa a esconder a etapa `charge`.
- **RF23 — Feed `/ocorrencias`:**
  - cobrança: "Chapa (Descarga) · R$ 150,00", o estado da sugestão ou "Recibo pendente — lançar à mão",
    e "Ver recibo";
  - espera: "1 h 20 min, desde a chegada às 13:05", com "(hora do servidor)" quando `clock = 'server'`,
    ou "Chegada não marcada" / "Duração não aferida".
- **RF24 — Linha do tempo:** o motivo da parada traduzido (hoje sai `unexpected_charge` cru,
  `trip-timeline-stop.query.ts:234`), e o mesmo detalhe.
- **RF25 — `/repasses`:**
  - "Motorista informou R$ 150,00 · Chapa", "Regra do cliente: R$ 120,00" (quando houver) e "Ver
    recibo" (pela rota de anexos do feed);
  - o aviso "Também há Descarga da regra nesta nota (sugerida)" quando `siblingRuleCharge` vier;
  - o valor editável preenchido.
- **RF26 — "Lançar à mão"** a partir da ocorrência com recibo pendente ou sem nota: abre o lançamento
  manual da nota com valor, categoria e `stopOccurrenceId`.

## Requisitos não funcionais

- Dinheiro:
  - banco em `numeric(14,4)`;
  - fronteira em string de quatro casas;
  - cálculo em `bigint` escalado. Nunca `number`.
- 44 px de área de toque e funcionamento em 375 px.
- O recibo não trafega em log. A chave do objeto não carrega dado pessoal. O recibo pode trazer o CPF do
  chapa: registro de LGPD em `docs/SECURITY.md` (T6.3).
- Sem `await` em laço no bootstrap e na derivação.
- Feed, linha do tempo e `/delivery-charges` sem N+1: um `SELECT` por consulta.

## Casos extremos e falhas

| Caso                                             | Comportamento                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Item antigo da fila, sem `charge`/`occurredAt`   | grava como hoje; `stop_charge_without_amount`                                     |
| Tipo aposentado ou de outra empresa na drenagem  | aposentado vale; desconhecido vira "Outra taxa" (D16)                             |
| Nota desvinculada entre o toque e a drenagem     | relato sem nota, sem sugestão; painel "sem nota — lançar à mão"                   |
| Fila cheia                                       | relato sem recibo, recibo pendente, sem cobrança (D6)                             |
| PDF acima de 896 KiB                             | recusado no toque, com texto; nada é enfileirado                                  |
| Regra recorrente dispara depois do relato        | pula (RF8)                                                                        |
| Relato chega depois da regra sugerir ou lançar   | as duas convivem; `/repasses` mostra os dois valores (D7)                         |
| Descarga + Chapa na mesma nota                   | duas sugestões `unloading`                                                        |
| Parada esvaziada e apagada com relato e cobrança | a ocorrência cai em cascata; a cobrança fica, com `stop_occurrence_id` nulo (D17) |
| `occurredAt` no futuro ou dias antes             | limitado à janela (D11)                                                           |
| Chegada sem GPS e ocorrência com `occurredAt`    | `clock = 'server'`; pode dar `clock_mismatch` se a chegada drenou depois do toque |
| Espera de 5 h                                    | grava 5 h                                                                         |
| Rollback da API com a app nova no ar             | proibido abaixo do push 2 (D19)                                                   |

## Critérios de aceite

- **CA01 — Migration.**
  - Contrato de schema:
    - a etapa e a coluna nova em `company_occurrence_types`, com os CHECKs;
    - as nove colunas e os oito CHECKs de `trip_stop_occurrences`;
    - `stop_occurrence_id` com FK `SET NULL (stop_occurrence_id)` e índice único parcial;
    - o índice `delivery_charges_suggested_unique` com o predicado novo.
  - `make migration-test` verde, com rollback.
- **CA02 — Cadastro:**
  - `PUT` com `stage: 'charge'` cria, renomeia, troca a categoria e aposenta;
  - `returned_goods` responde 400;
  - campo fora do fixo responde 400;
  - tipo `charge` é recusado como ocorrência de nota pelas rotas do motorista, do escritório, do galpão e
    do WhatsApp.
- **CA03** `GET /me/trips/current/charge-types` devolve só `charge` ativos da empresa do token.
- **CA04** Integração do bootstrap: empresa sem tipo `charge` recebe seis; com um aposentado, fica
  intocada; duas execuções não duplicam.
- **CA05 — Corpo com `charge`:**
  - grava valor, tipo e nome congelados, e o recibo;
  - tipo desconhecido vira "Outra taxa";
  - nota de fora da viagem vira relato sem nota;
  - sem recibo, grava com recibo pendente e sem cobrança;
  - forma inválida responde 400.
- **CA06 — Corpo antigo:**
  - vindo da app (`documentId: null`), grava sem sugestão, como hoje;
  - com nota (escritório), gera `other`/`'0'` vinculada;
  - os dois logam `stop_charge_without_amount`.
- **CA07 — Integração da derivação:**
  - relato com nota e recibo gera uma sugestão; o reenvio não gera outra;
  - ordem relato → confirma → entrega: a regra pula;
  - ordem entrega → confirma → relato: as duas existem, e `/delivery-charges` devolve `siblingRuleCharge`;
  - Descarga + Chapa na mesma nota geram duas sugestões;
  - duas requisições concorrentes do mesmo relato geram uma.
- **CA08** `charged_on` de um toque às 23:30 de Brasília é o dia do toque.
- **CA09** Hora e espera:
  - `occurredAt` é limitado;
  - `measured` sai certo com as duas pontas do aparelho e com a mista;
  - `no_arrival` e `clock_mismatch`;
  - a espera fica nula no canal `office`.
- **CA10** Aviso: as chaves novas nascem pelo seed; o notificador escolhe a nova com o dado e a antiga sem
  ele; placeholder ausente vira "".
- **CA11** Feed, linha do tempo e `/delivery-charges`: os campos novos sempre presentes, `null` fora do
  motivo; `tenant-safety` verde.
- **CA12 — Margem:** a sugestão não entra na parcela `delivery_charges`; confirmada, entra.
- **CA13 — Parada apagada:** a integração no caminho de esvaziar a parada (desvincular a última nota)
  apaga a ocorrência, mantém a cobrança com `stop_occurrence_id` nulo, e não falha.
- **CA14 — Painel tolerante:** publicado **antes** da API (push 1), aceitando a etapa `charge`, os campos
  opcionais e `null`.
- **CA15 — Formulário:** não envia sem tipo, valor, nota (com várias) e recibo; diz o que falta; recusa
  PDF grande no toque; a máscara tem teto de 7 dígitos e manda `"150.0000"`.
- **CA16 — Fila:** o item leva `occurredAt` e `charge`; com a fila cheia, sobe sem a foto com o texto do
  P2.
- **CA17 — Espera na app:** a partir do snapshot, a partir da fila, e sem chegada.
- **CA18 — Painel:** "Tipos de taxa", o feed, a linha do tempo, `/repasses` e "Lançar à mão".
- **CA19 — Preview:** preview local com prints de 375 px e 768 px e o "pode subir" do usuário antes de
  staging.
- **CA20 — Revisão de design** com print (`web.md` §15).

## Interseções com specs vizinhas

Antes de cada task que toca um arquivo desta tabela: `git fetch` e `git log origin/staging -- <arquivo>`.

| Arquivo ou área                                                                                             | 204                                                       | Quem mais mexe                                                                                                                                                                       | Regra                                                                                              |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `me-trip.schema.ts` (`occurrenceSchema`), `me-trip.routes.ts`, `main.ts:3074-3080`                          | `occurredAt`, `charge`, rota `charge-types`               | **209** (`attachmentObjectId`, upload por parada), 196 (`location`), 195, 202, 198, 200, 192                                                                                         | a 209 publica antes; a 204 só acrescenta campos                                                    |
| `report-stop-occurrence.use-case.ts`, repositório de campo                                                  | ramos de cobrança e espera, `occurred_at`                 | 209 (anexo), 195 (`wrong_address`), 196 (carimbo)                                                                                                                                    | ramos por `kind`; sem reescrever o de outro                                                        |
| `trip.schema.ts` (`trip_stop_occurrences`, `company_occurrence_types`)                                      | colunas, CHECKs, etapa                                    | 196, 195, 197, 198, 192, 185                                                                                                                                                         | migration própria depois das publicadas; `db:generate` = `no_changes` antes do push                |
| `shared/trip-occurrence.constant.ts`, `occurrence-type-catalog.constant.ts`                                 | `CompanyOccurrenceTypeStage`; catálogo em arquivo próprio | **208** (tipo novo no catálogo de bootstrap)                                                                                                                                         | a 204 não edita o catálogo da 208                                                                  |
| `delivery-client.schema.ts`, `suggest-delivery-charges.use-case.ts`, `transition-trip-document.use-case.ts` | vínculo, índice, pulo da regra                            | 197 (`trip_stop_schedules`)                                                                                                                                                          | blocos diferentes                                                                                  |
| `notification-catalog.constant.ts`, notificador                                                             | duas chaves novas                                         | 195 (chave `wrong_address`)                                                                                                                                                          | chaves diferentes                                                                                  |
| `trip-occurrence-feed.query.ts`, `trip-timeline-stop.query.ts`                                              | `charge`, `wait`, `occurredAt`                            | 195, 196                                                                                                                                                                             | campos diferentes no mesmo item                                                                    |
| `DriverStopCard.component.tsx`                                                                              | extração do formulário (RF16)                             | **209**, 192, 193, 195, 197, 200, **205** (exige "Cheguei" antes das ações), **206** (rota por parada), **207** (tempo, distância, agendamento); acordeão de `8ba3e4b17`/`9ec97d683` | se a 209 extraiu, reaproveitar; senão, extrair só movendo código                                   |
| `DriverTripWorkspace.page.tsx`, `useDriverTrip.hook.ts`                                                     | tipos de taxa; teto de bytes                              | 209, 192, 193, 196, 198, 203, 205, 206, 207                                                                                                                                          | mudança pequena e localizada                                                                       |
| `offlineQueue.service.ts`, `driverTripClient.service.ts`, `driverTrip.types.ts`                             | `occurredAt` e `charge` no item                           | **209** (forma do item com foto e `send`), 195, 196, 203                                                                                                                             | acrescentar campos à forma da 209, nunca renomear                                                  |
| `driverTrip*.locale.json`                                                                                   | `occurrenceCharge.*`, `occurrenceWait.*`                  | 193, 195, 197, 198, 205, 206, 207                                                                                                                                                    | bloco próprio; nunca reordenar o arquivo                                                           |
| painel `tripResponse.validation.ts`, `trip.constant.ts`, `TripTimeline*`                                    | tolerância e detalhe                                      | 192, 193, 196, 198                                                                                                                                                                   | push 1 isolado                                                                                     |
| painel `OccurrenceTypeCatalogPanel`, `CompanySettings.page.tsx`                                             | seção de taxas; esconder a etapa `charge`                 | 208 (só catálogo da API)                                                                                                                                                             | —                                                                                                  |
| a 205 (registro tardio) e a espera                                                                          | `no_arrival`                                              | 205: sem "Cheguei" não há ações de entrega                                                                                                                                           | se a 205 esconder o "Deu problema" antes do "Cheguei", `no_arrival` fica raro, e o estado continua |

## Preview

Desenho em texto, cerca de 40 colunas. A tela real sai no preview local (T6.1).

**1. App do motorista — "Deu problema" → Cobrança inesperada**

```text
┌──────────────────────────────────────┐
│ Deu problema                         │
│ (•) Cobrança inesperada              │
│ ( ) Espera longa                     │
│ ( ) Doca interditada                 │
│ ( ) Exigiram agendamento   ( ) Outro │
├──────────────────────────────────────┤
│ Tipo da taxa                         │
│ [Chapa] [Descarga] [Estacionamento]  │
│ [Taxa de plataforma] [Outra taxa]    │
│                                      │
│ Valor cobrado                        │
│ ┌──────────────────────────────────┐ │
│ │ R$ 150,00                        │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Nota                                 │
│ ┌──────────────────────────────────┐ │
│ │ Escolha a nota                 ▾ │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Recibo (obrigatório)                 │
│ [ Tirar foto ]      [ Anexar ]       │
│ ▣ recibo.jpg · 312 KB   [Remover]    │
│                                      │
│ O que aconteceu (opcional)           │
│ ┌──────────────────────────────────┐ │
│ │                                  │ │
│ └──────────────────────────────────┘ │
│ O escritório confere o valor antes   │
│ de cobrar do cliente.                │
│                                      │
│ Falta: nota.                         │
│ [            Registrar             ] │
└──────────────────────────────────────┘

Fila cheia, ao registrar:
│ A fila está cheia. O relato vai sem  │
│ o recibo, e a taxa só é cobrada      │
│ quando o escritório receber o papel. │
│ [ Registrar sem o recibo ] [Voltar]  │
```

"Nota" só aparece com mais de uma nota na parada. Sem lista de tipos, os chips viram só `[Outra taxa]`,
já marcada.

**2. App do motorista — "Deu problema" → Espera longa**

```text
┌──────────────────────────────────────┐
│ Deu problema                         │
│ ( ) Cobrança inesperada              │
│ (•) Espera longa                     │
│ ( ) Doca interditada   ...           │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ Esperando há 1 h 20 min          │ │
│ │ desde a chegada às 13:05         │ │
│ └──────────────────────────────────┘ │
│ O tempo conta até você registrar.    │
│                                      │
│ O que aconteceu (opcional)           │
│ ┌──────────────────────────────────┐ │
│ │ Doca ocupada, 3 caminhões na     │ │
│ │ frente.                          │ │
│ └──────────────────────────────────┘ │
│ [            Registrar             ] │
└──────────────────────────────────────┘

Chegada ainda na fila:
│ │ desde a chegada às 13:05 (fila)  │ │

Sem "Cheguei":
│ │ Você não marcou "Cheguei" nesta  │ │
│ │ parada. A espera vai sem a       │ │
│ │ duração.                         │ │
```

**3. Painel — a ocorrência vista pelo escritório**

```text
Ocorrências (/ocorrencias), linha aberta
┌──────────────────────────────────────┐
│ 25/09 14:25 · Parada · Cobrança      │
│ inesperada                           │
│ ABC1D23 · João · Parada 3 · NF 12345 │
│ ──────────────────────────────────── │
│ Chapa (Descarga) · R$ 150,00         │
│ Sugestão aguardando conferência      │
│ [Ver recibo]      [Abrir repasses]   │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│ 25/09 14:40 · Parada · Cobrança      │
│ Estacionamento · R$ 30,00            │
│ Recibo pendente — sem cobrança       │
│ [Lançar à mão]                       │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│ 25/09 14:25 · Parada · Espera longa  │
│ ABC1D23 · João · Parada 3            │
│ ──────────────────────────────────── │
│ 1 h 20 min, desde a chegada às 13:05 │
│ "Doca ocupada, 3 caminhões na        │
│ frente."                             │
└──────────────────────────────────────┘

Repasses (/repasses), fila de sugestões
┌──────────────────────────────────────┐
│ [x] Descarga · 25/09 · NF 12345/1    │
│     Motorista informou R$ 150,00 ·   │
│     Chapa           [Ver recibo]     │
│     Regra do cliente: R$ 120,00      │
│     ⚠ Também há Descarga da regra    │
│       nesta nota (sugerida)          │
│     Valor  [ R$ 150,00 ]             │
│                   [Descartar]        │
└──────────────────────────────────────┘

Sino
┌──────────────────────────────────────┐
│ Cobrança de R$ 150,00 · Chapa na     │
│ parada Loja Centro às 25/09 14:25    │
│ (nota 12345/1).                      │
├──────────────────────────────────────┤
│ Espera longa na parada Loja Centro   │
│ às 25/09 14:25: 1 h 20 min desde a   │
│ chegada às 13:05.                    │
└──────────────────────────────────────┘
```

**4. Painel — Configurações → Tipos de ocorrência → Tipos de taxa**

```text
┌──────────────────────────────────────┐
│ Tipos de taxa                        │
│ O motorista escolhe pelo nome; o     │
│ relatório agrupa pela categoria. O   │
│ recibo é sempre obrigatório.         │
│ ──────────────────────────────────── │
│ Chapa            Descarga  [x] Ativo │
│ Estacionamento   Estacion. [x] Ativo │
│ ──────────────────────────────────── │
│ Nome [                  ]            │
│ Categoria [Descarga ▾]  [Adicionar]  │
└──────────────────────────────────────┘
```

## Dúvidas

Nenhuma bloqueante. As respostas do usuário de 2026-09-25 fecharam as decisões D2, D5/D6 e D14.
