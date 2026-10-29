
## Etapa B (T9), primeira fatia: CRUD legado da 150 em staging

Aprovada pelo dono em 29/10/2026 (cartão de decisão, opção "Aprovar a Etapa B em staging").

Feito nesta fatia (sem migration):

- Saíram as rotas `/contractor-mail-templates`, `/contractor-mail-templates/catalog` e `/contractor-mail-templates/preview` (com a prévia 410), o caso de uso `createContractorMailTemplatesUseCase`, a fiação em `main.ts` e o erro `ContractorMailTemplateRetiredError`.
- Confirmado antes: o frontend não chama mais essas rotas (o cadastro da 150 saiu da tela na T6); a UI de tipo usa `/company-settings/occurrence-types/contractor-mail-templates`, que não muda.
- Validação: `tsc --noEmit` limpo (com `NODE_OPTIONS=--max-old-space-size=12288`, o padrão estoura o heap), `eslint --max-warnings=0` e `prettier --check` limpos nos arquivos tocados, `bun test` em `contractor-mail`, `occurrence-contractor-mail`, `address-correction-http` e `occurrence-client-channels`: 654 pass, 0 fail.

Ainda não feito (pendente, destrutivo, com migration própria):

- Colunas `forward_email_subject` e `forward_email_body` em `company_occurrence_types`. O fallback de `contractor-reply-client-template.support.ts` (API e worker) ainda lê esse texto quando o tipo não tem modelo, então a remoção depende de decidir o que acontece com tipos sem modelo.
- Tabela `contractor_mail_templates` e as FKs que apontam para ela em `trip.schema.ts` e `contractor-mail.schema.ts`.
