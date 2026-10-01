# Evidência

Uma seção por task, na ordem em que ela fechou. Cada uma leva o comando rodado e a saída dele —
relatório de agente não é evidência, execução é.

⚠️ Duas provas desta spec são **por mutação**, não por leitura: o CA05 (chave sem entrada no mapa
reprova `bun run typecheck`) e qualquer contrato de visibilidade que afirme código por texto. Colar a
reprovação e o verde do desfazer.

## Levantamento inicial (feito ao escrever a spec, 2026-10-01)

Medido no worktree `fervent-sutherland-937527`, contra `origin/staging` em `bf2a1c432`:

- **O menu não filtra por permissão.** `NAVIGATION_GROUPS.map` (`main.tsx:654`) e `group.items.map`
  (`:680`) renderizam tudo. O único `permissions` do arquivo (`:507`) serve ao redirecionamento do
  motorista.
- **19 itens em 5 grupos**: Fiscal 10, Operações 2, Cadastros 4, Usuários 2, Administração 1.
  `driver-trip` e `notification` ficam fora dos grupos (`:134`, `:137`).
- **15 páginas têm parede de permissão própria**; **Empresa** e **NFS-e** não têm.
- **O separador abre 5 dos 19**: NF-e (`invoices.read`), Viagens (`fleet.read`), Ocorrências
  (`fleet.read`), Frota (`fleet.read`), Pendências (`fleet.read`).
- **`'billing.read'` é declarada como constante local em 5 arquivos** do módulo de faturamento — o
  sintoma de não existir mapa.
- **Conta de campo entra no painel por qualquer caminho que não seja `/minha-viagem` ou a raiz**:
  `resolveDriverAppRedirect` calcula `isDriverEntry` só com esses dois (`driverAppRedirect.service.ts:33`)
  e devolve `stay` para o resto.
- **`GET /auth/me` devolve `roles` validados** (`useAuthMe.query.ts:153`, `isLiteralArray(roles,
COMPANY_ROLES)`), o que torna a preferência de aterrissagem da RF-C6 implementável sem rota nova.
- **A fonte dos papéis** é `COMPANY_ROLE_PERMISSIONS`
  (`api-transportada/src/identity/domain/authorization.policy.ts:115`): `separator` tem
  `invoices.read`, `fleet.read`, `trip.read`, `trip.manage`, `cargo.measure`; `driver` e `aggregate`
  têm `trip.read` + `trip.report`.

