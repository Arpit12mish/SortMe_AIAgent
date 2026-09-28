package com.sortme.backend.imported;

import java.time.Instant;

/** Normalized shape for the unified Imported Items view -- deliberately
 * separate from the planner's Task/PlanBlock model (see AsyncStorage
 * repositories on the mobile side): an imported item is raw, untrusted
 * source material the user can choose to bring into planning, never a
 * planner task by itself. `sourceId` (the Drive file id / Gmail message id
 * / "owner/repo#n") is included so the client can request a manual refresh
 * of a specific item without re-running the whole picker/search flow. */
public record ImportedItemDto(
    String id,
    ImportedItemType type,
    String source,
    String sourceId,
    String title,
    String link,
    Instant timestamp,
    SyncStatus syncStatus,
    boolean includedInPlanning,
    String preview
) {
    public static String compositeId(ImportedItemType type, java.util.UUID rawId) {
        return type.name() + ":" + rawId;
    }

    public static ImportedItemDto fromDocument(ImportedDocument d) {
        String preview = d.getContentText() != null
            ? d.getContentText().substring(0, Math.min(280, d.getContentText().length()))
            : null;
        return new ImportedItemDto(
            compositeId(ImportedItemType.DOCUMENT, d.getId()), ImportedItemType.DOCUMENT, "GOOGLE_DOCS", d.getSourceId(),
            d.getTitle(), d.getSourceLink(), d.getModifiedTime(), d.getSyncStatus(), d.isIncludedInPlanning(), preview
        );
    }

    public static ImportedItemDto fromEmail(ImportedEmail e) {
        String preview = e.getBodyText() != null
            ? e.getBodyText().substring(0, Math.min(280, e.getBodyText().length()))
            : e.getSnippet();
        // Best-effort deep link into Gmail's web UI; not an official stable
        // API but works for the default account (index 0) in practice.
        String link = e.getThreadId() != null ? "https://mail.google.com/mail/u/0/#all/" + e.getThreadId() : null;
        return new ImportedItemDto(
            compositeId(ImportedItemType.EMAIL, e.getId()), ImportedItemType.EMAIL, "GOOGLE_GMAIL", e.getSourceId(),
            e.getSubject(), link, e.getReceivedAt(), e.getSyncStatus(), e.isIncludedInPlanning(), preview
        );
    }

    public static ImportedItemDto fromGitHubItem(ImportedGitHubItem i) {
        String preview = i.getRepoFullName() + " · " + i.getItemType() + " · " + i.getState();
        return new ImportedItemDto(
            compositeId(ImportedItemType.GITHUB_ITEM, i.getId()), ImportedItemType.GITHUB_ITEM, "GITHUB", i.getSourceId(),
            i.getTitle(), i.getUrl(), i.getGithubUpdatedAt(), i.getSyncStatus(), i.isIncludedInPlanning(), preview
        );
    }
}
