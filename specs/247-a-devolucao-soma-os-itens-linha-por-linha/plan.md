# Plano técnico

## Contexto e premissas (conferidas em `origin/staging` `687473e1f`, 2026-10-06)

Specs lidas, com `tasks.md` e `evidence.md` conferidos contra o código: 079 (só nos commits
`65329a39d`, `76566f2cb`, `66600dfe6`; as pastas `specs/079-*` são de outros assuntos), 143, 144,
150, 156, 157, 161, 164, 166, 167, 172, 173, 179, 182, 183, 204, 208, 209, 211, 219, 240, 241, 242,
245 e 246. O que cada uma decidiu e esta spec **não** reabre:

| Spec      | Decisão que vale aqui                                                                                | Onde no código                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 079       | modelo de e-mail no tipo, lista fechada, recusa no cadastro                                          | `trips/domain/occurrence-template.policy.ts:16-28`, `:106-112`; `trips/presentation/occurrence.schema.ts:417-430`                        |
| 164       | tratativa (`redelivery_authorized`, `goods_paid`, `other`), acerto por item, `returned_goods`        | `trip.schema.ts:186-190`, `:3196-3275`; `delivery-client.schema.ts:386-490`; `occurrence-case.policy.ts:23` (`unset` não abre tratativa) |
| 166 / 172 | quantidade por item `numeric(12,3)` e unidade = `uCom` da nota                                       | `trip.schema.ts:2522`, `:2529`                                                                                                           |
| 167 / 240 | correção guarda `previous_items`; tela de correção                                                   | `correct-occurrence-items.use-case.ts`; `TripOccurrenceCorrectionForm.component.tsx:51-100`                                              |
| 183       | aviso automático à contratante por `emails_contractor` + `email_subject`/`email_body`                | `send-automatic-occurrence-mail.use-case.ts:82-89`; `drizzle-occurrence-mail.repository.ts:176-229`                                      |
| 241       | `items_mode`, CHECK `off ⇒ redelivery_policy = unset`                                                | `trip.schema.ts:2677`, `:2773`                                                                                                           |
| 246       | momentos como conjunto, `note_mode`/`signature_mode`, mínimos, exceção campo a campo nula, aba Tipos | `trip-occurrence.constant.ts:61-66`; `occurrence-type-moment.schema.ts:20`; `TripOccurrenceTypesTab.component.tsx`                       |

Fatos que sustentam a spec:

- **Itens da NF-e:** `nfe_products` (`nfe.schema.ts:779-815`) tem `code` (cProd), `description`,
  `commercial_unit` (uCom), `quantity`, `unit_value` (vUnCom) e `total_value` (vProd), os três
  últimos `numeric(19,4)` (`decimalColumn`, `:70`). Gravados pelo worker a partir do pacote fiscal
  (`drizzle-nfe-import-consumer.repository.ts:465-478`). **Não há EAN** na linha (o GTIN vai para
  `nfe_package_boxes.carton_gtin`) — o "2073170 02" do SAC é o `cProd`.
- **Itens da ocorrência:** `trip_document_occurrence_products` (`trip.schema.ts:2508-2590`) tem
  `product_code`, `position`, `quantity`, `quantity_unit`. **Nenhum valor monetário.**
- **Leitura para o modelo:** `readOccurrenceTemplateValues` (`delivery-proof-read.support.ts:~1223-1311`)
  usa `listDocumentProducts` (`:327-361`), que lê `nfeProducts.quantity` — daí o
  `{{quantidadeItem}}` errado. `totalValue` sai cru (`:1306`).
- **Junção por vírgula:** `buildOccurrenceItemValues` (`occurrence-template.policy.ts:128-138`).
- **Escape:** `renderOccurrenceTemplate` gera texto; o HTML é escapado depois por
  `buildOccurrenceMail` (`occurrence-mail.template.ts:28-47`) com `escapeMailHtml`
  (`mail-template-render.policy.ts:85-92`). Esta spec mantém isso: a linha de item é texto, e o
  `\n` entre linhas vira `<br>` no HTML escapado.
