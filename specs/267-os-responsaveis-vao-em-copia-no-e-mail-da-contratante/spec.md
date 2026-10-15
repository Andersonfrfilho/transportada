# Feature 267 — Os responsáveis vão em cópia no e-mail da contratante

> Pedido do dono em 2026-10-15: "quando for enviado o e-mail ao contratante devemos marcar os responsáveis por
> ocorrências na empresa; essa config pode ser feita em alguma página" — "vamos add nosso atendente responsável, ou no
> plural mais de um, como cópia". Decisões do dono em [`evidence.md`](evidence.md) § Decisões do dono. Spec
> **independente** da 266. ADR: a T0.2 decide se precisa de uma.

## Specs do mesmo assunto (lidas contra o código em `origin/staging` d6459e4cd, 2026-10-15)

| Spec | O que já decidiu e esta spec **usa sem refazer** (ou emenda, marcado)                                                                                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 034  | `recipientResolver` (`identity-recipient.resolver.ts`): endereço do usuário lido do perfil, só dentro da empresa. Nenhum e-mail em log. Esta spec resolve o endereço do responsável pelo mesmo caminho.                                                                                                                                                                                                            |
| 143  | Contatos da contratante com `receives_occurrences`; token de resposta no `Reply-To`, igual para a conversa inteira; outbox com payload `{messageId}` e destinatários como colunas da mensagem. **Emenda:** `plan.md:49` deixa `cc` fora do schema de e-mail **recebido** de propósito; esta spec passa a ler `cc` na entrada (RF9).                                                                                |
| 150  | Correção de endereço: destinatários escolhidos a cada envio entre os contatos ativos, pelo menos um, gravados na mensagem; limite `CONTRACTOR_MAIL_MAX_RECIPIENTS = 50` no Zod e no gateway; permissão `settings.manage`. Usa sem refazer; o limite passa a valer para `To` + `Cc`.                                                                                                                                |
| 183  | Uma conversa por (ocorrência, participante); o e-mail sai pelos use cases da 143; o formulário de envio (P4) escolhe os contatos. Remetente sem contato vira `unknown` com sugestão de cadastro (`contractor-sender.policy.ts:58-100`). **Emenda:** o remetente que é usuário da empresa deixa de ser `unknown` (RF9).                                                                                             |
| 211  | Núcleo de conversa com transporte de e-mail (`ConversationEmailTransportPort`, RF14 "byte a byte"). **Não publicada** (T401 aguarda o dono). Se publicar antes desta, o `cc` entra também na porta do núcleo (T0.1 confere).                                                                                                                                                                                       |
| 248  | Reenvio do pedido de resposta à contratante (reusa os contatos do envio original) e encaminhamento a terceiro (RF11/RF12: endereço livre, sem fio, sem token). D9: o alarme vai a quem despachou. **Emenda:** `spec.md:75` ("e-mail a endereço livre não existe") continua valendo para a cópia — **a cópia só leva usuário da empresa**, nunca endereço digitado. O encaminhamento a terceiro **não** leva cópia. |

## Problema e resultado

O e-mail de ocorrência e o de correção de endereço saem só para os contatos da contratante. O atendente que cuida
daquele cliente não recebe nada pelo e-mail: só vê a resposta se abrir o painel. Quando a contratante responde a todos,
ninguém da transportadora está na lista.

**Resultado:** a empresa configura **os responsáveis por ocorrências** (um ou mais usuários) numa aba das configurações,
e cada contratante pode ter **a própria lista**, que substitui a da empresa (o atendente fixo do cliente). Todo e-mail de
ocorrência e de correção de endereço sai com esses responsáveis **em cópia**. No formulário de envio a cópia aparece
preenchida, e o operador pode **tirar** alguém naquele envio, nunca digitar endereço. A resposta de um responsável
("responder a todos") entra na conversa como mensagem interna, nunca como remetente desconhecido.

## Requisitos funcionais

- **RF1 — Lista da empresa.** Aba "Responsáveis por ocorrências" em `/company-settings`. Seleção múltipla de usuários da
  empresa com vínculo ativo **e** permissão `occurrences.resolve`. Editar exige `settings.manage`. Usuário sem endereço
  de e-mail aparece marcado "sem e-mail" e não recebe cópia.
- **RF2 — Lista da contratante.** Na tela da contratante (Clientes de entrega), ao lado dos contatos, a seção
  "Responsáveis desta contratante — substitui a lista da empresa", com a mesma seleção e a mesma permissão. **Lista
  preenchida substitui a da empresa; lista vazia herda a da empresa.** A tela mostra qual lista está valendo.
- **RF3 — Lista efetiva.** Na hora do envio: lista da contratante se não vazia, senão a da empresa; menos quem perdeu o
  vínculo ativo ou a permissão `occurrences.resolve` (some sem erro, com log `info` sem endereço); menos quem não tem
  e-mail; menos endereço que já está no `To`; sem duplicata.
