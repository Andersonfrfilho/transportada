# Evidências — 227 A nota se abre inteira

Spec escrita em 2026-10-02 a partir do mapa da exploração. Aguarda N2 e N5 (só bloqueiam a Fase 5).

## T0.1 — renumeração 225 → 226

`origin/staging` já tinha `225-a-viagem-terminada-nao-foi-movida`; os números 226 a 229 estavam livres em
**todas** as refs. Feita **antes** do rebase, o único momento em que toda referência a 225 é minha.
37 arquivos, 85 substituições por lista explícita de padrões e 21 renomes via `git mv`; **zero resíduo**
conferido por `grep`. Ficaram de fora de propósito os falsos positivos — `'225.0000'`, o código `'225'`
da SEFAZ, os builds em `dist/`. Os commits antigos continuam dizendo 225: história não se reescreve.

## T0.2 — rebase em `origin/staging`

93 commits atrás, 32 à frente. Backup guardado em `backup/pre-rebase-226`. **Seis conflitos**, todos
resolvidos sem perder o trabalho de ninguém:

| arquivo                               | natureza                                          | resolução                                                |
| ------------------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| `static-migration.contract.ts`        | lista exaustiva de migrations                     | as duas entradas, em ordem                               |
| `trip-http.fixture.ts` (2×)           | dois campos opcionais acrescentados ao mesmo tipo | os dois                                                  |
| `package.json` da API                 | a lista explícita de `test:integration`           | a lista de staging **mais** o meu arquivo (148 no total) |
| `trip.contract.test.ts` (painel)      | imports de teste dos dois lados                   | todos                                                    |
| `tripValuationResponse.validation.ts` | **fusão de duas intenções**, ver abaixo           | staging + a minha validação dentro de `toRevenueLine`    |

Um commit (`0659a481b`, o SQLSTATE do `RESTRICT`) foi **pulado sozinho pelo git — já estava em staging**,
a mesma correção feita por outra sessão.

### O único conflito que não era mecânico

A tarefa "endurecer a leitura de dinheiro", que o usuário começou em outra sessão a partir de uma
observação minha, **já estava em staging** e tinha reestruturado `toTripValuation` (`collectLines` +
`toRevenueLine` recusando `amount` malformado). A minha T3.1 acrescentava a validação dos oito campos no
formato antigo. Escolher um lado perderia a outra intenção; a fusão põe a minha validação **dentro** de
`toRevenueLine`, com a mesma semântica das duas: linha malformada → `null` → avaliação recusada. Um
commit seguinte só editava o comentário de uma função (`readRevenueLines`) que deixou de existir, e o texto
corrigido já vive em `toRevenueLine` — descartei o órfão.

### Rebase limpo não é typecheck verde

`bun install --frozen-lockfile` e `typecheck` nas **sete** apps: exit 0. Os testes pegaram o que o typecheck
não podia: **5 contratos de cadeia de snapshots** reprovaram — T0.3.

## T0.3 — a migration reencadeada

Ver a entrada final de `specs/196-…/evidence.md`. Procedimento: guardar o `migration.sql` e o `rollback.sql`,
remover a pasta, deixar o `drizzle-kit` gerar a partir do snapshot de staging (`prevIds` = id dela, conferido
por script), trocar o SQL gerado pelo escrito à mão, renomear no `DELETE` do journal do rollback, atualizar
a lista exaustiva.

| portão                  | resultado                                            |
| ----------------------- | ---------------------------------------------------- |
| `db:generate`           | `no_changes`                                         |
| contratos de migration  | **75 pass · 4 skip · 0 fail**                        |
| `make migration-test`   | **115 pass · 0 fail**                                |
| contrato inteiro da API | **8656 testes · 0 fail**                             |
| painel                  | **6301 pass · 0 fail** e hooks **248 pass · 0 fail** |

O teste `beacon` do painel estourou o teto de 5 s no primeiro run (carga) e passou 3 de 3 isolado e na
suíte inteira; nada em `driver-trip` foi tocado por mim.

## Fase 1 — o acordeão (T1.1 e T1.2)

Executada por subagente `executor` em `sonnet`; gates e mutações conferidos por mim.

### A decisão que a spec deixou aberta: estado próprio, com `openProofDocumentId` **derivado**

