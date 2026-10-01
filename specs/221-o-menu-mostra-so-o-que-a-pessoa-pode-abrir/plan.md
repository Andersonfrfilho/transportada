# Plano técnico

## Contexto e premissas

Nada aqui é construção nova: o painel já carrega as permissões, já tem o padrão de decidir
visibilidade por função pura e já tem um precedente de "fazer algo depois que as permissões
chegam". O plano é ligar essas três coisas — e o risco principal é mexer no lugar errado do
`main.tsx`, que não tem router e resolve rota por comparação de `pathname`.

| Assunto                                 | Decisão fechada                                                           | Onde                                           |
| --------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| Ocultar vence bater 403                 | sem a permissão, o bloco some em vez de a rota recusar                    | spec 156 D11                                   |
| Visibilidade mora em função pura        | `resolveSeparationOccurrenceButtonVisibility`, `resolveDocumentRowAction` | `trip/shared/*.service.ts`                     |
| Política transcrita se congela em teste | tabela no teste, com a origem anotada                                     | `test/trip/state-gates.contract.ts`            |
| Agir depois das permissões              | efeito sobre `authMeQuery.data.permissions`                               | `main.tsx:507` (redirecionamento do motorista) |
| Chave nova obriga classificação         | `Record<...>` + `satisfies` reprova no typecheck                          | `TRIP_DOCUMENT_DETAIL_FIELD_POLICY`            |
| Sem router, navegação manual            | `pushState` + `popstate` + `sessionStorage`                               | `main.tsx` (CLAUDE.md da app)                  |

Premissa que sustenta a fase 3: **o `main.tsx` já sabe esperar as permissões e navegar sozinho.**
O bloco do motorista (`:507-568`) lê `authMeQuery.data?.data.permissions`, decide por função pura
(`resolveDriverAppRedirect`) e chama `window.location.replace`. A aterrissagem desta spec é o mesmo
arranjo com outro decididor e `history.replaceState` em vez de troca de origem.

## Arquitetura e arquivos afetados

### Novo: o mapa e as decisões (`apps/frontend-transportada/src/modules/shared/`)

- `workspaceAccess.service.ts` — módulo novo, sem import de componente:
  - `WORKSPACE_PERMISSIONS` — `Record<GatedWorkspaceKey, readonly TransportadaPermission[]>` com
    `satisfies`, uma entrada por chave de grupo, cada linha com comentário de origem (RF-A3).
  - `canOpenWorkspace({ permissions, workspace })` — união: `some(entrada, p => permissions.includes(p))`.
  - `visibleWorkspaceKeys(permissions)` — na ordem de `WORKSPACE_NAVIGATION_ITEMS`.
  - `LANDING_PREFERENCE` — lista **ordenada** de `{ roles, without, workspace }`, avaliada de cima
    para baixo. Uma entrada hoje: `{ roles: ['separator'], without: ['company-admin', 'operator',
'finance', 'fiscal'], workspace: 'trip' }` (RF-C6). Lista, não mapa: a ordem é a regra de desempate
    quando a conta acumula papéis, e `Record<papel, workspace>` não a expressa.
  - `resolveLandingWorkspace({ current, permissions, roles })` — devolve `{ kind: 'stay' }`,
    `{ kind: 'replace', workspace }` ou `{ kind: 'no-access' }`. Função pura, sem `window`. Ordem
    interna: `current` permitido → `stay`; senão preferência (se a conta puder abri-la, RF-C7); senão
    primeiro visível; senão `no-access`.
  - ⚠️ `roles` entra **só** aqui. `canOpenWorkspace` e `WORKSPACE_PERMISSIONS` não recebem papel, e um
    contrato afirma que o módulo do mapa não importa `CompanyRole` (D9).
- O tipo da chave sai de `main.tsx` para cá (ou para um `workspace.types.ts`): hoje
  `WorkspaceNavigationItem['key']` é uma união literal inline no `main.tsx`, e o mapa precisa dela
  sem importar o `main` (que monta a app inteira no import).

### `main.tsx`

