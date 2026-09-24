# ADR-0073 — O portal ganha a conversa da ocorrência, e continua sem câmera, microfone nem id interno

- **Status:** proposto
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

1. **O portal consome o `@adatechnology/conversations-ui`**, como o painel (ADR-0051): `styles.css`
   uma vez, só no módulo `occurrences`, com os `--cv-*` alimentados pelos tokens do portal (cópia por
   valor dos do painel, como já é). O portal continua sem o design system do painel.
2. **A `Permissions-Policy` não muda.** Câmera, microfone e posição continuam negados. A
   contratante anexa por seletor de arquivo e **ouve** áudio, mas não grava áudio nem fotografa pelo
   portal. Liberar microfone para gravar é decisão nova, com ADR própria.
3. **O `connect-src` não muda.** Anexo e áudio são servidos pela API com URL temporária da própria
   origem permitida. O pacote vem no bundle e não chama terceiro nenhum.
4. **Nenhum id interno nas rotas**, como já é no portal: a ocorrência é nomeada pela chave de acesso
   da nota e pela `public_ref` aleatória da conversa. O recorte vem só de `resolveContractorScope`.
5. **O serializador do portal é outro.** Ele não tem campo do motorista (nome, telefone, foto) nem do
   funcionário da transportadora. A transportadora aparece como empresa.
6. **O teste continua sendo serviço puro e texto de fonte.** A app não ganha Playwright com esta
   ADR; ganha contratos de que a política, o `connect-src` e as rotas não mudaram.

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
