# Roteiro da T019 — prova ponta a ponta em staging (spec 144)

Você executa, com o seu número de teste. Cada passo diz o que fazer, o que deve acontecer e o que anotar.
Cole o resultado de cada critério em `specs/144-o-comando-chega-pelo-whatsapp/evidence.md`, na seção
"T019", com data.

## 0. Antes de começar

1. **Publicar o branch em staging:**
   `git fetch && git rebase origin/staging && git push origin HEAD:staging`
   O `preDeployCommand` da API roda as migrations novas. São seis, todas aditivas:
   - `whatsapp_phone_binding`
   - `whatsapp_phone_key`
   - `whatsapp_flow_graph_versions`
   - `cte_profile_output_document`
   - `whatsapp_command_requests`
   - `whatsapp_command_settlement`
2. **Conferir a variável do worker.** Ela precisa estar declarada no Railway (staging):
   - o crachá de máquina do worker (o mesmo do `mdfe-auto-issue`). Sem ele a rotina
     `whatsapp.command.settle` não é registrada e a fatura nunca sai.
3. **Publicar o grafo** para a empresa de teste. Na primeira vez rode sem `--confirm`, para ver o diff e a
   validação; depois rode de novo com `--confirm`:
   `bun run --cwd apps/api-transportada scripts/whatsapp-flow-publish.ts --company <companyId> --confirm`
   Até isso rodar, o bot usa a versão que estiver no banco (nenhuma), e o menu não aparece.
4. **Canal de WhatsApp** da empresa de teste configurado em Configurações, com o número de exibição
   preenchido. Sem ele, o `POST /me/whatsapp-phone/verification` responde 409.
5. **Dois usuários de teste**:
   - um **operador** com `cte.manage`, `cte.submit`, `nfse.issue` e `billing.create`;
   - um **motorista** vinculado a uma viagem **despachada** com pelo menos uma nota pendente.
6. **Perfis de emissão**: pelo menos um perfil de CT-e com saída **CT-e** e um com saída **NFS-e** (apontando
   para um perfil NFS-e ativo), cobrindo notas de um mesmo emitente numa faixa de números conhecida.

## Os 9 critérios de aceite

