## frontend-transportada

Histórico completo e narrativas (specs, medições datadas, defeitos investigados):
`docs/ai-context/frontend-transportada.md`.

React 19.2 + Vite 7.3 + TanStack Query 5 (`retry: false`, `staleTime` 30s). **Sem router**:
navegação manual em `src/main.tsx` (`pushState` + `popstate` + `sessionStorage`). **Sem Tailwind e
sem zod** — `tailwind-merge`/`clsx`/`cva` estão no `package.json` mas não são usados; `cn()` é
reimplementado em `src/lib/utils.ts`; validação é type guard manual em `*.validation.ts`.

Módulos em `src/modules/`: `billing`, `company-settings`, `cte-batch`, `cte-issuance`,
`cte-profiles`, `fleet`, `foundation`, `freight`, `identity`, `mdfe-manifest`, `nfe-workspace`,
`nfse-invoice`, `notification`, `operations`, `trip`, `shared`. `shared/` concentra client HTTP +
validação + view-model. Um client HTTP **por módulo** (`shared/<modulo>Client.service.ts`), com
`fetch` injetado por dependência. Auth via `KeycloakAuthProvider`.

Tokens de design em `:root` de `src/styles/index.css` (`--color-*`, `--font-*`, `--space-1..16`),
tema escuro único. Design system caseiro em `src/components/ui/`. Estilos por módulo em
`*.module.css`.

## Regras do design system que não se negociam

Cada linha é um primitivo obrigatório — o cru correspondente é **proibido** em `src/**/*.tsx` fora
de `src/components/ui/` e há um contrato de design-system que falha se ele reaparecer. Detalhe de
cada um (props, teclado, ARIA, por que a regra existe) em `docs/frontend/*.md` e no histórico.

| Precisa de                              | Use                                                                   | Nunca                                                 | Contrato                                          |
| --------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Largura de tela                         | 4 breakpoints (`web.md` §10) em `min-width`                           | `max-width`/`width <=`                                | `responsive.contract.ts`                          |
| Largura de container                    | `var(--layout-width)`                                                 | largura própria por módulo                            | `layout-width.contract.ts`                        |
| Altura/padding de campo                 | tokens `--field-*`                                                    | valor literal                                         | `field-metrics.contract.ts`                       |
| Data                                    | `@/components/ui/date-picker` / `date-range-picker`                   | `<input type=date>`                                   | `date-picker.contract.ts`                         |
| Leitura de etiqueta                     | `@/components/ui/barcode-scanner`                                     | implementação própria de câmera                       | `barcode-scanner.contract.ts`                     |
| Checkbox                                | `@/components/ui/checkbox`                                            | `<input type=checkbox>`                               | `checkbox.contract.ts`                            |
| Dica de interface                       | `@/components/ui/tooltip`                                             | `title` nativo                                        | `tooltip.contract.ts`                             |
| Ícone                                   | `@/components/ui/icon`                                                | `<svg>` cru                                           | `icon.contract.ts`                                |
| Altura de controle/botão quadrado       | `--control-height(-compact)`                                          | `rem` literal                                         | `control-height.contract.ts`                      |
| Seleção única/múltipla                  | `@/components/ui/select` / `multi-select`                             | `<select>` nativo                                     | `select.contract.ts` / `multi-select.contract.ts` |
| Painel flutuante (select, calendário)   | portal via `useFloatingLayer`                                         | `position: absolute` dentro de ancestral com overflow | `floating-layer.contract.ts`                      |
| Filtro ativo                            | `@/components/ui/filter-pills`                                        | pílula própria                                        | `filter-pills.contract.ts`                        |
| Contagem em botão de ícone              | `@/components/ui/count-badge`                                         | badge em `position: absolute`                         | `count-badge.contract.ts`                         |
| Estado de carregamento                  | `@/components/ui/skeleton` na forma do conteúdo real                  | texto solto ou `null`                                 | `skeleton.contract.ts`                            |
| Painel que nasce por clique             | `useRevealedPanel` (rola + foca)                                      | renderizar antes da lista que abre                    | `panel-reveal.contract.ts`                        |
| Tabela com filtro/ordenação/seleção     | seguir `docs/frontend/data-tables.md`                                 | reimplementar do zero                                 | contrato do módulo                                |
| Invalidar cache após mutação de vínculo | `invalidateMutationEffect` (`shared/mutationInvalidation.service.ts`) | lista de chaves montada à mão                         | `mutation-invalidation.contract.ts`               |
| Botão com ícone: alinhamento            | regra global `button:has(svg)`                                        | `display`/`gap` de módulo                             | `button.contract.ts`                              |

