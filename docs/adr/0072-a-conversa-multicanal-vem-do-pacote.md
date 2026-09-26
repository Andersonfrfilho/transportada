# ADR-0072 — A conversa multicanal vem do pacote; quem conversa com quem fica no produto

- **Status:** aceito (2026-09-24), **revisto em parte pela ADR-0075** (2026-09-26)

> ⚠️ **Dois pontos desta ADR não valem mais**, e quem ler precisa saber antes de seguir o texto
> abaixo: as tabelas da conversa **passam a ser do núcleo**, não do produto, e o transporte do
> e-mail da 143 **vira porta do núcleo** exigida de quem ligar o canal. O resto continua de pé —
> inclusive quem é a contratante e o motorista, a atribuição concreta, as permissões, o `companyId`
> e o estilo no produto. A tabela do que mudou está em
> `0075-o-nucleo-de-conversa-e-um-pacote-e-o-assunto-e-do-produto.md` § "O que esta ADR muda na
> ADR-0072".

- **Data:** 2026-09-24
- **Contexto:** spec 183. Depende da ADR-0051 (a tela de conversa vem do pacote) e de duas ADRs que
  dividem o número 0063: `0063-a-resposta-por-e-mail-decide-a-taxa.md` e
  `0063-o-telefone-vira-credencial-so-verificado.md`.

## Contexto

A spec 183 põe duas conversas na ocorrência — com a contratante (e-mail e WhatsApp) e com o motorista
(app e WhatsApp). Hoje o produto tem dois trilhos que não se conhecem:

| Trilho   | Onde mora                                                                    | O que tem                                                             |
| -------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| E-mail   | `apps/*/src/contractor-mail/` (spec 143)                                     | conversa por objeto, token de resposta, webhook Resend, DKIM, outbox  |
| WhatsApp | `@adatechnology/meta-whatsapp-{provider,module,contracts}` + `src/whatsapp/` | canal por empresa, modelo, texto, botões, webhook, conversas próprias |

E a tela da conversa já tem dono: a ADR-0051 decidiu que ela vem do `@adatechnology/conversations-ui`
e que o produto não remonta o grid à mão.

A pergunta é onde fica a costura: a conversa que mistura canais, o seletor de canal, as respostas
rápidas, os anexos.

## Decisão

**Vai para o `adatechnology-packages`** (reutilizável por qualquer produto):

1. `conversations-ui`: a conversa com **abas por participante**, **selo de canal** por mensagem,
   **seletor de canal** com estado (inclui "janela de 24h aberta/fechada"), **respostas rápidas**
   (lista recebida por prop; tocar preenche, nunca envia), **anexos** (lista, remover, limite) e o
   **player e gravador de áudio**, a **transcrição** embaixo do player quando o produto a fornecer, e o
   **selo de status** por mensagem (enviada, entregue, lida, falhou — o produto diz quais o canal
   suporta; o componente não mostra "lida" onde não recebeu esse estado). Tudo
   pela camada `.cv-*` da ADR-0051, capacidade opcional por ausência de prop.
2. `meta-whatsapp-provider`: **envio de mídia** (documento, imagem e áudio), que hoje não existe; e
   `meta-whatsapp-module`: entregar ao produto os **eventos de status** (`sent`, `delivered`, `read`,
   `failed`) do webhook, com o id da mensagem, se ainda não entrega.
3. Uma política pura de **janela de atendimento** (dada a última mensagem recebida e o relógio, diz
   se texto livre é permitido e até quando), em `meta-whatsapp-contracts` — é regra da Meta, não do
   TMS.

**Fica no TransportAdA:**

- quem é a contratante (emitente da nota, 143 RF3), os contatos, os tipos e o aceite de WhatsApp;
- quem é o motorista da ocorrência e o telefone verificado dele (ADR-0063);
- a conversa por (ocorrência, participante) e as mensagens com canal — tabelas do produto, com
  `companyId`;
- a regra que decide a taxa (143 RF5/RF6, e no WhatsApp só botão — spec 183 D4);
- a atribuição da mensagem recebida à conversa (spec 183 RF9);
- a transcrição de áudio (porta no produto; provedor em ADR própria — spec 183 RF18);
- permissões, LGPD e o que entra em log.

O e-mail da 143 **não** muda de lugar: ele vira o transporte do canal e-mail. A conversa que o
operador vê é a do produto, que referencia a mensagem de transporte.

## Revisão na aceitação (2026-09-24)

A conferência da versão publicada (`conversations-ui@0.3.1`, `meta-whatsapp-*`, spec 183 T101)
mostrou que o pacote não traz tudo da lista acima: não há abas por participante, selo de canal por
mensagem com canais do produto, seletor de canal, velocidade de áudio, e o `theme` não é aplicado;
balões e compositor ainda usam utilitárias Tailwind. A decisão do dono do projeto fecha isso:

- **o SDK é genérico, e todo estilo customizável fica do nosso lado.** O produto usa as peças do
  pacote (`ConversationPane`, `MessageBubble`, compositor, `AudioPlayer`, `AudioRecorderButton`,
  `AudioTranscription`, `StatusTicks`, `windowOf`, `sendMedia`, `onStatusUpdate`) e **compõe** o que
  é dele — abas por participante, selo de canal por mensagem (`email`, `whatsapp`, `app`, `portal`),
  seletor de canal;
- o estilo entra pelos `className`/`classNames` das peças e por `*.module.css` sobre `.cv-*`, com os
  nossos tokens. **Sem Tailwind** no painel e no portal: a ADR-0051 continua valendo;
- o envio pelo WhatsApp passa pelo `SendMessageUseCase` do módulo, porque é ele que guarda a mensagem
  e entrega o status; mensagem enviada por fora do módulo não recebe `onStatusUpdate`.

A lista da seção "Decisão" continua sendo o que se **espera** do pacote com o tempo; o que ainda não
existe nele é composição do produto, não contorno.

## Consequências

- O SDK chega pronto com esta lista (decisão do dono do projeto, 2026-09-24). A spec 183 não constrói
  nada no pacote: confere o contrato da versão instalada antes de usar (T101) e para se faltar algo,
  em vez de contornar no produto.
- `conversations-ui` ganha superfície de API (abas, canal, respostas rápidas, anexos). Como os `.cv-*`
  da ADR-0051, os nomes viram contrato.
- Duas fontes de conversa no banco: as tabelas do produto e o schema `meta_whatsapp`. O produto nunca
  cria FK para o schema do módulo (como hoje); guarda o id da mensagem como referência opaca.
- A spec 062 D2 (tema só por `theme`, sem CSS externo) já tinha sido revista pela ADR-0051; esta ADR
  segue a 0051.

## Alternativas descartadas

**Tudo no produto.** Mais rápido para a 183, mas é biblioteca reutilizável dentro do repositório, o
que o `AGENTS.md` proíbe, e repete o que a ADR-0051 recusou: tela de conversa remontada à mão
divergindo entre produtos.

**Tudo no pacote, inclusive a conversa por participante e a atribuição.** A conversa saberia o que é
contratante, motorista e ocorrência — domínio do TMS dentro de um pacote genérico. Os outros produtos
herdariam conceitos que não têm.

**Migrar o e-mail da 143 para dentro do `meta-whatsapp-module` (um módulo de conversas só).** O
módulo é da Meta por nome e por contrato; misturar Resend nele cria um pacote que muda por dois
motivos. Se um núcleo de conversa comum aos canais se provar necessário, ele nasce como pacote
próprio, com ADR própria.