| #   | O que fazer                                                                                                                                                   | O que deve acontecer                                                                                                                                                                                                                                        | Anotar                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| AC1 | Mande "oi" de um número **não vinculado**. Depois vincule-o pela tela, sem mandar o código, e mande "oi" de novo.                                             | Nas duas vezes chega a mesma resposta neutra ("Este número não está habilitado…"), e nenhum menu. Mandar várias mensagens seguidas não repete a resposta dentro de 24 h.                                                                                    | print das duas respostas                                                   |
| —   | **Vínculo**: no painel, abra o ícone de WhatsApp no cabeçalho, informe o número e gere o código. Envie o código do próprio WhatsApp para o número da empresa. | O bot responde "✅ Número vinculado a _Nome_." e mostra o menu. A tela passa a mostrar o vínculo, com o número mascarado e a validade de 90 dias.                                                                                                           | print da tela e da conversa                                                |
| AC2 | Com um usuário **sem** `nfse.issue`, abra "Emitir documentos" e tente confirmar uma prévia que tenha NFS-e.                                                   | O menu raiz só mostra o que a pessoa alcança. Na confirmação chega "Seu acesso não permite emitir todos os documentos desta prévia", e nada é emitido.                                                                                                      | print                                                                      |
| AC3 | Operador: Emitir documentos → Faixa de número → emitente → número inicial → número final → vencimento → Pular o período.                                      | Chega a volumetria: "N notas · X CT-e · Y NFS-e · Z bloqueadas", e depois as bloqueadas com o motivo e os números. Confira na tela de Notas, coluna "Documento", que a classificação de cada nota é a mesma.                                                | print + 3 notas conferidas na tela                                         |
| AC4 | Com a prévia aberta, vincule pelo painel uma das notas da faixa a um lote de CT-e. Depois toque em ✅ Confirmar.                                              | O bot **não emite**: mostra uma prévia nova, em que aquela nota aparece como "já vinculada".                                                                                                                                                                | print das duas prévias                                                     |
| AC5 | Na prévia nova, toque em ✅ Confirmar **duas vezes seguidas**.                                                                                                | Sai **um** lote de CT-e e **uma** NFS-e por tomador. O segundo toque responde "já está sendo enviado" ou "já foi enviado". Confira no painel que não há lote duplicado.                                                                                     | ids do lote e da NFS-e                                                     |
| AC6 | Espere a SEFAZ e a prefeitura responderem. A rotina roda a cada 5 min. Se possível, inclua uma nota que vá ser rejeitada.                                     | Chega no WhatsApp o resumo: autorizados, rejeitados com o motivo, NFS-e como "autorizada, sem fatura" e as faturas criadas. No painel, **uma fatura por tomador**, só com os CT-e autorizados, com o vencimento escolhido e o autor igual a quem confirmou. | print do resumo + ids das faturas                                          |
| AC7 | Motorista: Minha viagem → 📦 Entregar → escolha a nota. Depois abra o PWA do motorista.                                                                       | O bot responde "Entrega registrada. ✅", e o PWA mostra a mesma nota entregue. Teste também ↩️ Devolver (motivo em lista) e ⚠️ Ocorrência.                                                                                                                  | print do bot + print do PWA                                                |
| AC8 | Percorra todos os menus.                                                                                                                                      | Toda escolha com até 3 opções vem como **botão com emoji**. De 4 a 10 opções vem como lista. Com mais de 10, a lista pagina com "➡️ Mais" e "⬅️ Voltar". Nenhum título aparece cortado.                                                                     | prints dos três formatos                                                   |
| AC9 | No Railway, logs da API e do worker durante os passos acima.                                                                                                  | Nenhum telefone inteiro (só `****1234`), nenhum corpo de mensagem, nenhum código de verificação, nenhum CNPJ/CPF de tomador, nenhum texto de resumo.                                                                                                        | uma busca por um número de telefone e por um CNPJ nos logs, sem ocorrência |

## Conferência visual (a T017 não pôde fazer localmente)

As portas 53000 e 53001 desta máquina estavam ocupadas pela stack de outra sessão
(worktree `cargo-missing-box`), então a tela de vínculo nunca foi vista rodando. Em staging:

| Onde                                              | Larguras                                 | O que conferir                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Painel → ícone de WhatsApp no cabeçalho → diálogo | 375 px (diálogo em tela cheia) e 1280 px | esqueleto no carregamento; campo de telefone com máscara; código em destaque com o número da empresa e botão de copiar; contagem até expirar; estado vinculado com o número mascarado e a validade; "Desvincular" com ícone e confirmação; aviso quando a empresa não tem canal configurado |
| PWA do motorista → Perfil → cartão "WhatsApp"     | 375 px                                   | os mesmos estados, dentro do cartão, entre a fila e o Sair                                                                                                                                                                                                                                  |

Anote uma captura de cada largura. Qualquer campo cortado, texto sem acento ou rolagem horizontal é
defeito da T017.

## Recusas e casos de borda (vale conferir se der tempo)

- Resposta digitada fora do menu duas vezes seguidas → o bot oferece "🙋 Falar com pessoa" e para de responder
  como bot.
- Prévia aberta há mais de 15 minutos → ✅ Confirmar responde "Prévia expirada" e oferece refazer.
- Membership do operador suspensa **depois** de confirmar e **antes** da liquidação → nenhuma fatura sai, e o
  resumo não é enviado (a partir da T014b).
- Pedir o código de verificação 6 vezes em 10 minutos → a sexta volta 429.

## Limitações conhecidas (não são falha da T019)

- Fora da janela de 24 h da Meta, o resumo em texto livre é recusado. É preciso um template aprovado
  próprio, que fica como dívida.
- As respostas do bot não aparecem na inbox de conversas da 062.
- O convite por WhatsApp da 062 saía sem o 55 (corrigido numa sessão separada; confira se já está em
  staging).
- O `create` de NFS-e travou de forma intermitente em integração local (investigado numa sessão
  separada). Se a confirmação ficar parada em "enviando", anote o horário e o id do pedido.