- **Dois avisos, dois destinatários:** `notifies` + `email_template_key` → quem despachou a viagem
  (`occurrence-notifier.gateway.ts:24-27`, `:70`); `emails_contractor` + `email_subject`/`email_body`
  → contratante da nota (183). O save zera o segundo quando há o primeiro
  (`save-occurrence-type.use-case.ts:147`); a dica do painel chama o primeiro de "e-mail que o
  contratante recebe" (`companySettings.locale.json:440`).
- **App do motorista:** só o chip "A nota inteira" (`OccurrenceProductsField.component.tsx:14-37`); o
  envio não manda `productCodes` (`occurrenceDispatch.service.ts:127-135`); o snapshot não traz
  produtos (`drizzle-current-driver-trip.repository.ts` não lê `nfe_products`); a rota de registro
  do motorista não aceita itens (`register-driver-occurrence.use-case.ts`). O mínimo de produtos da
  246 não é cumprido no app (ressalva registrada no `evidence.md` da 246).
- **Dinheiro na base:** o padrão de conta em inteiro já existe em `billing.use-case.ts:530-546`
  (`parseMoney` → `bigint` centavos → `formatMoney`).
- **Rótulos atuais dos momentos:** `companySettings.locale.json:425-429` — "Separação no galpão",
  "Entrega da nota", "Chegada à parada", "Escritório, pelo motorista"; filtro `:466-469`.

## Modelo de dados (🧠 — validar com `architect` antes)

**`company_occurrence_types`** (aditivo, defaults que não mudam nada existente):

```sql
reference_number_mode   varchar(16) NOT NULL DEFAULT 'off'      -- CHECK IN DELIVERY_PROOF_FIELD_MODES
reference_number_label  varchar(40) NOT NULL DEFAULT 'Número do documento do cliente' -- CHECK btrim <> ''
declared_amount_mode    varchar(16) NOT NULL DEFAULT 'off'      -- CHECK IN DELIVERY_PROOF_FIELD_MODES
declared_amount_scope   varchar(16) NOT NULL DEFAULT 'item'     -- CHECK IN ('item','occurrence')
declared_amount_label   varchar(40) NOT NULL DEFAULT 'Valor pago'
email_item_line_template text        NOT NULL DEFAULT ''        -- CHECK char_length <= 400
-- CHECK company_occurrence_types_declared_amount_items_check:
--   declared_amount_mode = 'off' OR declared_amount_scope = 'occurrence' OR items_mode <> 'off'
```

**Exceções** (`company_occurrence_type_contractor_overrides`, `..._recipient_overrides`):
`reference_number_mode`, `declared_amount_mode` — **nulos, sem default** (D-a da 246).

**`trip_document_occurrences`:** `reference_number varchar(30) NULL` (CHECK
`reference_number ~ '^[A-Za-z0-9 ./-]{1,30}$'`), `declared_amount numeric(14,4) NULL` (CHECK `>= 0`).

**`trip_document_occurrence_products`:** `unit_value numeric(19,4) NULL` (cópia do `vUnCom` no
registro; nulo nas linhas antigas), `declared_amount numeric(14,4) NULL` (CHECK `>= 0`).

As CHECKs de vocabulário são **geradas das constantes** (`DELIVERY_PROOF_FIELD_MODES`,
`OCCURRENCE_DECLARED_AMOUNT_SCOPES` nova em `trip-occurrence.constant.ts`), como a da 246.

`rollback.sql`: derruba só o que esta spec cria (CHECKs, colunas, registro do journal com
`ROW_COUNT = 1`); registra o que se perde (números e valores digitados). **Não toca** colunas da
241/246.

