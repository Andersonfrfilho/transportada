# Objetivo — spec 071

O bloco abaixo é o que se cola numa sessão nova. Ele define o alvo e o que conta como terminado; o
`prompt.md` ao lado carrega como trabalhar.

---

**Objetivo:** implementar a spec 071 (`specs/071-o-documento-preenche-a-ficha/`) inteira, do pacote à
tela, com teste, e parar antes de publicar.

Leia, nesta ordem, antes de tocar em código: `CLAUDE.md`, `specs/071-o-documento-preenche-a-ficha/spec.md`,
`tasks.md` e `prompt.md`. As decisões estão fechadas na spec e não se reabrem.

Crie seu worktree antes de qualquer edição: `make worktree NAME=spec-071`.

## O alvo, em uma frase

Quem se candidata a agregado sobe os documentos **primeiro**, e todo dado que der para extrair
preenche o campo dele — atravessando bloco do formulário, não só o bloco do documento.

## Terminado é quando tudo abaixo for verdade

1. **As 17 tasks fechadas**, cada uma com evidência em `evidence.md` — o comando que rodou e o número
   que ele deu, não "funcionou".
2. **O pacote publicado e instalado.** `@adatechnology/document-intake` com `readCrlv` e
   `extractCnhFields`, em versão nova, consumida pela api, pelo worker, pelo painel e pela landing. A
   cópia local do painel saiu.
3. **O CRLV preenche na tela**, provado por teste: bloco Veículo, mais nome, documento e cidade. Só
   campo vazio; proprietário divergente avisa e não corrige.
4. **A CNH sobe e o OCR escreve na ficha do operador** — nunca no formulário do candidato. O trilho
   da 070 escolhe entre camada de texto e OCR pelo tipo e pela assinatura do arquivo.
5. **Comprovante de endereço e documento da empresa anexam sem extrair nada**, com os tipos novos
   afirmados na fronteira dos dois lados.
6. **Teste ponta a ponta com infra de verdade**, como a 070 fez: `make up`, e o caminho provado do
   upload ao campo gravado. Contrato prova peça; só a integração prova costura.
7. **O verde conferido contra falso positivo.** Todo teste central que passar de primeira: quebre a
   expectativa de propósito, veja o vermelho, desfaça. Teste que não consegue falhar não prova nada.
8. **Gate limpo na raiz**: `bun run format:check && bun run lint && bun run typecheck && bun run test`,
   mais a suíte de cada app tocada.
9. **ADR** da decisão de pacote, e **`CLAUDE.md` atualizado** — regra do repo ao mudar arquitetura.
10. **Nada publicado.** Branch pronta, e o comando de push entregue ao usuário.

## Quando parar e perguntar

Dúvida que muda **o que** se constrói: pare. Dúvida que muda só **como**: decida e escreva o porquê.

Se alguma decisão da spec se mostrar errada durante a implementação, **diga** — não implemente o
contrário em silêncio, e não implemente sabendo que está errado.

## Ordem

Fase 0 (`opus`, atravessa dois repositórios) → fases 1, 2 e 3 (`sonnet`). Se a sessão estiver em
modelo diferente do recomendado, pare e peça a troca antes de tocar em código.
