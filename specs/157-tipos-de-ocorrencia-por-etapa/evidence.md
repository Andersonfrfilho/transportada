# Evidências — spec 157

## A regra confirmada (RF4)

Havia duas leituras em conflito no repositório:

- `occurrence.policy.ts` (spec 079 T020): "a rota do galpão não grava ocorrência de rua".
- `test/trip-occurrence/register.contract.ts` ("o escritório registra os dois grupos, e a
  permissão dele é trip.manage") e o comentário de `trip.routes.ts` ("o caso de uso o confere"),
  sem conferência nenhuma no caso de uso.

Venceu a primeira, pelo que o produto faz hoje:

| Papel           | `trip.manage` | `trip.report` | `trip.report-on-behalf` |
| --------------- | ------------- | ------------- | ----------------------- |
| `company-admin` | sim           | não           | sim                     |
| `operator`      | sim           | não           | sim                     |
| `separator`     | sim           | não           | não                     |
| `driver`        | não           | sim           | não                     |

(`resolveCompanyPermissions`, medido em 2026-09-18.)

- `company-admin` e `operator` registram ocorrência de rua em nome do motorista pela rota da
  spec 156 (`POST /trips/:id/documents/field-occurrences`). Fechar a rota do galpão não lhes tira
  nada.
- Quem ganharia com a rota do galpão aceitando rua é só o `separator` — a elevação que a política
  descreve.
- Os dois chamadores de `registerTripOccurrence` já oferecem só `separation`:
  `TripOccurrences.component.tsx:60` (tela do escritório) e
  `register-operator-trip-flow-actions.ts:503,548` (WhatsApp do operador).

O contrato da 079 foi reescrito para a regra nova, com o motivo no comentário.

## T1 — `GET /me/trips/current/occurrence-types`

Arquivos: `me-trip.routes.ts` (rota + dependência), `main.ts` (liga ao `listFieldOccurrenceTypes`
da L2 da spec 156).

Teste antes (red): `bun test ./test/driver-trip.contract.test.ts` → 3 falhas em "os tipos de
ocorrência do motorista (spec 157)" (rota inexistente). Depois (green): 152 pass com
`trip-occurrence`.

Contratos (`test/driver-trip/me-routes.contract.ts`):

- a rota fica sob `/me/trips/current`, pede `trip.report`, e o `authorize` real deixa o `driver` passar;
- o handler devolve só `{ id, name }`, com o `companyId` do token;
- conta sem cadastro de motorista recebe `DriverNotRegisteredError` sem consultar os tipos;
- os contratos existentes da árvore (`trip.read`/`trip.report` apenas, sem id de viagem, nenhuma
  rota do escritório alcançável pelo `driver`) continuam verdes com a rota nova.

## T2 — PWA do motorista

Arquivos: `driverTripClient.service.ts` (caminho), `driverTrip.types.ts` (`DriverOccurrenceType`
vira `{ id, name }`; `driverSelectableOccurrenceTypes` sai — o filtro é do servidor),
`DriverStopCard.component.tsx`, `test/driver-trip-smoke.helper.ts` (dublê da rota nova).

Teste antes (red): `bun test ./test/driver-trip.contract.test.ts` (frontend) → 2 falhas (caminho
`/company-settings/occurrence-types`). Depois: 119 pass.

## T3 — guarda de etapa no galpão

Arquivos: `trip.error.ts` (`OccurrenceTypeNotSeparationError`, 422
`OCCURRENCE_TYPE_NOT_SEPARATION`), `register-trip-occurrence.use-case.ts` (guarda logo após ler o
tipo, antes de gravar e de avisar), comentários de `trip.routes.ts` e `occurrence.policy.ts`.

Teste antes (red): `SyntaxError: Export named 'OccurrenceTypeNotSeparationError' not found`.
Depois: 69 pass em `trip-occurrence.contract.test.ts`.

- tipo de rua → 422 `OCCURRENCE_TYPE_NOT_SEPARATION`, `saveOccurrence` e notificador não chamados;
- tipo de galpão → grava e avisa;
- `notification.contract.ts` e `template-key.contract.ts` usavam tipo de rua no caso de uso do
  galpão (caminho que a regra fecha); os fixtures passaram a `separation` — o que eles testam
  (aviso e template) não depende da etapa.

## Gates

- `make check` (format:check + lint + typecheck + test + build): verde, 12.500 testes, 0 falhas.
- Smoke (`bun run smoke -- test/responsive.smoke.spec.ts -g motorista`): 3 passed, incluindo o
  novo "o motorista vê os tipos de ocorrência de rua da empresa" (dublê de
  `/me/trips/current/occurrence-types` em `driver-trip-smoke.helper.ts`).
- Print: `prints/driver-occurrence-types-mobile.png` (375×812) — o seletor abre com o tipo de rua.
- Não rodado: `test/integration/whatsapp-operator-flow-actions.integration.ts` (Postgres). O fluxo
  já só oferece `separation` (`register-operator-trip-flow-actions.ts:503,548`), então a guarda
  não muda o caminho exercitado ali.

## Revisão de design

Sem mudança visual: o seletor é o mesmo, e agora tem conteúdo. A degradação para lista vazia em
erro continua (fora do escopo, `spec.md`).

## T4 — aviso quando a lista de tipos falha (RF5/CA5)

Falha, lista vazia de verdade e carregamento eram indistinguíveis: `listOccurrenceTypes()`
convertia corpo estranho, rede fora do ar e recusa do servidor no mesmo `[]` que a empresa sem
tipo de rua cadastrado devolve de verdade, e `.catch(() => undefined)` na página engolia o que
sobrava — o motorista via o painel de "Registrar ocorrência" sem opção nenhuma, sem saber o porquê.

### Formato escolhido

```ts
// driverTrip.types.ts
export type DriverOccurrenceTypesResult =
  | Readonly<{ status: 'failed' }>
  | Readonly<{ status: 'loaded'; types: readonly DriverOccurrenceType[] }>

export type DriverOccurrenceTypesState =
  | Readonly<{ status: 'loading' }>
  | DriverOccurrenceTypesResult
```

`listOccurrenceTypes(): Promise<DriverOccurrenceTypesResult>` nunca lança — falha de rede, recusa
HTTP e corpo inválido viram `{ status: 'failed' }` dentro do próprio cliente (`try/catch` ao redor
do `request()`); `{ data: [] }` vira `{ status: 'loaded', types: [] }`. `loading` só existe do lado
da página, como estado inicial e ao reiniciar a busca no "Tentar de novo" — o cliente não a
devolve. `DriverStopCard`/`DocumentRow` recebem o estado inteiro (`occurrenceTypes:
DriverOccurrenceTypesState`) e `onRetryOccurrenceTypes`, e decidem entre falha/carregando/vazio/com
itens dentro do mesmo `fieldset` que já existia.

Arquivos: `driverTripClient.service.ts`, `driverTrip.types.ts`, `DriverTripWorkspace.page.tsx`
(sai o `.catch(() => undefined)`; `handleRetryOccurrenceTypes` recarrega sob demanda),
`DriverStopCard.component.tsx` (painel com os 4 estados), `driverTrip.locale.json` (4 chaves
novas), `test/driver-trip/occurrence.contract.ts`, `test/driver-trip-smoke.helper.ts`
(`occurrenceTypesFailures` configurável), `test/responsive.smoke.spec.ts`.

### Red (antes do código)

Para provar o red sem alterar o histórico compartilhado do worktree, os cinco arquivos de
implementação foram postos de lado com `git stash push -u -m "wt-157-t4-impl-only" --
<arquivos>` (mantendo o teste novo em pé) e reaplicados em seguida com `git stash apply <sha>` —
nunca `pop`, para não arriscar o stash de outra sessão.

```
bun test ./test/driver-trip.contract.test.ts
```

→ **116 pass, 11 fail**. As 11 falhas batem com o que o T4 muda: o formato novo do retorno
(`{status}` em vez de array), a leitura das chaves de locale novas, o `occurrenceTypes.types.map(`
no `DriverStopCard` e a ausência do `.catch(() => undefined)` na página.

### Green (depois do código)

```
bun test ./test/driver-trip.contract.test.ts
```

→ **127 pass, 0 fail**, 305 `expect()` calls.

### Smoke

```
bun run smoke -- test/responsive.smoke.spec.ts -g "motorista" --reporter=line
```

→ **5 passed**, incluindo os dois novos:

- "sem a lista de tipos, o motorista vê o aviso e tenta de novo" — 1 falha 500 configurada via
  `occurrenceTypesFailures: 1`; o aviso aparece, "Entreguei"/"Não entreguei" continuam visíveis
  (a falha não bloqueia a parada), o toque em "Tentar de novo" repete o pedido e mostra "Cliente
  ausente".
- "sem tipo de rua cadastrado, o motorista vê o aviso de lista vazia" — dublê respondendo
  `{ data: [] }`; mostra o texto de lista vazia, não o de falha.

### Prints (375×812)

`prints/driver-occurrence-types-failed-mobile.png` e
`prints/driver-occurrence-types-empty-mobile.png`, gerados com `page.screenshot({ fullPage: true
})` **temporariamente** inserido nos dois testes novos e removido logo depois (`git diff
apps/frontend-transportada/test/responsive.smoke.spec.ts | grep screenshot` não devolve nada).

### Revisão de design e usabilidade

- **Falha**: texto em `styles.proofFieldError` (o mesmo vermelho `--color-alert` dos campos
  obrigatórios da própria tela) com `role="alert"` envolvendo o parágrafo e o botão — leitor de
  tela e olho pegam o aviso junto. Contraste bom sobre o fundo do card. Botão "Tentar de novo"
  segue o padrão `variant="ghost"` + `Icon name="refresh"` dos outros botões do mesmo fieldset
  (mesma altura, mesmo espaçamento) — nenhum primitivo cru ao lado dos do design system.
  "Entreguei"/"Não entreguei" continuam no lugar de sempre, fora do fieldset da ocorrência: a
  falha não desloca nem esconde o resto da parada.
- **Lista vazia**: texto em `styles.stopMeta` (cinza secundário, o mesmo tom de "Aguardando o
  início do trajeto" e da contagem de notas pendentes) — tom neutro correto, porque não é erro.
  Nada transborda em 375px (`assertNoHorizontalOverflow` passou nos dois testes).
- **Carregando**: o `<p>{t('documentOccurrenceTypesLoading')}</p>` inicial violava
  `test/design-system/skeleton.contract.ts` ("forbids a lone translated loading paragraph as the
  entire loading state") — achado pelo `bun run test` completo do frontend, não pelo contrato
  específico do T4. Trocado por `SkeletonGroup`/`Skeleton` (`@/components/ui/skeleton`), duas
  barras na altura `var(--control-height)` (a mesma dos botões reais que ela antecede), seguindo
  `docs/frontend/loading.md`.
- Nenhuma pendência de design encontrada.

### Gates finais

- `bun test ./test/driver-trip.contract.test.ts`: **127 pass, 0 fail**, 305 `expect()` calls.
- `bun run test` (suíte completa do frontend): **4384 pass + 7 pass (hooks), 0 fail**.
- `bunx eslint src/modules/driver-trip test --max-warnings=0`: sem saída, sem erro.
- `bun run smoke -- test/responsive.smoke.spec.ts -g "motorista" --reporter=line`: **5 passed**.
- `make check` (format:check + lint + typecheck + test + build, monorepo inteiro): **EXIT_CODE=0**
  — 6512+1381+94+4384+7+50+111 pass nos testes de todas as apps, 0 fail; build das 6 apps ok.

### Revisão final (`code-reviewer`, opus) e correções

Veredito: **aprovado com ressalvas**. Nenhum achado bloqueava. A corrida entre a carga inicial e o
"Tentar de novo" não acontece: o botão só existe em `failed`, e o toque troca o estado para
`loading`. O CORS no dublê do estado vazio também não é problema: o Playwright responde o
preflight. Corrigido na mesma task:

- **Carregamento eterno com rede presa** (médio): `request()` passou a aceitar `signal`, e a lista
  vai com `AbortSignal.timeout(10_000)`. O aborto cai no `catch` e vira `failed`.
- **Foco perdido ao tocar "Tentar de novo"** (médio): o botão some ao virar `loading`. O
  `fieldset` ganhou `ref` e `tabIndex={-1}` e recebe o foco depois do toque.
- **`role="alert"` envolvia o botão** (baixo): o alerta passou para o `<p>` e o botão ficou irmão.
- **Item malformado virava botão vazio** (baixo): `isDriverOccurrenceType` confere `id` e `name`
  como texto, e qualquer item fora disso torna a lista `failed`.
- **O smoke não conferia "Deu problema"** (baixo): o teste de falha agora exige visível **e**
  habilitado para Entreguei, Não entreguei e Deu problema.
- **Faltava o caminho de rede caída** (baixo): contrato com `fetch` que rejeita.

Ficou como está: `DocumentRow` já passava de 5 props antes desta task (dívida anterior).
Registrado aqui, sem refatoração.

Red das correções: 3 contratos novos falhando (teto de tempo, item malformado, foco). Green:
`bun test ./test/driver-trip.contract.test.ts` → **131 pass, 0 fail**. Smoke do motorista:
**5 passed**. O print de falha foi refeito rolando até o botão, porque o anterior o cortava.
Os dois prints mostram o aviso em `--color` de erro de campo (o mesmo `proofFieldError` dos
outros avisos do painel). O vazio aparece em texto secundário, e "Tentar de novo" é `ghost` com
ícone, igual aos botões de tipo que ocupam o mesmo lugar.
