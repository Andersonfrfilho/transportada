# ADR-0094 — O recebimento da carga acontece antes da viagem, e cada contratante tem o seu perfil

- **Status:** aceita
- **Data:** 2026-10-03
- **Decisores:** usuário (respostas de 2026-10-03 na spec 237), revisão `architect` (opus) na T1.1
- **Spec:** 237 (`specs/237-a-carga-chega-e-se-separa-antes-da-viagem/`)
- **Mantém:** ADR-0021 (instalação dedicada, isolamento multiempresa) · ADR-0043/0074 (eixo
  `separation_status` da nota na viagem e despacho derivado) · ADR-0044 §5 (a sugestão nunca cria
  viagem) · ADR-0048 (cadastro nasce sem regra; ausência é ausência)
- **Molde:** `delivery_proof_setting_contractor_overrides` (spec 218 RF-C1): tabela por contratante, FK
  composta com o tenant

## Contexto

A carga de um contratante chega **antes** de existir viagem: uma planilha de prévia por e-mail, a
mercadoria em paletes, a equipe desembrulha, organiza por cidade e separa por rota; há 24 h para separar
e abrir avaria, e 3 dias úteis desde a chegada para entregar. O usuário foi explícito: **isso vale para
um CNPJ específico**; outros contratantes terão outras regras.

O sistema só conhece a separação **dentro** de uma viagem (`trip_documents.separation_status`:
`pending → separated → loaded`, ADR-0043), depois de a nota ter sido vinculada. Antes disso não há estado,
relógio, prévia nem lugar para guardar "as regras deste contratante". O contratante só tem período de
fechamento, e-mail do relatório e observações (`contractors`).

A análise de quatro planilhas reais e 277 XMLs do mesmo emitente (`planilha-fr.md`) mostrou que a
planilha **não traz** número de NF-e, chave, série nem CNPJ do emitente; que o identificador da linha
(`Text001`) e o código do cliente (`Company`) **não aparecem** no XML; e que a prévia chega 2,7 a 4,2 h
**antes** da emissão das notas.

## Decisão

### 1. O recebimento é um eixo próprio, antes da viagem

A nota que chega tem um eixo de recebimento **separado** (`expected → received → separated`, Fase 2 da
237), agrupado por rota do contratante × cidade. `trip_documents.separation_status` **não é tocado**:
quando a nota entra numa viagem ela continua `pending`, e o despacho derivado (ADR-0074) segue lendo só o
eixo da viagem. Misturar os dois faria a separação de recebimento disparar o despacho de uma viagem que
ainda nem existe.

### 2. As regras de cada contratante são dado: o perfil de recebimento

`contractor_receiving_profiles`, uma linha por contratante, no molde de
`delivery_proof_setting_contractor_overrides`: FK composta `(company_id, contractor_id)` →
`contractors(company_id, id)`, `unique (company_id, contractor_id)`, PK `uuid`, sem ENUM nativo.
**Nenhum CNPJ de contratante entra em `src/`.**

**Ausência é ausência** (ADR-0048): contratante sem linha, ou com `is_enabled = false`, segue o fluxo de
hoje — nenhuma rota nova o afeta. As **regras do contratante** (janela, prazo, prévia, padrão, avaria) são
opcionais, e nulo é "o contratante não definiu", nunca "zero". `match_window_days` e
`weight_tolerance_percent` são outra coisa: **parâmetros do algoritmo de vínculo**, com padrão, por isso
`NOT NULL`.

| Coluna                            | Tipo           | Regra                                    | Para quê                                                          |
| --------------------------------- | -------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| `is_enabled`                      | `boolean`      | not null, default `false`                | o perfil só vale ligado; desligar devolve o fluxo de hoje         |
| `separation_window_hours`         | `smallint`     | nulo, `1..168`                           | janela de separação/avaria desde a chegada (Fase 2/3)             |
| `delivery_deadline_business_days` | `smallint`     | nulo, `1..60`                            | prazo de entrega em dias úteis — **lido pela spec 236**           |
| `match_window_days`               | `smallint`     | not null, default `15`, `1..60`          | até quantos dias depois da prévia um XML ainda é candidato (RF5a) |
| `weight_tolerance_percent`        | `numeric(5,2)` | not null, default `0`, `0..100`          | tolerância do peso no vínculo; `0` porque o peso medido é exato   |
| `preview_enabled`                 | `boolean`      | not null, default `false`                | o contratante manda prévia                                        |
| `preview_sheet_name`              | `text`         | nulo, 1..31 caracteres (limite do Excel) | aba que tem os dados (`IMPORTAÇÃO`); nula = a primeira aba        |
| `preview_column_map`              | `jsonb`        | nulo, objeto; exigido com prévia ligada  | **nome de coluna → campo** da prévia, nunca posição               |
| `arrival_reference_pattern`       | `text`         | nulo, 1..200 caracteres                  | expressão que lê `NroCarga` do `infCpl` (fase futura)             |
| `requires_damage_check`           | `boolean`      | not null, default `false`                | conferência de avaria na entrada (Fase 3, D4 aberta: só dado)     |

