/*
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Este arquivo existe para NÃO fazer nada. As páginas herdadas do `base` (troca de senha, entre
 * outras) terminam o formulário com `<script src="${url.resourcesPath}/js/passwordVisibility.js">`,
 * e o `resourcesPath` resolve primeiro no nosso tema. Sem esta cópia vazia o script do `base` é
 * servido, ele também liga `[data-password-toggle]`, e os dois alternam o campo no mesmo clique:
 * o `type` volta para `password` no mesmo instante em que o nosso marca `aria-pressed="true"` — o
 * olho passa a mentir e a senha nunca aparece.
 *
 * Quem alterna é `password-visibility.js`, carregado em toda página pelo `theme.properties`.
 */
