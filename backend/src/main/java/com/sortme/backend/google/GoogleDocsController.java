package com.sortme.backend.google;

import com.sortme.backend.imported.ImportedItemDto;
import com.sortme.backend.security.CurrentUserContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/connections/google-docs")
@RequiredArgsConstructor
public class GoogleDocsController {

    private final GoogleDocsSyncService syncService;

    public record ImportRequest(@NotEmpty List<String> fileIds) {
    }

    /** Imports (or re-imports, for manual refresh) exactly the Drive file
     * ids the Picker returned -- never a broader listing. */
    @PostMapping("/import")
    public List<ImportedItemDto> importFiles(@Valid @RequestBody ImportRequest request) {
        return syncService.importSelectedFiles(CurrentUserContext.require(), request.fileIds()).stream()
            .map(ImportedItemDto::fromDocument)
            .toList();
    }
}
