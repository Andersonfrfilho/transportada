<#-- Copyright (c) 2026 Ada Technology. MIT License. -->
<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password'); section>
    <#if section = "header">
        ${msg("loginAccountTitle")}
    <#elseif section = "form">
        <p class="panel-description">${msg("transportadaLoginDescription")}</p>
        <#if realm.password>
            <form id="kc-form-login" action="${url.loginAction}" method="post" onsubmit="login.disabled = true; return true;">
                <#if !usernameHidden??>
                    <label class="field" for="username">
                        <span class="field-label"><#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if></span>
                        <input autocomplete="username" autofocus class="field-input" dir="ltr" id="username" name="username"
                               type="text" value="${(login.username!'')}"
                               aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>" />
                    </label>
                </#if>

                <label class="field" for="password">
                    <span class="field-label">${msg("password")}</span>
                    <input autocomplete="current-password" class="field-input" dir="ltr" id="password" name="password"
                           type="password"
                           aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>" />
                </label>

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
