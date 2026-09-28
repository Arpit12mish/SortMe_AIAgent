package com.sortme.backend.google;

import com.sortme.backend.imported.ImportedItemDto;
import com.sortme.backend.security.CurrentUserContext;
import jakarta.validation.Valid;
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
}
