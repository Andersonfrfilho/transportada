# Plano — Feature 179

## Decisão de desenho

A exigência mora no **tipo de ocorrência**, não numa lista de nomes. `company_occurrence_types`
ganha `attachment_mode` (`off` / `optional` / `required`), reaproveitando `DELIVERY_PROOF_FIELD_MODES`
— o mesmo vocabulário que já governa foto e assinatura do canhoto. Assim "recusa" continua sendo o
que a empresa cadastrou, e o código nunca compara nome de tipo.

A alternativa descartada foi marcar `recusa_total`/`recusa_parcial` da constante de semente: a
constante não é o catálogo vivo, e a primeira empresa que cadastrar "Cliente recusou" escapa da
regra sem nenhum erro aparecer.

## Ordem

1. **Banco e catálogo** — coluna aditiva com default `off`, CHECK de valores, rollback próprio.
   Nenhum registro existente muda de comportamento (RF7, CA08).
2. **API** — a rota do motorista aceita multipart; o use-case passa a exigir anexo e `note` quando o
   tipo é `required`. Erro de domínio novo, código em `shared/errors/codes.ts`.
3. **App do motorista** — captura da foto, validação antecipada, e a fila offline carregando a
   imagem.
4. **Painel** — a marca no editor de tipos de ocorrência.

A ordem importa: o app não pode exigir o que a API ainda não aceita, e a API não pode exigir o que o
app ainda não envia. Por isso a API entra **aceitando** antes de o app enviar, e a exigência (T203)
só fecha depois que T30x manda a imagem.

## Pontos de atenção

- **A rota do motorista é JSON hoje.** Virar multipart mexe no parser e no cliente do app juntos;
  manter JSON aceito para os tipos que não exigem anexo evita quebrar tudo de uma vez.
- **A fila offline carrega JSON.** Guardar imagem exige decidir o armazenamento local (Blob em
  IndexedDB é o caminho já usado pelo comprovante — conferir antes de inventar).
- **Escrita única.** Uma recusa `required` gravada sem imagem é exatamente o defeito que a spec
  existe para impedir; se a transação não puder ser uma só, a ocorrência fica pendente e a tela diz.
- **Sem regra legal inventada.** Exigir foto é política da empresa, não obrigação fiscal; nada disso
  toca o pacote fiscal.

## Testes

Contrato antes da implementação, em cada fase. Integração para a coluna nova e para o multipart.
Smoke do app do motorista para a fila offline — é o caminho que a spec mais arrisca quebrar.

⚠️ Teste novo só roda se entrar na lista explícita do `package.json` **e** no entrypoint da suíte.
A integração da API exige `bun --env-file=../../.env.test run test:integration`; sem a flag ela
pula, e pular não é passar.
