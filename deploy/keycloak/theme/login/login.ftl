<#-- Copyright (c) 2026 Ada Technology. MIT License. -->
<#import "template.ftl" as layout>
<#assign identifiedUsername = (login.username)!''>
<#assign applicationOrigin = properties.applicationOrigin!''>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password'); section>
    <#if section = "header">
        ${msg("loginAccountTitle")}
    <#elseif section = "form">
        <p class="panel-description">${msg("transportadaLoginDescription")}</p>
        <#if realm.password>
            <form id="kc-form-login" action="${url.loginAction}" method="post" onsubmit="login.disabled = true; return true;">
                <#if !usernameHidden??>
                    <#-- Username preenchido é quem a tela do app já identificou (`login_hint`), ou o
                         que acabou de ser enviado e voltou com erro: perguntar de novo seria pedir o
                         username num campo que não aceita o CPF ou o telefone digitado lá. -->
                    <#if identifiedUsername?has_content>
                        <div class="field identified-user">
                            <span class="field-label">${msg("transportadaIdentifiedAs")}</span>
                            <strong class="identified-user-name" dir="ltr">${identifiedUsername}</strong>
                            <#-- O script resolve a origem pelo `redirect_uri` da requisição de login
                                 sempre que ele existir — é o app de onde a pessoa veio, e nem sempre é
                                 o painel. `applicationOrigin` (a variável do deploy) só entra como
                                 `data-fallback-origin`, para quando não houver `redirect_uri` a ler;
                                 sem a variável no deploy o valor é o literal `${env.…}`, por isso o
                                 `<#if>` testa `http`. -->
                            <a class="panel-link" data-identity-restart hidden href="#"
                               <#if applicationOrigin?starts_with("http")>data-fallback-origin="${applicationOrigin}"</#if>>${msg("transportadaNotYou")}</a>
                        </div>
                        <input id="username" name="username" type="hidden" value="${identifiedUsername}" />
                    <#else>
                        <label class="field" for="username">
                            <span class="field-label"><#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if></span>
                            <input autocomplete="username" autofocus class="field-input" dir="ltr" id="username" name="username"
                                   type="text" value=""
                                   aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>" />
                        </label>
                    </#if>
                </#if>

                <#-- Aqui o rótulo é irmão do campo, não o envolve: o botão do olho é conteúdo
                     interativo, e dentro de um `label` o clique nele também alcançaria o campo. -->
                <div class="field">
                    <label class="field-label" for="password">${msg("password")}</label>
                    <span class="field-control">
                        <input autocomplete="current-password" <#if identifiedUsername?has_content>autofocus </#if>class="field-input" dir="ltr" id="password" name="password"
                               type="password"
                               aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>" />
                        <button aria-controls="password" aria-label="${msg("showPassword")}" aria-pressed="false"
                                class="field-reveal" data-label-hide="${msg("hidePassword")}"
                                data-label-show="${msg("showPassword")}" data-password-toggle hidden type="button">
                            <svg aria-hidden="true" data-icon="show" fill="none" stroke="currentColor" stroke-width="1.6"
                                 viewBox="0 0 24 24">
                                <path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                            <svg aria-hidden="true" data-icon="hide" fill="none" stroke="currentColor" stroke-width="1.6"
                                 viewBox="0 0 24 24">
                                <path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Z" />
                                <circle cx="12" cy="12" r="3" />
                                <path d="m3 3 18 18" />
                            </svg>
                        </button>
                    </span>
                </div>

                <#if messagesPerField.existsError('username','password')>
                    <p class="field-error" id="input-error" role="alert">
                        ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
                    </p>
                </#if>

                <#if realm.rememberMe && !usernameHidden??>
                    <label class="field-inline" for="rememberMe">
                        <input id="rememberMe" name="rememberMe" type="checkbox" <#if login.rememberMe??>checked</#if> />
                        <span>${msg("rememberMe")}</span>
                    </label>
                </#if>

                <input id="id-hidden-input" name="credentialId" type="hidden"
                       <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if> />
                <button class="action action-primary" id="kc-login" name="login" type="submit">${msg("doLogIn")}</button>

                <#-- O link aponta para a nossa tela de recuperação, servida pelo frontend; o script
                     resolve a origem pelo `redirect_uri` e só então revela o link. -->
                <a class="panel-link" data-password-reset hidden href="#">${msg("transportadaPasswordReset")}</a>

                <#if realm.resetPasswordAllowed>
                    <a class="panel-link" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
                </#if>
            </form>
        </#if>
    </#if>
</@layout.registrationLayout>
