package com.sortme.backend.imported;

import com.sortme.backend.security.CurrentUserContext;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/imported-items")
@RequiredArgsConstructor
public class ImportedItemsController {

    private final ImportedItemsService service;

    public record SetIncludedRequest(boolean includedInPlanning) {
    }

    @GetMapping
    public List<ImportedItemDto> list() {
        return service.listAll(CurrentUserContext.require());
    }

    @PatchMapping("/{id}")
    public ImportedItemDto setIncluded(@PathVariable String id, @Valid @RequestBody SetIncludedRequest request) {
        return service.setIncluded(CurrentUserContext.require(), id, request.includedInPlanning());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(CurrentUserContext.require(), id);
        return ResponseEntity.noContent().build();
    }
}
