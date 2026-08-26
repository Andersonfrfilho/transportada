# Tasks — 064 — o agregado tem portal

> Pré-requisito lido antes de qualquer task: `spec.md` (Decisões D1-D3, Dúvidas resolvidas).
> RF1-RF8 (landing com header/footer/seções/`/cadastro`) e RF14 (CORS multi-origem) **já estão
> implementados** — ver `053` e a sessão que fechou RF14. Este arquivo cobre o que falta: RF9-RF11
> (conta e portal do agregado) e RF13 (domínio). RF12 (chat) está **bloqueado** — ver Fase 4.

## Fase 1 — Conta do agregado (RF9)
> 🤖 Modelo: `opus` 🧠 (integração de SDK nova, decisões de schema de auth — T2 pode descer pra `sonnet` depois de T1 validado)

- **T1** 🧠 — Instalar `@adatechnology/user-module` + `user-contracts` + `user-ui` em
  `apps/frontend-landing` e `apps/api-transportada`. Schema `user` isolado do schema `identity` que
  já existe (o agregado não é um `identityUsers`/membership de empresa — é conta própria, sem
  `companyId` de operador). Sessão headless: só hooks, nenhum componente pronto renderizado direto
  (mesma regra que a 053 já aplicou pro resto do app).
  - Dependências: nenhuma.
  - Verificação: `bunx tsc --noEmit` nos dois apps; migration do schema `user` roda limpa em
    Postgres local.
  - Critério de aceite: conta nova pelo fluxo do SDK cria linha em `user.*`, sem tocar
    `identity_users`/`companies`.

- **T2** — Vincular conta de agregado → `fleet_drivers` pelo CPF normalizado. Ao logar pela primeira
  vez, se existir `fleet_drivers.tax_id` igual e sem conta vinculada ainda, a conta vira "dona" da
  ficha; senão, portal mostra estado "em análise" (ver spec, Casos extremos).
  - Dependências: T1.
  - Verificação: teste de contrato cobrindo os três casos (ficha existe e vincula, ficha não existe
    ainda, ficha já vinculada a outra conta — rejeita).
  - Critério de aceite: os três casos do "Casos extremos" da spec têm teste correspondente.

## Fase 2 — Configurações do portal (RF10, RF9-conta)
> 🤖 Modelo: `sonnet`

- **T3** — Tela "Configurações": dados da ficha em modo leitura (nome, contato, endereço, status da
  candidatura/ficha) — sem edição nesta fase; o agregado corrige dado errado falando com a
  transportadora (RF10 não pede formulário de edição, só leitura do que já foi declarado/aprovado).
  - Dependências: T2.
  - Verificação: `bun test` cobrindo os três estados de status (pendente/aprovado/recusado, ver
    "Casos extremos").
  - Critério de aceite: cada estado renderiza o texto certo, sem vazar tela de documentos/conversa
    fora do estado aprovado.

- **T4** — Telas padrão de conta do `user-module` (troca de senha, troca de e-mail) montadas dentro
  da mesma aba "Configurações", usando os hooks/componentes que o SDK já expõe — não escrever forms
  de segurança à mão.
  - Dependências: T1.
  - Verificação: `bun test` no fluxo de troca de senha do pacote (se o SDK já traz suíte própria,
    cobrir só a integração, não reimplementar os testes dele).
  - Critério de aceite: troca de senha/e-mail funcional ponta a ponta contra o schema `user` local.

## Fase 3 — Documentos (RF11, D3)
> 🤖 Modelo: `sonnet` (T5 é 🧠 — schema novo, decisão de bucket/prefixo — validar com `opus` antes)

- **T5** 🧠 — Tabela `aggregate_documents` (`fleet` ou schema próprio): `driverId`, `type` (`'cnh' |
  'crlv'`, lista fechada mas pensada pra crescer sem migração — RF11), `status`
  (`'pending'|'approved'|'rejected'`), `rejectionReason`, `reviewedBy`, `reviewedAt`, referência ao
  `stored_objects` do upload (mesmo padrão de NF-e/CT-e — presigned URL, bucket privado, D3).
  - Dependências: T2.
  - Verificação: migration limpa; constraint de `type` fechada testada (`fleet_vehicles_owner_check`
    é o padrão de referência pra constraint de enum textual neste schema).
  - Critério de aceite: `type` fora da lista rejeita no banco, não só no zod.

