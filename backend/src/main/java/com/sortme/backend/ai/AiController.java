package com.sortme.backend.ai;

import com.sortme.backend.google.GmailReplyService;
import com.sortme.backend.google.NeedsReplyThreadDto;
import com.sortme.backend.security.CurrentUserContext;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
@Validated
public class AiController {

    private final StudyQuestionAiService studyQuestionAiService;
    private final EmailTaskExtractionAiService emailTaskExtractionAiService;
    private final InterviewPrepAiService interviewPrepAiService;
    private final GmailReplyService gmailReplyService;
    private final GmailReplyAiService gmailReplyAiService;
    private final CareerInsightAiService careerInsightAiService;
    private final AudioTranscriptionService audioTranscriptionService;
    private final DailyBriefingAiService dailyBriefingAiService;

    /** The transcript this returns is unreviewed by design -- the mobile
     * client must show it for the user to edit/confirm before any other
     * endpoint ever sees it (see DailyBriefingAiService). Requires an
     * authenticated session like every other /api/ai endpoint, but doesn't
     * otherwise read or store anything per-user. */
    @PostMapping(value = "/voice/transcribe", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public TranscriptionResponse transcribeAudio(@RequestParam("audio") MultipartFile audio) {
        CurrentUserContext.require();
        return audioTranscriptionService.transcribe(audio);
    }

    public record DailyBriefingRequest(String transcript, boolean includeGmail, boolean includeDocs) {
    }

    /** `transcript` must already be the user's own reviewed/edited text --
     * this endpoint only ever returns suggestions for the mobile client to
     * show on its own review screen; nothing here creates a task, an
     * interview, or touches the accepted plan. */
    @PostMapping("/voice/daily-briefing")
    public DailyBriefingResponse dailyBriefing(@RequestBody DailyBriefingRequest request) {
        return dailyBriefingAiService.analyze(
            CurrentUserContext.require(), request.transcript(), request.includeGmail(), request.includeDocs()
        );
    }

    @PostMapping("/documents/{importedDocumentId}/questions")
    public GenerateQuestionsResponse generateQuestions(
        @PathVariable UUID importedDocumentId,
        @RequestParam(defaultValue = "8") @Min(1) @Max(20) int count
    ) {
        return studyQuestionAiService.generateQuestions(CurrentUserContext.require(), importedDocumentId, count);
    }

    @PostMapping("/gmail/extract-tasks")
    public ExtractTasksResponse extractTasks() {
        return emailTaskExtractionAiService.extractTasks(CurrentUserContext.require());
    }

    public record PrepPrioritiesRequest(String context) {
    }

    @PostMapping("/prep-priorities")
    public PrepPrioritiesResponse prepPriorities(@RequestBody(required = false) PrepPrioritiesRequest request) {
        String extraContext = request != null ? request.context() : null;
        return interviewPrepAiService.prioritize(CurrentUserContext.require(), extraContext);
    }

    @GetMapping("/gmail/needs-reply")
    public List<NeedsReplyThreadDto> needsReply() {
        return gmailReplyService.listNeedsReply(CurrentUserContext.require());
    }

    @PostMapping("/gmail/needs-reply/{threadId}/draft")
    public DraftReplyDto draftReply(@PathVariable String threadId) {
        return gmailReplyAiService.draftReply(CurrentUserContext.require(), threadId);
    }

    @PostMapping("/career-insights")
    public CareerInsightsResponse careerInsights() {
        return careerInsightAiService.getWeeklyInsights(CurrentUserContext.require());
    }
}
