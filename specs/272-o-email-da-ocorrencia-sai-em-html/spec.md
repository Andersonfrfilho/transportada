# Feature 272 — O e-mail da ocorrência sai em HTML

> Pedido do dono nas sessões de 2026-10-17 e 2026-10-18 ([`evidence.md`](evidence.md) § Decisões do dono). A prévia
> aprovada é a versão 10 do artefato "Modelos de e-mail de ocorrência" (cópia em
> [`desenho-aprovado.html`](desenho-aprovado.html); a função `render()` é o desenho de referência). Decisão de arquitetura:
> [ADR-0110](../../docs/adr/0110-o-email-da-ocorrencia-sai-em-html.md) (escrita na T0.2).
>
> ⚠️ **Ordem:** a 269, a 270 e a 271 estão em `staging` e **nenhuma está em produção**. A 272 vai a `main` **depois**
> delas (ela desenha em volta do modelo da 271). A 273 (a ocorrência tem dono, `work/spec-273`) mexe no mesmo envio: a
> 272 vem **antes** e deixa o ponto `signer` que a 273 preenche — ver `plan.md` § Coordenação com a 273.

## Specs do mesmo assunto (lidas contra o código em `origin/staging` 68613c0f9, 2026-10-18)

| Spec      | O que já decidiu e esta spec **usa sem refazer** (ou emenda, quando dito)                                                                                                                                                                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 143 / 183 | O e-mail de ocorrência é a mensagem da 143 (`contractor_mail_messages`) mais a da conversa, gravadas numa transação por `send-occurrence-mail`; o worker envia pelo Resend da empresa. `Reply-To` com token traz a resposta para a conversa. **Usa:** a faixa "Responda este e-mail" só existe porque o `Reply-To` existe.                         |
| 247       | Itens da ocorrência com código, quantidade, unidade e valor; soma das linhas, dinheiro em `bigint`/string com arredondamento único. **Usa** os mesmos valores na tabela de itens; nenhum cálculo novo.                                                                                                                                             |
| 248       | Reenvio do pedido de resposta e encaminhamento a terceiro. **Fica fora**: o reenvio repete o envio original (sai em HTML se o original saiu), o encaminhamento a terceiro continua em texto.                                                                                                                                                       |
| 267       | Responsáveis em cópia, teto 50 em `To`+`Cc`. Não muda.                                                                                                                                                                                                                                                                                             |
| 268       | Modo sandbox (`transport = 'sandbox_smtp'`, Mailpit, sem `Reply-To`, `From = EMAIL_FROM`). **Emenda:** o "De" do sandbox ganha o nome de exibição da transportadora (achado do teste em staging de 2026-10-18, D11), e a faixa "Responda este e-mail" some no sandbox.                                                                             |
| 269       | Assunto saneado (sem quebra de linha) e truncado. **Usa:** o prefixo da 272 entra antes do corte e nunca é cortado.                                                                                                                                                                                                                                |
| 270       | Tipo geral ou de contratantes. Não muda.                                                                                                                                                                                                                                                                                                           |
| 271       | (em `staging`) O texto é um modelo do módulo de notificação, **texto simples** (corpo HTML recusado), variáveis `{{camelCase}}` da lista fechada, `{{linhasItens}}` com uma linha por item, `interpolateTemplate`. **Usa sem refazer**: o modelo continua texto e a recusa de HTML continua; a 272 monta o HTML **em volta** do texto renderizado. |
| 273       | (em `work/spec-273`, não em `staging`) Grava o **dono** da ocorrência e, no envio automático, quer o dono no "De" e na assinatura (273 RF7). **Coordena:** a 272 cria o ponto `signer` (operador, dono ou equipe) e a regra única do "De"; a 273 só passa o dono para ele. A 272 não depende da 273: sem dono, assina a equipe.                    |

## Problema e resultado

O e-mail de ocorrência à contratante sai em texto puro: sem a marca da transportadora, sem destaque para a nota e o
valor, com os itens em linhas corridas e uma assinatura genérica. A contratante recebe dezenas de e-mails de
transportadoras e não reconhece de quem é, nem acha o número da nota sem ler tudo. No sandbox (268) o "De" chega sem
nome.

**Resultado:** o sistema monta o e-mail em HTML, no desenho aprovado, em volta do texto do modelo (que continua simples
e escrito em Notificações → Preferências). Cabeçalho com o logo, o nome de exibição, o CNPJ e a cidade da transportadora
e o selo do tipo; título; quadro de resumo (nota, partes, registro); o texto do modelo com a tabela de itens; a faixa
"Responda este e-mail"; a assinatura de quem enviou; e o rodapé com a identificação da transportadora e as marcas
TransportAdA e Ada Technology. A parte em texto puro continua indo junto. O assunto e o "De" passam a identificar a
transportadora.