Mais `id`, `company_id`, `contractor_id`, `created_at`, `updated_at`. CHECK de consistência:
`not preview_enabled or preview_column_map is not null` — prévia ligada sem mapa é prévia que o worker
nunca vai conseguir ler.

O formato de `preview_column_map` é validado na fronteira (Zod): chaves só entre os campos de item da
prévia (`contractorReference`, `recipientCode`, `recipientName`, `weightKg`, `volumeM3`, `value`,
`address`, `neighborhood`, `city`, `state`, `postalCode`, `routeName`, `routingDate`), valor = nome de
coluna (1..80 caracteres), no máximo 20 entradas, sem coluna repetida **depois de normalizar** (espaço
das pontas e caixa — a mesma normalização que o leitor da planilha vai usar). Com `preview_enabled`, o
mapa precisa ter pelo menos `routeName`, `value` e `weightKg`, que são o mínimo do vínculo (RF5a). O banco
só garante que é objeto.

`arrival_reference_pattern` é **dado**, nunca executado nesta fase. Na gravação: ≤ 200 caracteres,
compila com a flag `u` (em `try/catch`, erro vira 400 do campo), tem **exatamente um grupo de captura** (o
valor da carga) e recusa o que faz o motor retroceder sem limite: **quantificador aninhado** (`(a+)+`,
`(a*){2,}`), **grupo quantificado com alternação** (`(a|ab)+`), **referência para trás** (`\1`, `\k<x>`)
e **lookaround**. O padrão vai rodar sobre texto de NF-e de terceiro, e retrocesso catastrófico é negação
de serviço. Esse filtro é a primeira barreira, não a garantia: a fase que executar o padrão limita o
tamanho da entrada (`infCpl`) e roda com prazo, porque o motor de expressão do Bun (JavaScriptCore) também
retrocede.

#### As regras valem para a chegada que ainda vai nascer

Editar o perfil **nunca** age sobre chegada que já existe. A chegada (Fase 2) copia, no momento do
registro, o `separation_due_at` (de `separation_window_hours`) e o prazo em dias úteis (de
`delivery_deadline_business_days`, que a 236 lê); mudar o prazo de 3 para 5 dias amanhã não refaz o prazo
nem o selo das entregas de hoje. `separation_window_hours` nulo é chegada **sem relógio de separação**; o
que isso significa para a avaria de entrada é decisão da T3.1 (D4 aberta).

#### O que divergiu do RF1 da spec, e por quê

- **`preview_sender_allowlist` fica para a Fase 4b.** Quem é o remetente depende da D6 (endereço próprio
  × encaminhamento × caixa conectada); na opção (b) o remetente verificado passa a ser o da
  transportadora. Gravar a lista agora seria fixar uma semântica que a D6 pode inverter. Entra como
  coluna aditiva quando a D6 fechar.
- **`grouping` não vira coluna.** O usuário decidiu que a primeira separação é por rota × cidade; uma
  coluna com um único valor possível é configuração morta. Se outro contratante agrupar diferente, a
  coluna nasce aditiva, com o valor de hoje como padrão.
- **Acrescentados** `match_window_days`, `weight_tolerance_percent`, `preview_sheet_name` e
  `arrival_reference_pattern`: são os parâmetros que o vínculo por conteúdo (RF5a) e a leitura da planilha
  (RF4) precisam, e que a análise mostrou variar por contratante (aba, nomes de coluna, padrão do
  `infCpl`).
- **`notes` não entrou** (estava no pedido da T1.1): `contractors.notes` já existe, e duas observações na
  mesma ficha confundem quem lê.
- **Risco registrado:** o contratante é **um** CNPJ. Emitente com filiais vai precisar de uma lista de
  emitentes por perfil — aditiva, quando aparecer.

### 3. Prévia = chegada

Decisão do usuário: **1 prévia = 1 chegada**. Ao ler a prévia o sistema propõe a chegada (contratante, dia
planejado, roteiros, notas esperadas) e o operador só confirma a hora em que o caminhão chegou. O `LACRE`
dos XMLs (3 lacres para 18 cargas) é informação de apoio, não chave.

