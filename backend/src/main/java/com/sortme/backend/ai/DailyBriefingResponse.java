package com.sortme.backend.ai;

import java.util.List;

public record DailyBriefingResponse(
    String summary,
    List<BriefingTaskSuggestion> tasks,
    List<BriefingInterviewSuggestion> interviews,
    List<String> uncertainties
) {
}
