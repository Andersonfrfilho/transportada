# 064 — o agregado tem portal

> **Continuação direta da 053.** A Fase 5 daquela spec (T014-T016, SDK de usuário) ficou de propósito
> fora da primeira rodada — "se ela escorregar, o que já está de pé continua servindo" (053, nota da
> Fase 5). Esta spec é essa fase, ampliada: além de conta e acompanhamento, o agregado aprovado ganha
> configurações, documentos e conversa com a transportadora, e a landing ganha o visual e o domínio
> de produção.

## Problema e resultado

A 053 entregou o pré-cadastro do agregado de ponta a ponta, sem exigir login. O que falta agora é o
que vem **depois** da aprovação: hoje o motorista aprovado não tem onde entrar, não sabe o status da
própria ficha, não envia CNH/CRLV pela web e não fala com a transportadora fora do WhatsApp pessoal
de alguém. E a landing que apresenta a empresa ainda está com o visual mínimo da entrega funcional da
053 — sem cara de transportadora grande, sem domínio próprio, sem página institucional de verdade.

O resultado desta spec, em três frentes:

1. **A landing ganha identidade** — layout inspirado nas grandes transportadoras, adaptado aos nossos
   tokens: cabeçalho fixo, rodapé, seção institucional, serviços, disponibilidade do app do
   motorista, rastreio de entrega, contato — e o formulário de pré-cadastro sai da rolagem da home e
   vira rota própria (`/cadastro`).
2. **O domínio de produção** — `fernandes-transportadora.com.br` aponta para `apps/frontend-landing`
   em vez de para qualquer coisa genérica.
3. **O portal do agregado** — conta autenticada (SDK de usuário da 053/T014-T016), com três telas:
   configurações da própria ficha, documentos (upload e status de CNH/CRLV/etc.) e conversa com a
   transportadora.

## Fora do escopo

- Qualquer coisa do painel interno (`frontend-transportada`) além do necessário para o operador
  responder a conversa e revisar documento enviado pelo agregado.
- Portal do cliente/contratante — isso é a 063, público diferente, decisão ainda em aberto lá.
- Rastreamento ao vivo de veículo no mapa, tanto na landing quanto no portal.
- Pagamento, faturamento ou qualquer tela financeira do agregado.
- Segunda empresa/filial na landing — continua servindo uma raiz de grupo por instalação
  (`PROVISION_COMPANY_ID`, ver 053 evidence.md e a nota da 054 "a filial existe").

## Decisões

### D1 — O portal vive em `apps/frontend-landing`, não num quarto app

A 063 (D1) separa o portal do cliente em app próprio pelo argumento de segurança: bundle que carrega
frota/financeiro/fiscal não pode ser o mesmo servido a quem não é funcionário. Esse argumento não se
aplica aqui — `frontend-landing` **já é** a superfície pública, sem nada de operação interna. Dar ao
agregado uma conta dentro do mesmo bundle que já serve anônimo não aumenta a superfície exposta; só
acrescenta rotas autenticadas a um app que já era público por natureza.

### D2 — Conversa reusa o canal já modelado, não inventa um chat novo

A 062 já modelou WhatsApp como canal de notificação **e** de conversa (inbox no painel,
`WhatsAppDriverPort`, driver pronto). "Chat com os atendentes" no portal do agregado é a mesma
conversa, só com uma segunda janela: hoje ela só aparece no painel interno; esta spec expõe a leitura
e o envio dela também para o lado do agregado autenticado, pela mesma trilha de mensagens — não um
canal paralelo. Ver Dúvidas: se existe de fato um SDK de chat próprio do ecossistema (`@adatechnology/*`)
diferente do modelo WhatsApp da 062, ele **substitui** este item, não convive com ele.

### D3 — Documentos são objeto, não campo

