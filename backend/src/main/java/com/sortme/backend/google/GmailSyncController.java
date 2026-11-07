package com.sortme.backend.google;

import com.sortme.backend.imported.ImportedItemDto;
import com.sortme.backend.security.CurrentUserContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/connections/gmail")
@RequiredArgsConstructor
public class GmailSyncController {

    private final GoogleGmailSyncService syncService;
    private final GmailSendService sendService;

    public record SyncRequest(
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        String searchTerms
    ) {
    }

    /** `from`/`to` bound the search; `searchTerms` is free text ANDed in
     * (e.g. "interview OR deadline"). Returns candidate emails for the user
     * to review -- nothing here becomes a planner task automatically. */
    @PostMapping("/sync")
    public List<ImportedItemDto> sync(@Valid @RequestBody SyncRequest request) {
        var result = syncService.sync(
            CurrentUserContext.require(),
            new GoogleGmailSyncService.SyncRequest(request.from(), request.to(), request.searchTerms())
        );
        return result.stream().map(ImportedItemDto::fromEmail).toList();
    }

    public record SendReplyRequest(
        @NotBlank String threadId,
        @NotBlank String to,
        @NotBlank String subject,
        @NotBlank String body
    ) {
    }

    /** Sends a reply the user has already reviewed and approved client-side
     * -- this endpoint does not itself ask for confirmation, the caller
     * must have already gotten it. Requires the Gmail connection to carry
     * the gmail.send scope (see GoogleScopes); otherwise fails with
     * requiresReconnect=true. */
    @PostMapping("/send")
    public GmailSendService.SendReplyResponse send(@Valid @RequestBody SendReplyRequest request) {
        return sendService.sendReply(
            CurrentUserContext.require(),
            new GmailSendService.SendReplyRequest(request.threadId(), request.to(), request.subject(), request.body())
        );
    }
}