`openDocumentId` é o estado do acordeão, em `useOpenTripDocument`; `openProofDocumentId` deixou de ser
estado e passou a ser **derivado** dele — só vale quando a nota é entregue ou devolvida
(`hasTripDocumentProof`). Reaproveitar `openProofDocumentId` como estado teria feito abrir uma nota **não
entregue** disparar as três buscas que dependem dele (`delivery-proofs`, `document-products`, `occurrences`,
todas `enabled: openProofDocumentId !== null`) e ligar o gate do canhoto — chamada à toa, com risco de 404 ou
estado de erro na tela de uma nota que **não tem** comprovante. Com a derivação as três buscas e o gate
ficaram intactos.

Efeito colateral declarado: nota não entregue aberta não busca itens nem ocorrências. Antes só o diálogo
de ocorrência de separação buscava os itens, então nada regrediu; mostrar itens e ocorrências na nota
aberta é das Fases 3 e 4.

### O que mudou na estrutura

O cabeçalho da nota é **checkbox e botão irmãos** (`<button aria-expanded aria-controls>`); o checkbox
**não** está aninhado no botão, que é HTML inválido e engole o clique. Os selos continuam fora do botão,
porque um deles é `<Button>`. Saíram os dois botões "Comprovante" e "Detalhes da nota" e o `useState` da
linha. `TripStopList` continua com cinco props.

A âncora da linha do tempo agora **abre** a nota. O `click` no `document` existe porque clicar duas vezes
na mesma âncora **não** dispara `hashchange`; é restrito a âncoras que casam com o formato
`#trip-timeline-document-…`, e os dois listeners têm limpeza.

### O contrato da spec 181 não foi afrouxado

`document-row-structure.contract.ts` ganhou **só acréscimo** (4 testes): nenhuma asserção existente foi
alterada ou removida, e o contrato antigo **não** afirmava "duas expansões independentes", ao contrário do
que a exploração tinha lido. A afirmação por **estrutura renderizada** (checkbox fora do botão, exclusividade)
está em `test/trip-hooks/trip-document-accordion.contract.ts` (13 testes, em DOM).

### Provado por mutação — e a que quase passou despercebida

| mutação                                         | o que reprovou                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| estado local por linha (volta ao `useState`)    | exclusividade (RF1/CA01) e os 3 testes de âncora                                                  |
| checkbox aninhado no botão                      | "a caixa não está dentro do botão…" e "marcar a caixa seleciona a nota e não abre nem fecha nada" |
| **nota não entregue passa a pedir comprovante** | "a nota não entregue abre sem buscar comprovante, itens nem ocorrências"                          |

A terceira linha é a que importa. O executor viu esse teste reprovar numa mutação que **não tocava** o hook
dele, **suspeitou** de vazamento de `window.location.hash` entre testes, mexeu no `afterEach` e **não
reexecutou**. Eu reexecutei: com a ordem **embaralhada 6 vezes** (`--randomize`, e com o preload de DOM que o
script `test:hooks` registra) a suíte dá **261 pass · 0 fail** nas seis, e a mutação **certa** para esse
teste reprova só ele (260 · 1), voltando a 261 · 0 revertida. Teste que reprova por causa de outro teste
passa ou falha conforme a ordem; este não faz isso.

⚠️ Rodar esse arquivo **solto** (`bun test ./test/trip-hooks/…`) dá treze falhas de 0,05 ms — falta o DOM do
`--preload ./test/trip-hooks/dom.preload.ts`. É o aviso do `CLAUDE.md` sobre invocação errada: a falha é de
ambiente e se parece com defeito.

### Portões

| Portão                        | Resultado                                                            |
| ----------------------------- | -------------------------------------------------------------------- |
| `typecheck` / `lint` (painel) | exit 0 · 0 erros, 16 avisos pré-existentes, nenhum novo              |
| `bun run test` (painel)       | **6305 pass · 0 fail** (era 6301)                                    |
| `test:hooks`                  | **261 pass · 0 fail** (era 248), estável em 6 execuções embaralhadas |

### O que ficou declaradamente fora

- **`scrollWidth <= innerWidth` em 375 px** não foi medido (exige o smoke com a stack de pé). Pelo CSS não há
  causa de transbordo (`min-width: 0` no botão e no corpo), mas CSS lido não é medida: fica para o smoke
  `spec-227-prints` e para a T6.1.
- Os dois `useState` de dentro do comprovante (`isProductsExpanded`, `isOccurrencesExpanded`) continuam —
  são das Fases 3 e 4.
- A ordem do canvas dentro do corpo é só a aproximação de detalhes → comprovante.