## Requisitos funcionais

- **RF1 — HTML em volta do texto.** Todo e-mail de ocorrência à contratante (automático, manual e o reenvio da 248) sai
  `multipart/alternative` com a parte `text/html` (desenho do RF3–RF10) e a parte `text/plain` (o texto de hoje mais a
  assinatura e a identificação em texto). O modelo continua **texto**: a recusa de corpo HTML da 271 não muda. Nenhum
  valor da ocorrência, do modelo ou do operador entra no HTML sem escape.
- **RF2 — Assunto identifica a transportadora.** Assunto = `<nome de exibição> · CNPJ <cnpj> — <assunto do modelo
preenchido>`. O saneamento e o corte da 269 valem só para a parte do modelo; o prefixo nunca é cortado. O modelo não
  precisa repetir o nome.
- **RF3 — Cabeçalho.** Faixa asfalto com borda cobre: logo da transportadora (o cadastrado; sem logo, as iniciais do nome
  de exibição num quadrado), o nome de exibição, `CNPJ <cnpj> · <cidade> · <UF>` e o selo com o nome do tipo de
  ocorrência.
- **RF4 — Título.** O assunto do modelo preenchido (sem o prefixo do RF2).
- **RF5 — Quadro de resumo** em três grupos, nesta ordem:
  - **Nota fiscal:** Número (`NF <número>`); **Valor da nota** em linha própria, em destaque.
  - **Partes:** Contratante; CNPJ da contratante em linha própria; Cliente (razão social do destinatário).
  - **Registro:** Parada; Data; Motorista.
    Linha sem valor não aparece (ocorrência de parada sem nota não mostra o grupo "Nota fiscal"; sem motorista, some
    "Motorista"). Grupo sem nenhuma linha não aparece.
- **RF6 — Corpo.** O texto do modelo preenchido, em parágrafos (linha em branco separa parágrafo; quebra simples vira
  quebra de linha). Onde o modelo tem `{{linhasItens}}` entra a **tabela de itens** (Código, Item, Qtd., Valor; rodapé
  "Total dos itens" com a soma da 247). Até 200 linhas, como a 271, e a linha "e mais N itens". Sem itens, nada entra no
  lugar. No envio manual, a tabela entra se o operador manteve o bloco de linhas como veio da prévia; se editou o bloco,
  ele sai como texto (`plan.md` D6).
- **RF7 — Faixa de resposta.** "↩ Responda este e-mail: a resposta entra na conversa desta ocorrência e chega à equipe."
  Só quando a mensagem tem `Reply-To` (Resend). No sandbox (268) não aparece.
- **RF8 — Assinatura.**
  - Envio manual: o operador — avatar com as iniciais, nome, papel na empresa, nome de exibição e CNPJ.
  - Envio automático: o **dono** da ocorrência quando a 273 estiver publicada e houver dono (mesma forma do operador);
    senão "Equipe <nome de exibição>", com "Mensagem automática do registro da ocorrência · CNPJ <cnpj>" e as iniciais da
    transportadora.
  - Reenvio da 248: a assinatura do envio original.
- **RF9 — Rodapé.** Linha com o logo da transportadora (ou as iniciais) **antes** de "<nome de exibição> · <razão social>
  · CNPJ <cnpj>" e "Ocorrência da NF <número>"; abaixo, separada por linha fina, as miniaturas da transportadora, do
  TransportAdA e da Ada com "Enviado pelo TransportAdA — uma solução Ada Technology"; e "© <ano do envio> Ada Technology
  — TransportAdA. Todos os direitos reservados."
- **RF10 — Cores fixas.** Asfalto `#10222c`, cobre `#d58a47`, névoa `#f0f2ee`, ardósia `#5a6b74`, tinta `#1d2b33`, fundo
  branco. O e-mail não segue tema escuro do cliente de e-mail (sem `prefers-color-scheme`).
- **RF11 — "De" com o nome da transportadora.** Nome no "De": envio automático sem dono → `<nome do remetente>`; envio
  manual → `<operador> — <nome do remetente>`; automático com dono (273) → `<dono> — <nome do remetente>`. O nome do
  remetente é o configurado no Resend da empresa (o de hoje) e, no sandbox (268), o nome de exibição da transportadora
  (`plan.md` D5). O endereço não muda (o do Resend da empresa, ou `EMAIL_FROM` no sandbox). **Vale também no sandbox**,
  que hoje manda o endereço sem nome.
