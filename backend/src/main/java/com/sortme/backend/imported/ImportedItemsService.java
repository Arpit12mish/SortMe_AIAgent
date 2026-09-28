package com.sortme.backend.imported;

import com.sortme.backend.exception.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ImportedItemsService {

    private final ImportedDocumentRepository documentRepository;
    private final ImportedEmailRepository emailRepository;
    private final ImportedGitHubItemRepository githubItemRepository;

    @Transactional(readOnly = true)
    public List<ImportedItemDto> listAll(UUID userId) {
        List<ImportedItemDto> items = new ArrayList<>();
        documentRepository.findAllByUserId(userId).forEach(d -> items.add(ImportedItemDto.fromDocument(d)));
        emailRepository.findAllByUserId(userId).forEach(e -> items.add(ImportedItemDto.fromEmail(e)));
        githubItemRepository.findAllByUserId(userId).forEach(i -> items.add(ImportedItemDto.fromGitHubItem(i)));
        items.sort(Comparator.comparing(ImportedItemDto::timestamp, Comparator.nullsLast(Comparator.reverseOrder())));
        return items;
    }

    @Transactional
    public ImportedItemDto setIncluded(UUID userId, String compositeId, boolean included) {
        CompositeId id = CompositeId.parse(compositeId);
        return switch (id.type()) {
            case DOCUMENT -> {
                ImportedDocument d = documentRepository.findByIdAndUserId(id.rawId(), userId)
                    .orElseThrow(() -> new NotFoundException("Imported item not found"));
                d.setIncludedInPlanning(included);
                yield ImportedItemDto.fromDocument(documentRepository.save(d));
            }
            case EMAIL -> {
                ImportedEmail e = emailRepository.findByIdAndUserId(id.rawId(), userId)
                    .orElseThrow(() -> new NotFoundException("Imported item not found"));
                e.setIncludedInPlanning(included);
                yield ImportedItemDto.fromEmail(emailRepository.save(e));
            }
            case GITHUB_ITEM -> {
                ImportedGitHubItem i = githubItemRepository.findByIdAndUserId(id.rawId(), userId)
                    .orElseThrow(() -> new NotFoundException("Imported item not found"));
                i.setIncludedInPlanning(included);
                yield ImportedItemDto.fromGitHubItem(githubItemRepository.save(i));
            }
        };
    }

    @Transactional
    public void delete(UUID userId, String compositeId) {
        CompositeId id = CompositeId.parse(compositeId);
        switch (id.type()) {
            case DOCUMENT -> documentRepository.findByIdAndUserId(id.rawId(), userId)
                .ifPresentOrElse(documentRepository::delete, ImportedItemsService::notFound);
            case EMAIL -> emailRepository.findByIdAndUserId(id.rawId(), userId)
                .ifPresentOrElse(emailRepository::delete, ImportedItemsService::notFound);
            case GITHUB_ITEM -> githubItemRepository.findByIdAndUserId(id.rawId(), userId)
                .ifPresentOrElse(githubItemRepository::delete, ImportedItemsService::notFound);
        }
    }

    private static void notFound() {
        throw new NotFoundException("Imported item not found");
    }

    private record CompositeId(ImportedItemType type, UUID rawId) {
        static CompositeId parse(String composite) {
            int sep = composite.indexOf(':');
            if (sep < 0) throw new NotFoundException("Malformed imported item id");
            try {
                return new CompositeId(ImportedItemType.valueOf(composite.substring(0, sep)), UUID.fromString(composite.substring(sep + 1)));
            } catch (IllegalArgumentException e) {
                throw new NotFoundException("Malformed imported item id");
            }
        }
    }
}