Por que copiar `unit_value` em vez de ler da NF-e na hora: a NF-e não muda, mas a ocorrência aponta
produto por **código** (166), não por linha, e uma nota pode ter o mesmo código em duas linhas; a cópia
fixa qual valor o registro usou (história imutável, constituição §5). Alternativa descartada: guardar o
`ordinal` da linha — muda a chave da 166 e todas as leituras; custo alto para um caso raro.

## Cálculo (domínio puro, `trips/domain/occurrence-amount.policy.ts`)

```text
quantidade  numeric(12,3)  → inteiro em milésimos
valor unit. numeric(19,4)  → inteiro em décimos de milésimo
produto     → 10^-7 de real → arredonda meio para cima a centavos → bigint centavos
soma da linha  = round(q × vUn)        (q nulo → total_value da NF-e, arredondado)
valor da linha = declared_amount da linha ?? soma da linha
somaItens      = Σ soma da linha
valorDeclarado = declared_amount da ocorrência ?? Σ valor da linha
```

Formatação: `formatBrazilianAmount(cents: bigint): string` → `7.840,64` (sem símbolo). Quantidade:
`formatBrazilianQuantity` → `1`, `2,5`, `0,125`. Os dois em `shared/` da API **e** espelhados no
`frontend-driver` e no `frontend-transportada` (nenhuma app importa código de outra): um contrato
de tabela compartilhada (mesmos casos, três arquivos) prova que os três calculam igual.

Nada de `Number()`/`parseFloat` sobre valor: contrato de parede no arquivo de política **e** mutação
que troca por `Number` e fica vermelha num caso que o binário erra (`0,1 + 0,2`; `3 × 19,995`).

## Marcadores (`occurrence-template.policy.ts`)

- A lista fechada vira **duas** constantes: `OCCURRENCE_TEMPLATE_PLACEHOLDERS` (assunto/corpo) e
  `OCCURRENCE_ITEM_LINE_PLACEHOLDERS` (linha). `unknownTemplatePlaceholders` ganha o contexto.
- `{{linhasItens}}` é resolvido **antes** dos outros: para cada item, renderiza a linha com os
  valores do item + os da ocorrência; junta com `\n`. Valor de item nunca é re-renderizado (um
  `{{` dentro da descrição do produto sai literal — contrato).
- `buildOccurrenceItemValues` continua para os marcadores antigos no corpo (`{{item}}`,
  `{{codigoItem}}`, `{{quantidadeItem}}` com vírgula) — compatibilidade com modelos gravados.
- O schema Zod do cadastro valida `email_item_line_template` com o contexto de linha, e assunto
  **sem** `{{linhasItens}}` (uma linha só).

## Rótulos da tela

`companySettings.locale.json` (ou o locale da aba, se a 246 o moveu):

| Chave                       | Hoje                                            | Proposto                                                                                                      |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| título do bloco de momentos | Em que momento pode acontecer                   | Quem registra, e onde                                                                                         |
| `separation`                | Separação no galpão                             | Separador, no galpão                                                                                          |
| `document`                  | Entrega da nota                                 | Motorista, numa nota                                                                                          |
| `stop`                      | Chegada à parada                                | Motorista, na parada                                                                                          |
| `office`                    | Escritório, pelo motorista (filtro: Escritório) | Escritório, pelo motorista (filtro igual)                                                                     |
| dica de cada momento        | —                                               | o exemplo da tabela da spec                                                                                   |
| `notification.title`        | Notificação                                     | Aviso interno                                                                                                 |
| `notification.templateHint` | "O e-mail que o contratante recebe…"            | "Aviso a quem despachou a viagem, pelo módulo de Notificações. O e-mail à contratante fica no bloco ao lado." |

Os rótulos de momento aparecem também no filtro e no resumo da linha recolhida; todos saem da mesma
chave. Contrato de texto não basta (memória "Contrato de parede afirma permissão"): o teste renderiza
a aba e procura o rótulo **no controle**.

## Arquitetura e arquivos afetados

**API** (`apps/api-transportada`)