- **RF12 — Ver antes de enviar.** A prévia do diálogo de envio manual mostra o e-mail em HTML como vai sair (mesma
  montagem do servidor), além do texto editável de hoje.
- **RF13 — Rastreio.** A mensagem gravada guarda o HTML que saiu, o nome usado no "De" e quem assinou (tipo e id), para o
  histórico da conversa e para o reenvio da 248 repetir o original.

## Requisitos não funcionais

- **Compatível com cliente de e-mail:** tabelas e estilos inline; nada de grid, flex, variável CSS, `<style>` com
  seletor de classe como única fonte de estilo, fonte externa ou script. Largura máxima 620 px; legível em 320 px. Teste
  de forma: o HTML final não contém `display:grid`, `display:flex`, `var(`, `<script`, `@import`.
- **Imagem que não depende de site no ar:** o logo da transportadora (guardado em `company_logos`) vai embutido no
  e-mail como parte inline (`plan.md` D3); nenhuma rota anônima nova (`security.md` §7). As marcas TransportAdA e Ada
  são assets públicos estáveis do painel, nunca base64 no HTML (`plan.md` D4).
- **Sem PII em log:** ids e contagens; nunca endereço, nome, assunto ou corpo (como a 268).
- **Tamanho:** HTML final abaixo de 100 KB com 200 itens (o Gmail corta acima de ~102 KB); teste com o caso de 200 itens.
- **Um renderizador só:** a prévia do painel e o envio usam a mesma montagem do servidor; o painel não reimplementa.
- **Publicação em etapas (ADR-0081 §9):** painel tolerante → API (migration aditiva) → worker → telas.

## Fora do escopo

- Corpo HTML escrito pela empresa no modelo (a 271 recusa e continua recusando).
- E-mail de correção de endereço (150), encaminhamento a terceiro (248), e-mail do sistema (convite, senha) e os avisos
  internos do módulo de notificação: continuam como estão.
- Tema escuro, idioma diferente de pt-BR, cores por transportadora.
- Gravar o dono da ocorrência (spec 273).
- Cadastro do logo: usa o que Configurações da empresa já guarda (`evidence.md` § Levantamento); se faltar algo no
  cadastro, é pergunta, não escopo.

## Critérios de aceite

1. Ocorrência "Avaria" de NF 48.213-1 com dois itens, modelo `ocorrencia.avaria` com `{{linhasItens}}`: o automático
   chega com assunto `Tapete Mágico Transportes · CNPJ 12.345.678/0001-90 — Avaria no transporte na entrega — NF
48.213-1`, parte HTML com cabeçalho, resumo nos três grupos, tabela com 2 linhas e "Total dos itens", e parte texto.
2. O HTML final passa no teste de forma (sem grid/flex/`var(`/script) e todo valor com `<`, `&` ou `"` sai escapado
   (teste com `observacao = '<b>x</b> & "y"'`).
3. Empresa sem logo: cabeçalho e rodapé com as iniciais, sem `<img>` quebrado. Com logo: a imagem é parte embutida do
   e-mail e o HTML a referencia por `cid:`; nenhum `data:` nem link de API aparece no HTML.
4. Envio manual de Ana Lima: "De" `Ana Lima — Tapete Mágico Transportes <…>`, assinatura com nome, papel, nome de
   exibição e CNPJ. Automático sem dono: "De" `Tapete Mágico Transportes <…>` e "Equipe Tapete Mágico Transportes".
5. Sandbox (268), no Mailpit: "De" `Tapete Mágico Transportes <EMAIL_FROM>` (com nome), sem a faixa "Responda este
   e-mail", com as duas partes.
6. Operador edita o bloco de linhas dos itens no diálogo: o HTML mostra o texto editado, sem tabela. Mantém o bloco: sai
   a tabela.
7. Ocorrência de parada sem nota: o resumo não tem o grupo "Nota fiscal" nem linha vazia.
8. 200 itens: HTML abaixo de 100 KB e a linha "e mais N itens" quando passar de 200.
9. Reenvio da 248 de um e-mail enviado em HTML repete o HTML, o "De" e a assinatura gravados.
10. Assunto do modelo com 300 caracteres: o prefixo fica inteiro e a parte do modelo é cortada no limite da 269.
11. A prévia do diálogo mostra o mesmo HTML que o Mailpit recebe (mesma montagem; teste de igualdade de string).
12. Com a 273 publicada e dono Carla na ocorrência: o automático sai "De" `Carla — Tapete Mágico Transportes` e assinado
    por Carla (teste do ponto `signer` com dono, mesmo antes da 273, por injeção).