- Extrair `WORKSPACE_NAVIGATION_ITEMS`, `NAVIGATION_GROUPS` e a união de chaves para um módulo
  próprio (`modules/shared/workspaceNavigation.constant.ts`) — sem isso o contrato do mapa não
  consegue ler a lista de itens para afirmar cobertura, porque importar `main.tsx` num teste
  dispara o boot.
- No render da barra (`:654`): filtrar `group.items` por `canOpenWorkspace` e descartar grupo que
  ficou vazio. Com `authMeQuery` carregando, esqueleto (RF-B3).
- **"Minha viagem" entra num grupo** (RF-E6), visível só com `trip.report`. Ela está hoje fora de
  `NAVIGATION_GROUPS` (`main.tsx:134`), então precisa de casa: o grupo **Operações** é o mais próximo
  do assunto, e a entrada no mapa de permissões é `['trip.report']`. Isso tira `driver-trip` da lista
  de chaves não cobertas da RF-A4 — ela passa a ser chave de menu como qualquer outra. `notification`
  continua fora.
- Efeito novo ao lado do bloco do motorista: `resolveLandingWorkspace` sobre
  `resolveCurrentWorkspace()` + permissões → `history.replaceState` e o `setState` do workspace
  atual, ou a tela de sem acesso.
- ⚠️ O efeito roda **depois** do redirecionamento do motorista, e só quando ele decidiu `stay`:
  usuário de campo não aterrissa em workspace nenhum, ele sai da app.

### A conta de campo (`modules/driver-trip/shared/driverAppRedirect.service.ts`)

A mudança é de duas linhas na função pura, e é a mais barata da spec — o que ela exige é cuidado com
a ordem, não com o código:

- `isDriverEntry` passa a ser `pathname === DRIVER_TRIP_PATH || input.isFieldOnlyUser` (RF-E1). O
  `pathname === '/' &&` sai: a raiz já está coberta pela segunda metade.
- `DriverAppRedirectMode` ganha `'legacy-home'` (RF-E3), devolvido **antes** do `stay` final quando
  `driverAppUrl === undefined`, a conta é de campo e o caminho não é `/minha-viagem`. A ordem interna
  fica: sem interruptor → (`legacy-home` para conta de campo fora de `/minha-viagem`, senão `stay`);
  com interruptor → não é entrada de motorista → `stay`; fila → `pending-screen`; standalone →
  `install-screen`; senão `redirect`.
- `main.tsx` (`:545` e `:934`) trata o modo novo com `history.replaceState` para `DRIVER_TRIP_PATH`
  mais o `setState` do workspace — mesma origem, nunca `location.replace`.
- ⚠️ `readDriverAppMode({ driverAppUrl, isFieldOnlyUser: false })` em `:934` existe para o caminho que
  não conhece o usuário; conferir na T4.1 se ele passa a precisar da permissão real, porque com a
  RF-E1 o `false` cravado deixa de ser neutro.

### Paredes que faltam

- `modules/company-settings/pages/CompanySettings.page.tsx` — `settings.manage` ausente: frase de
  sem acesso, e as consultas das abas não são disparadas (hoje a tela monta).
- `modules/nfse-invoice/pages/NfseInvoiceWorkspace.page.tsx` — mesma coisa com `nfse.read`.
- Molde: `CteBatchWorkspace.page.tsx:75` e `:220` (`isForbidden` + `t('forbidden')`).

### Tela de conta sem acesso

- `modules/identity/components/NoWorkspaceAccess.component.tsx` — frase, a quem pedir, botão de
  sair (o `logout` do `KeycloakAuthProvider` que o cabeçalho já usa). Sem ilustração nova: é tela de
  beco, não de boas-vindas.

## Contratos/API/eventos

Nenhuma rota muda, nenhum contrato de API muda, nenhum evento novo. O `GET /auth/me` já devolve
`permissions` — é a mesma resposta que o cabeçalho e cada workspace consomem.

## Dados, migration e rollback

Nenhuma migration. Rollback é reverter o commit: sem estado persistido, sem coluna, sem feature
flag. O `sessionStorage` continua guardando a mesma chave com os mesmos valores.

## Segurança e tenant

