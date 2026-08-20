# 046 — Evidência

> Registro posterior: os números abaixo foram colhidos em 2026-08-20, com todas as tasks fechadas já
> em `HEAD`. **Não há vermelho-antes registrado para nenhuma task** — nem para as duas que nasceram de
> contrato: `b069ba4` e `1905dc1` trazem o contrato e o serviço no mesmo commit, então o histórico não
> prova a ordem e a saída do vermelho não foi preservada. Essa ausência é ela mesma a evidência do
> desvio de processo que a `spec.md` declara no topo, e reconstruir o vermelho agora seria inventá-lo.

## T001 — Schema, migration e rollback

`drizzle/20260820002947_fleet_driver_address_and_dates/migration.sql` — nove `add column`, um
`create unique index ... where length("license_number") > 0` e quatro CHECKs. Aditiva: nenhum
`drop`, nenhum `not null` retroativo sem `default`.

```
$ make migration-test
73 pass · 0 fail · 825 expect() calls · 11.16s
```

O gate inclui `test/database-migration/fleet-constraints.assertion.ts`, que exercita cada CHECK
contra o banco descartável.

## T002 — Fronteira HTTP

```
$ bun test ./test/fleet-http.contract.test.ts ./test/fleet-schema.contract.test.ts
92 pass · 0 fail · 314 expect() calls
```

## T003 — Consulta de endereço no navegador

Coberta pelos gates do frontend abaixo. O que o código garante e o teste fixa: `Promise.any` nos dois
provedores de CEP, `Promise.allSettled` nos dois de busca textual, `SEARCH_DEBOUNCE_MS = 400`,
`LOCATE_DEBOUNCE_MS = 900`, mínimo de cinco caracteres e `AbortSignal` por tecla.

## T004 — Data é calendário do produto

`test/design-system/date-picker.contract.ts` varre `src/**/*.tsx` fora de `src/components/ui/` e
falha se um campo de data nativo reaparecer. Verde no gate do design system abaixo.

## T005 — Cidade é lista do IBGE

Verde em `test/fleet/driver-city-select.contract.ts`, dentro do gate de `fleet` abaixo. Sem
vermelho-antes registrado: `b069ba4` traz `municipality.service.ts` e o contrato no mesmo commit.

## T006 — Usuário vinculado é lista de vínculos

Verde em `test/fleet/driver-membership-select.contract.ts` (11 casos), dentro do gate de `fleet`.
Mesmo caso de T005: `1905dc1` traz serviço, componente, hook e contrato juntos.

## Gates do frontend

```
$ bun test test/fleet.contract.test.ts
206 pass · 0 fail · 2146 expect() calls

$ bun test test/design-system.contract.test.ts
139 pass · 0 fail · 502 expect() calls

$ bun run typecheck
$ tsc --noEmit          (sem saída)

$ bun run lint
$ eslint .              (sem saída)

$ bun run test
1477 pass · 0 fail · 7892 expect() calls · 18 arquivos
```

## Gates da API

```
$ bun run typecheck     (sem saída)
$ bun run lint          (sem saída)
$ bun run test
2690 pass · 15 skip · 0 fail · 10979 expect() calls · 112 arquivos
```

## T007 — ADR-0037

Escrita e aceita: `docs/adr/0037-o-endereco-do-motorista-nao-sai-inteiro-do-navegador.md`, status
`aceito`. ADR não tem gate de teste; o que ela produziu de verificável é o T007-A abaixo.

## T007-A — executar a ADR-0037

Mudança de **remoção**: saíram `buildMapEmbedUrl`, `locateAddress`, `GeoPoint`, `toPoint`,
`toCoordinate`, `MAP_SPAN_DEGREES`, `LOCATE_DEBOUNCE_MS`, o estado `point`, o `runLocate`, o `mapUrl`
do controlador, o `iframe` de `DriverAddressFields.component.tsx`, a classe `.addressMap`, a chave
`driverAddressMapTitle` nos dois dicionários e o provedor Nominatim inteiro.

**Não houve vermelho antes.** Nenhum teste existente referenciava um dos símbolos removidos
(`rg -n 'toStateCode|Nominatim|GeoPoint|mapUrl|\.point' src test` só devolvia `src`), então não havia
suíte para ficar vermelha com a remoção. O contrato-guarda nasceu junto com ela, e o que ele guarda é
o futuro: falha se um símbolo ou um dos dois destinos voltar, e falha também se um dos três destinos
que ficaram desaparecer — remoção sem guarda volta na próxima mão que quiser um mapa.

