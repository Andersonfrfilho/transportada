# ADR-0073 — O portal ganha a conversa da ocorrência, e continua sem câmera, microfone nem id interno

- **Status:** aceito (2026-09-24)
- **Data:** 2026-09-24
- **Contexto:** spec 183 (D9, RF21). Cresce o portal da ADR-0050; usa a tela de conversa da ADR-0051
  pela ADR-0072.

## Contexto

O `apps/frontend-client/CLAUDE.md` registra que o portal tem cinco telas, nenhum design system, nenhum
Playwright, e que **crescer a app é decidir isso de novo, por escrito**. A spec 183 põe no portal a
conversa da contratante sobre as ocorrências das notas dela, com anexos, áudio e a decisão da taxa.
É a primeira tela do portal em que a contratante **escreve** para a transportadora, e não só lê ou
decide.

## Decisão

1. **O portal consome as peças do `@adatechnology/conversations-ui`**, como o painel (ADR-0051,
   ADR-0072), **sem o `styles.css`** (⚠️ emendado em 2026-09-26, abaixo), com o estilo nosso a
   partir dos tokens do portal (cópia por valor dos do painel, como já é). O
   portal continua sem o design system do painel.
2. **A `Permissions-Policy` não muda.** Câmera, microfone e posição continuam negados. A
   contratante anexa por seletor de arquivo e **ouve** áudio, mas não grava áudio nem fotografa pelo
   portal. Liberar microfone para gravar é decisão nova, com ADR própria.
3. **O `connect-src` não muda** (⚠️ emendado em 2026-09-25, abaixo: o bucket entra). Anexo e áudio são servidos pela API com URL temporária da própria
   origem permitida. O pacote vem no bundle e não chama terceiro nenhum.
4. **Nenhum id interno nas rotas**, como já é no portal: a ocorrência é nomeada pela chave de acesso
   da nota e pela `public_ref` aleatória da conversa. O recorte vem só de `resolveContractorScope`.
5. **O serializador do portal é outro.** Ele não tem campo do motorista (nome, telefone, foto) nem do
   funcionário da transportadora. A transportadora aparece como empresa.
6. **O teste continua sendo serviço puro e texto de fonte.** A app não ganha Playwright com esta
   ADR; ganha contratos de que a política, o `connect-src` e as rotas não mudaram.

## Revisão na aceitação (2026-09-24)

Staging já tem, pela spec 164, a tela "Ocorrências" do portal com o formulário de decisão
(`occurrences.decide`) e `GET /client/me/occurrences`. Por isso:

- a conversa entra **nessa tela**, ao lado do formulário de decisão, que continua sendo o único jeito
  de decidir pelo portal — a conversa não decide;
- a conversa aparece só nas ocorrências que a 164 D5 já mostra ao portal;
- as rotas novas são `/client/me/occurrence-conversations/:ref`, com `ref` opaco, e a listagem da 164
  ganha a `conversationRef`. A rota de decisão da 164 recebe o id interno da ocorrência, contra a
  regra do portal; isso é da 164 e fica registrado fora desta ADR;
- o estilo da conversa no portal segue a ADR-0072 revisada: peças do pacote, estilo nosso, sem
  Tailwind.

## Emenda de 2026-09-25: o bucket entra no `connect-src` (spec 183 T702b)

O item 3 supunha que o anexo passaria pela API. A T702a desenhou outro caminho: o navegador pede à
API uma URL assinada de PUT, envia o arquivo **direto** ao bucket da própria instalação e só então
manda a mensagem com o id do pedido; a API confere os bytes antes de gravar. O teto de 1 MiB por
requisição da API continua valendo para todas as rotas, e ela não segura arquivo de 25 MB na
memória.

Decisão do usuário, em 25/09/2026, entre esse caminho e o upload pela API com teto próprio:

- o bucket entra no `connect-src` (upload) e no `media-src` (áudio) do portal, pela mesma origem que
  já estava no `img-src` desde a spec 164 (`VITE_STORAGE_URL`). **Terceiro continua fora:** a lista
  de destino externo segue vazia, e o bucket é da instalação;
- a URL só aceita aquele objeto e aquele tamanho por 15 minutos, e nada vale até a API conferir os
  bytes no envio da mensagem;
- a mesma mudança vale para o painel, que tinha o contrato "o bucket não entra em connect-src" desde
  a revisão da spec 161.

O item 2 (`Permissions-Policy`) não muda: a contratante anexa pelo seletor de arquivo, sem câmera,
e ouve áudio sem gravar.

## Emenda de 2026-09-26: peças do pacote, sem o `styles.css` (spec 183 T650)

O §1 mandava importar o `styles.css` do pacote uma vez, no módulo `occurrences`. A implementação
achou o mesmo que o painel na T407 (ADR-0051 §1): o arquivo traz regra global (`:where(*) {
border-color }` e `:root`), que repintaria o portal inteiro, e o `MessageBubble` só tem forma com
Tailwind. O portal usa só as peças que não dependem disso (`MessageText`, `StatusTicks`,
`DateDivider`); o balão é nosso, com os tokens `--color-bubble-*` copiados por valor do painel.
Decisão do dono do projeto em 26/09/2026.

## Consequências

- O bundle do portal cresce com o pacote de conversa. Isso fica medido na T653, com o tamanho antes e
  depois no `evidence.md`.
- A contratante passa a ter três canais para a mesma conversa. Por isso a conversa é uma só (spec 183
  D2): o operador não precisa saber por onde ela preferiu responder.
- O aviso de mensagem nova no portal sai por e-mail **sem o corpo**. Quem lê a mensagem é quem entra
  no portal, e o corpo não fica em mais uma caixa de e-mail além das que já o recebem pelo canal
  e-mail.

## Alternativas descartadas

**Conversa só por e-mail e WhatsApp, e o portal apenas com link para a caixa.** Mantém o portal
pequeno, mas a contratante que já trabalha pelo portal teria de sair dele para responder, e a
decisão da taxa ficaria num lugar e a conversa sobre ela em outro.

**Liberar microfone e câmera no portal.** Daria paridade com o app do motorista, mas o portal é a
única superfície com usuário externo (ADR-0050 §1), e a política negada é parte da defesa dela. O
ganho (gravar em vez de anexar) não paga o risco nesta versão.

**Montar a conversa do portal à mão, com CSS próprio.** Seria o grid remontado que a ADR-0051 recusou,
agora no terceiro lugar do produto.