- **A UI não autoriza.** Toda rota continua com a política dela no servidor
  (`security.md` §2); esconder o item do menu não é controle de acesso e a spec diz isso por escrito
  (RNF). Um contrato afirma que nenhuma parede de página foi removida.
- **Nada de permissão inferida de papel no cliente.** O mapa compara contra a lista de permissões
  que o token trouxe, nunca contra `roles` — é o que o painel já faz em todo lugar, e é o que
  mantém a conta com dois papéis funcionando como união (o caso que originou a spec).
- Nenhum dado pessoal novo entra em tela, log ou storage.

## Idempotência e concorrência

- A aterrissagem é idempotente: `resolveLandingWorkspace` devolve `stay` quando o workspace atual já
  é permitido, então o efeito não entra em laço com a própria navegação.
- Permissões que chegam duas vezes (refetch) decidem igual — função pura sobre a mesma entrada.
- Guarda contra laço: o efeito só chama `replaceState` quando a chave de destino é **diferente** da
  atual.

## Observabilidade

Nada novo. Não há beacon aqui: o defeito é visível em tela, diferente do `driver_legacy_served`
(spec 189), que media uso de código que ninguém vê.

## Estratégia de testes

Os contratos desta app rodam **sem DOM** (CLAUDE.md da app), e o filtro do menu é render. Daí a
divisão:

- **Contrato puro** (`test/shared/workspace-access.contract.ts`) — o grosso: a tabela da RF-A3
  transcrita e afirmada entrada por entrada; os cinco itens do `separator` (CA01); `company-admin`
  sem perda (CA02); `fiscal` sem o grupo Usuários (CA03); grupo vazio descartado (CA04);
  `resolveLandingWorkspace` nos quatro casos — permitido fica, proibido troca, vazio é `no-access`,
  destino igual ao atual não navega (CA06, CA08); cobertura do mapa sobre a lista de itens.
- **Contrato de tipo** (CA05) — provado por **mutação** na evidência: acrescentar chave sem entrada,
  rodar `bun run typecheck`, colar a falha, desfazer. Afirmação de tipo não roda em teste.
- **Hook com DOM** (`test/trip-hooks/`, `bun run test:hooks`) — só se o efeito de aterrissagem
  precisar de montagem para provar o `replaceState` e a ausência de laço. Preferir o contrato puro
  do decididor; o DOM é para a corrida, não para a regra.
- **Smoke** — CA07 (URL direta permanece) e CA09 (as duas paredes novas) pedem navegação real;
  entram no Playwright da app se houver cenário autenticado disponível, senão ficam afirmados pelo
  contrato do decididor mais inspeção manual registrada na evidência.
- ⚠️ Todo arquivo novo entra na **lista explícita** do `package.json` da app, senão não roda.

## Riscos

| Risco                                                          | Mitigação                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Mapa divergir da parede da página com o tempo                  | Origem anotada por linha + contrato transcrito (D2); divergência vira item na próxima leitura     |
| Esconder item que alguém usava por permissão que o mapa errou  | Fase 1 reconfere cada linha contra o código antes de escrever; D3/D4 erram para o lado de mostrar |
| Extrair a lista do `main.tsx` quebrar a navegação              | Extração é mecânica e vem antes do filtro, em commit próprio, com a app subindo entre os dois     |
| Laço de navegação entre aterrissagem e `popstate`              | `stay` quando já permitido + comparação de chave antes do `replaceState` (idempotência)           |
| Menu piscar a lista inteira antes das permissões               | RF-B3 com esqueleto, afirmado no contrato do estado de carregamento                               |
| Conflito com outra sessão no `main.tsx`                        | Arquivo muito disputado: rebase antes de abrir a fase 2 e gates completos antes do push           |
| Redirecionar a conta de campo e perder a fila antiga dela      | `pending-screen` mantém precedência (RF-E2), afirmado por contrato antes da mudança               |
| `legacy-home` entrar em laço com `popstate` em `/minha-viagem` | O modo só existe fora de `/minha-viagem`; contrato afirma `stay` dentro dela                      |
| Mudar `isDriverEntry` afetar quem não é de campo               | Contrato da CA13 (`separator` continua `stay`) roda antes da mudança                              |