Texto pt-BR em `*.locale.json` vai **acentuado** — `locale-accents.contract.ts` varre e falha com
forma sem acento (`nao`, `possivel`, …).

## Configuração perto do efeito

Painel de configuração mora na tela onde o efeito aparece, nunca numa tela central de
configurações. O endereço de cada painel é declarado uma vez em
`company-settings/shared/companySettingsTabs.service.ts` (`SETTINGS_PANEL_PLACEMENT`), e é esse
registro que garante o campo vir preenchido ao abrir a aba. `company-settings` tem hoje **Empresa**,
**Site**, **Certificados** e **Tributos**; outros painéis (busca automática de notas, preço de
combustível, credencial da Nota RP, tabela de frete) moram nas abas dos módulos a que pertencem.
Contrato: `test/company-settings/tabs.contract.ts`. Detalhe de cada painel (permissão exigida,
conversão percentual/fração dos tributos, mapa de zona via IBGE): docs/ai-context § "Configuração
perto do efeito".

## Domínio de viagem, roteirização e proposta de carga — ver a referência

**As regras de negócio de `trip`/`routing` (montagem de viagem, proposta multi-veículo, aceite,
valuation, roteirizador com teto de paradas) são as que causaram o CLAUDE.md de 184k — não as
resuma aqui de novo.** Antes de tocar em qualquer código de `trip`, `routing`, `route-suggestions`
ou valuation, leia a seção correspondente em `docs/ai-context/frontend-transportada.md` (specs 058,
090, 100–105, 110–112, ADR-0044, ADR-0055). Invariantes mais cotadas para não reimplementar por
engano:

- A conta (`buildValuationFromContext`) e a distância/pedágio da proposta têm **um** seam cada,
  compartilhado entre viagem, prévia e sugestão — segunda implementação diverge calada.
- Verde é o que entra, vermelho é o que sai — `--color-ready`/`--color-alert`, nunca `.negative`
  (que é cobre, usado por outras telas).
- Tirar destino é marcação (riscar + desfazer), nunca destruição; mover destino entre caminhões não
  existe hoje.
- Aceite parcial de proposta **consome** a sugestão inteira.
- O roteirizador tem teto de paradas e marca a qualidade da otimização (`optimizationQuality`);
  10 mil paradas numa instância só segue fora de alcance (memória da matriz).

## CSP, ambiente e tema de login

**A CSP nasce no build** — `shared/contentSecurityPolicy.service.ts` é a fonte única, o plugin
`transportada-content-security-policy` do `vite.config.ts` gera `dist/content-security-policy.txt`,
e `server.ts` lê o arquivo **fail-closed** (`FRONTEND_MISSING_CONTENT_SECURITY_POLICY`). Destino
externo novo entra no `connect-src` existente, nunca numa segunda diretiva. Contrato:
`test/shared/content-security-policy.contract.ts`.

`VITE_APP_ENV` (`local`·`staging`·`production`, ausente/desconhecido cai em `production`) decide a
faixa de ambiente e o ícone 🚧 fora de produção — mesmo padrão do `web.md` §12. A tela de login
**não é desta app**: é o tema Keycloak em `deploy/keycloak/theme/`, com os tokens de design
copiados por valor (não importa código nosso) — mudou cor/fonte/escala aqui? copie lá. Detalhe
completo do tema (incluindo as armadilhas do FreeMarker) em `docs/frontend/login-theme.md` e no
histórico.

Envs: `VITE_API_URL`, `VITE_APP_ENV`, `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`,
`VITE_KEYCLOAK_CLIENT_ID`.

Segurança: `Permissions-Policy: camera=(self), geolocation=(), microphone=()` — `camera=()`
negaria a própria origem. Contrato: `test/shared/security-headers.contract.ts`.