CNH e CRLV do agregado não viram coluna nova em `fleet_drivers`; são `stored_objects` (mesmo padrão
já usado por NF-e/CT-e — presigned URL, bucket privado) com um registro de vínculo
`aggregate_documents` apontando tipo, status de revisão (`pending`/`approved`/`rejected`) e quem
revisou. O operador revisa no painel; o agregado só vê o próprio status.

## Histórias priorizadas

### P1 — A landing parece uma transportadora de verdade

**Given** um visitante que nunca ouviu falar da empresa
**When** ele abre a landing
**Then** vê cabeçalho com marca e navegação, herói com uma chamada clara, seção sobre a empresa,
serviços oferecidos, disponibilidade do app, e contato — cada seção com conteúdo real ou
claramente configurável, nunca texto de preenchimento — e rodapé com os mesmos dados de contato.

### P2 — O pré-cadastro tem endereço próprio

**Given** o visitante decidido a se candidatar
**When** ele clica em "Quero me candidatar" em qualquer ponto da home
**Then** navega para `/cadastro`, uma rota própria — o formulário não compete mais por espaço com o
conteúdo institucional, e pode ser compartilhado como link direto (campanha, QR code no pátio).

### P3 — O agregado aprovado entra e vê o que falta

**Given** um agregado com candidatura aprovada
**When** ele cria conta e entra no portal
**Then** vê o status da própria ficha, os documentos pendentes de envio, e pode enviar CNH/CRLV; um
documento enviado aparece como "em análise" até o operador revisar.

### P4 — O agregado fala com a transportadora sem sair do portal

**Given** um agregado com dúvida sobre a própria candidatura ou ficha
**When** ele abre a aba de conversas do portal
**Then** vê o histórico com a transportadora e consegue mandar mensagem nova, que chega no mesmo
inbox que o operador já usa no painel (062).

### P5 — O domínio de produção é o da empresa

**Given** a instalação em produção do cliente Fernandes
**When** alguém acessa `fernandes-transportadora.com.br`
**Then** cai direto na landing configurada para aquela raiz de grupo — não num domínio genérico da
Railway nem em qualquer outro app.

## Requisitos funcionais

- **RF1** — Header fixo com marca (logo + nome configurável), navegação para as âncoras da home
  (Sobre, Serviços, App, Contato) e botão de destaque para `/cadastro`.
- **RF2** — Footer com os mesmos dados de contato do header/hero, links de navegação e copyright.
- **RF3** — Seção "Sobre" com texto institucional configurável (`landingSettings.sections.about`),
  sem número fabricado (nada de "10 anos", "500 clientes" sem fonte real).
- **RF4** — Seção "Serviços" com lista configurável de ofertas (`sections.services`), cada item com
  ícone (SVG inline, nunca emoji) e descrição curta.
- **RF5** — Seção "App" descrevendo o aplicativo do motorista (057) e a possibilidade de acompanhar
  entregas — sem prometer recurso que o app ainda não tem.
- **RF6** — Seção "Contato" com telefone/e-mail configurados e formulário ou link de contato direto,
  distinto do formulário de candidatura.
- **RF7** — `/cadastro` é rota separada, com o `PreRegistrationForm` já existente (053/T011); a home
  não perde o formulário — ela chama para essa rota.
- **RF8** — Roteamento client-side simples (sem biblioteca nova) por `pathname`, no padrão já usado em
  `frontend-transportada` (ver `main.tsx` daquele app).
- **RF9** — Conta do agregado via `@adatechnology/user-module`/`user-contracts`/`user-ui`, retomando
  a 053/T014-T016: schema `user` isolado, sessão própria, headless (só hooks, sem componente pronto
  renderizado — mesma regra da 053).
- **RF10** — Tela "Configurações" no portal: dados da própria ficha (nome, contato, endereço), leitura
  do status da candidatura/ficha.
- **RF11** — Tela "Documentos": lista de tipos exigidos (CNH, CRLV — configurável), upload por tipo,
  status (`pending`/`approved`/`rejected`) e motivo quando recusado.
