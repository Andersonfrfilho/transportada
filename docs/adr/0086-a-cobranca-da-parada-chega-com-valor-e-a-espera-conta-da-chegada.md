# ADR-0086 — A cobrança da parada chega com valor e recibo, e a espera conta desde a chegada

- **Status:** proposta (2026-09-25, revisada no mesmo dia depois da crítica). Vira `aceita` na T0.1
  da spec 204, depois de conferida contra o código e contra a spec 209 publicada.
- **Data:** 2026-09-25
- **Decisores:**
  - usuário, em 2026-09-25:
    - a cobrança inesperada tem **valor obrigatório** em R$, **foto do recibo** e **tipo escolhido numa
      lista**;
    - a lista fica **junto dos tipos de ocorrência** (`company_occurrence_types`);
    - o recibo é **sempre** obrigatório, e a entrega nunca é afetada;
    - a taxa confirmada pelo escritório **vira custo da viagem**;
    - a espera longa conta **a partir do "Cheguei"**, e o registro **grava** a chegada e a duração;
  - orquestrador: a foto do "Deu problema" sai da trilha de canhoto pela spec 209 (P0), com
    `attachmentObjectId` em qualquer motivo, e esta ADR se apoia nela;
  - o desenho restante é desta ADR.
- **Spec:** `specs/204-a-ocorrencia-da-parada-traz-os-dados/`
- **Depende de:** spec 209 (a foto da ocorrência de parada não vira canhoto).

## O que esta ADR revisa, e o que não