- **T6** — Endpoint de upload (presigned URL) + endpoint de listagem/status para o próprio agregado
  autenticado — escopado ao `driverId` da própria conta, nunca por `driverId` livre do cliente
  (mesmo princípio de isolamento de tenant do resto da API).
  - Dependências: T5.
  - Verificação: teste negativo de isolamento — conta A não lê/envia documento da ficha de B.
  - Critério de aceite: presente no `test/fleet-http/` seguindo o padrão dos demais contratos HTTP.

- **T7** — Tela "Documentos" no portal: lista de tipos exigidos, upload por tipo, status e motivo de
  recusa visível. Recusa client-side de formato/tamanho fora do permitido, mensagem única
  independente do motivo (mesmo espírito do `202` invariável da 053 — ver "Casos extremos").
  - Dependências: T6.
  - Critério de aceite: upload inválido nunca revela ao navegador qual regra específica falhou.

- **T8** — Painel interno: fila de revisão de documento enviado (aprovar/rejeitar com motivo),
  dentro de `AggregateApplicationsTab` ou aba própria de "Documentos" — escopo mínimo, só o
  necessário pro operador revisar (ver spec, "Fora do escopo").
  - Dependências: T6.
  - Critério de aceite: aprovação/rejeição no painel reflete no portal do agregado sem refresh manual
    forçado (poll ou re-fetch ao focar a aba já resolve; não precisa de websocket novo).

## Fase 4 — Chat (RF12) — bloqueado, não implementável nesta spec
> 🤖 Modelo: `opus` 🧠 (decisão de contrato de módulo em outro repositório)

- **T9** 🧠 — **Fora deste monorepo.** Abrir o pedido de extração de `web-chat-module` em
  `adatechnology-packages` (branch `feat/webhook-account-events` ou a que estiver ativa lá), citando
  a `transportada` como segundo consumidor de backend (o gatilho que a doc do pacote já prevê, e que
  `pluggable-module.md` — regra do 2º uso — pede pra virar módulo de verdade). **Esta task não roda
  aqui**: é trabalho de repositório e time diferentes. Sem ela pronta, T10 não começa.
  - Dependências: nenhuma (pode rodar em paralelo às Fases 1-3).
  - Critério de aceite: `web-chat-module` publicado e versionado em `adatechnology-packages`.

- **T10** — Consumir `web-chat-module` pronto: montar `@adatechnology/web-chat-widget` na landing
  e/ou no portal, apontando pras rotas do módulo extraído. Conversa do widget não se junta ao inbox
  de WhatsApp da 062 (D2) — thread própria.
  - Dependências: T9 (bloqueante, externo).
  - Critério de aceite: critério de aceite da spec — "mensagem enviada pelo portal chega no inbox do
    painel, resposta do operador chega no portal" — só se aplica à metade WhatsApp (062); o widget de
    site é canal à parte, sem esse requisito de unificação (ver D2).

## Fase 5 — Domínio de produção (RF13) — ação de infraestrutura
> 🤖 Modelo: n/a — não é task de código

- **T11** — Fora do código: configurar `fernandes-transportadora.com.br` como domínio customizado do
  serviço Railway de `apps/frontend-landing`, e confirmar que a 054 (multi-empresa/filial) está
  resolvida ou paralela antes do rollout (RF13 já registra essa dependência). Ação manual no painel
  Railway + DNS do registrador — nenhuma linha de código deste repositório executa isso.
  - Dependências: 054 avaliada (ver spec, Dúvidas).
  - Critério de aceite: `https://fernandes-transportadora.com.br` responde com certificado válido e
    serve o bundle de `frontend-landing`.

## Ordem sugerida

Fases 1→2→3 são sequenciais entre si (cada uma depende da conta existir). Fase 4 (T9) corre em
paralelo desde o início — é o gargalo mais longo, por depender de outro repositório. Fase 5 é
independente de código e pode acontecer a qualquer momento depois que a 054 estiver decidida.
