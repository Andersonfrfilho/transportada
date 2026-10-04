# Evidência — Feature 241

## Fase 0

### T0.2 — a 239 ainda não criou `items_mode`

Conferido em `origin/staging` = `83813b1758b09e6e070e8b63679ed244374c086a` (2026-10-03):

```text
$ git grep -n -i -E "items_mode|itemsMode" origin/staging -- apps packages
(nenhuma linha; saída vazia)
```

Nem `items_mode` nem `itemsMode` existem em `apps/` ou `packages/`. Logo a 241 vai antes da 239 e
cria a coluna com `DEFAULT 'optional'`. A 239 (só em `work/spec-239`, sem código) **precisará** tirar
o `ADD COLUMN items_mode` da migration dela e o default `off` do plano. **Registrado, não
executado**: a spec da 239 não foi editada aqui.

### T0.3 — medição em staging e produção: PENDENTE, pede autorização

Medir em produção (Postgres-Hqfu) é ação em produção e exige o usuário; esta sessão não a executou.
As três perguntas, só leitura, sobre `company_occurrence_types`:

1. Quantos tipos têm o nome exato da segunda via do boleto e **qual `redelivery_policy` cada um tem**
   (a migration a zera para `unset`; política ≠ `unset` avisa o usuário antes da etapa 2).
2. O nome "Cliente pediu prorrogação do boleto" já existe?
3. Quantos tipos renomeados ficariam de fora do `UPDATE` da migration?

Status: **pendente, pede autorização.** Task T0.3 segue desmarcada.

## Fase 1 — Painel tolerante (etapa 1)

### T1.1 — guards tolerantes

Contrato: `test/trip/occurrence-items-mode-tolerance.contract.ts` (importado por
`test/trip.contract.test.ts`, que já está na lista do `package.json`).

Vermelho, antes do código (mesmo contrato, `src/` intocado):

```text
(fail) tipo do cadastro: itemsMode > presente (off e optional) é lido como veio
(fail) feed e detalhe: occurrenceTypeId, typeItemsMode, typeAllowsMultipleItems > forma errada em qualquer das três recusa o item
(fail) lista da nota: typeItemsMode e typeAllowsMultipleItems > aceita e preserva as chaves presentes
 7 pass
 3 fail
```

Verde depois: `-t "itemsMode|feed e detalhe|lista da nota: typeItems"` → 10 pass, 0 fail.
`bun run --cwd apps/frontend-transportada test` → 6676 pass + 397 pass (lote DOM), 0 fail;
`bun run typecheck` → sem erros.

Decisão: `itemsMode` do tipo do cadastro **não** ganha padrão no adaptador (ausente continua ausente) —
é o que permite à T1.5 oferecer o controle só quando a API o trouxer. `typeItemsMode` e
`typeAllowsMultipleItems` ausentes são lidos como `optional`/`true` por quem os usa
(`DEFAULT_OCCURRENCE_ITEMS_MODE`). `required` é aceito na leitura (vocabulário da coluna) e tratado
como "carrega itens"; a escrita só aceita `off | optional`.

### T1.2 — RF7 em `resolveOccurrenceCorrectionActions` (CA05)

Contrato primeiro: `test/trip/occurrence-correction-actions.contract.ts` ganhou `typeItemsMode` na
entrada e o bloco "Corrigir por tipo (spec 241 CA05)" (tabela de sete casos); os testes da 240 que
dependiam de "sem itens ⇒ sem Corrigir" passaram a declarar `typeItemsMode: 'off'`.
`test/trip/occurrence-correction-button.contract.tsx` (DOM do componente) ganhou os casos `off`,
`optional` e resposta sem o campo (API anterior lê `optional`).

Vermelho, antes do código:

```text
Expected: "enabled"
Received: "hidden"
(fail) ... > Corrigir por tipo (spec 241 CA05) > optional, sem itens, nunca corrigida (a avaria da nota inteira): Corrigir aparece e Cancelar continua
Expected: "enabled"
Received: "hidden"
(fail) ... > Corrigir por tipo (spec 241 CA05) > required, sem itens: Corrigir aparece e Cancelar continua
 33 pass
 2 fail
```

Implementação: `canCorrect = typeItemsMode !== 'off' || hasItems || wasCorrected`
(`tripOccurrenceDetail.service.ts`); o componente passa
`occurrence.typeItemsMode ?? DEFAULT_OCCURRENCE_ITEMS_MODE`.

Verde: `bun run --cwd apps/frontend-transportada test` → 6685 pass + 397 pass (lote DOM), 0 fail;
`bun run typecheck` sem erros; lint da app 0 erros (16 avisos já existentes).

### T1.3 — mutação: voltar o RF7 para `hasItems || wasCorrected`

Mutação em `tripOccurrenceDetail.service.ts` (`canCorrect = input.hasItems || input.wasCorrected`),
`bun run --cwd apps/frontend-transportada test`:

```text
(fail) Corrigir e Cancelar: ... > Corrigir por tipo (spec 241 CA05) > optional, sem itens, nunca corrigida (a avaria da nota inteira): Corrigir aparece e Cancelar continua
(fail) Corrigir e Cancelar: ... > Corrigir por tipo (spec 241 CA05) > required, sem itens: Corrigir aparece e Cancelar continua
(fail) botão Corrigir no detalhe da ocorrência (spec 240 T2.1) > tipo optional sem itens (a avaria da nota inteira) tem Corrigir e Cancelar
(fail) botão Corrigir no detalhe da ocorrência (spec 240 T2.1) > resposta sem typeItemsMode (API anterior) lê optional: Corrigir aparece sem itens
 6681 pass
 4 fail
```

Restaurado o arquivo (`git status` limpo na fonte): 6685 pass + 397 pass (lote DOM), 0 fail.

### T1.4 — RF8 (registro) e RF9 (correção com seleção única)

Contratos primeiro:

- `test/trip/occurrence-items-mode.contract.ts` — comportamento puro de
  `occurrenceItemsMode.service.ts` (leitura de `itemsMode`, limpeza da seleção ao trocar para `off`,
  primeira escolha para item único). Vermelho antes: `Cannot find module
'@/modules/trip/shared/occurrenceItemsMode.service'`.
- `test/trip-hooks/occurrence-register-items-mode.contract.ts` — `TripOccurrences` montado no DOM:
  tipo `optional` e tipo sem `itemsMode` mostram o seletor de produtos; tipo `off` não mostra; trocar
  de `optional` para `off` esconde e voltar mostra (usa o `Select` do design system de verdade).
- `test/trip-hooks/occurrence-correction-single-item.contract.ts` — o formulário de correção abre em
  seleção única com `typeAllowsMultipleItems: false`; com `true` ou campo ausente, seleção múltipla.

Vermelho do lote DOM, antes do código (`bun run test:hooks`):

```text
(fail) registro de ocorrência por tipo (spec 241 RF8, CA06) > tipo off não mostra o seletor de produtos
(fail) registro de ocorrência por tipo (spec 241 RF8, CA06) > trocar de optional para off esconde o seletor, e voltar o mostra
(fail) formulário de correção e o teto de um item (spec 241 RF9) > tipo de item único abre a correção em seleção única
 401 pass
 3 fail
```

Implementação: `TripOccurrences.component.tsx` esconde `OccurrenceProductSelect` e
`OccurrenceItemQuantities` quando o tipo é `off` e troca a seleção por
`resolveItemsOnTypeChange` (a regra da 166, "item único fica com o primeiro", passou para o serviço);
`TripOccurrenceCorrectionForm` recebe `allowsMultipleItems`, vindo de
`occurrence.typeAllowsMultipleItems ?? true`. `SeparationOccurrenceDialog` só empresta a moldura e
hospeda `TripOccurrences`, então o RF8 vale por ele sem mudança própria. Um teste de fonte da 166
(`occurrence-item-quantity-field.contract.ts`) procurava `productCodes.slice(0, 1)` no componente; a
regra mudou de lugar e ele passou a procurar `resolveItemsOnTypeChange`, com o comportamento coberto
pelo contrato puro acima.

Verde: `bun run --cwd apps/frontend-transportada test` → 6691 pass + 404 pass (lote DOM), 0 fail;
`bun run typecheck` sem erros; lint da app 0 erros.

### T1.5 — Produtos no cadastro de tipos (RF10, RF12) e mensagens por código (CA10, painel)

Contratos primeiro:

- `test/company-settings/occurrence-type-items-mode-body.contract.ts` — o corpo real do `PUT`
  (`createTripClient` com `fetch` dublado): Produtos Desligado, foto desligada, sem soltar a nota →
  `itemsMode: 'off'`, `redeliveryPolicy: 'unset'`, `flow: 'document'`, sem itens; sem `itemsMode` no
  input a chave não vai no corpo ("não mexa").
- `test/trip-hooks/occurrence-type-items-mode-panel.contract.ts` — `OccurrenceTypeCatalogPanel`
  montado no DOM, com o `Select` de verdade: listagem sem `itemsMode` não mostra Produtos; com ele
  mostra a escolha gravada; tipo Desligado esconde a política de reentrega e o "um ou vários";
  trocar para Desligado grava `itemsMode: 'off'` + `redeliveryPolicy: 'unset'` no mesmo `PUT` (o tipo
  tinha `blocked`); voltar a Opcional mantém a política gravada; as outras gravações não mandam
  `itemsMode`; **CA10**: cadastro novo com Etapa "Na rua" e Produtos Desligado esconde a política e
  grava o corpo exato da segunda via; política já escolhida na tela some e o corpo leva `unset`;
  sem listagem com `itemsMode` o cadastro novo não oferece nem manda Produtos.
- `test/trip/occurrence-items-mode-feedback.contract.ts` — `OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED` e
  `OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY` resolvem para chave de `trip.feedback.*` (o mecanismo
  da 240: `TRIP_FEEDBACK_KEY_BY_ERROR` + `resolveTripFeedbackKey`; não existe `getApiErrorCode()` nesta
  app), com texto pt-BR e en.

Vermelho, antes do código (`src/` revertido aos arquivos do HEAD, contratos novos mantidos):

