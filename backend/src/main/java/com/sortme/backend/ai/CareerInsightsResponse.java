package com.sortme.backend.ai;

import java.time.Instant;
import java.util.List;

public record CareerInsightsResponse(Instant generatedAt, List<CareerInsightDto> insights) {
}