```
$ bun test test/fleet.contract.test.ts
209 pass · 0 fail · 3272 expect() calls

$ bun run format         (todos os arquivos "unchanged")
$ bun run typecheck      (sem saída — quatro apps)
$ bun run lint           (sem saída — quatro apps)
$ bun run --cwd apps/frontend-transportada test
1480 pass · 0 fail · 9018 expect() calls · 18 arquivos
```

## T008 — CSP

A diretiva é composta no **build**, não no runtime, e o motivo é medido: `VITE_API_URL` e
`VITE_KEYCLOAK_URL` são inlinadas no bundle e não existem no contêiner que serve o `dist` — o estágio
de runtime do `Dockerfile` copia só `dist` e `server.ts`, e `server.ts` não pode importar de `src/`.
Daí a costura: `src/modules/shared/contentSecurityPolicy.service.ts` é a fonte única, o plugin
`transportada-content-security-policy` emite `dist/content-security-policy.txt` no `generateBundle`, e
o `server.ts` lê o arquivo antes de montar `SECURITY_HEADERS`.

O que se serve, verificado com `bun server.ts` sobre o `dist` recém-construído:

```
Content-Security-Policy: default-src 'self'; base-uri 'self'; connect-src 'self'
  http://localhost:53000 http://localhost:58080 https://brasilapi.com.br
  https://photon.komoot.io https://viacep.com.br; font-src 'self'; form-action 'self';
  frame-ancestors 'none'; frame-src 'none'; img-src 'self'; manifest-src 'self';
  object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self'
```

Fail-closed provado por experimento, não por leitura: apagado o `dist/content-security-policy.txt`, o
boot levanta `FRONTEND_MISSING_CONTENT_SECURITY_POLICY` e **não sobe servidor nenhum**. Publicar sem
cabeçalho é o único fim inaceitável, porque não quebra nada visível.

Quatro decisões que só se enxergam errando, e cada erro derrubava a aplicação em vez de protegê-la:

- `style-src 'self' 'unsafe-inline'` — a camada flutuante posiciona painel por **atributo** `style`,
  que nonce não cobre. `style-src-attr` seria cirúrgico, mas o Safari < 15.4 o ignora e cairia no
  `style-src` restritivo: todo select e todo calendário quebrariam calados no iPhone. A folga é de
  estilo e só de estilo — `script-src 'self'`, sem `unsafe-eval`.
- A política de dev é **construída**, não concatenada: diretiva duplicada não soma, a primeira
  ocorrência vence. A única diferença é `'unsafe-inline'` no `script-src`, pelo preâmbulo inline do
  react-refresh que o `@vitejs/plugin-react` injeta; sem ela o `make dev` abre tela branca.
- Origem ausente não derruba o build — o job `quality` do CI roda `bun run build` sem `.env`. Origem
  declarada e ilegível derruba na hora, em vez de publicar diretiva mais estreita do que se pediu.
- `frame-src`/`frame-ancestors`/`object-src` em `'none'`: o `iframe` do mapa saiu pela ADR-0037 e o
  Keycloak roda com `checkLoginIframe: false`. Não há moldura no bundle, e é isso que a diretiva diz.

O aceite não confia em lista escrita à mão. `collectSourceOrigins` varre `src/**/*.{ts,tsx,css,json}`
por origem `https://` e cobra cada uma no `connect-src` ou em `NON_FETCH_ORIGIN`; hoje ela acha
quatro — `brasilapi.com.br`, `photon.komoot.io`, `viacep.com.br` e `adatechnology.com.br` (link do
rodapé, nunca buscado). Foi essa varredura que provou o que a suspeita não sabia: a lista de
municípios do IBGE anda **pela BrasilAPI** (`municipality.service.ts:10`), então a diretiva já está
completa e não falta origem do `servicodados.ibge.gov.br`. A 047 T012 acrescenta a malha ao **mesmo**
`connect-src` quando o mapa nascer.

```
$ bun test ./test/shared.contract.test.ts --test-name-pattern "policy"
8 pass · 0 fail

$ bun run build
dist/content-security-policy.txt   0.38 kB

$ bun run format         (todos os arquivos "unchanged")
$ bun run typecheck      (sem saída — quatro apps)
$ bun run lint           (sem saída — quatro apps)
$ bun run --cwd apps/frontend-transportada test
1505 pass · 0 fail · 9125 expect() calls · 18 arquivos
```

## T009

Aberta. Depende de decisão, e ADR não escrito não tem gate. O achado de criptografia em repouso segue
datado em `docs/SECURITY.md` (2026-08-20).
