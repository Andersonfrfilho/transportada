## frontend-driver

Núcleo normativo (resumo, para consulta rápida): `apps/frontend-driver/CLAUDE.md`. Este arquivo é o
histórico: por que a app nasceu, o que cada fase da spec 189 construiu e as decisões que não
couberam no núcleo.

### Por que a app existe (ADR-0075, spec 189)

Até a spec 189, o PWA do motorista era o módulo `apps/frontend-transportada/src/modules/driver-trip/`
(34 arquivos, ~5.760 linhas), servido em `/minha-viagem`, dentro do bundle do escritório. Três
problemas motivaram a separação:

1. **Instalar levava ao escritório.** O manifesto era o do painel (`name`/`short_name`
   "TransportAdA", `start_url` em `/`, sem `scope`), então o ícone instalado abria o painel — e o
   atalho para a viagem dependia de `GET /auth/me`, que sem rede não responde.
2. **Web Push (spec 147) só chega a PWA instalado no iPhone** (iOS 16.4+), e o que o motorista
   instalava era o escritório.
3. **O bundle era do escritório**: OpenCV (~3 MB), `maplibre-gl`, `tesseract.js`, `pdfjs-dist` e o
   modelo U²-Net de 16 MB (recorte de foto de usuário) ficavam fora do precache por `globIgnores`,
   mas eram da mesma build e do mesmo `scope` — o motorista em 3G carregava a casca de um produto de
   escritório.

A ADR-0050 §1 já tinha separado o portal do contratante por segurança; o mesmo argumento vale aqui,
com risco menor porque o motorista é funcionário do mesmo tenant. A decisão: quarta app web do
monorepo (depois do painel, do portal e da landing), molde `apps/frontend-client`, mesmo client
Keycloak `transportada-spa` com uma origem a mais (nunca um client próprio — ver ADR-0075 §2 para o
raciocínio completo), service worker `injectManifest` desde o primeiro dia (porque a 147 e o `push`
passam a morar aqui), e `registerType: 'prompt'` com atualização só em ponto seguro.

### Fase 1 — a app existe, vazia e servida (T1.1–T1.3)

Contratos antes do código: CSP, headers de segurança, `vite-build-args`, `environment-banner`,
manifest, service worker e `dist.contract.test.ts` (orçamento de precache). O esqueleto (T1.2, único
commit) trouxe `package.json`, `vite.config.ts` (porta 53200, `injectManifest`, `prompt`), `src/sw.ts`,
`server.ts`, `Dockerfile`, ícones e `offline.html`, além de `changed-targets.sh` e
`pipeline-change-filter.contract.ts` reconhecendo o alvo `driver`. T1.3 ligou o workspace: scripts da
raiz, `Makefile` (`FRONTEND_DRIVER_PORT`), `.env.example`/`.env`, `ci.yml` (portas reservadas) e
`deploy.yml`/`mark-deployed.sh` com o marco "parado" — o job de deploy ainda não existia, de
propósito, então o marco fica pendente até a Fase 6.

### Fase 2 — entrar e sair pelo Keycloak (T2.1–T2.3)

`realm/transportada-local-realm.json` ganhou a origem `53200`, e `keycloak-reconcile.sh` passou a
unir também `post.logout.redirect.uris` — antes só o script manual fazia isso. O corpo do `PUT` de
reconciliação leva **todos** os atributos atuais com o pós-logout unido: um `PUT` parcial apagaria
`pkce.code.challenge.method` sem erro do Keycloak, e a verificação depois do `PUT` passou a conferir
os dois (pós-logout **e** `pkce = S256`). `KeycloakAuthProvider`, `LoginIdentifier` e
`loginHintClient` chegaram como cópia por valor do portal, com os testes correspondentes adaptados.

### Fase 3 — o módulo muda de casa, com o campo seguro (T3.1–T3.6)