- **RF4 — Formulário de envio.** O envio manual de e-mail de ocorrência (P4 da 183) e o de correção de endereço mostram
  "Cópia:" com um chip por responsável da lista efetiva (nome e e-mail mascarado). O operador **remove** chips naquele
  envio; não há campo para adicionar nem digitar endereço. A remoção vale só para aquele envio.
- **RF5 — Onde a cópia vai.**
  - e-mail de ocorrência manual (`send-occurrence-mail`), com a lista efetiva menos os removidos;
  - envio automático (T802 da 183, sem operador), com a lista efetiva inteira;
  - reenvio do pedido de resposta da 248, com a lista efetiva inteira, recalculada no reenvio;
  - e-mail de correção de endereço (150), com a lista efetiva da contratante da correção menos os removidos.
- **RF6 — Onde a cópia não vai.** Encaminhamento da resposta da contratante a terceiro (248 RF11/RF12) e e-mail de teste
  de configuração (`setup_test`).
- **RF7 — Limite.** `To` + `Cc` ≤ `CONTRACTOR_MAIL_MAX_RECIPIENTS` (50). Envio manual que estoura responde
  `400 CONTRACTOR_MAIL_TOO_MANY_RECIPIENTS` antes de gravar. Cada lista de responsáveis tem no máximo 10 usuários.
- **RF8 — Histórico mostra a cópia.** A mensagem gravada guarda `cc_addresses`. O histórico de e-mail da conversa e da
  correção mostra "Cópia:" ao lado de "Para:".
- **RF9 — Resposta do responsável.** O e-mail recebido pelo token da conversa cujo remetente (DKIM alinhado) é usuário
  da empresa com vínculo ativo entra como **mensagem interna** daquele usuário, canal e-mail. Nunca vira remetente
  desconhecido nem sugere cadastro como contato. Não gera e-mail de saída (o "responder a todos" já chegou à
  contratante); sem laço de notificação. Se nenhum endereço de contato da contratante estiver no `To`/`Cc` do e-mail
  recebido, a mensagem aparece com o selo "só para a equipe — a contratante não recebeu".
- **RF10 — Trilha de auditoria.** Toda troca de lista grava em `audit_logs` o ator, a lista (empresa ou contratante) e os
  ids antes e depois.

## Requisitos não funcionais

- **Isolamento:** `companyId` do token. Usuário de outra empresa, ou contratante de outra empresa, dá 404 (contrato
  negativo, BOLA). FK composta com `company_id` em toda tabela nova.
- **Sem PII em log:** nenhum endereço (`To`, `Cc`, remetente) em log; contagens e ids só.
- **Sem endereço livre:** a rota de envio continua `.strict()`; `cc` no corpo continua `400` (o contrato existente
  `conversation-routes.contract.ts:226-231` segue valendo).
- **Publicação em etapas:** API (com a migration aditiva) → worker → painel. Ver `plan.md` § Publicação.

## Fora do escopo

- Cópia oculta (`Bcc`).
- Endereço digitado na cópia, ou pessoa de fora da empresa.
- Cópia no encaminhamento a terceiro (248) e no WhatsApp.
- Notificação no sino para os responsáveis (o e-mail já é o aviso).
- Responsáveis por tipo de ocorrência ou por etapa.

## Critérios de aceite

1. Com a lista da empresa {Ana, Bruno} e nenhuma lista na contratante X, o e-mail de ocorrência para X sai com Ana e
   Bruno em `Cc`, e o histórico mostra "Cópia: Ana, Bruno".
2. A contratante Y tem a lista {Carla}: o e-mail para Y sai só com Carla em `Cc`. Esvaziada a lista de Y, volta a sair
   com Ana e Bruno.
3. O operador remove Bruno no formulário: aquele e-mail sai só com Ana; o próximo envio volta a mostrar os dois.
4. O corpo com `cc: ["x@y.com"]` responde 400; com `excludedWatcherUserIds` de outro usuário qualquer, a lista efetiva
   não muda (só remove, nunca adiciona).
5. Ana perde `occurrences.resolve`: o envio seguinte sai sem ela, sem erro.
6. O envio automático e o reenvio da 248 saem com a lista efetiva inteira; o encaminhamento a terceiro sai sem `Cc`.
7. O e-mail de correção de endereço sai com a lista efetiva da contratante da correção.
8. Ana responde a todos: a mensagem entra na conversa da contratante como mensagem interna de Ana, sem sugestão de
   cadastro e sem novo e-mail de saída.
9. Operador de outra empresa lê ou grava a lista da empresa ou da contratante: 404.
10. Trocar a lista grava `audit_logs` com ator e ids antes e depois.
