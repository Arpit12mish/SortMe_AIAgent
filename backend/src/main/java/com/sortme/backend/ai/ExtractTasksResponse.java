package com.sortme.backend.ai;

import java.util.List;

public record ExtractTasksResponse(List<ExtractedTaskDto> tasks) {
}