### 4. O vínculo da linha com a nota é por conteúdo, nunca por número

Detalhe medido em `planilha-fr.md`. Em resumo, dentro do universo de **um** contratante (notas do
emitente, não vinculadas, importadas depois do e-mail e dentro de `match_window_days`), em três níveis:
roteiro (`RouteName`) ↔ carga (`NroCarga` do `infCpl`, lido pelo `arrival_reference_pattern`) pelo
encaixe de totais; cliente dentro do grupo; e **n linhas ↔ 1 nota** pela soma exata de valor e peso (uma
NF junta vários pedidos do mesmo cliente). Veredito por linha `matched | ambiguous | suggested |
awaiting_xml | invalid`, sempre corrigível pelo operador. O vínculo é **assíncrono**: nasce quando o XML
é importado, porque a prévia chega antes da emissão.

### 5. Ler e gravar o perfil

`GET /contractors/:id/receiving-profile` devolve `{ data: null }` (200) para contratante sem perfil (e a
linha, com `isEnabled: false`, quando o perfil existe desligado), e `404 CONTRACTOR_NOT_FOUND` para
contratante de outra empresa ou inexistente. Leitura é `fleet.read`, como a do próprio contratante.

`PUT` substitui o perfil inteiro e **exige todas as chaves**, com `null` explícito onde não há regra:
campo omitido é `400`, não "volta ao padrão". O painel é PWA com cache; quando a Fase 4b acrescentar uma
coluna, um cliente antigo que omitisse o campo novo apagaria o valor sem erro nenhum — com a chave
obrigatória, ele recebe `400` e o problema aparece. O `PUT` é idempotente e audita em `audit_logs` só
quando algo mudou (o corpo devolvido pelo `GET`, reenviado, não grava nada). Escrever é
`settings.manage`: o perfil decide prazo e janela cobrados de outra empresa. `companyId` vem sempre do
contexto autenticado.

O módulo é novo, `src/cargo-receiving/` (as fases seguintes — chegada, prévia, vínculo — moram nele), e
confere a existência do contratante por consulta própria filtrada pela empresa, sem importar o repositório
de `delivery-clients`.

## Consequências

- Contratante novo com regra diferente é cadastro, não deploy.
- A spec 236 lê `delivery_deadline_business_days` sem depender do resto do módulo.
- O agregado `Contractor` **não muda**: o perfil é recurso separado, e as guardas de chave exata do
  painel continuam valendo sem alteração.
- A tabela do worker (`apps/worker-transportada/.../delivery-client.schema.ts`) não ganha nada até a fase
  que o worker ler o perfil.
- Os relógios e a avaria (Fases 2 e 3) e a prévia (Fase 4) leem esta tabela; nenhuma delas reescreve
  `trip_documents`.

## Alternativas descartadas

| Alternativa                                                             | Por que não                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regra por CNPJ no código (`if (taxId === …)`)                           | Produto genérico (ADR-0021): outra transportadora, outro contratante, e o código vira uma lista de clientes. O usuário já avisou que outros contratantes terão outra regra                                                                                        |
| Colunas novas em `company_delivery_proof_settings` (ou na exceção)      | Aquela tabela é o **formulário do comprovante** de entrega; recebimento é outro momento e outro dono. Misturar faz o `PUT` de um sobrescrever a regra do outro                                                                                                    |
| Colunas novas em `contractors`                                          | Muda o agregado `Contractor` (três guardas de chave exata no painel, `PATCH /contractors`) por um dado que só um contratante em dez terá; ausência fica difícil de ler                                                                                            |
| Relaxar o `NOT NULL` de `trip_document_occurrences.trip_document_id`    | Perde a garantia de que toda ocorrência pertence a algo; a avaria sem viagem (Fase 3) usa coluna irmã com `CHECK` de exatamente-um, decisão própria da T3.1                                                                                                       |
| Reaproveitar `separation_status` para a primeira separação              | A nota não está em viagem; o despacho derivado (ADR-0074) passaria a reagir a uma separação de galpão                                                                                                                                                             |
| Guardar só o rótulo (`NroCarga`) e extrair com expressão fixa do código | Mais seguro, e foi sugerido na revisão; ficou a expressão porque a análise só viu um contratante, e o formato do `infCpl` de outro emitente (`Carga: 123`, `CARGA N. 123/A`) não é conhecido. Fica como alternativa se o filtro de padrão se mostrar insuficiente |
| Mapa de colunas por posição (`A`, `B`, …)                               | O contratante reordena colunas; por nome, a mudança vira erro de coluna faltando, não dado trocado em silêncio                                                                                                                                                    |