```text
(fail) corpo do PUT de tipo de ocorrência (spec 241) > Produtos Desligado, foto desligada, sem soltar a nota: itemsMode off e política unset
(fail) mensagens dos códigos de itens por tipo (spec 241) > OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED vira occurrenceTypeItemsNotAllowed, com texto nos dois idiomas
(fail) mensagens dos códigos de itens por tipo (spec 241) > OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY vira occurrenceTypeItemsOffRedeliveryPolicy, com texto nos dois idiomas
(fail) mensagens dos códigos de itens por tipo (spec 241) > o texto do registro manda ligar Produtos no cadastro; o do cadastro manda desligar a política
 6692 pass
 4 fail
--- lote DOM (bun run test:hooks) ---
(fail) cadastro de tipos: Produtos (spec 241 RF10) > listagem com itemsMode: Produtos aparece no tipo, com a escolha gravada
(fail) cadastro de tipos: Produtos (spec 241 RF10) > tipo Desligado: a política de reentrega e o "um ou vários" somem
(fail) cadastro de tipos: Produtos (spec 241 RF10) > trocar para Desligado grava itemsMode off e redeliveryPolicy unset no mesmo PUT (RF12)
(fail) cadastro de tipos: Produtos (spec 241 RF10) > voltar para Opcional grava itemsMode optional e mantém a política já gravada
(fail) cadastro de tipos: criar a prorrogação (spec 241 CA10) > Produtos Desligado, sem foto, sem soltar a nota: o corpo é o da segunda via, sem política
 407 pass
 5 fail
```

Mutação da política escondida (CA10), depois do código: tirar do painel as duas trocas
`value === 'off' ? unset : …` (edição) e `isItemsOff ? unset : redeliveryPolicy` (cadastro novo) deixa
o contrato vermelho; restaurado, verde:

```text
(fail) cadastro de tipos: Produtos (spec 241 RF10) > trocar para Desligado grava itemsMode off e redeliveryPolicy unset no mesmo PUT (RF12)
  Expected: "unset"
  Received: "blocked"
(fail) cadastro de tipos: criar a prorrogação (spec 241 CA10) > política já escolhida some com Produtos Desligado: o corpo leva unset, não o que estava na tela
 7 pass
 2 fail
--- restaurado ---
 9 pass
 0 fail
```

Implementação: `OccurrenceTypeItemsModeSelect` (`Select` do design system com a dica, Desligado /
Opcional); `OccurrenceTypeCatalogPanel` mostra Produtos só quando a listagem trouxe `itemsMode`
(`hasItemsModeSupport`), esconde política de reentrega e "um ou vários" com Desligado, troca para
Desligado envia `redeliveryPolicy: 'unset'` no mesmo `PUT`, e mostra a recusa do servidor
(`saveFeedbackKey`, via `resolveTripFeedbackKey`) num alerta — antes o painel engolia o erro de
gravação. O `PUT` (`tripClient.service.ts`) manda `itemsMode` só quando presente. As demais gravações
do painel continuam sem `itemsMode` (ausente é "não mexa", RF4) e mandam `redeliveryPolicy` como a
242 corrigiu. Os testes de DOM do lote dependem de `stubVisibleLayout()` (o `Select` fecha a camada de
gatilho com retângulo zerado) e não registram `beforeEach`/`afterEach` próprios, que no lote viram
globais.

