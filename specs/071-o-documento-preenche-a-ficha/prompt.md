# Prompt de execução — spec 071

Cole isto numa sessão nova, na raiz do `transportada`. Ele é autossuficiente: não depende da conversa
que produziu a spec.

---

Execute a spec 071 (`specs/071-o-documento-preenche-a-ficha/`) até o fim, task a task, na ordem das
fases. Leia `spec.md` e `tasks.md` antes de tocar em código — as decisões todas já estão lá e não
devem ser reabertas.

**O objetivo:** o pré-cadastro do agregado começa pelos documentos, e todo dado que der para extrair
preenche o campo dele — atravessando bloco do formulário, não só o bloco do documento.

## Antes de começar

1. **Crie seu próprio worktree**: `make worktree NAME=spec-071`. Duas sessões no mesmo checkout
   produzem formatação cruzada e commit de uma entrando no push da outra.
2. Leia `CLAUDE.md` e `AGENTS.md`. As regras de arquitetura e de nomenclatura são bloqueantes.
3. A fase 0 acontece em **outro repositório**: `~/Documents/personal/adatechnology-packages`. Sem a
   versão nova publicada e instalada, a fase 1 não fecha.

## O que não se decide de novo

- Etapa de documentos é a **primeira**, antes de "Dados pessoais".
- Documento da empresa é **um campo, qualquer tipo**; só o CCMEI preenche.
- Comprovante de endereço: **qualquer tipo, qualquer data**, anexo puro, sem extração.
- CNH anexa; o **OCR preenche a ficha do operador**, nunca o formulário do candidato.
- Código partilhado entre apps vai para **`@adatechnology/document-intake`**, não é cópia por valor.
- Cartão CNPJ e contrato social **não ganham parser**.

Se você achar motivo forte contra alguma delas, **pare e diga** — não implemente o contrário em
silêncio, e não implemente a decisão sabendo que ela está errada.

## As três guardas que nenhuma task afrouxa

1. **Só campo vazio.** Nada sobrescreve o que a pessoa digitou.
2. **Divergência avisa, não corrige.** O proprietário do CRLV diferente de quem se candidata é caso
   normal — agregado roda com veículo de terceiro.
3. **Documento não identificado não preenche nada**, mesmo trazendo dado legível. Ler com o mapa
   errado inventa campo, e campo inventado vira divergência falsa.

E a que vem da spec 070, que não muda: **o preenchimento é local e instantâneo; o envio é prova.** A
leitura que preenche roda no navegador de quem anexa. O upload existe para o operador conferir. Não
inverta isso — leitura de cliente anônimo aceita como prova deixa um atacante escolher o que o
operador vê (ADR-0053).

## Como trabalhar

- **Uma task por vez**, tirada da `tasks.md`. Marque `[x]` só quando a evidência estiver escrita.
- **Contrato antes da implementação.** Teste que não consegue falhar não prova nada — se um passar de
  primeira, quebre a expectativa de propósito e confirme o vermelho antes de seguir.
- **Commit isolado por task**, para rollback barato.
- Teste novo **precisa entrar na lista explícita** do `package.json` da app. Sem isso ele não roda.
- Respeite o modelo recomendado por fase. Se a sessão estiver num modelo diferente, **pare e peça a
  troca** antes de tocar em código.

## Gates de toda task

```bash
bun run format:check && bun run lint && bun run typecheck
```

E ao fim de cada fase, a suíte das apps tocadas (`bun run --cwd apps/<app> test`).

## O que fazer quando travar

- **Dúvida que muda o que se constrói:** pare e pergunte. Não invente decisão de produto.
- **Dúvida que muda só como se constrói:** decida, e escreva o porquê no código ou na ADR.
- **Parser que não reconhece o documento:** isso é resultado, não falha. Grave vazio e siga.

## Ao terminar

- `evidence.md` com o resultado de cada fase e o comando que produziu cada número.
- ADR para a decisão do pacote (T001).
- `CLAUDE.md` atualizado — é regra do repo ao mudar arquitetura, rota ou regra de negócio.
- **Não publique.** Deixe a branch pronta e diga o comando de push; quem decide subir é o usuário.