- `src/database/trip.schema.ts` — colunas e CHECKs acima; `db:generate`.
- `src/shared/trip-occurrence.constant.ts` — `OCCURRENCE_DECLARED_AMOUNT_SCOPES`.
- `src/trips/domain/occurrence-amount.policy.ts` (novo) — cálculo e formatação.
- `src/trips/domain/occurrence-template.policy.ts` — marcadores novos, contexto, `linhasItens`.
- `src/trips/presentation/occurrence.schema.ts` — campos do tipo, validação de contexto.
- `src/trips/application/save-occurrence-type.use-case.ts` (+ `save-occurrence-type-values.mapper.ts`)
  — sem zerar assunto/corpo (RF2); `422` da RF1; valores efetivos com `stored` como na 246.
- `src/trips/application/register-trip-occurrence.use-case.ts` — `renderEmail` independe da chave.
- `src/trips/application/register-driver-occurrence.use-case.ts` (+ `.types.ts`, `me-trip.routes.ts`)
  — itens com quantidade e valor pago, número, valor da ocorrência; exigência efetiva
  (`resolveWithOverrides`, mesma resolução da 246); `unit_value` lido da nota no servidor.
- `src/trips/infrastructure/drizzle-current-driver-trip.repository.ts` — produtos por nota no
  snapshot (uma consulta por viagem, não por nota).
- `src/trips/infrastructure/delivery-proof-read.support.ts` — `readOccurrenceTemplateValues` lê
  quantidade da ocorrência, `unit_value`, valores pagos, número; formata dinheiro.
- `src/trips/application/correct-occurrence-items.use-case.ts` — número e valores, `previous_items`.
- `src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.ts` — prévia e aviso
  automático passam pelos valores novos (mesmo leitor).
- Rota nova `POST /company-settings/occurrence-types/email-preview` (`settings.manage`, rate limit do
  padrão da rota de prévia da 183).

**Painel** (`apps/frontend-transportada`)

- `modules/trip/shared/tripResponse.validation.ts` — aceita as chaves novas como opcionais
  (etapa tolerante) e passa a ler `emailsContractor`, `emailSubject`, `emailBody`.
- `modules/trip/components/OccurrenceTypeRequirementFields.component.tsx` — linhas "Número do
  documento do cliente" e "Valor pago" no mesmo `Select` de três estados; rótulo editável; escopo.
- `OccurrenceTypeContractorMail.component.tsx` (novo) — interruptor, assunto, corpo, linha de item,
  marcadores clicáveis, prévia (rota da RF4, com `debounce`).
- `OccurrenceTypeNotification.component.tsx` — vira "Aviso interno", dica corrigida.
- `OccurrenceTypeExceptions.component.tsx` — as duas colunas novas com "Igual ao tipo".
- `OccurrenceTypeMoments.component.tsx` + locale — rótulos e dicas.
- `TripOccurrenceCorrectionForm.component.tsx` — número, valor pago por linha/ocorrência, somas.
- `OccurrenceSettlementPanel.component.tsx` — sugestão de valor (RF12).

**App do motorista** (`apps/frontend-driver`)

- `OccurrenceProductsField.component.tsx` — lista de produtos, quantidade, soma da linha, valor pago.
- `DriverOccurrenceRegistrationForm.component.tsx` — número, total, valor da ocorrência.
- `shared/occurrenceRequirements.service.ts` — exigências novas e o mínimo de produtos.
- `shared/occurrenceDispatch.service.ts` — envia itens/número/valor pela fila.
- `shared/occurrenceAmount.service.ts` (novo) — espelho do cálculo.
- validação do snapshot — produtos opcionais (tolerante).

## Ordem de publicação (ADR-0081 §9)

1. **Painel e app tolerantes**: validações aceitam as chaves novas como opcionais; nenhuma tela as
   escreve. Sem API nova.
2. **Banco + API**: migration, leitura e escrita; o `PUT` sem os campos novos mantém os gravados
   (como a 246 faz com `moments`). A rota do motorista aceita itens **opcionais** — o app antigo
   continua registrando.
