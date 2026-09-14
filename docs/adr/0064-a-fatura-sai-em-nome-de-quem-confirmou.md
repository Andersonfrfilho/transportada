# ADR-0064 — A fatura sai em nome de quem confirmou

- **Data:** 2026-09-11
- **Estado:** aceita
- **Contexto:** habilita D3–D6 da **spec 144**. Responde à T014 (76879561) e à T014b (795cb137,
  correções da revisão de segurança).

## Contexto

A Fase 3 da spec 144 deixa o bot emitir documento fiscal por seleção — CT-e e NFS-e, confirmados por
diário de passos (T011–T013). Confirmar não fatura: `billing_invoice_items` exige
`cte_document_id not null` e `dueDate`, e o CT-e só está pronto para faturar depois de a SEFAZ
autorizar, que é assíncrono (o worker fala com a SEFAZ, não a API). Alguém precisa perceber que os
documentos do pedido chegaram a estado final e faturar em seguida, sem um humano voltar a tocar o
celular.

Esse "alguém" é o worker: ele já varre `job-run.v1` a cada cinco minutos (o mesmo padrão de
`nfse.status.pull` e `fuel.price.pull`). Mas o worker **não fatura hoje** — não existe use-case de
billing lá, e a decisão da spec 144 é que o faturamento continua morando na API (§ Regras que não se
negociam: "apps não importam código-fonte de outra"). O worker detecta; a API fatura. Isso exige o
worker chamar uma rota da API **agindo em nome de outra pessoa** — conceito que não existia neste
produto antes desta spec.

## Decisão

**Procuração revalidada, não usuário de sistema.** O worker chama
`POST /whatsapp-command-requests/:id/settlement` com um token de máquina — o serviço já existente
(ADR-0047 §3, o mesmo crachá que aciona `mdfe.auto-issue`), agora também com a permissão nova
`whatsapp.settle`, concedida **só** ao papel `automation`. A API não confia no corpo da chamada para
decidir o que faturar: os CT-e saem do diário do pedido (`whatsapp_command_documents`), o tomador
sai da classificação **congelada** na prévia, e o vencimento sai de `whatsapp_command_requests.due_date`
— nada disso é parâmetro da rota.

**A fatura sai com `actor_user_id` de quem confirmou, e só depois de revalidar.** Antes de criar
qualquer fatura, a API chama `tenantContext.resolveCompanyForUser` para o `actor_user_id` do pedido
— a mesma função que resolve o ator de uma mensagem de WhatsApp (T005) — e confere `billing.create`
pelo mesmo `authorize` do router HTTP. Membership suspensa, empresa desativada ou permissão perdida
entre a confirmação e a liquidação (o CT-e pode levar minutos para autorizar) dão
`actor_not_authorized`: nenhuma fatura sai, e o resumo ao WhatsApp não nomeia o motivo por extenso —
correção da T014b (M2), porque a primeira versão descrevia o bloqueio na própria mensagem enviada ao
usuário.

**Faturamento é só CT-e.** Decisão do usuário em 2026-09-11, direta: "Fatura só os CT-e." A NF-e
NFS-e autorizada aparece no resumo como "autorizada, sem fatura" — mudar o modelo de faturamento
para incluir NFS-e é decisão maior, de spec própria, não um efeito colateral desta.

**O ator da procuração é sempre gente.** A T014b (B2) fechou o caso em que o próprio `resolveActor`
da liquidação aceitaria um papel de serviço como "quem confirmou" — `resolveHumanActor` recusa
qualquer membership de `SERVICE_COMPANY_ROLES`, a mesma defesa que `resolve-whatsapp-actor.use-case.ts`
já tinha para a entrada da conversa. Sem essa recusa, um cenário hipotético (token de serviço vazado,
usado para "confirmar" antes da revalidação existir) faturaria em nome de uma conta que nunca é
pessoa — a trilha mentiria sobre quem autorizou.

## Alternativas rejeitadas

**O bot não fatura — fatura só pelo painel.** Rejeitada pela decisão de produto: o valor da spec 144
é fechar o ciclo "emitir → faturar" dentro da conversa, sem forçar o operador a abrir o painel para o
último passo.

**Faturar NFS-e também.** Rejeitada porque `billing_invoice_items` está desenhada em torno do CT-e
(`cte_document_id not null`) desde a ADR-0028 (billing customer é o tomador do CT-e). Faturar NFS-e
pelo bot exigiria mudar esse modelo — mudança de escopo maior que esta spec, com spec própria.

**Usuário de sistema como autor da fatura.** Rejeitada porque a trilha de auditoria mentiria: "quem
autorizou esta fatura" precisa apontar para uma pessoa real, revalidada no momento da emissão, não
para uma conta que representa "o sistema". Uma fatura em nome do sistema não responde à pergunta que
a auditoria sempre faz — quem, na empresa, decidiu emitir isto.

## Consequências

- **"Agir em nome do usuário" é conceito novo no produto.** Até esta spec, toda ação sempre carregava
  a identidade de quem a executou diretamente (token de gente, ou token de máquina agindo só com a
  permissão do próprio serviço). Agora existe um terceiro padrão: token de máquina que **revalida e
  assume** a identidade de uma pessoa específica, gravada num pedido anterior. A revalidação é a
  única coisa que torna esse padrão seguro — sem ela, qualquer token de máquina vazado poderia
  faturar em nome de qualquer usuário que já tivesse confirmado algo um dia.
- **A revalidação pode negar depois de o trabalho estar feito.** O CT-e já foi emitido (T013) quando
  a liquidação roda; se o ator perdeu a permissão nesse meio-tempo, o documento fiscal existe mas a
  fatura não sai. Isso é aceito: o CT-e autorizado é fato consumado com a SEFAZ, e a fatura é decisão
  de negócio que pode legitimamente mudar de mão.
- **Achados abertos, registrados em `docs/SECURITY.md` (T018):** a retomada de pedidos em
  `confirming` não tem reivindicação atômica no banco fora do worker (B1); as consultas do worker
  filtram por `batchItemId` e aplicam a empresa em memória, não por construção (B3); o digest da
  prévia não cobre ambiente fiscal nem certificado, então a retomada após 15 minutos pode emitir por
  um perfil diferente do que foi congelado, enquanto a fatura agrupa pelo tomador congelado (B4).

## O que reabriria esta decisão

Se o produto decidir faturar NFS-e pelo bot, ou se outro fluxo precisar do mesmo padrão de
procuração para uma ação diferente de faturar, a revalidação e o desenho de permissão de máquina
exclusiva (`SERVICE_ONLY_PERMISSIONS`) são o que se reaproveita — não a rota em si.
