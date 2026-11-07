package com.sortme.backend.ai;

/** `dateTimeUncertain` is true whenever the date or time is missing or was
 * flagged ambiguous -- the mobile client must ask the user to confirm
 * before this becomes a real InterviewEntry with an interviewDate. */
public record BriefingInterviewSuggestion(
    String company,
    String role,
    String interviewerName,
    String date,
    String time,
    String timezone,
    boolean dateTimeUncertain,
    String meetingLinkOrLocation,
    String sourceEmailSubject
) {
}