3. **Telas**: aba Tipos, correção, acerto, app do motorista.

A API não é revertida com a app nova no ar. `rollback.sql` só antes da etapa 3.

## Testes

- Contratos de domínio: cálculo (tabela de casos, incluindo os que o binário erra), formatação,
  marcadores por contexto, `linhasItens`, recusas.
- **CA03 (só a configuração decide):** fixture com dois tipos `{ name: 'X', ...config A }` e
  `{ name: 'X', ...config B }`, e dois com nomes diferentes e mesma config; o contrato afirma
  exigências e e-mail. Mutação: um `if (type.name === …)` em `renderEmail` ou na exigência deixa
  vermelho; outra mutação: ler `declared_amount_mode` do tipo e não do efetivo.
- Integração (`test/integration/*.integration.ts`, **na lista do `package.json`**, rodada com
  `--env-file=../../.env.test`): migration (valores das colunas em dado semeado antes), registro do
  motorista com exceção, `unit_value` do servidor, aviso automático com o modelo do SAC, RF2.
- App do motorista e painel: contratos de componente (botão desabilitado, somas, prévia).
- `make migration-test`.

## Decisões por delegação (2026-10-06 — o usuário pode reverter antes da execução)

| #   | Decisão                                                                      | Alternativa descartada                          | Custo de reverter                                                                                                           |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| D1  | Soma calculada + valor pago digitado opcional/obrigatório por tipo (opção C) | só calculada; só digitada; usar o acerto da 164 | baixo: configuração                                                                                                         |
| D2  | Número do documento do cliente é **campo próprio** com modo e rótulo no tipo | usar a observação obrigatória (`note_mode`)     | médio: migration aditiva para tirar; a observação já carrega o motivo, e o número precisa de marcador próprio para o e-mail |
| D3  | Arredondamento meio para cima por linha, soma das linhas arredondadas        | arredondar só a soma                            | baixo: uma função                                                                                                           |
| D4  | Dinheiro nos marcadores sem símbolo (`7.840,64`)                             | com `R$`                                        | baixo; com símbolo quebraria `R$ {{valorNota}}` gravado                                                                     |
| D5  | `{{quantidadeItem}}` passa à quantidade da ocorrência                        | manter a da NF-e                                | baixo                                                                                                                       |
| D6  | `{{numeroNotaSemSerie}}` novo; `{{numeroNota}}` não muda                     | mudar `{{numeroNota}}`                          | baixo                                                                                                                       |
| D7  | Configurar/renomear os tipos existentes; nada de seed com reconciliação      | tipos novos; seed                               | baixo: renomear                                                                                                             |
| D8  | Exceção cobre só os dois modos novos; modelo de e-mail não é por contratante | modelo por contratante                          | médio: colunas nulas a mais                                                                                                 |
| D9  | `unit_value` copiado no registro                                             | ler da NF-e na leitura; guardar `ordinal`       | médio                                                                                                                       |
| D10 | Rótulos de momento "Quem registra, e onde"                                   | só dica                                         | baixo: locale                                                                                                               |
| D11 | Valor pago por linha pré-preenche o acerto da 164, sem mudar regra           | gravar o acerto no registro                     | baixo                                                                                                                       |
| D12 | Escritório completa pela correção, não pelo diálogo "em nome de"             | ampliar o diálogo                               | médio                                                                                                                       |

## Riscos

- **Snapshot maior.** Nota com centenas de linhas engorda o snapshot do motorista. Mitigação: só
  campos usados, e medir o tamanho na T5.x com a maior nota de staging; acima de 256 KiB, paginar por
  nota sob demanda (registrar em `evidence.md`).
- **Modelo antigo que dependia da quantidade da NF-e** muda de número (D5) — declarado.
- **Mesmo `cProd` com valores diferentes** — aviso na tela e valor pago obrigatório na linha.

