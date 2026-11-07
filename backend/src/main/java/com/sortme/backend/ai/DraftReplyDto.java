package com.sortme.backend.ai;

/** `to` is derived server-side from the thread's correspondent, never
 * taken from the model -- the client can't be tricked into sending
 * somewhere Gemini hallucinated. */
public record DraftReplyDto(String to, String subject, String body) {
}