Textos novos — `companySettings.occurrenceTypeCatalog.*`:
`itemsMode` "Produtos" / "Products"; `itemsModeOff` "Desligado" / "Off"; `itemsModeOptional`
"Opcional" / "Optional"; `itemsModeHint` "Desligado: a ocorrência não carrega produtos — o registro
não mostra o seletor e a reentrega não se aplica. Opcional: quem registra pode apontar os produtos."
(en: "Off: the occurrence carries no products — registration shows no selector and redelivery does
not apply. Optional: whoever registers may point at products."). `trip.feedback.*`:
`occurrenceTypeItemsNotAllowed` "Este tipo de ocorrência não carrega produtos. Registre sem escolher
itens; se ele precisa de produtos, ligue Produtos no cadastro do tipo. Nada foi gravado." (en: "This
occurrence type does not carry products. Register it without choosing items; if it needs products,
turn Products on in the type setup. Nothing was saved."); `occurrenceTypeItemsOffRedeliveryPolicy`
"Tipo sem produtos não abre tratativa: deixe a reentrega como indefinida ou volte Produtos para
Opcional. Nada foi gravado." (en: "A type without products does not open a case: leave redelivery
unset or switch Products back to Optional. Nothing was saved.").

Limites conhecidos: com a lista de tipos **vazia** o cadastro novo não oferece Produtos (não há como
saber se a API já conhece o campo); um tipo com `itemsMode: 'required'` (da 239) não ganha o controle
de Produtos nem some a política — a 239 decide como o painel o trata.

### T1.6 — gates do painel

Comandos, com a árvore no HEAD da T1.5:

```text
$ bun run --cwd apps/frontend-transportada test
 6696 pass / 0 fail  (Ran 6696 tests across 32 files)
 413 pass / 0 fail   (lote DOM, Ran 413 tests across 1 file)
$ bun run typecheck                      → 0 erros (TS)
$ (apps/frontend-transportada) bun run lint → 0 erros, 16 avisos já existentes
$ bun run format:check                   → All matched files use Prettier code style!
```

Contrato do painel contra a resposta da API **atual** (sem nenhum campo novo), onde cada caso já está
provado: guards — `occurrence-items-mode-tolerance.contract.ts` (tipo sem `itemsMode`, feed/detalhe/
lista da nota sem `occurrenceTypeId`/`typeItemsMode`/`typeAllowsMultipleItems`); Corrigir —
`occurrence-correction-button.contract.tsx` ("resposta sem `typeItemsMode` lê `optional`") e a tabela
CA05; registro — `occurrence-register-items-mode.contract.ts` ("tipo sem `itemsMode` mostra o
seletor"); correção — `occurrence-correction-single-item.contract.ts` ("resposta sem o campo lê
vários"); cadastro — `occurrence-type-items-mode-panel.contract.ts` ("listagem sem `itemsMode`: nada
de Produtos, a política segue ali").

Com a API atual, o que muda na tela é só o previsto no plano: Corrigir passa a aparecer para a
ocorrência sem itens (lê `optional`) e a API atual aceita a correção como hoje.

Não feito nesta sessão, por instrução: nenhum push, deploy ou mudança em `apps/api-transportada`.
`docs/ai-context/frontend-transportada.md` é da T3.3. T1.5 e T0.3 não dependem uma da outra.

## Fase 3 — Fechamento

### T3.1 — Revisão de design e usabilidade (CA08)

Árvore integrada `work/241-juntos` (`work/241-api` + os commits do painel por `cherry-pick`), `bun run typecheck`
limpo nela. Ambiente, tudo descartável e fora do repositório, derrubado ao fim (`lsof` vazio nas portas 53090,
53091, 53092 e 59093):

- **Banco:** o Postgres local de dev (127.0.0.1:55432) é usado por APIs de outras sessões (53001, 53101, 53201…), então a
  migration **não** foi aplicada no banco `transportada` dele. Foi criado nele um banco novo, `transportada_241_review`,
  por `pg_dump | psql` do `transportada`, e a migration `20261004004602_occurrence_type_items_mode` aplicada **só nele**
  (`db:migrate`: 268 → 277 registros no `__drizzle_migrations`; ele não é o `.env.test` de E2E nem staging/produção).
  O banco foi apagado ao fim (`DROP DATABASE`). **O local não tinha o tipo "Cliente pediu segunda via do boleto"**
  (`SELECT` de leitura por `name like '%boleto%'`: vazio) — a prova de que a migration o deixa `off` continua sendo a
  integração CA01/CA09 da T2.1, sobre dado semeado antes da coluna; nada local a conferir.
- **API** desta árvore na 53091 (cwd `apps/api-transportada`, `DATABASE_URL` do banco acima, `STORAGE_ENDPOINT`
  apontado para um dublê S3 em memória na 59093 — o MinIO local depende de imagem privada do GHCR e não está no ar);
  **Vite** da app com o binário da app (`apps/frontend-transportada/node_modules/.bin/vite`, nunca `bunx vite`) na 53090
  com `VITE_SMOKE_AUTH_BYPASS=true`; **proxy** descartável na 53092 que troca o `Authorization` pelo token real do
  usuário de seed `local-user` (authorization code + PKCE feito sem navegador, contra o Keycloak local, com a senha
  de seed lida do `.env`; renovado a cada ~200 s). Senha, token e URLs assinadas: `[REDACTED]`. A 53000 era do Vite de
  outra sessão (`lsof`) e não foi tocada.
- **Medição** por Chromium do Playwright da própria app (`@playwright/test` 1.58.2) apontado para a 53090, no DOM
  (`getComputedStyle`/`getBoundingClientRect`; contraste calculado contra o fundo efetivo, pelo `canvas`). Os PNGs são
  desses mesmos Chromium. O navegador embutido foi usado só para ler o texto das telas. Larguras 1280 (`desktop`),
  768 (`tablet`) e 375 (`mobile`, com toque). Os cenários de erro no celular (08–10) rodaram a 375 × 812 **sem** a
  emulação de aparelho: a tela da viagem já transborda 76 px a 375 (achado 8) e, emulada, a janela de layout vira 451 px
  e o rodapé fixo cobre o seletor.
- **Dados** criados pela UI e pela API do ambiente, nunca `INSERT`: o tipo da prorrogação pela **UI** (cadastro, "Na
  rua", Produtos = Sem produtos, Sem foto, De nota); "Conferência sem itens" (galpão, `off`) e "Avaria de um item só"
  (galpão, `optional`, item único) pelo `PUT` do cadastro; as ocorrências de galpão pela **UI** do diálogo de registro
  (foto de 1 px; o conjunto: "Conferência sem itens", "Item avariado" sem produtos e com tratativa, "Avaria de um item só"
  com um produto e sem produto); a ocorrência da prorrogação (tipo de rua, que só o app do motorista e o lote do
  escritório registram) pela rota do escritório `POST /trips/:id/documents/field-occurrences`.

Prints (`specs/241-o-tipo-da-ocorrencia-diz-se-ela-carrega-itens/prints/`, `NN-descricao-LARGURA.png`, 31 arquivos):
`01-cadastro-produtos-opcional` · `02-cadastro-produtos-desligado` (sem política, sem "vários itens") ·
`03-registro-tipo-desligado` (sem seletor nem quantidade) · `04-registro-tipo-opcional` (com seletor) ·
`05-detalhe-corrigir-tipo-opcional` · `06-detalhe-so-cancelar-tipo-desligado` (a prorrogação) ·
`07-correcao-selecao-unica` · `08-erro-itens-nao-permitidos-registro` · `09-erro-itens-nao-permitidos-correcao` ·
`10-erro-reentrega-tipo-desligado` (cada um nas três larguras) · `11-seletor-produtos-aberto-mobile` (prova do achado 3,
só no celular).

| Verificação                                                                           | desktop 1280                                                                            | tablet 768 | mobile 375                           |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------- | ------------------------------------ |
| Rolagem horizontal (config., detalhe, diálogo de registro)                            | nenhuma                                                                                 | nenhuma    | nenhuma (a tela da viagem: achado 8) |
| Select Produtos / Foto / Item da nota                                                 | 48 px de altura                                                                         | idem       | idem                                 |
| Botões Registrar, Cancelar, Corrigir, Cancelar ocorrência, Salvar correção, Descartar | 38,4 px (ponteiro fino)                                                                 | idem       | **44 px** (alvo de toque)            |
| Opção da lista do Select                                                              | 35 px                                                                                   | idem       | 35 px (abaixo de 44, achado 6)       |
| Texto do Select Produtos                                                              | 14,4 px, contraste 12,86:1                                                              | idem       | idem                                 |
| Dica de Produtos (no foco)                                                            | 12,48 px, contraste 13,81:1, 352 px                                                     | idem       | idem (cabe em 375)                   |
| Ajuda "Este tipo aceita só um item"                                                   | 12,8 px, contraste 5,65:1                                                               | idem       | idem                                 |
| "Adicione ao menos uma foto…" (rodapé do registro)                                    | 13,12 px, contraste 4,99:1                                                              | idem       | idem                                 |
| Estado desabilitado: Select Produtos / botão Registrar                                | 3,03:1 / 4,94:1 (sem contar a opacidade 0,6 / 0,5)                                      | idem       | idem                                 |
| Foco visível                                                                          | contorno sólido 2 px (cobre, 70 %), `:focus-visible` verdadeiro, no Select e nos botões | idem       | idem                                 |
| Quebra de texto / corte                                                               | nenhum elemento com `overflow` cortando texto no diálogo                                | idem       | idem                                 |

Ordem de tab, medida: cadastro novo — Nome do tipo → Onde acontece → Avisar → **Produtos** → Aceita vários itens →
Admite reentrega → A viagem segue sem a nota → Modelo de e-mail → Cadastrar tipo → Editar modelos (o controle novo fica
ao lado de quem ele governa, e com Sem produtos os dois seguintes saem da ordem). Diálogo de registro — Tipo → Item da
nota → Tirar este item → Limpar itens → Enviar foto → Observação → Frases prontas → Cancelar → Fechar. Teclado no
Produtos: Tab foca, Enter abre, ↑ + Enter escolhe, o foco volta ao gatilho. `aria` do Select novo: `aria-label`
"Produtos", `aria-haspopup="listbox"`, `aria-expanded` falso/verdadeiro, lista com `aria-label` "Produtos", opções
`role="option"` com `aria-selected`. O erro do registro chega em `role="status"` (fila de fotos) e o da correção e o
do cadastro em `role="alert"`.

Estados do detalhe (CA05 vista de verdade, contra a API nova): tipo `optional` sem itens e sem tratativa → **Corrigir** +
Cancelar ocorrência; tipo `off` de galpão e a prorrogação de rua (`off`) → **só Cancelar ocorrência**; tipo de item único →
a correção abre em escolha única (dica "Este tipo aceita só um item — escolher outro substitui o anterior"). O registro:
tipo `optional` mostra "Item da nota"; trocar para `off` esconde o seletor e as quantidades; voltar a `optional` mostra
o seletor **sem** a seleção anterior.

Erros novos renderizados de verdade, provocados com a tela aberta e o tipo mudado por outra via (a aba velha):
`422 OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED` no registro ("Foto 1: falhou — Este tipo de ocorrência não carrega produtos. Tire
os itens escolhidos e tente de novo; … Nada foi gravado.") e na correção (mesmo texto, em `role="alert"`); `422
OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY` no cadastro ("Tipo sem produtos não abre tratativa: deixe a reentrega como
indefinida ou volte Produtos para Opcional. Nada foi gravado."). Depois da correção do achado 4, o registro refaz a
tentativa sem produto e grava; o cadastro mostra o tipo já em Sem produtos.

Console: sem erro de script. Ruído de ambiente, ignorado: `404` de `/public/landing-logo` e `/company-settings/logo`,
miniaturas (o dublê S3 em 59093 não está no `img-src`; é o equivalente do MinIO fora do ar) e `WebGL2` do mapa no
Chromium sem GPU. Rede: nenhuma resposta ≥ 400 da tela além dos três `422` provocados.

Usabilidade ponta a ponta (o operador cria "prorrogação", registra, vê que não corrige):

1. Cadastro: o operador abre Configurações → Tipos de ocorrência, preenche o nome, escolhe "Na rua", troca Produtos para
   Sem produtos; a política e "vários itens" somem, Foto já nasce Sem foto, Fluxo De nota. O `PUT` sai com o corpo da
   segunda via da 208 (`itemsMode: off`, `attachmentMode: off`, `leavesDocumentBehind: false`, `redeliveryPolicy:
unset`, `flow: document`, `stage: delivery`) — CA10 provado também por este caminho.
2. Registro: a prorrogação é de rua e **não aparece no diálogo de registro do painel** (ele só lista tipos de galpão); ela
   sai do app do motorista ou do lote do escritório. Isso estava na spec (RF8), mas pega o operador de surpresa: ele
   cria o tipo e não encontra onde registrá-lo no painel.
3. Detalhe: a ocorrência da prorrogação mostra só Cancelar ocorrência; **nada diz por que Corrigir não existe**.

O que ficou confuso ou ambíguo, e o destino de cada achado (commits no `work/241-painel`, trazidos à árvore integrada por
`cherry-pick` e revalidados lá):

1. **Defeito que anulava a spec, corrigido (`bf8eaefde`).** O guard de `OccurrenceType` é de chave exata, e a API já
   manda `emailsContractor` (183) e `stopKind` (218) em **todo** tipo (resposta lida da API desta árvore): a lista
   inteira era recusada e a aba "Tipos de ocorrência" mostrava "Nenhum tipo cadastrado ainda" com dez tipos no banco. Sem
   isso o controle Produtos só existia no formulário de cadastro novo — nenhum tipo existente o mostrava. Não é da 241,
   que criou o controle, mas é o que o torna alcançável; **vale o mesmo para staging e produção hoje** (a causa está na
   API e no guard que já estão lá). Provado antes (sonda: `REJECT` com as duas chaves, `ok` sem elas) e depois
   (`occurrence-type-tolerance.contract.ts`, 8 testes; a lista aparece na tela). Fora de escopo estrito; está num commit
   isolado para o usuário poder dispensá-lo.
2. **Produtos sem rótulo à vista, corrigido (`cd1b8208b`).** Na linha do tipo o controle aparecia só como "Opcional",
   entre "Em uso" e "Aceita vários itens", enquanto Foto e reentrega se explicam ("Sem foto", "Admite reentrega"). Opções
   agora "Sem produtos" / "Produtos opcionais", e a dica diz o que o Desligado faz: não mostra o seletor, **Corrigir
   não aparece** e **a reentrega fica indefinida (não abre tratativa)** — a resposta à pergunta "o que acontece com a
   reentrega ao desligar Produtos". Contrato do painel atualizado (`occurrence-type-items-mode-panel`).
3. **A dica cobria as opções da lista, corrigido (`403beff91`, `42e57376f`).** O `Tooltip` abre no foco e pinta com
   `z-index` 80; a lista do `Select`, 60, abre no mesmo ponto: ao abrir o Produtos as duas opções ficavam **sob** a dica
   (medido nas três larguras, por teclado e por ponteiro; print `11`). Vale para Foto do comprovante e Fluxo de registro
   também, que tinham o mesmo defeito. O `Tooltip` agora se fecha ao ativar o gatilho (clique, Enter, Espaço, setas).
   Dois contratos (clique e Enter), cada um **vermelho sem a correção** (execução: `1 fail` com a linha removida) e
   verde com ela.
4. **422 com a tela aberta deixava o operador sem saída, corrigido (`e72f6c1c3`, `39b495181`).** O `plan.md` promete que
   a tela recarrega o tipo; não recarregava. Pior: se os tipos fossem recarregados (a consulta é refeita ao voltar o foco
   à janela) com o tipo já `off`, o seletor sumia **mas a seleção antiga seguia no estado e ia no envio** — `422` sem campo
   para consertar. Agora o registro normaliza a seleção pelo tipo vigente (`resolveItemsOnTypeChange`), o `422
OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED` recarrega os tipos, e o `PUT` do cadastro recarrega também no erro (`onSettled`);
   a mensagem deixou de mandar "registrar" na tela de correção ("Tire os itens escolhidos e tente de novo"). Contrato do
   cadastro: vermelho com `onSuccess` (mutação executada), verde com `onSettled`.
5. **Registrado, não alterado:** (a) o erro do registro vem prefixado "Foto 1: falhou —" porque a primeira foto carrega o
   registro (spec 161); a frase é verdadeira ("Nada foi gravado") mas o prefixo sugere defeito de foto; (b) o erro do
   cadastro aparece no topo da seção, não na linha do tipo que falhou (padrão do cadastro desde a 218); (c) nenhum texto diz
   por que Corrigir não existe num tipo `off`, nem por que o registro de galpão não oferece produtos nele — um aviso de
   uma linha ajudaria; (d) a prorrogação (tipo de rua) não se registra pelo painel, só pelo app do motorista ou pelo lote
   do escritório.
6. **Fora de escopo, só registrado (componentes compartilhados):** opção da lista do `Select` com 35 px (< 44 px de alvo
   de toque no celular); estado desabilitado do design system abaixo de 4,5:1 (3,03:1 no Select, e a opacidade ainda
   desconta mais; isento pela WCAG para controle desabilitado); a dica do `Tooltip` liga ao controle por
   `aria-describedby` no contêiner e só enquanto aberta.
7. **Fora de escopo (spec 240, já registrado lá):** "1 itens escolhidos" sem plural no seletor, ao lado do selo
   "A nota inteira".
8. **Fora de escopo, achado novo:** a tela da viagem transborda na horizontal a 375 px (`scrollWidth` 451): o cartão da
   placa (`.plate`, 160 px) passa da coluna; o diálogo de ocorrência herda e fica cortado à esquerda no celular. E o
   console da tela da viagem registra "two children with the same key, `1`" (chave repetida numa lista de paradas) a
   cada carregamento. Nenhum dos dois é da 241.

### T3.2 — Ordem de publicação

`origin/staging` conferido em **`11a78cb6e`** (2026-10-04). **Nada foi publicado nesta task.** `git fetch` + comparação de
conteúdo antes de cada passo: a `work/241-api` está **0 atrás** de `origin/staging`; a **`work/241-painel` está 46
atrás** (parte do `83813b175`) e **precisa de `git rebase origin/staging` + `bun install --frozen-lockfile` + typecheck e
testes da app antes do push** (nenhum dos 46 toca os arquivos da 241 que o `cherry-pick` para a árvore integrada
reaplicou sem conflito de código). Branches e SHAs reais, em ordem (`git log --reverse origin/staging..<branch>`):

**Etapa 1 — painel tolerante** (`work/241-painel`; os commits só de `specs/` estão marcados):

| SHA           | Conteúdo                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `4947b91c3`   | só `specs/`: T0.2 (a 239 ainda não criou `items_mode`) e T0.3 pendente                                                                                      |
| `f41e73634`   | T1.1 — guards tolerantes                                                                                                                                    |
| `a1ead764f`   | T1.2 — Corrigir por `typeItemsMode`                                                                                                                         |
| `0cdbe249a`   | só `specs/`: T1.3 — a mutação do RF7, executada vermelha                                                                                                    |
| `80b532108`   | T1.4 — registro e correção por tipo                                                                                                                         |
| `e22653cda`   | T1.5 — Produtos no cadastro e mensagens                                                                                                                     |
| `aefd713bb`   | só `specs/`: T1.6 — gates do painel                                                                                                                         |
| `bf8eaefde`   | T3.1 achado 1 — o guard aceita `emailsContractor` e `stopKind` (**dispensável**, ver o achado)                                                              |
| `cd1b8208b`   | T3.1 achado 2 — rótulos de Produtos e dica                                                                                                                  |
| `e72f6c1c3`   | T3.1 achado 4 — recarga do tipo no `422` e seleção normalizada                                                                                              |
| `39b495181`   | T3.1 achado 4 — o cliente falso de teste ganha `saveOccurrenceType`                                                                                         |
| `403beff91`   | T3.1 achado 3 — `Tooltip` fecha ao ativar o gatilho                                                                                                         |
| `42e57376f`   | T3.1 achado 3 — Enter e Espaço                                                                                                                              |
| fim da branch | só `specs/` e `docs/`: `docs(specs)` (T3.1–T3.3 neste arquivo, os 31 prints e o `tasks.md`) e `docs(frontend)` (`docs/ai-context/frontend-transportada.md`) |

Ensaio do rebase (worktree descartável sobre `origin/staging` `11a78cb6e`, abortado, nada mudou nas branches): o
**único** conflito é o commit `docs(frontend)` em `docs/ai-context/frontend-transportada.md` — as duas pontas anexam no fim
do arquivo (a de staging traz a seção "Spec 237 T2.4"); resolver mantendo as duas seções, a da 241 por último. Os 13
commits de código e os de `specs/` reaplicam sem conflito.

Gate de entrada da etapa 1: contra a **API atual** (sem os campos novos) o painel se comporta como antes, exceto Corrigir,
que passa a aparecer para ocorrência sem itens (lê `optional`) e que a API atual aceita (T1.6). Depois do push:
esperar o deploy e o `autoUpdate` do PWA **antes** da etapa 2.

**Correções da revisão final entram na etapa 1** (`work/241-painel`, depois dos commits da tabela acima: `16d5c828d`,
`0d796e90c`, `98e619db7`, `6d7ba0620`): o painel tolerante passa a aceitar `null` em `occurrenceTypeId`,
`typeItemsMode` e `typeAllowsMultipleItems`, que a API da etapa 2 publica em toda ocorrência de parada. **Esse painel tem de
estar no ar e com o `autoUpdate` do PWA propagado antes da etapa 2**; sem ele, a primeira ocorrência de parada derruba a
lista inteira com `TRIP_RESPONSE_INVALID`. Contra a **API atual** (sem os campos) o painel segue como antes: os contratos de
tolerância (`test/trip/occurrence-items-mode-tolerance.contract.ts`, blocos "ausentes") continuam verdes.

**Por que o painel sobe primeiro (dois guards de chave exata).** Com a API nova e o painel **atual de staging**, dois guards
derrubam a tela, porque recusam chave que não conhecem: (i) `isTripOccurrence` / `TRIP_OCCURRENCE_OPTIONAL_KEYS`
(`tripResponse.validation.ts`, `trip.constant.ts`) recusa `typeItemsMode` e `typeAllowsMultipleItems` na lista de
ocorrências da nota, e (ii) `isOccurrenceType` recusa `itemsMode` no catálogo do cadastro de tipos. Logo o painel
(etapa 1) sobe primeiro e o PWA precisa ter atualizado antes da API (etapa 2).

**Etapa 2 — banco e API** (`work/241-api`, sobre `origin/staging` `11a78cb6e`; 11 commits de implementação, mais `fde805846` só de `specs/` com a ordem de publicação):

| SHA         | Conteúdo                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------- |
| `43e5137df` | T2.1 — integração vermelha da migration                                                   |
| `f44f9a168` | T2.1 — schema, CHECKs, migration e rollback (`20261004004602_occurrence_type_items_mode`) |
| `ba52bace5` | só `specs/`: T2.1/T2.2 — as duas mutações da migration, executadas vermelhas              |
| `bf88566b2` | T2.3 — catálogo de bootstrap com `itemsMode` e a prorrogação                              |
| `eeb4c15bd` | T2.4 — contrato do cadastro, vermelho                                                     |
| `7eb7f6bd6` | T2.4 — cadastro grava `items_mode` e recusa `off` com política                            |
| `0f5191ee2` | T2.5 — contrato da guarda de produto, vermelho                                            |
| `4eb9e1e63` | T2.5 — registro e correção recusam produto em tipo `off`                                  |
| `d72cbe043` | T2.7 — integração das leituras, vermelha                                                  |
| `036a84692` | T2.7 — detalhe, feed, lista da nota e cadastros publicam o modo de itens                  |
| `43519b44a` | T2.9 — migration regerada sobre `cargo_arrivals`; gates da API                            |

Gate de entrada da etapa 2: a etapa 1 no ar. Antes do push: `git fetch` + `git rebase origin/staging`, `bun install
--frozen-lockfile`, `bun run db:generate` = `no_changes` (o timestamp `20261004004602` colide com migration de outra
sessão? conferir `ls apps/api-transportada/drizzle | tail`), `make migration-test`, contrato e integração da API
(`--env-file=../../.env.test`). A API continua **sem alteração nesta task** (nenhum achado do T3.1 era dela).

**Passo 3 — humano, depois da etapa 2: PENDENTE.** O operador, com `settings.manage`, cadastra "Cliente pediu prorrogação do
boleto" em produção pela tela (`spec.md` § Passo operacional): Entrega · Nota · **Sem produtos** · Sem foto · "Deixa a
nota para trás" desligado · reentrega indefinida. Nenhuma migration o insere. O cadastro já funciona nesta árvore
exatamente assim (CA10, T3.1). Conferir antes que o nome ainda não existe (T0.3 abaixo).

**T0.3 — medição em staging e produção: PENDENTE, exige a autorização do usuário.** Consulta só de leitura em
`company_occurrence_types` (staging; produção é o `Postgres-Hqfu`): (i) quantos tipos têm o nome exato da segunda via e
**qual `redelivery_policy` cada um tem**; (ii) se "Cliente pediu prorrogação do boleto" já existe; (iii) quantos tipos
renomeados ficariam de fora. **Se (i) achar política ≠ `unset`, a migration a zera sem aviso (D1): a decisão é do usuário
e tem de vir antes da etapa 2.** Nada foi consultado em produção ou staging nesta sessão.

**`tasks.md` difere nos dois branches** (cada um marca as suas fases: `work/241-painel` T0.1, T0.2 e T1.1–T1.6;
`work/241-api` T0.1 e T2.1–T2.9; nenhum marca a Fase 3). As linhas são disjuntas, então o `git rebase` junta sem
conflito. O que **conflita** é o `evidence.md`, que os dois branches **criam** (add/add): na árvore integrada
(`work/241-juntos`) o arquivo está unido — seções da API primeiro, as do painel e a Fase 3 depois. Procedimento: publicar a
etapa 1 com o `evidence.md` do painel; na `work/241-api`, depois do rebase em `origin/staging`, resolver o add/add com
`git checkout work/241-juntos -- specs/241-o-tipo-da-ocorrencia-diz-se-ela-carrega-itens/evidence.md` (traz as duas
metades) e conferir a existência dos dois conjuntos de seções antes de seguir.

### T3.3 — `docs/ai-context/frontend-transportada.md` (parte de documentação)

Seção "Spec 241 — o tipo da ocorrência diz se ela carrega itens" no fim do arquivo: Produtos no cadastro, registro e
correção por tipo, tolerância a API antiga e as três pegadinhas (o guard de chave exata e a lista vazia, os dois `422` e
a recarga, o `Tooltip` sobre o `Select`). Sem marcadores de conflito. **A revisão final por `code-reviewer` (`opus`) fica
pendente — é do usuário.**

## Correções da revisão final

Cada correção: contrato vermelho primeiro, implementação, verde; um commit por correção na `work/241-painel`.

### 1. Guards recusavam o `null` da API nova (`16d5c828d`) — bloqueante

Contrato novo em `occurrence-items-mode-tolerance.contract.ts` (bloco "ocorrência de parada: a API nova publica os três
campos como null"): item `source: 'stop'` com os três campos `null` pelo cliente real (`listOccurrences` e
`readOccurrence`) e pelo guard da lista da nota (`occurrencesFromApi`); `typeItemsMode: 'banana'` continua reprovando.
`isFeedItem` aceita `null` nos três, `isTripOccurrence` nos dois que a lista da nota tem (`occurrenceTypeId` ali segue
obrigatório: ocorrência de nota sempre tem tipo). Nenhum outro guard do painel lê esses campos (`grep` em `src/`).

Vermelho (`bun test test/trip.contract.test.ts`, antes da correção):

```text
error: TRIP_RESPONSE_INVALID
      at readPage (.../tripOccurrenceFeedClient.service.ts:314:46)
(fail) ocorrência de parada: a API nova publica os três campos como null > o feed aceita o item de parada com os três campos null e os lê como ausentes
error: TRIP_RESPONSE_INVALID
      at readDetail (.../tripOccurrenceFeedClient.service.ts:277:11)
(fail) ... > o detalhe da parada aceita os três campos null
error: TRIP_RESPONSE_INVALID
      at occurrencesFromApi (.../tripResponse.validation.ts:1081:82)
(fail) ... > a lista da nota aceita typeItemsMode e typeAllowsMultipleItems null
 2460 pass
 3 fail
```

Verde depois: `2463 pass, 0 fail`.

### 2. `Tooltip` fechava em todo clique e tecla (`0d796e90c`) — médio

Prop `dismissOnActivate` (padrão `false`, comportamento anterior à 241), usada só nos cinco seletores do cadastro de tipos
(Produtos, Foto do comprovante e Fluxo de registro, na linha e no formulário de cadastro). Contrato novo
`test/trip-hooks/tooltip-dismiss.contract.ts`: o padrão não fecha ao clicar nem ao apertar Enter; com a prop fecha nos dois.
Os dois contratos da 241 sobre o `Select` (`occurrence-type-items-mode-panel`) seguem verdes.

Vermelho (lote DOM, antes da prop):

```text
Expected to contain: "Dica de teste"
Received: "Gatilho"
(fail) Tooltip: dispensar a dica ao ativar o gatilho é opt-in > o padrão não fecha ao clicar nem ao apertar Enter
 418 pass
 1 fail
```

Mutação (tirar `dismissOnActivate` do `OccurrenceTypeItemsModeSelect`): `(fail)` nos dois contratos do cadastro — "abrir o
seletor de Produtos dispensa a dica…" e "Enter no seletor de Produtos também dispensa a dica" (`417 pass, 2 fail`); restaurado,
`419 pass, 0 fail`.

### 3. `OccurrenceTypeCatalogPanel` repetia o corpo de `onSave` oito vezes (`98e619db7`) — médio

`buildOccurrenceTypeUpdate(type, edit)` em `company-settings/shared/occurrenceTypeUpdate.service.ts` (função pura; o tipo
`OccurrenceTypeSaveInput` mora ali). Contrato `test/company-settings/occurrence-type-update.contract.ts`: cada edição troca só
o campo editado, mantém `redeliveryPolicy`, e nunca manda `itemsMode`; só o seletor Produtos o manda, e Desligado zera a
política (RF4/242). A linha do tipo virou `OccurrenceTypeRow.component.tsx` (154 linhas), o formulário de cadastro
`OccurrenceTypeCreateForm.component.tsx` (209 linhas) e as opções dos seletores o hook `useOccurrenceTypeOptions`; o painel
foi de 522 para 123 linhas. **O formulário de cadastro ficou com 209 linhas, 9 acima de 200:** são 9 `useState` com o
comentário de spec de cada um e a lista de campos; partir mais exigiria um reducer, que muda comportamento.

Vermelho: `Cannot find module '@/modules/company-settings/shared/occurrenceTypeUpdate.service'` (módulo inexistente, `1 fail, 1 error`).
Mutação (`edit.itemsMode === 'never'` no lugar de `'off'`): `(fail) buildOccurrenceTypeUpdate > Produtos Desligado manda
itemsMode off e zera a política`.

**Divergência a registrar:** quatro arquivos de contrato de texto (`occurrence-type-attachment-mode`, `occurrence-type-catalog-panel`,
`occurrence-type-catalog-template-select`, `trip/occurrence-catalog-leaves-behind`) liam o **arquivo do painel** com
`toContain`/regex; com o código movido para a linha e o formulário, 11 reprovaram. Mudou só **de onde leem**
(`test/company-settings/occurrenceTypePanelSource.helper.ts` concatena os três arquivos); nenhuma expectativa foi alterada.
Os dois contratos "toda chamada a `onSave` carrega X" agora só enxergam a chamada de `handleAdd` (as demais passaram a ser
`buildOccurrenceTypeUpdate`); quem prende as outras é o contrato novo acima.

### 4. Dica de Produtos e literais (`6d7ba0620`) — baixo

(a) `itemsModeHint`: "Corrigir não aparece nas novas ocorrências" (pt-BR) e "Correct does not appear on new occurrences" (en), pelo RF7. Contrato
`occurrence-type-items-mode-hint.contract.ts`, vermelho antes (`Expected to contain: "Corrigir não aparece nas novas ocorrências"`,
`2 fail`). (b) `OCCURRENCE_ITEMS_MODE` e `OCCURRENCE_ATTACHMENT_MODE` não existiam como objeto (só os arrays); criados em
`occurrence.constant.ts` e usados no painel, na linha, no formulário, no seletor de Produtos, em `tripOccurrenceDetail.service.ts`
e `occurrenceItemsMode.service.ts`. Fora do alvo e deixados: `deliveryProofSettings` e `driver-trip` (vocabulário do comprovante,
outra constante), `tripClient.service.ts:558` e `tripResponse.validation.ts:1880`.

### Gates (primeiro plano, `work/241-painel`)

`bun install --frozen-lockfile` (sem mudanças) · `bun run --cwd apps/frontend-transportada test`: **6708 pass, 0 fail** (32 arquivos) +
lote DOM **419 pass, 0 fail** · `bun run typecheck` (raiz): sem erro · `bun run format:check`: limpo · lint da app: 0 erros, 16
avisos (nenhum em arquivo tocado).

# Evidência — etapa 2 (banco e API)

## T0.3 — medição em produção (pendente)

- **(i) pendente de produção.** Quantos tipos têm o nome exato "Cliente pediu segunda via do boleto"
  (etapa `delivery`, fluxo `document`) e qual `redelivery_policy` cada um tem — a migration da T2.1
  zera a política dessas linhas para `unset`. **Não medido**: a medição em produção (Postgres-Hqfu) é
  só leitura e pede aprovação humana. Precisa ser feita antes da etapa 2; política ≠ `unset` avisa o
  usuário antes do deploy.
- (ii) e (iii) também pendentes, pelo mesmo motivo.

Conferido para a T2.1 (2026-10-03): `origin/staging` em `83813b175` não tem `items_mode` nem
`itemsMode` em `apps/api-transportada` (`git grep`), então a 241 cria a coluna.

## T2.1 — teste vermelho antes da migration

Testes escritos antes do schema e da migration:

- `test/database-migration/occurrence-type-items-mode.assertion.ts` (CA01 + CA09), chamado de
  `database-migration.integration.ts`: desfaz só a migration de `items_mode`, semeia seis tipos
  **antes** da coluna (segunda via `unset`; segunda via `blocked`; "Recusa total" `blocked`; mesmo
  nome em `separation`; mesmo nome em fluxo `stop`; nome renomeado), reaplica as migrations e confere
  `off` + `unset` nas duas primeiras e `optional` com a política intocada nas outras quatro; depois,
  a CHECK da forma recusa `off` + `blocked` no insert e `allowed` no update (23514), e a de
  vocabulário recusa `always` (23514).
- `test/database-migration/static-migration.contract.ts`: a ordem coluna → CHECK de vocabulário →
  `UPDATE` com a política → CHECK da forma, e o rollback inverso.
- `test/integration/occurrence-type-catalog-seed.integration.ts` (CA02): empresa vazia semeada →
  os dois tipos de boleto `off`, os derivados `optional`.

`make migration-test ENV_FILE=.env.test` (Postgres de teste 127.0.0.1:65432):

```text
test/database-migration.contract.test.ts:
2174 |     expect(directory).toBeString()
error: expect(received).toBeString()
Received: undefined
(fail) ... > orders the items_mode column, its backfill and the shape check, and reverses it
158 |   if (directory === undefined) throw new Error('occurrence_type_items_mode migration is required')
error: occurrence_type_items_mode migration is required
(fail) Drizzle migration integration > applies, constrains, rolls back, and reapplies the fiscal migration [4425.49ms]

 119 pass
 2 fail
Ran 121 tests across 8 files. [68.75s]
make: *** [migration-test] Error 1
```

`bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-catalog-seed.integration.ts`:

```text
PostgresError: column "items_mode" does not exist
    errno: "42703",
(fail) seed do catálogo de tipos de ocorrência contra Postgres real > semeia os tipos de boleto sem itens e os derivados com itens opcionais [1279.95ms]

 1 pass
 1 fail
Ran 2 tests across 1 file. [2.77s]
```

## T2.1 — schema, migration e rollback (verde)

- Schema: `itemsMode` em `companyOccurrenceTypes` (`src/database/trip.schema.ts`), com
  `company_occurrence_types_items_mode_check` (`inList(DELIVERY_PROOF_FIELD_MODES)`) e
  `company_occurrence_types_items_off_shape_check`.
- `bun run db:generate --name occurrence_type_items_mode` gerou
  `drizzle/20261004001234_occurrence_type_items_mode/{migration.sql,snapshot.json}` com
  `ADD COLUMN` + as duas CHECKs; o `UPDATE` da segunda via entrou à mão entre as duas, e o
  `rollback.sql` foi escrito no molde da `20260929144801_occurrence_type_stop_kind`. Depois da edição,
  `bun run db:generate` → `{"status":"no_changes"}`.
- **Achado ao implementar:** `company_occurrence_types_company_name_unique` (`company_id`,
  `lower(btrim(name))`) impede dois tipos com o mesmo nome na mesma empresa. O primeiro verde falhou
  com `23505` porque o teste semeava as variantes da segunda via numa empresa só; agora cada variante
  mora numa empresa própria. Consequência para a migration: o `UPDATE` pega no máximo uma linha por
  empresa. Não muda a ordem nem o plano.
- CA02 fica `test.failing` (vermelho conhecido) até a T2.3: o seed ainda não grava `itemsMode` nem a
  prorrogação. Rodado como `test` depois da migration, falha pelo motivo certo:

```text
175 |           expect(itemsModeByName.get(SECOND_COPY_BILL_OCCURRENCE_TYPE_NAME)).toBe('off')
error: expect(received).toBe(expected)
Expected: "off"
Received: "optional"
```

Gates:

- `make migration-test ENV_FILE=.env.test` → `121 pass, 0 fail, 1824 expect() calls` (a integração
  de migration rodou até o fim: 1824 asserções, contra 1639 na execução que parou no `23505`).
- `bun run typecheck` (API) → sem erro; `bun run format:check` → limpo.
- Contrato da API, `bun --env-file=../../.env.test test --timeout 120000` → `9272 pass, 24 skip,
0 fail` (198 arquivos).
- Integração, `--env-file=../../.env.test`, um arquivo por vez: `occurrence-type-catalog-seed` 2 pass
  (um é o `test.failing` da CA02); `occurrence-type-leaves-document-behind` 4;
  `occurrence-type-redelivery-policy` 2; `company-settings-repository` 3; `trip-occurrence-case` 4;
  `trip-occurrence-detail` 6; `trip-occurrence-correction` 7; `migration-completeness` 3 (com
  `DRIZZLE_TEST_DATABASE_URL` — sem ela, os 3 pulam).

### Rebase em `origin/staging` (02cd5fe8b)

`git fetch && git rebase origin/staging` conflitou em `static-migration.contract.ts` (lista de
migrations) e em `docs/ai-context/api-transportada.md`: entrou de outra sessão
`20261003190847_location_retention_settings` (spec 239 do expurgo — **não** cria `items_mode`; `git
grep items_mode origin/staging` segue vazio). A primeira geração desta migration
(`20261004000033_…`) tinha `prevIds` apontando para `contractor_receiving_profiles`, o mesmo pai da
migration nova — duas folhas. A pasta foi apagada e regerada por `bun run db:generate --name
occurrence_type_items_mode` em cima do snapshot novo: `20261004001234_occurrence_type_items_mode`,
`prevIds = ['11c128c3-…']` (o snapshot de `location_retention_settings`), SQL gerado idêntico; o
`UPDATE` e o `rollback.sql` foram copiados com o nome novo. Depois:

- `bun install --frozen-lockfile` → sem mudanças; `bun run db:generate` → `{"status":"no_changes"}`.
- `make migration-test ENV_FILE=.env.test` → `123 pass, 0 fail, 1894 expect() calls`.
- `bun run typecheck` (raiz, todas as apps) → exit 0; `bun run format:check` → limpo.
- Contrato da API → `9357 pass, 24 skip, 0 fail` (198 arquivos).
- Integração, um arquivo por vez: seed 2, leaves-document-behind 4, redelivery-policy 2,
  company-settings-repository 3, trip-occurrence-case 4, trip-occurrence-detail 6,
  trip-occurrence-correction 7, migration-completeness 3 — todos `0 fail`, nenhum pulado.

Nenhum arquivo de teste novo de entrada: a asserção entra por `database-migration.integration.ts`,
importado por `test/database-migration.contract.test.ts`, que já está no `db:test` e no `test` do
`package.json`.

## T2.2 — mutações (depois do rebase, na `20261004001234_…`)

**(a) Arrancar o `UPDATE` inteiro** → CA01 vermelha (`make migration-test ENV_FILE=.env.test`):

```text
error: expect(received).toEqual(expected)

@@ -1,3 +1,3 @@
  {
-   "items_mode": "off",
+   "items_mode": "optional",
    "redelivery_policy": "unset",

(fail) a segunda via sai sem itens antes da CHECK da forma (spec 241) > orders the items_mode column, its backfill and the shape check, and reverses it [1.10ms]
(fail) Drizzle migration integration > applies, constrains, rolls back, and reapplies the fiscal migration [2287.40ms]
 2 fail
 1672 expect() calls
Ran 123 tests across 8 files. [44.33s]
```

Restaurado (`git checkout -- migration.sql`) → `123 pass, 0 fail`.

**(b) Arrancar só `"redelivery_policy" = 'unset'` do `UPDATE`** → CA09 vermelha: a CHECK da forma
recusa a segunda via semeada com `blocked` e a migration falha:

```text
DrizzleQueryError: Failed query:
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_items_off_shape_check" CHECK ("items_mode" <> 'off' or "redelivery_policy" = 'unset');
PostgresError: check constraint "company_occurrence_types_items_off_shape_check" of relation "company_occurrence_types" is violated by some row
      errno: "23514",
 constraint: "company_occurrence_types_items_off_shape_check",
(fail) a segunda via sai sem itens antes da CHECK da forma (spec 241) > orders the items_mode column, its backfill and the shape check, and reverses it [0.63ms]
(fail) Drizzle migration integration > applies, constrains, rolls back, and reapplies the fiscal migration [2081.23ms]
 2 fail
 1671 expect() calls
Ran 123 tests across 8 files. [35.97s]
```

Restaurado → `123 pass, 0 fail`. As mesmas duas mutações já tinham dado vermelho antes do rebase, na
`20261004000033_…` (mesmo SQL), com o mesmo diff na CA01 e o mesmo `23514` na CA09.

## T2.3 — catálogo com `itemsMode` e a prorrogação (só bootstrap)

Teste antes da implementação. O contrato novo em `test/trip-occurrence/catalog-seed.contract.ts`
(importado por `test/trip-occurrence.contract.test.ts`) saiu vermelho:

```text
test/trip-occurrence/catalog-seed.contract.ts:

# Unhandled error between tests
SyntaxError: Export named 'BILL_EXTENSION_OCCURRENCE_TYPE_NAME' not found in module
'.../src/shared/occurrence-type-catalog.constant.ts'.

 0 pass
 1 fail
 1 error
```

Implementação: `itemsMode` em `OccurrenceTypeCatalogEntry` (`optional` nos derivados, `off` nas duas
de boleto), `BILL_EXTENSION_OCCURRENCE_TYPE_NAME`, e `insertOccurrenceTypes` grava `itemsMode`
explícito. **Nenhuma migration insere a prorrogação** (D2) e o seeder segue só-bootstrap
(`hasAnyOccurrenceType`): nada reconcilia tipo existente. Resultado:

- `catalog-seed.contract.ts` → 9 pass, 0 fail (o teste da 208, "empresa com um tipo qualquer não
  recebe os outros", segue verde — empresa que já tem tipo não recebe a prorrogação).
- CA02: o `test.failing` de `occurrence-type-catalog-seed.integration.ts` virou `test` e passa:
  2 pass, 0 fail, 0 skip contra o Postgres de teste.
- `bun run typecheck` → sem erro.

## T2.4 — cadastro com `itemsMode` e a regra `off` ⇒ `unset`

Contrato antes da implementação (commit `692dfe4b3`, só com os testes e as classes de erro).
`test/trip-occurrence/items-mode-type-write.contract.ts` (importado por
`test/trip-occurrence.contract.test.ts`), vermelho contra o código sem `itemsMode`:

```text
(fail) o cadastro do tipo aceita "itemsMode" (spec 241 RF4, CA07) > off é aceito e chega ao resultado
(fail) o cadastro do tipo aceita "itemsMode" (spec 241 RF4, CA07) > optional é aceito e chega ao resultado
(fail) o estado resultante "off" exige política "unset" (spec 241 RF11, CA09) > off com política blocked no corpo: 422 ...
(fail) ... > off com política allowed no corpo: 422 ...
(fail) ... > off no corpo e política gravada blocked (campo ausente lê o gravado): 422 ...
(fail) ... > política allowed no corpo e tipo gravado off (itemsMode ausente lê o gravado): 422 ...
(fail) ... > off com unset grava; optional com política de reentrega grava
(fail) o PUT que cria a prorrogação do boleto (spec 241 CA10) > off, sem foto, sem soltar a nota e sem política: grava com o corpo da 208
 4 pass
 8 fail
Ran 12 tests across 1 file.
```

Implementação:

- `occurrence.schema.ts`: `itemsMode: z.enum(['off', 'optional']).optional()` — sem `default`, ausente
  fica ausente; `required` e qualquer outro valor voltam 400 (`INVALID_REQUEST`).
- `save-occurrence-type.use-case.ts`: `assertItemsOffHasNoRedeliveryPolicy` valida o estado
  **resultante** (valor novo ou o gravado, lido por `findCurrentType` só quando um dos dois campos vem
  ausente) e lança `OccurrenceTypeItemsOffRedeliveryPolicyError` (`422
OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY`, em `trips/domain/trip.error.ts` ao lado do
  `OccurrenceTypeSingleItemError`) antes do `save`. O novo `OccurrenceTypeItemsNotAllowedError` (`422
OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED`) é usado na T2.5.
- `delivery-proof-read.support.ts`: `saveOccurrenceType` grava `itemsMode` só quando presente (INSERT
  usa o default da coluna `optional`; UPDATE omite a coluna, sem `?? 'x'`); `findOccurrenceType`
  seleciona `itemsMode`; `OccurrenceTypeRecord.itemsMode` (opcional no tipo, como as demais colunas
  novas, para os dublês; a implementação real sempre grava). `main.ts` liga `findCurrentType` a
  `findOccurrenceType`.
- Semente local (`local-occurrence-type-seed.service.ts`): grava `optional` **só na criação** (não
  reescreve o modo de um tipo que o operador mudou).
- Os dois contratos antigos que chamam `saveOccurrenceTypeWithTemplate` ganharam
  `findCurrentType: async () => null`.
- `test/integration/occurrence-type-items-mode.integration.ts` (novo, entrou na lista
  `test:integration` do `package.json`): grava e ausente não altera; criação usa `optional`; o PUT da
  prorrogação com os campos da 208 grava (`off`, foto `off`, `leavesDocumentBehind false`, `unset`,
  `document`); `off` sobre tipo gravado `blocked` é o erro do caso de uso e a linha não muda.

Verde:

```text
items-mode-type-write.contract.ts: 12 pass, 0 fail
test/trip-occurrence.contract.test.ts: 344 pass, 0 fail
occurrence-type-items-mode.integration.ts (Postgres de teste): 4 pass, 0 fail, 0 skip
bun run typecheck (API): sem erro
```

## T2.4b — mutação: arrancar a validação `off` ⇒ `unset`

Removida a chamada `await assertItemsOffHasNoRedeliveryPolicy(input)` de
`saveOccurrenceTypeWithTemplate`. Contrato (4 casos de 422) e integração (CA09) ficam vermelhos, e a
integração mostra a CHECK do banco segurando a linha — o que na API seria 500 em vez de 422:

```text
error: A rejeição era esperada
(fail) o estado resultante "off" exige política "unset" (spec 241 RF11, CA09) > off com política blocked no corpo: 422 com código estável e nada gravado
(fail) ... > off com política allowed no corpo: 422 com código estável e nada gravado
(fail) ... > off no corpo e política gravada blocked (campo ausente lê o gravado): 422 ...
(fail) ... > política allowed no corpo e tipo gravado off (itemsMode ausente lê o gravado): 422 ...
 8 pass
 4 fail

PostgresError: new row for relation "company_occurrence_types" violates check constraint "company_occurrence_types_items_off_shape_check"
      errno: "23514",
 constraint: "company_occurrence_types_items_off_shape_check",
(fail) "itemsMode" do tipo de ocorrência contra o Postgres (spec 241) > off com política gravada blocked é 422 do caso de uso, nunca 500 da CHECK (CA09)
 3 pass
 1 fail
```

Restaurado (cópia byte a byte do arquivo) → contrato 12 pass, integração 4 pass.

## T2.5 — RF6: tipo `off` recusa produto (registro do galpão, do motorista e correção)

Pontos que gravam itens, conferidos por `grep` em `src/` (`saveOccurrence`, `saveDocumentOccurrence`,
`replaceItems`, `registerTripOccurrence`, `registerDriverOccurrence`):

| Ponto                                                                                                | Passa produto?                                            | Guarda                                                      |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| `registerTripOccurrence` (painel do galpão e WhatsApp do operador, `main.ts` 1196/3928)              | sim (`productCode`/`productCodes`; o WhatsApp manda `[]`) | sim, logo depois do tipo e do estágio                       |
| `registerDriverOccurrence` (app do motorista e WhatsApp do motorista, `main.ts` 1041/3471)           | `productCode` (o app manda `''`)                          | sim, depois do tipo e antes de ler a nota alcançável        |
| `register-office-document-occurrences` / `office-occurrence-batch.service.ts` (em nome do motorista) | **não**: `productCode: ''` fixo (linha 153)               | desnecessária, nunca grava produto                          |
| `correctOccurrenceItems`                                                                             | sim                                                       | sim, logo depois de ler o tipo ATUAL por `(company_id, id)` |

A guarda é `assertOccurrenceTypeAcceptsProducts` (`trips/domain/occurrence-items-mode.policy.ts`):
`itemsMode === 'off'` com `productCode` não vazio ou `productCodes` não vazio lança
`OccurrenceTypeItemsNotAllowedError` (`422 OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED`); ausente lê `optional`.
Roda **antes** de ler produtos, de `saveOccurrence`/`saveDocumentOccurrence`/`replaceItems`, do
notificador e da foto.

Contrato antes da implementação (commit `4b48224a0`),
`test/trip-occurrence/items-mode-guard.contract.ts` (entrou em `trip-occurrence.contract.test.ts`):

```text
(fail) o registro do galpão recusa produto em tipo sem itens (spec 241 RF6) > off com productCode: 422, sem gravar nem avisar
(fail) ... > off com productCodes: 422, sem gravar nem avisar
(fail) o registro do motorista recusa produto em tipo sem itens (spec 241 RF6) > off com produto: 422, sem gravar
(fail) a correção recusa produto em tipo sem itens (spec 241 RF6, CA03) > off com produto: 422, sem substituir itens nem registrar correção
 5 pass
 4 fail
```

Verde depois: `items-mode-guard.contract.ts` 9 pass; `trip-occurrence.contract.test.ts` 353 pass, 0 fail;
integração `trip-occurrence-correction.integration.ts` com o caso novo (ocorrência gravada com item num
tipo `optional`, tipo posto em `off` por `UPDATE`, correção com produto → 422, correção para `[]` →
aceita e grava o histórico): 8 pass, 0 fail, 0 skip. Lista vazia grava em `off`; `optional` com produto
grava — nos três casos de uso.

## T2.6 — mutação: arrancar a guarda da correção

Removido o `assertOccurrenceTypeAcceptsProducts` de `correct-occurrence-items.use-case.ts`:

```text
error: expect(received).toBeInstanceOf(expected)
Expected constructor: [class OccurrenceTypeItemsNotAllowedError extends ApiError]
Received value: undefined
(fail) a correção recusa produto em tipo sem itens (spec 241 RF6, CA03) > off com produto: 422, sem substituir itens nem registrar correção
 8 pass
 1 fail

(integração, trip-occurrence-correction.integration.ts)
Expected constructor: [class OccurrenceTypeItemsNotAllowedError extends ApiError]
(fail) correção de itens da ocorrência (spec 167 T301/T309) > tipo que virou off recusa produto e aceita esvaziar (spec 241 CA03)
 7 pass
 1 fail
```

Restaurado → contrato 9 pass.

## T2.7 — leituras publicam o modo de itens do tipo (RF5, CA04)

Integração antes da implementação (commit `05f3628d6`), `test/integration/trip-occurrence-type-items-read.integration.ts`
(novo, na lista `test:integration`): vermelha por módulo ausente
(`Cannot find module '.../occurrence-type-items-read.query.js'`, 0 pass, 1 fail, 1 error).

Implementação: `trips/infrastructure/occurrence-type-items-read.query.ts` —
`listOccurrenceTypeItemsShapesByIds` lê `allows_multiple_items` e `items_mode` dos tipos da página
**numa consulta só**, `where company_id = $1 and id in (…)` (junção por `(company_id, id)`); lista vazia
não consulta. Usada pelo feed (`listTripOccurrenceFeed`, que também alimenta o detalhe) e pela lista da
nota (`listTripOccurrences`). Os campos publicados:

| Leitura                                                                               | Campos novos                                                                                                    |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Feed (`GET /trip-occurrences`), item de nota                                          | `occurrenceTypeId` (string), `typeItemsMode` (`off`/`optional`/`required`), `typeAllowsMultipleItems` (boolean) |
| Feed, item de **parada**                                                              | `occurrenceTypeId: null`, `typeItemsMode: null`, `typeAllowsMultipleItems: null`                                |
| Detalhe (`GET /trip-occurrences/:id`) — é o item do feed mais motorista e correções   | os mesmos três (nota com valor; parada com `null`)                                                              |
| Lista da nota (`GET /trips/:tripId/documents/:documentId/occurrences`)                | `typeItemsMode`, `typeAllowsMultipleItems` (`occurrenceTypeId` já era publicado desde a 079)                    |
| Cadastro (`GET /company-settings/occurrence-types`)                                   | `itemsMode` (`off`/`optional`/`required`)                                                                       |
| `GET /me/trips/current/occurrence-types` e `occurrenceTypes` do snapshot do motorista | `itemsMode` (linha legada sem a coluna lê `optional`)                                                           |

Tipo não achado na empresa (ou ausente do lote) sai `null` nos campos de tipo, nunca o modo de outra empresa.

Sem N+1: o teste "uma consulta de tipos por página" conta os `select` do `listTripOccurrences` com 1 e
com 3 ocorrências de 3 tipos diferentes e exige o mesmo número. Cobertura dos três casos de uso
(detalhe, feed, lista da nota, cadastro) com tipo `off` e `optional` e uma empresa vizinha com tipo de
mesmo nome: `trip-occurrence-type-items-read.integration.ts` → 3 pass, 0 fail, 0 skip.

Efeito nos testes antigos: `FieldOccurrenceType` ganhou `itemsMode` obrigatório, então os dublês e as
expectativas exatas de `me-routes`, `office-field-occurrences`, `me-trip.integration`,
`occurrences-route`, `field-catalog` e o `OCCURRENCE_DETAIL` ganharam o campo.

Clientes: `apps/frontend-driver` valida o tipo por `isDriverOccurrenceType`
(`driverTrip.types.ts:402`), que lê só `id`, `name`, `attachmentMode`, `flow` e `stopKind` e ignora
chave a mais — a `itemsMode` não o rejeita. `apps/frontend-client` fala com o portal do contratante, não
com estas leituras. O painel é da outra branch (tolerante, T1.1).

Contrato da API depois: `bun --env-file=../../.env.test test --timeout 120000` → 9380 pass, 24 skip,
0 fail (198 arquivos); `bun run typecheck` limpo.

## T2.8 — mutação: arrancar o filtro de empresa da junção

Removido `eq(companyOccurrenceTypes.companyId, params.companyId)` de
`listOccurrenceTypeItemsShapesByIds` (fica só `inArray` nos ids). O teste passa a ler ids reais de duas
empresas com o `companyId` de uma e vê o tipo da outra:

```text
error: expect(received).toBe(expected)
Expected: 1
Received: 2
(fail) as leituras publicam o modo de itens do tipo (spec 241 RF5, CA04) > tipo de outra empresa não entra: ids reais com o companyId alheio voltam vazios
 2 pass
 1 fail
```

Restaurado (cópia byte a byte) → 3 pass, 0 fail. Achado: `trip_document_occurrences` tem FK composta
`trip_document_occurrences_company_type_fk` `(company_id, occurrence_type_id)` — inserir ocorrência de uma
empresa apontando para tipo de outra viola a FK —, por isso a barreira que a mutação prova é a do filtro
do lote, e a ocorrência cruzada não é semeável.

## T2.9 — gates da API

**Rebase em `origin/staging`** (`git fetch` + `git rebase`): entrou `20261003204733_cargo_arrivals` (spec
de chegada de carga), filha do mesmo `location_retention_settings` que a nossa — duas folhas no grafo de
snapshots, e `db:generate` ainda dizia `no_changes`. A pasta `20261004001234_occurrence_type_items_mode`
foi apagada e regerada por `bun run db:generate --name occurrence_type_items_mode` em cima do snapshot
novo: **`20261004004602_occurrence_type_items_mode`**, `prevIds = ['788af633-…']` (o snapshot de
`cargo_arrivals`); o SQL gerado é idêntico, o `UPDATE` da segunda via e o `rollback.sql` foram copiados
com o nome novo, e o nome foi trocado em `static-migration.contract.ts` e em
`docs/ai-context/api-transportada.md` (as menções a `20261004001234` acima, neste arquivo, são o
histórico da primeira geração). Conflitos de rebase: `static-migration.contract.ts` (lista de
migrations), `docs/ai-context/api-transportada.md` e as linhas únicas de `test:integration` no
`package.json` (as duas listas foram reunidas; os três arquivos de integração novos desta spec
conferidos na lista).

- `bun install --frozen-lockfile` → "no changes"; `bun run db:generate` → `{"status":"no_changes"}`;
  `bun run db:check` → "Everything's fine".
- `make migration-test ENV_FILE=.env.test` (Postgres 127.0.0.1:65432) → `124 pass, 0 fail, 1912 expect()`
  (aplica, restringe, reverte e reaplica; a CA01/CA09 sobre dado semeado antes da coluna).
- Contrato da API, `bun --env-file=../../.env.test test --timeout 120000` → **9471 pass, 24 skip, 0
  fail** (198 arquivos). Os 24 skips são os mesmos de antes (suítes sem infra opcional).
- Integração, `bun --env-file=../../.env.test` sobre a lista inteira do `test:integration` (165
  arquivos), em 8 blocos, um por vez, sem suíte concorrente no mesmo banco: 129 + 261 + 56 + 55 + 141 +
  64 + 84 + 57 + 69 + 54 = **970 pass, 0 fail**. **Pulados, e por quê:**
  - `database-migration.contract.test.ts`: 4 skip e `migration-completeness.integration.ts`: 3 skip
    quando rodados só com o `--env-file` — pedem `DRIZZLE_TEST_DATABASE_URL`. Cobertos: o primeiro pelo
    `make migration-test` (124 pass, 0 skip) e o segundo rodado com a variável
    (`migration-completeness` + `fiscal-sequence`: 10 pass, 0 skip).
  - `trip-occurrence-upload-confirm.integration.ts`: 1 skip (teste que sonda o endpoint S3; sem MinIO
    local, como o CLAUDE.md da raiz descreve). **Não rodou; não é verde.**
- `bun run typecheck` (raiz, as quatro apps com `tsc`) → sem erro; `bun run format:check` → limpo;
  `bun run lint` → 0 erros, 16 avisos (todos em `apps/frontend-transportada`, nenhum em arquivo desta
  spec); `bun run build` → verde (PWA gerado).
- `make check` completo **não foi rodado**: ele também executa as suítes das apps de frontend e passa de
  dez minutos em primeiro plano; o equivalente por partes acima cobre `format:check`, `lint`,
  `typecheck`, `build` e o teste da API (contrato e integração). Suítes de `frontend-*` não foram
  tocadas por esta branch.
- **OpenAPI:** não há. Nenhum arquivo `openapi*` na API, nenhum gerador no `package.json`; o contrato é
  o dos schemas Zod e o de `docs/ai-context/api-transportada.md` (seção da 241, completada).

## T3.2 — Ordem de publicação (cópia da etapa 2; o texto completo está no `evidence.md` do painel)

⚠️ **Nada daqui sobe antes da etapa 1.** Ordem (ADR-0081 §9): **etapa 1 = painel tolerante** (`work/241-painel`, Fase 1 e a
revisão da Fase 3) publicada, com o deploy e o `autoUpdate` do PWA no ar; **depois a etapa 2 = esta branch** (migration

- API); **depois o passo 3, humano**: o operador cadastra "Cliente pediu prorrogação do boleto" em produção pela tela
  (`spec.md` § Passo operacional) — **PENDENTE**.

**T0.3 — PENDENTE, exige a autorização do usuário:** medir em staging e produção quantos tipos têm o nome exato da segunda via
e qual `redelivery_policy` cada um tem. Política ≠ `unset` em qualquer um: a migration a zera sem aviso (D1), e a decisão
é do usuário **antes** desta etapa.

`origin/staging` conferido em `11a78cb6e` (2026-10-04): esta branch está 0 atrás. Antes do push, `git fetch` + `git rebase
origin/staging`, `bun install --frozen-lockfile`, `db:generate` = `no_changes`, timestamp `20261004004602` sem colisão
com migration de outra sessão, `make migration-test`, contrato e integração da API. Commits desta etapa, em ordem:
`43e5137df`, `f44f9a168`, `ba52bace5` (só `specs/`), `bf88566b2`, `eeb4c15bd`, `7eb7f6bd6`, `0f5191ee2`, `4eb9e1e63`,
`d72cbe043`, `036a84692`, `43519b44a`.

Este arquivo e o do painel são **add/add** no rebase. Na árvore integrada (`work/241-juntos`) os dois estão unidos: depois
de a etapa 1 estar em `origin/staging` e do rebase desta branch, resolver com `git checkout work/241-juntos --
specs/241-o-tipo-da-ocorrencia-diz-se-ela-carrega-itens/evidence.md` e conferir que as seções da API e as do painel
existem. O `tasks.md` difere entre as branches em linhas disjuntas (esta marca T0.1 e T2.1–T2.9) e junta sem conflito.

## Correções da revisão final (API)

### 1. `Promise.all` da lista da nota e do feed isolam a leitura do modo de itens

`listOccurrenceTypeItemsShapesByIds` é refinamento (o painel tolera `typeItemsMode: null`), mas uma falha nele
derrubava a lista inteira. Nova `listOccurrenceTypeItemsShapesOrEmpty` (`.catch(() => new Map())`), usada na lista
da nota e no feed; no feed a leitura saiu da série e foi para o `Promise.all` com os cancelamentos (continua uma
consulta por página — o teste que conta os `select` segue verde). Sem logger: essas funções de leitura não recebem
`ApiLogger` e não há padrão de log nelas; a falha some em silêncio (divergência relatada).

Vermelho (teste escrito antes; `trip-occurrence-type-items-read.integration.ts`, leitor falhando por proxy):

```text
error: shapes down
      at listOccurrenceTypeItemsShapesByIds (.../occurrence-type-items-read.query.ts:45:6)
      at listTripOccurrences (.../delivery-proof-read.support.ts:1129:1)
(fail) ... > a leitura do modo de itens falhando não derruba a lista da nota nem o feed
 3 pass
 1 fail
```

Mutação (tirar o `.catch`) → mesma saída vermelha (`1 fail`); com o `.catch`, `4 pass, 0 fail`.

### 2. Corrida no cadastro: a CHECK `off ⇒ unset` vira 422, não 500

`findCurrentType` lê fora da transação do `UPDATE`; dois `PUT` concorrentes passam a validação e só a CHECK
`company_occurrence_types_items_off_shape_check` os pega (SQLSTATE `23514`). `saveOccurrenceType` (adaptador de
persistência) agora traduz o `23514` **dessa** constraint, pelo nome (`violatedCheckConstraint`, que percorre o
`cause` do `DrizzleQueryError` até o `PostgresError` com `constraint`), em
`OccurrenceTypeItemsOffRedeliveryPolicyError`; outra CHECK (testada com `stage` inválido) segue propagando. O nome
virou a constante `OCCURRENCE_TYPE_ITEMS_OFF_SHAPE_CHECK` (schema e adaptador).

Vermelho (teste antes; escrita direta no repositório, sem a validação do caso de uso):

```text
error: expect(received).toBeInstanceOf(expected)
Expected constructor: [class OccurrenceTypeItemsOffRedeliveryPolicyError extends ApiError]
Received value: ... DrizzleQueryError: Failed query: update "company_occurrence_types" set ...
(fail) "itemsMode" do tipo de ocorrência contra o Postgres (spec 241) > a gravação concorrente que fere a CHECK volta 422 do domínio, e outra CHECK segue propagando
 4 pass
 1 fail
```

Verde: `5 pass, 0 fail`. Mutação (tirar o `.catch(rethrowItemsOffShapeViolation)`) → `4 pass, 1 fail`, mesma falha.

### 3. Fallback para estado impossível (`itemsMode ?? 'optional'`)

A coluna `items_mode` é `NOT NULL`, mas o tipo de aplicação `OccurrenceTypeRecord.itemsMode` é opcional para os
dublês de teste. Tornar o campo obrigatório quebrou o typecheck em 24 pontos de 20 arquivos de teste (medido e
revertido), diferença grande demais para uma correção de revisão e o mesmo desenho de `attachmentMode`. **Nada foi
removido**; os três fallbacks existentes lidam com o `?` do tipo (e, no cadastro, com `stored === null` na
criação, onde o padrão da coluna é `optional`) e o comentário de `FieldOccurrenceType.itemsMode`, que dizia "linha
legada", agora diz a razão verdadeira.

### 4. Literais repetidos viram `OCCURRENCE_ITEMS_MODE` (§16)

`OCCURRENCE_ITEMS_MODE = { off, optional }` em `src/shared/trip-occurrence.constant.ts` (escopo entre módulos),
importado por: `list-field-occurrence-types.use-case.ts`, `save-occurrence-type.use-case.ts`,
`local-occurrence-type-seed.service.ts`, `occurrence-type-catalog.constant.ts`, `occurrence-items-mode.policy.ts`,
`occurrence.schema.ts` (`WRITABLE_ITEMS_MODES`) e o `.default(...)` da coluna em `trip.schema.ts`. O vocabulário
completo segue sendo `DELIVERY_PROOF_FIELD_MODES`. Fora: o literal dentro do `sql` da CHECK (`<> 'off'`), que é
SQL do migration e não ganha nada interpolado. Sem mudança de comportamento: `bun run typecheck` limpo,
`db:generate` = `no_changes`.

### 5. A etapa 2 não pode sair junto com o painel atual (só nota, sem mudança de código)

Conferido no código do painel desta árvore (base `origin/staging` em `11a78cb6e`): `isTripOccurrence`
(`tripResponse.validation.ts:1435`) usa `hasKeys` com `allowed: [...TRIP_OCCURRENCE_KEYS,
...TRIP_OCCURRENCE_OPTIONAL_KEYS]` (`trip.constant.ts:416-430`), e nenhuma das duas listas contém `typeItemsMode` nem
`typeAllowsMultipleItems`. Chave fora de `allowed` reprova o guard, e a lista da nota (`listTripOccurrences`) passa a
publicar os dois campos nesta etapa (`null` quando o tipo não é da empresa). Logo, o painel **atual** rejeita a resposta
da API da etapa 2 na lista da nota. Ordem obrigatória: **etapa 1 (painel tolerante, incluindo `null`) → esperar o
`autoUpdate` do PWA → etapa 2 (migration + API)**.

### Gates das correções da revisão final (API)

`origin/staging` sem commits novos (rebase sem efeito; sem migration nova, `20261004004602` sem colisão);
`bun install --frozen-lockfile` sem mudanças. `bun run typecheck` limpo; `bun run format:check` limpo;
`db:generate` → `no_changes`; contrato da API **9471 pass, 24 skip, 0 fail** (198 arquivos; os 24 skips são os
mesmos de antes); `make migration-test ENV_FILE=.env.test` → 124 pass, 0 fail. Integração, um arquivo por vez,
`--env-file=../../.env.test`: `trip-occurrence-type-items-read` 4, `occurrence-type-items-mode` 5,
`occurrence-type-catalog-seed` 2, `trip-occurrence-correction` (+`-read`) 16, `me-trip` (+`-departure`) 32,
`occurrence-type-redelivery-policy` 2, `occurrence-type-leaves-document-behind` 4, `trip-occurrence-feed-document` 6,
`trip-occurrence-feed-case` 2, `trip-occurrence-detail` 6, `trip-occurrence-item-quantity` 5,
`trip-occurrence-timeline` 3 — todos pass, 0 fail, 0 skip.