## Protótipo (`preview.html`) — medição de 2026-10-06

Servido por `python3 -m http.server` e medido no navegador embutido com `iframe` de largura exata,
nas duas telas (configuração do tipo; registro com os três produtos marcados):

| Largura | Estouro horizontal | Elemento fora dos limites | Alvo de toque < 44 px | Texto cortado | Contraste mínimo |
| ------- | ------------------ | ------------------------- | --------------------- | ------------- | ---------------- |
| 320     | 0                  | 0                         | 0                     | 0             | 5,35:1           |
| 375     | 0                  | 0                         | 0                     | 0             | 5,35:1           |
| 768     | 0                  | 0                         | 0                     | 0             | 5,35:1           |
| 1280    | 0                  | 0                         | 0                     | 0             | 5,35:1           |

O botão desabilitado media 4,30:1 na primeira passada e foi corrigido (texto `--color-fog`). As
caixas de seleção têm 20 px, mas o alvo é o rótulo inteiro (`label.check`, ≥ 44 px). A conta do
protótipo foi conferida: `1 × 57,20 + 3 × 49,995 = 57,20 + 149,99 = 207,19`; com 50,00 digitado na
primeira linha, `NFD 45029 – R$ 199,99`. A prévia do protótipo é calculada no navegador só para
ilustrar; no produto ela vem do servidor (RF4).

### Seletores: cópia fiel do `Select` da aplicação (medido em 2026-10-06)

Os oito `<select>` nativos do protótipo (os cinco de exigência, "Onde se digita o valor pago" e os dois da exceção) foram trocados pela **mesma marcação e o mesmo CSS** do `Select` real (`apps/frontend-transportada/src/components/ui/select.tsx` + `select.module.css`, `icon.module.css`, tokens de `index.css`, tudo de `origin/staging`): raiz → gatilho `button[aria-haspopup=listbox][aria-expanded]` com valor e seta `chevron-down` → painel `role=listbox` com `role=option` e `aria-selected`. Exigência e "Digitado" usam o gatilho normal de 48 px; as duas exceções, o compacto (38,4 px, 44 px no toque), como na tela de exceções da 246. A lógica do protótipo continua lendo `[data-req=…].value` e o evento `change`, e a prévia obedece (conferido: trocar "Valor pago" para Obrigatório refaz as linhas). Os estados fechado, aberto, desabilitado e com foco estão na cartela "Seletor · estados do controle real", no fim da tela de configuração. Nenhum arquivo de `apps/*/src` foi tocado.

**Método.** Subi o Vite do worktree `spec-239` (idêntico a `origin/staging` em `ui/` e `styles/`), porta 53090, e renderizei **os componentes reais** (importados do servidor do Vite, com o CSS da aplicação) numa coluna de 328 px: `Select` compacto e normal, com valor, sem valor e desabilitado. Medi os estilos **computados** de cada parte (gatilho fechado e aberto, painel, opção normal/ativa/selecionada, foco por Tab real, hover por ponteiro real) e repeti **o mesmo script** nos seletores do protótipo, na mesma janela (490 × 766, a do painel do navegador embutido, sem emulação). Resultado: **1114 de 1114 propriedades iguais** (tolerância de 1 px nas dimensões; as transições foram terminadas com `getAnimations().finish()` porque a janela embutida fica `hidden` e não anima). O foco no protótipo (`solid 2px #d58a47@70% off 2px`) e o hover (`#d58a47@45%`) foram medidos **na própria página** da 247, onde existe a regra global `button:focus-visible`, e batem com o real.

⚠️ O CSS lido primeiro foi o do checkout principal, que está atrás da staging (opção ativa a 16% de cobre); a fonte da verdade é `origin/staging` (10% e 5%), e a medição acima é contra ela. Além da cópia, a página da 247 pedia três ajustes: `body { line-height: 1.4 }` esticava gatilho e opção (agora `line-height: normal` na raiz do seletor, como na aplicação), a regra global de `input[type=text]` capturaria a busca do painel (agora exclui `role=combobox`), e o painel fechava por qualquer rolagem em vez de só quando o gatilho se move (como `useFloatingLayer`).