O núcleo da spec: 20 dos 21 contratos de `driver-trip` do painel foram copiados (menos
`office-execution`, que não existe aqui), com o cabeçalho "Cópia por valor" vigiado por contrato
próprio. A casca (`driverRoute.service.ts`, `main.tsx` com `DriverShellHeader`/`DriverBottomBar`,
sem layout de escritório) e o sino entraram na T3.3.

**T3.3a foi a task 🧠 da fase**: boot sem rede, snapshot com dono e fila com dono (ver o núcleo
normativo para o desenho final). A dificuldade real não era a mecânica de cada peça, mas a ordem —
sondar antes de inicializar o Keycloak, porque `check-sso` sem `silentCheckSsoRedirectUri` navega a
página inteira e nenhuma exceção do `init` chega ao código chamador. Descobrir isso tarde teria
significado reescrever o boot inteiro; a ADR já veio com essa ordem decidida.

T3.4 (pendência e drenagem) e T3.5 (atualização em ponto seguro, com `captureRegistry`) seguiram a
mesma lógica de "nunca navegar/recarregar com uma captura aberta" — câmera, recorte, assinatura e o
diálogo de ocorrência registram nele, e tanto a reautenticação quanto a atualização do SW esperam
`isIdle()`. T3.6 fechou a fase com o contrato de 44 px.

### Fase 4 — Playwright da app (T4.1)

`@playwright/test` na versão do painel e da landing (1.58.2), com o preview simulado na origem
`53112` (não é uma segunda porta de serviço — é só o valor de `VITE_DRIVER_APP_URL` que o Playwright
usa durante o próprio smoke, para não disputar a porta real 53200 do processo em teste). Os testes
do motorista que viviam em `apps/frontend-transportada/test/responsive.smoke.spec.ts` migraram para
cá (saem do painel na T5.4). Novos: CA05/CA06 (offline e troca de conta), CA07 (drenagem), CA08
(sino), CA09 (atualização adiada) e CA15 (44 px). O job `integration` da CI passou a instalar o
Chromium uma vez só, servindo as três apps.

### Fase 5 — o painel manda o motorista para a casa nova (T5.1–T5.4, desligado até a Fase 6)

`VITE_DRIVER_APP_URL` é interruptor, não configuração obrigatória — lido sozinho por
`readDriverAppUrl()` (`apps/frontend-transportada/src/modules/identity/shared/identityEnvironment.config.ts`),
fora de `getIdentityEnvironment()`, para uma variável ausente não derrubar o boot em nenhum
contexto. `resolveDriverAppRedirect` (`driverAppRedirect.service.ts`) é a função pura: sem a
variável, `stay` — o painel serve `/minha-viagem` como sempre, e é esse o comportamento que valeu em
staging até a virada. Com a variável e a entrada do motorista (rota `/minha-viagem`, ou raiz com
`isFieldOnlyUser`), decide entre `redirect` (fila antiga vazia), `install-screen` (aberto pelo ícone
antigo, em `standalone` — um `location.replace` para outra origem sairia do `scope` e cairia numa
aba solta) e `pending-screen` (há o que enviar da fila antiga). A tela de pendências
(`DriverLegacyPending.page.tsx`) drena o que sobra e oferece "Descartar" por item recusado, com o
aviso de que a entrega não foi registrada; quando a fila zera, "Ir para o app novo" recarrega a
página, que decide de novo. Uma rede de segurança em runtime, `isDriverAppUrlOwnOrigin`, compara a
origem do `VITE_DRIVER_APP_URL` com a própria antes de todo `location.replace` automático — o build
já valida isso (`assertDriverAppUrlBuildsClean`), mas o valor pode mudar entre o build e o deploy.