- **Revisa a ADR-0045 §6, regra 1** ("o motorista não escolhe valor, não classifica custo, não julga
  culpa"), **só** em `unexpected_charge` e **só na parte do valor**:
  - o motorista passa a **informar** o valor impresso no recibo e a escolher o **nome** da taxa;
  - ele continua sem classificar custo: a categoria do relatório vem do cadastro, não dele;
  - ele continua sem decidir se a taxa é repassável e sem lançar nada.
  - As regras 2 (independente da entrega) e 3 (mesma fila offline, mesma idempotência) ficam intactas.
- **Revisa** a premissa da spec 057 P1 ("sem que ele precise informar valor nenhum") e o comentário
  `OCCURRENCE_CHARGE_TYPE` (`report-stop-occurrence.use-case.ts:18-22`).
- **Não revisa a spec 060 D4 / ADR-0048** ("quem lança é funcionário, sob `trip.manage` — nunca o
  motorista"). O valor do motorista entra em `delivery_charges` como `suggested`, e só a confirmação do
  escritório o leva a `recorded`. O motorista continua sem tela de lançamento.
- **Emenda a spec 060 D4c** em um ponto: a dedupe "uma sugestão por nota e tipo" passa a valer só para a
  regra recorrente. O relato do motorista é deduplicado pela própria ocorrência (§5).

## Contexto

Conferido no código em 2026-09-25:

1. **Hoje a cobrança do motorista nunca vira sugestão.** A app manda `documentId: null` na ocorrência
   de parada (`DriverTripWorkspace.page.tsx:466`), e sem nota não há sugestão
   (`report-stop-occurrence.use-case.ts:145-153`). Só o escritório, ao informar a nota, gera a sugestão
   `other` com `'0'` (`suggest-delivery-charges.use-case.ts:68-79`).
2. **O recibo não chega à ocorrência.** A rota não aceita anexo (`me-trip.schema.ts:42-54`; `main.ts:3078`
   e `:3134`), e a app sobe a foto como canhoto da primeira nota pendente. A spec 209 corrige isso para
   qualquer motivo.
3. **Não há lista de tipos de taxa.** `DELIVERY_CHARGE_TYPES` é o vocabulário fechado do relatório (060
   D4). `company_occurrence_types` é o cadastro da empresa, com `stage` (`separation`/`delivery`)
   decidindo quem registra.
4. **A espera não é medida**, e a ocorrência não tem hora do toque. `created_at` é a hora em que a fila
   drenou.
5. **A taxa confirmada já é custo da viagem.** A valoração soma `delivery_charges` em `recorded`,
   `submitted`, `approved` e `reimbursed` por viagem como a parcela `delivery_charges`
   (`trip-valuation.query.ts:467-479`, `read-trip-valuation.use-case.ts:531-535`). `suggested` fica fora.
6. **Os avisos do sino moram no banco.** O seed só insere o `(key, channel, locale)` que falta
   (`notification-template-seed.service.ts:52-80`): mudar o texto de uma chave existente não chega a
   instalação nenhuma.

## Decisão

### 1. O motorista informa o valor, e ele é sugestão

Na `unexpected_charge`, o valor é obrigatório, em `numeric(14,4)`. Ele é um fato impresso no recibo, e
o motorista é a única pessoa com o recibo na mão. O valor vira o `amount` de uma sugestão `suggested`,
origem `occurrence`. O escritório confirma pela fila que já existe, com o valor editável.

### 2. A lista de taxas é uma etapa nova do cadastro de tipos de ocorrência

`company_occurrence_types` ganha a etapa **`charge`** e a coluna `delivery_charge_type` (a categoria do
relatório, do vocabulário `MANUAL_DELIVERY_CHARGE_TYPES`). Cada taxa é um tipo de ocorrência comum: nome
da empresa, `active`, aposentar sem apagar. A tela é a mesma, numa seção "Tipos de taxa".

Uma etapa, e não uma flag ou subcategoria, por um motivo medido: **todo leitor de `stage` hoje compara
com um valor positivo.**

- `register-driver-occurrence.use-case.ts:99` e `office-occurrence-batch.service.ts:38` exigem
  `delivery`;
- `register-trip-occurrence.use-case.ts:300` e `attach-occurrence-photo.use-case.ts:99` exigem
  `separation`;
- `list-field-occurrence-types.use-case.ts:41` e os dois fluxos do WhatsApp filtram por
  `delivery`/`separation`.

Um tipo `charge` fica **fora de todos eles sem mudar uma linha**: nunca aparece como motivo de recusa,
nunca é aceito como ocorrência de nota. Uma flag faria o contrário: cada um desses seis pontos teria de
aprender `and not is_charge`, e o que esquecesse mostraria "Chapa" como motivo de recusa.

O custo da etapa:

- o tipo se parte em dois: `TripOccurrenceStage` continua com dois valores, porque é também o tipo de
  `trip_document_occurrences.stage`, cujo CHECK **não** muda; `CompanyOccurrenceTypeStage` é
  `TripOccurrenceStage | 'charge'`, e só quem lê `company_occurrence_types` vê o tipo largo. O
  compilador aponta onde a união não é tratada;
- o CHECK `company_occurrence_types_stage_check` é recriado com três valores;
- um CHECK de forma: tipo `charge` tem `attachment_mode = 'required'`, sem aviso, sem e-mail, sem
  template, `redelivery_policy = 'unset'` e sem "deixa a nota para trás". As colunas da ocorrência de nota
  não se aplicam a taxa;
- o painel valida `stage` com vocabulário fechado (`tripResponse.validation.ts:1468-1530`) e recusaria a
  lista inteira: a tolerância sai antes, no push 1;
- o feed de ocorrências e o filtro por etapa **não mudam**: taxa nunca vira linha de
  `trip_document_occurrences`, e o item de parada tem `stage: null`.

### 3. O nome é da empresa, a categoria é do produto, e os dois são congelados

O motorista escolhe "Chapa", e a sugestão nasce em `unloading`. A ocorrência guarda o id do tipo, a
categoria (`charge_type`) e o nome (`charge_type_name`) do momento do toque. Renomear ou trocar a
categoria depois não reescreve o que já foi relatado.

### 4. O recibo é sempre obrigatório para a cobrança, e nunca para o relato

- Sem recibo, **a cobrança não é registrada**: não nasce linha em `delivery_charges`.
- O **relato** (a ocorrência, com o valor) é gravado mesmo assim, marcado **recibo pendente**
  (`charge_amount` preenchido e `attachment_object_id` nulo). Isso só acontece quando a fila do
  aparelho não comporta a foto (spec 209). A tela normal não deixa registrar sem recibo; sem câmera,
  "Anexar" abre a galeria e os arquivos.
- **Por que gravar o relato em vez de recusar:** a regra do usuário proíbe a cobrança sem recibo, não o
  fato. Recusar perderia valor, hora e nota, que são exatamente o que a fila cheia não pode apagar. O
  recibo em papel volta com o motorista no fim do dia (060 D4), e o escritório lança à mão a partir da
  ocorrência, pela rota manual da 060 com o vínculo `stopOccurrenceId`, direto em `recorded`. Essa rota
  é JSON e não carrega arquivo: digitalizar o papel e anexá-lo fica como continuação.
- A entrega da nota nunca espera nada disso.

### 5. A dedupe da cobrança é pela ocorrência

- A sugestão do relato é única por `stop_occurrence_id`. Descarga e Chapa na mesma nota são duas
  sugestões, porque são dois recibos.
- O índice `delivery_charges_suggested_unique` passa a valer só para `origin = 'recurring'`. O predicado
  é pela origem, que nunca muda, e não por `stop_occurrence_id`, que o `SET NULL` do §9 pode apagar.
- A regra recorrente, na entrega, **pula** quando já existe cobrança da mesma nota e categoria com
  `origin = 'occurrence'` e status diferente de `dismissed`.
- Na ordem inversa (a regra já sugeriu ou já foi lançada quando o relato chega), o relato cria a sua
  sugestão e nenhuma das duas é descartada sozinha. A fila `/repasses` mostra o valor da regra ao lado
  do valor informado, e quem decide é o escritório.

### 6. A taxa confirmada é custo da viagem pela parcela que já existe

A espécie de custo é a parcela **`delivery_charges`** de `TRIP_COST_KINDS`. Ela já soma o que o
escritório confirmou (`recorded` em diante) e deixa `suggested` de fora. **Não** se grava
`trip_cost_entries`: aquela tabela alimenta a parcela `manual`, e a mesma taxa entraria duas vezes na
margem.

### 7. A hora do toque vem do aparelho, com trava

- O corpo da ocorrência leva `occurredAt`, a hora do toque no aparelho, com ou sem GPS.
- O servidor limita a `[recebimento − missingAfterHours, recebimento + 2 min]`, o molde da spec 159 D3a
  (`delivery-proof-punctuality.policy.ts:60-71`), e grava em `occurred_at`.
- Essa hora serve para três coisas:
  - a ponta final da espera;
  - o `charged_on` da cobrança, por `formatFiscalDay`;
  - o "às HH:MM" do aviso.

### 8. A espera vai do primeiro "Cheguei" até o toque, e é gravada

- **Chegada:** `captured_at ?? created_at` do primeiro evento `arrived` da parada.
- **Fim:** `occurred_at` da ocorrência (§7), ou `created_at` sem ele.
- **O que se grava:**
  - `wait_started_at` e `wait_duration_seconds`;
  - `wait_clock`: `device` quando as duas pontas são do aparelho, senão `server`;
  - `wait_state`: `measured`, `no_arrival` ou `clock_mismatch`.
- **Sem "Cheguei":** grava `no_arrival`, sem duração, e não bloqueia.
- **Duração negativa:** grava `clock_mismatch`, e nunca se inventa um número.
- **Canal `office`:** não mede. O WhatsApp não grava ocorrência de parada.
- **Gravar, e não derivar na leitura.** A 060 D6 prefere consulta a coluna, e derivar seria possível: a
  hora do toque (§7) é a única entrada nova. Não foi escolhido por dois motivos:
  1. o usuário pediu que o registro grave a chegada e a duração;
  2. o relato congela o que o motorista viu. Uma chegada retroativa do escritório (ADR-0067 §3)
     reescreveria depois uma espera que o motorista já relatou, e o aviso do sino já teria saído com o
     número antigo.
- **Onde a espera entra, e onde não:**
  - **não** entra na amostra de tempo de serviço da 198 D14 nem na mediana da 060 D6/058 D6. A amostra
    já vai da chegada ao último desfecho e contém a espera; somar as duas contaria duas vezes;
  - ela é a métrica por cliente que a 060 D4c prometeu ("esse cliente nos custa duas horas de espera por
    semana"), a agregar numa leitura futura.

### 9. A cobrança sobrevive à parada apagada

`delivery_charges.stop_occurrence_id` tem FK composta `ON DELETE SET NULL (stop_occurrence_id)`.

- A parada que esvazia é apagada (`drizzle-trip-stop-reconciliation.support.ts:41`,
  `drizzle-trip-route.repository.ts:822`), e a ocorrência cai em cascata.
- A cobrança, que é dinheiro e pode já estar num lote, fica, sem o vínculo.
- A forma com lista de colunas exige Postgres 15. A CI usa 17.10 (imagem do `compose.yaml`, conferida
  pelo digest), e produção e local usam 18.
- "Parada com ocorrência não é apagada" foi descartada: deixaria parada vazia no roteiro, e desvincular a
  última nota passaria a falhar.

### 10. O aviso usa chaves novas

- As chaves são `trip.occurrence-unexpected-charge-amount` e `trip.occurrence-long-wait-duration`. O
  notificador escolhe a nova quando tem o dado (cobrança com valor; espera do canal `driver_app`) e a
  antiga no caminho legado.
- Chave nova nasce pelo seed em toda instalação. Texto novo numa chave velha nunca chegaria (Contexto,
  item 6).
- Placeholder ausente vira texto vazio.

### 11. O que já está na fila continua valendo, e a API não volta atrás

- **Corpo antigo:** sem `charge` e sem `occurredAt`, é aceito e grava como hoje.
- **O que depende da hora da drenagem não recusa; grava e marca:**
  - tipo desconhecido vira "Outra taxa";
  - nota fora da viagem vira relato sem nota;
  - sem recibo, o relato fica com recibo pendente.
- O servidor exige que a nota seja da viagem. Que ela seja da parada, a tela garante.
- **Depois que a app nova sai**, a API não é revertida para antes deste contrato: o schema `.strict()`
  antigo recusaria com 400 o `charge` e o `occurredAt` que a PWA em cache e as filas ainda mandam.
  Reverte-se a app e espera-se a fila drenar.

## Consequências

- O escritório recebe a taxa com número, nome e recibo, e confere em vez de ligar para o motorista.
- A margem da viagem ganha a taxa quando ela é confirmada, pela parcela que já existe.
- A espera longa diz quanto tempo foi, com o relógio declarado.
- **O que não se ganha:**
  - cobrança automática de estadia;
  - repartir uma taxa entre notas;
  - o motorista anexar o recibo depois;
  - o escritório registrar "em nome de" com valor. O escritório lança pela rota manual da 060.
- **O custo que se assume:**
  - uma etapa nova no cadastro, com CHECK de forma e seed próprio;
  - nove colunas e oito CHECKs em `trip_stop_occurrences`;
  - uma coluna, uma FK e a troca de um índice em `delivery_charges`;
  - duas chaves de aviso.

## Alternativas descartadas

| Alternativa                                                    | Por que não                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tabela própria `company_charge_types`                          | O usuário pediu a lista junto dos tipos de ocorrência. E duplicaria a mecânica de cadastro, aposentadoria e seed que `company_occurrence_types` já tem.                                                                                                                                                                                                          |
| Flag `is_charge` ou subcategoria em `company_occurrence_types` | Os seis leitores de `stage` teriam de aprender a excluí-la, e o que esquecesse mostraria taxa como motivo de recusa. A etapa fica de fora deles sem mudança.                                                                                                                                                                                                     |
| Espécies de lançamento da spec 169 (`company_entry_kinds`)     | Classificam o dinheiro que a transportadora gasta ou recebe na **própria** viagem (`trip_cost_entries`/receitas, lado `expense`/`revenue`) e alimentam a parcela `manual`. A taxa é cobrada por terceiro e repassada ao contratante (`delivery_charges`, lote de repasse). Misturar poria "Chapa" no formulário de custo e contaria a taxa duas vezes na margem. |
| Gravar a taxa confirmada também em `trip_cost_entries`         | A parcela `delivery_charges` já a soma. Seria custo em dobro.                                                                                                                                                                                                                                                                                                    |
| Recibo opcional por tipo (`attachment_mode` livre)             | O usuário decidiu que é sempre obrigatório. O CHECK fixa `required` na etapa `charge`.                                                                                                                                                                                                                                                                           |
| Recusar o relato sem recibo quando a fila está cheia           | Perde valor, hora e nota. A regra proíbe a cobrança sem recibo, e a cobrança não nasce.                                                                                                                                                                                                                                                                          |
| O motorista lançar em `recorded`                               | Quebra a 060 D4.                                                                                                                                                                                                                                                                                                                                                 |
| Manter "uma sugestão por nota e categoria" para o relato       | Descarga e Chapa na mesma nota são dois recibos. A segunda sumiria na dedupe.                                                                                                                                                                                                                                                                                    |
| Descartar sozinha a sugestão da regra quando o relato chega    | Com a mesma categoria não se sabe se é a mesma taxa. Descartar poderia perder uma cobrança legítima; quem decide é o escritório, com os dois valores lado a lado.                                                                                                                                                                                                |
| Mudar o texto das chaves de aviso que já existem               | O seed não sobrescreve template existente. O texto nunca chegaria.                                                                                                                                                                                                                                                                                               |
| Derivar a espera na leitura                                    | Ver §8: o usuário pediu gravar, e o relato congela o que o motorista viu.                                                                                                                                                                                                                                                                                        |
| Espera com o relógio do GPS (`captured_at` da ADR-0081)        | Some quando não há GPS, que é o caso de galpão e subsolo. A hora do toque vem sempre.                                                                                                                                                                                                                                                                            |
| `ON DELETE RESTRICT` ou "parada com ocorrência não é apagada"  | Bloqueia desvincular a última nota da parada, ou deixa parada vazia no roteiro.                                                                                                                                                                                                                                                                                  |
| Recusar com 422 o que muda entre o toque e a drenagem          | O item seria recusado na fila e o relato se perderia. Grava-se e marca-se.                                                                                                                                                                                                                                                                                       |