#### Real × protótipo (propriedade → real → protótipo → igual?)

| Propriedade                    | Real                                       | Protótipo                                  | Igual? |
| ------------------------------ | ------------------------------------------ | ------------------------------------------ | ------ |
| **Gatilho fechado (compacto)** |                                            |                                            |        |
| altura                         | `38.3984px`                                | `38.3984px`                                | sim    |
| padding (topo/dir)             | `8px / 12px`                               | `8px / 12px`                               | sim    |
| borda                          | `1px / solid / #8fa3ad@32%`                | `1px / solid / #8fa3ad@32%`                | sim    |
| raio                           | `0px`                                      | `0px`                                      | sim    |
| fundo                          | `#10222c@84%`                              | `#10222c@84%`                              | sim    |
| cor do valor                   | `#f0f2ee`                                  | `#f0f2ee`                                  | sim    |
| fonte (tam/peso)               | `13.12px / 400`                            | `13.12px / 400`                            | sim    |
| família                        | `Avenir Next…`                             | `Avenir Next…`                             | sim    |
| linha                          | `normal`                                   | `normal`                                   | sim    |
| gap                            | `12px`                                     | `12px`                                     | sim    |
| sombra                         | `none`                                     | `none`                                     | sim    |
| seta: tamanho                  | `17.5938px / 17.5938px`                    | `17.5938px / 17.5938px`                    | sim    |
| seta: opacidade                | `0.7`                                      | `0.7`                                      | sim    |
| seta: folga à direita          | `13`                                       | `13`                                       | sim    |
| seta: traço                    | `1.8px / M6 9l6 6 6-6`                     | `1.8px / M6 9l6 6 6-6`                     | sim    |
| **Gatilho normal (48 px)**     |                                            |                                            |        |
| altura                         | `48px`                                     | `48px`                                     | sim    |
| padding                        | `12px / 12px`                              | `12px / 12px`                              | sim    |
| fonte                          | `14.4px`                                   | `14.4px`                                   | sim    |
| **Placeholder**                |                                            |                                            |        |
| cor                            | `#9aacb5`                                  | `#9aacb5`                                  | sim    |
| **Desabilitado**               |                                            |                                            |        |
| borda                          | `dashed / #8fa3ad@32%`                     | `dashed / #8fa3ad@32%`                     | sim    |
| cor do valor                   | `#9aacb5`                                  | `#9aacb5`                                  | sim    |
| cursor                         | `not-allowed`                              | `not-allowed`                              | sim    |
| opacidade                      | `1`                                        | `1`                                        | sim    |
| **Aberto: gatilho/seta**       |                                            |                                            |        |
| borda                          | `#d58a47@60%`                              | `#d58a47@60%`                              | sim    |
| seta                           | `matrix(-1, 0, 0, -1, 0, 0) / #d58a47 / 1` | `matrix(-1, 0, 0, -1, 0, 0) / #d58a47 / 1` | sim    |
| **Painel (Select)**            |                                            |                                            |        |
| posição                        | `fixed`                                    | `fixed`                                    | sim    |
| borda                          | `1px / #8fa3ad@45%`                        | `1px / #8fa3ad@45%`                        | sim    |
| fundo                          | `#1c2b33`                                  | `#1c2b33`                                  | sim    |
| sombra                         | `#10222c@72% 0px 8px 20px 0px`             | `#10222c@72% 0px 8px 20px 0px`             | sim    |
| max-height                     | `256px`                                    | `256px`                                    | sim    |
| min-width/largura              | `328px / 328`                              | `328px / 328`                              | sim    |
| folga do gatilho               | `4`                                        | `4`                                        | sim    |
| padding da lista               | `4px / 4px`                                | `4px / 4px`                                | sim    |
| raio                           | `0px`                                      | `0px`                                      | sim    |
| z-index                        | `60`                                       | `60`                                       | sim    |
| **Opção normal**               |                                            |                                            |        |
| altura                         | `34.5`                                     | `34.5`                                     | sim    |
| padding                        | `8px / 12px`                               | `8px / 12px`                               | sim    |
| borda esq.                     | `2px / rgba(0, 0, 0, 0)`                   | `2px / rgba(0, 0, 0, 0)`                   | sim    |
| cor                            | `#f0f2ee`                                  | `#f0f2ee`                                  | sim    |
| fonte                          | `13.6px / 400`                             | `13.6px / 400`                             | sim    |
| **Opção ativa (hover)**        |                                            |                                            |        |
| borda esq.                     | `#d58a47@70%`                              | `#d58a47@70%`                              | sim    |
| fundo                          | `#d58a47@10%`                              | `#d58a47@10%`                              | sim    |
| cor                            | `#f0f2ee`                                  | `#f0f2ee`                                  | sim    |
| **Opção selecionada+ativa**    |                                            |                                            |        |
| cor                            | `#d58a47`                                  | `#d58a47`                                  | sim    |
| peso                           | `600`                                      | `600`                                      | sim    |
| fundo                          | `#d58a47@5%`                               | `#d58a47@5%`                               | sim    |
| borda esq.                     | `#d58a47@70%`                              | `#d58a47@70%`                              | sim    |
| **Foco (:focus-visible)**      |                                            |                                            |        |
| outline                        | `solid 2px #d58a47@70% off 2px`            | `solid 2px #d58a47@70% off 2px`            | sim    |
| **Hover do gatilho**           |                                            |                                            |        |
| borda                          | `#d58a47@45%`                              | `#d58a47@45%`                              | sim    |