O **beacon** (`sendDriverLegacyBeacon`, `driverAppRedirect.service.ts`) é a medida que autoriza
remover o módulo antigo: `navigator.sendBeacon('/_driver-legacy-served', 'pending-screen')`, disparado
só dentro do caso `pending-screen` de `takeOverDriverEntry` (`main.tsx`), antes mesmo de checar se o
usuário está autenticado — conta quem chegou ali mesmo que abandone o login. A rota em
`server.ts` (`apps/frontend-transportada`) é pública, sem autenticação, aceita corpo de até 32 bytes
e só o valor enumerado, e sempre responde `204`; a entrada de log
(`{"event":"driver_legacy_served","mode":"pending-screen"}`) sai só na primeira ocorrência de uma
janela de 60 s (throttle), sem usuário nem IP. O critério de remoção (ADR-0075 §6, tasks.md Fase 10
T10.1): zero ocorrências em 14 dias seguidos de log de produção, conferido à mão e autorizado pelo
usuário — não por calendário.

### Fase 6 — a virada: staging, depois produção (T6.1–T6.4, parcialmente 👤)

O serviço `driver` entrou em `.railway/railway.ts` com `VITE_*` **literais** por ambiente (nunca
`preserve()`) — o modelo é `VITE_IDENTIFIER_FIRST_LOGIN` do `client`: variável pública, inlinada no
build, e uma esquecida no painel geraria bundle verde que quebra no celular. Os passos humanos
(aplicar `railway config apply`, criar o domínio `motorista.<zona>`, o CNAME e o TXT
`_railway-verify`, e acrescentar a origem ao `FRONTEND_ORIGIN` da API) ficam registrados em
`docs/spec/railway.md` e no `evidence.md` da spec, não neste arquivo.

### Fase 7 — depois da virada: seletor, janela e consentimento (T7.1–T7.5)

Três frentes que não seguram a mudança de casa, porque valem tanto no painel quanto na app nova:

- **Duas viagens.** A API já devolvia N viagens em `createdAt` ascendente, mas a tela mostrava só
  `trips[0]`. `resolveSelectedTrip` (função pura, RF12) escolhe a mais antiga em rota
  (`in_transit`/`on_delivery_route`) como padrão, e lembra a escolha do motorista enquanto ela
  continuar na lista.
- **Janela de entrega.** Só exibição — `deliveryWindowStart`/`End` já chegavam validados da API.
- **Consentimento de rastreamento** foi a task 🧠 da fase (T7.4/T7.5). A API tinha `PUT
/me/location-consent` desde a ADR-0050 §5 (spec 063), mas não tinha leitura: `GET
/me/location-consent` nasceu para a app poder mostrar o estado atual do interruptor sem inferir a
  partir de nenhum outro dado. Os dois respondem `409 DRIVER_NOT_REGISTERED` para conta sem
  motorista — é configuração pendente do escritório, não "nunca consentiu", e a distinção importa
  porque as duas telas (erro de cadastro vs. interruptor desligado) dizem coisas diferentes ao
  motorista. O comentário de `driverLocation.service.ts` deixou de dizer "nunca `watchPosition`" (a
  regra original da spec 057/D3) e passou a citar a ADR-0050 §5 e a ADR-0075 §8, que a revisam: agora
  há posição contínua, mas só com consentimento explícito, com a app visível e com teto de envio (1
  por minuto) — a proteção trocou de "nunca observar" para "só observar com consentimento e limite".

### O que ficou pronto para as specs 147 e 179

A ADR-0075 §8 já documenta os dois pontos de extensão, e o núcleo normativo (`CLAUDE.md`) os resume.
Vale registrar aqui **por que** foram deixados prontos, e não implementados: a 147 (Web Push) e a 179
(recusa com foto) estavam em andamento paralelo à 189, e escrever o `sw.ts` já em `injectManifest` e
o `kind` `documentOccurrence` já no `switch` exaustivo evita que quem implementar a 147/179 precise
tocar de novo na estrutura da fila ou do service worker — só soma o handler ou o `kind`, e o
compilador aponta onde falta.

### Testes e evidência

Contagens finais por task (comandos, pass/fail, tamanho do precache) vivem em
`specs/189-o-motorista-tem-app-propria/evidence.md`, não aqui — este arquivo explica decisões, não
substitui a evidência de execução.