Contexto de origem: investigação do relato de produção de 2026-10-01 ("os botões de CT-e não podem
aparecer para quem carrega"). A causa daquele relato era a conta ter `operator` **e** `separator`, e
as permissões somarem — resolvida por troca de papel. Esta spec trata o que sobrou.

## Fase 1 — A conta de campo não abre o painel

### T1.1 — o que cada chamador passa hoje

Lido em `driverAppRedirect.service.ts`, `driverAppEntry.service.ts` e `main.tsx`.

- `resolveDriverAppRedirect` (antes): sem interruptor → `stay`; `isDriverEntry` = `/minha-viagem`
  **ou** (`/` **e** conta de campo); fora disso `stay`; depois `pending-screen` → `install-screen`
  → `redirect`. Por isso conta de campo em `/trips` caía em `stay` e abria o painel.
- `readDriverAppMode` só empacota a leitura do IndexedDB + `isStandaloneDisplay(window)` +
  `window.location.pathname` e chama a função pura com o `isFieldOnlyUser` que recebe.
- Chamador 1, efeito do `main.tsx` (~`:507`): roda depois de `auth/me`, `isFieldOnlyUser(permissions)`
  verdadeiro, **só se `pathname === '/'`**; sem interruptor entra em `/minha-viagem` direto; com
  interruptor chama `readDriverAppMode({ driverAppUrl, isFieldOnlyUser: true })`.
- Chamador 2, `takeOverDriverEntry` (`main.tsx` ~`:934`): roda no boot, **antes de `auth/me`**, só se
  `pathname === DRIVER_TRIP_PATH` e `driverAppUrl !== undefined` (senão retorna `false` logo na
  primeira linha); passa `isFieldOnlyUser: false`.

**Decisão sobre `:934`: manter `false`, com justificativa.** O `false` só decide algo quando o
caminho não é `/minha-viagem`, e esse chamador nunca chega à função com outro caminho (guarda na
primeira linha). Com o caminho `/minha-viagem`, `isDriverEntry` é verdadeiro pela primeira metade,
independente da permissão; e o modo novo `legacy-home` exige `driverAppUrl === undefined`, que esse
chamador também descarta. Logo o `false` continua neutro com a RF-E1. Ficou escrito no comentário
da chamada e afirmado por contrato (`em /minha-viagem o caminho decide, com ou sem o dado de conta
de campo`). O único ajuste exigido no chamador foi o `switch` ficar exaustivo: `legacy-home` junto
de `stay` (`return false`).

Consequência no chamador 1: o efeito só olhava a raiz. Para fechar o defeito ele passou a valer
para **qualquer caminho de entrada** exceto `/minha-viagem` (guarda `entryPath === DRIVER_TRIP_PATH`),
e a releitura do `pathname` pós-IndexedDB compara com o `entryPath` capturado, não mais com `'/'`.
As dependências do efeito continuam `[permissions]`: ele decide na entrada, não bloqueia navegação
interna posterior. Sem interruptor, o ramo `driverAppUrl === undefined` (entrar em `/minha-viagem`
por `history.replaceState`, sem abrir o IndexedDB) **é** o `legacy-home` em runtime; o modo existe na
função pura e é tratado no ramo do `then` (`stay`/`redirect`/`legacy-home` → `enterDriverTrip`),
que é inalcançável com `driverAppUrl` definido mas mantém o `switch`/cadeia exaustivos.

### T1.2 + T1.6 — contratos de regressão, ANTES de mudar produção

Rodados contra o código antigo (`driverAppRedirect.service.ts` ainda sem alteração):

```
$ bun test test/driver-trip.contract.test.ts -t "regressão|separador"   (apps/frontend-transportada)
 7 pass
 247 filtered out
 0 fail
 14 expect() calls
```

Cobrem: `pending-screen` vence tudo; `install-screen` depois; `/minha-viagem` sem interruptor é `stay`
(com fila e instalado); `/minha-viagem` com `isFieldOnlyUser: false` (o que `:934` passa) continua
`redirect`/`pending-screen`; `separator` (`invoices.read`, `fleet.read`, `trip.read`, `trip.manage`,
`cargo.measure`) em `/trips` é `stay` com e sem interruptor; motorista + separador (permissões
somadas) tem `isFieldOnlyUser === false` e `stay` em `/trips` com e sem interruptor (T1.6).

### T1.3 — contrato dos casos novos, falhando ANTES da T1.4

```
$ bun test test/driver-trip.contract.test.ts -t "não abre o painel"
error: expect(received).toBe(expected)
Expected: "redirect"
Received: "stay"
(fail) a conta de campo não abre o painel > com o interruptor, qualquer caminho redireciona
Expected: "legacy-home"
Received: "stay"
(fail) a conta de campo não abre o painel > sem o interruptor, qualquer caminho fora de /minha-viagem volta para a casa antiga
Expected: "pending-screen"
Received: "stay"
(fail) a conta de campo não abre o painel > a fila antiga pendente vence em qualquer caminho, e o ícone instalado vem depois
 0 pass
 251 filtered out
 3 fail
```

Dois testes **antigos codificavam o defeito** e foram reescritos junto (não são relaxamento):
`sem a variável, fica...` perdeu o caso `{ pathname: '/' }` com conta de campo (agora é `legacy-home`,
afirmado no bloco novo) e `fora da entrada do motorista, fica` passou a usar conta que **não** é de
campo (`isFieldOnlyUser: false`); para conta de campo o caminho é entrada em qualquer lugar (RF-E1).

### T1.4 — função pura

`isDriverEntry = pathname === DRIVER_TRIP_PATH || input.isFieldOnlyUser`; `DriverAppRedirectMode`
ganha `'legacy-home'`; ordem: sem interruptor → (`legacy-home` se campo e fora de `/minha-viagem`,
senão `stay`); com interruptor → não-entrada `stay`, `pending-screen`, `install-screen`, `redirect`.

```
$ bun test test/driver-trip.contract.test.ts
 254 pass
 0 fail
 557 expect() calls
```

### T1.5 — `main.tsx`

Efeito ampliado a qualquer caminho de entrada, `legacy-home` tratado, `switch` de `takeOverDriverEntry`
exaustivo, comentário da decisão de `:934`. Nenhum `location.replace` novo; a troca interna é o
`enterDriverTrip` já existente (`history.replaceState` + `setCurrentWorkspace` + `setCurrentPath`).

### T1.7 — beacon

```
$ bun test test/driver-trip.contract.test.ts -t "beacon"
 5 pass
 249 filtered out
 0 fail
```

`sendDriverLegacyBeacon` e `DRIVER_LEGACY_BEACON_*` não foram tocados; `legacy-beacon.contract.ts`
(importado por `driver-trip.contract.test.ts`) verde; continua saindo só de `pending-screen`.

### T1.8 — gates

```
$ bun run --cwd apps/frontend-transportada test
 6061 pass / 0 fail   (31 arquivos, contratos)
 179 pass / 0 fail    (1 arquivo, test:hooks)
$ bun run typecheck      -> exit 0 (api, worker, cron, frontend-transportada, frontend-client, frontend-driver, frontend-landing)
$ bun run lint           -> exit 0 (0 errors, 16 warnings preexistentes; nenhuma em arquivo tocado)
$ bun run format:check   -> "All matched files use Prettier code style!" (após prettier --write só no arquivo de contrato)
```

```
$ bun run --cwd apps/frontend-transportada build   -> exit 0 (vite build, PWA precache 173 entries)
```

`make check` não foi rodado como alvo único: os cinco gates dele foram rodados um a um (format,
lint, typecheck, test, build do frontend do painel). O smoke Playwright não faz parte desta fase.
