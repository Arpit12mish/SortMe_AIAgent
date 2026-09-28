package com.sortme.backend.google;

/** Scopes requested per independently-connectable Google feature. Each set
 * includes `openid email` only to label which account is connected --
 * never anything broader than the feature needs. */
public final class GoogleScopes {
    public static final String DOCS = "openid email https://www.googleapis.com/auth/drive.file";
    public static final String GMAIL = "openid email https://www.googleapis.com/auth/gmail.readonly";

    private GoogleScopes() {
    }
}
