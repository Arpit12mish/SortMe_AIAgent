package com.sortme.backend.ai;

/** `transcript` is the raw, unreviewed transcription -- the mobile client
 * must show this for the user to edit/confirm before it is ever used to
 * extract tasks or propose a plan (see DailyBriefingAiService). */
public record TranscriptionResponse(String transcript) {
}