- **RF12** — Tela "Conversas": histórico de mensagens com a transportadora e envio de mensagem nova,
  pela mesma trilha de dados que o inbox do painel (062).
- **RF13** — DNS/deploy: `fernandes-transportadora.com.br` como domínio customizado do serviço
  Railway de `apps/frontend-landing` em produção (ação de infraestrutura, fora do código).

## Requisitos não funcionais

- Zero regra de negócio de operação vazando para `frontend-landing` — leitura e ação restritas ao
  que é do próprio agregado autenticado (mesmo princípio de escopo da 063/D1, aplicado dentro do
  mesmo bundle em vez de por app separado).
- CSP do `frontend-landing` continua fail-closed (053/T008); qualquer origem nova (SDK de chat,
  storage de documento) entra no `connect-src` declarado, nunca solta.
- Upload de documento segue o mesmo teto de tamanho e allowlist de tipo já usado por outros uploads
  do ecossistema (ver `company-logo.schema.ts` como referência de padrão, não de limite exato).
- Todo texto novo da landing seguro pelo mesmo contrato de acentuação e de tokens de design já
  cobrado pelos testes da 053 (`locale-accents.contract.ts`, `field-metrics.contract.ts`).

## Casos extremos e falhas

- Agregado cria conta antes de ser aprovado → portal mostra status "em análise", sem tela de
  documentos nem conversa liberada ainda (não há ficha para vincular documento).
- Candidatura recusada depois que o agregado já tem conta → portal mostra o motivo da recusa
  (mesmo texto que o operador registrou), sem as telas de ficha ativa.
- Upload de documento em formato ou tamanho fora do permitido → recusa client-side antes do envio,
  mesma mensagem para qualquer motivo (não vaza qual regra específica falhou, mesmo espírito do `202`
  invariável da 053).
- Envio de mensagem sem conexão → fica em estado "enviando", nunca silenciosamente perdida; retry
  explícito, não automático infinito.
- Domínio customizado sem certificado ainda emitido → Railway serve o domínio antigo até o TLS
  propagar; não é responsabilidade do código, mas o rollout deve prever a janela.

## Critérios de aceite

- [ ] Landing com header, footer, e as cinco seções (herói, sobre, serviços, app, contato) — nenhuma
  com texto de preenchimento.
- [ ] `/cadastro` funcional como rota própria, com o formulário da 053 sem alteração de comportamento.
- [ ] `make check`, `make migration-test` e `make smoke` verdes com o portal montado.
- [ ] Documento enviado pelo agregado aparece na revisão do painel interno (fluxo completo, não só a
  metade do agregado).
- [ ] Mensagem enviada pelo portal chega no inbox do painel, e uma resposta do operador chega no
  portal.
- [ ] `fernandes-transportadora.com.br` servindo `frontend-landing` em produção, com HTTPS válido.

## Dúvidas

- `[NEEDS CLARIFICATION: existe hoje algum pacote @adatechnology de chat/mensageria além do que a
  062 já modela sobre WhatsApp? Se sim, qual, e ele substitui D2 ou convive com ela?]`
- `[NEEDS CLARIFICATION: quais documentos são obrigatórios para o agregado além de CNH e CRLV —
  existe uma lista oficial da operação, ou a spec 052 (rotina) já define isso em algum lugar?]`
- `[NEEDS CLARIFICATION: "configurações" do portal inclui troca de senha/e-mail (padrão do
  user-module) ou só os dados da ficha do motorista? Os dois pedem telas diferentes.]`
- `[NEEDS CLARIFICATION: fernandes-transportadora.com.br é o domínio de UM cliente específico
  (Fernandes) ou o nome interno de exemplo para o domínio de qualquer instalação? Se é de um cliente
  real, isso muda a 054 (multi-empresa) de "próxima spec" para pré-requisito desta.]`