**O que divergia antes:** `<select>` **nativo** (painel do sistema operacional, sem borda, fundo, sombra nem realce de cobre), altura fixa de 44 px em todos (a tela real é 48 px nos campos de formulário e 38,4 px nos compactos), seta nativa do navegador em vez do ícone `chevron-down` de 17,6 px com 70% de opacidade, fundo opaco `--color-asphalt` em vez de 84%, borda a 45% em vez de 32%, e foco de 2 px a 100% de cobre em vez de 70%.

#### Estouro, alvo e contraste (medido nas duas telas)

| Largura | Ponteiro | `scrollWidth` / `clientWidth` (configuração · registro) | Fora da janela | Recortes | Alvo < 44 px                                                                       |
| ------- | -------- | ------------------------------------------------------- | -------------- | -------- | ---------------------------------------------------------------------------------- |
| 320     | toque    | 320 / 320 · 320 / 320                                   | 0              | 0        | 0 (seletor e demais controles)                                                     |
| 375     | toque    | 375 / 375 · 375 / 375                                   | 0              | 0        | 0 (seletor e demais controles)                                                     |
| 768     | fino     | 768 / 768                                               | 0              | 0        | só o do ponteiro fino (gatilho compacto 38,4 px, opção 34,5 px), **igual ao real** |
| 1280    | fino     | 1280 / 1280                                             | 0              | 0        | idem                                                                               |

Painel interativo aberto a 320 px fica dentro da janela (46 → 274). Contraste do seletor: valor 14,3 · placeholder 6,9 · desabilitado 6,9 · opção 12,9 · opção ativa 11,2 · opção selecionada 5,2 (4,9 com o realce a 5%), todos ≥ 4,5:1.

**Não deu para igualar:** o painel das cartelas "estados" (aberto) fica **no fluxo** (`position: relative`) para a página mostrá-lo sem clique; o aberto **interativo** é `position: fixed` com a mesma conta de `resolveFloatingLayerPosition` e foi medido assim. A regra de toque do componente real (`@media (pointer: coarse)`) não foi medida na aplicação, só no protótipo emulado como toque (44 px); está no CSS copiado.
