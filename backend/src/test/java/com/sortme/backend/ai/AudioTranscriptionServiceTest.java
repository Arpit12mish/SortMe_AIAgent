package com.sortme.backend.ai;

import com.sortme.backend.exception.ValidationException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class AudioTranscriptionServiceTest {

    @Autowired
    private AudioTranscriptionService service;

    @MockBean
    private GeminiClient geminiClient;

    private MultipartFile audioFile(String contentType, byte[] bytes) {
        return new MockMultipartFile("audio", "recording.m4a", contentType, bytes);
    }

    @Test
    void transcribesAndReturnsTheVerbatimTranscript() {
        when(geminiClient.generateStructuredFromAudio(any(), any(), any(), eq("audio/m4a"), any(), eq(AudioTranscriptionService.TranscriptionPayload.class)))
            .thenReturn(new AudioTranscriptionService.TranscriptionPayload(
                "Tomorrow I have an interview at 2 PM, I need to prepare system design and do some DSA."));

        TranscriptionResponse response = service.transcribe(audioFile("audio/m4a", "fake-audio-bytes".getBytes()));

        assertThat(response.transcript()).isEqualTo("Tomorrow I have an interview at 2 PM, I need to prepare system design and do some DSA.");
    }

    @Test
    void normalizesACodecsSuffixOnTheContentTypeBeforeCallingGemini() {
        when(geminiClient.generateStructuredFromAudio(any(), any(), any(), eq("audio/mp4"), any(), any()))
            .thenReturn(new AudioTranscriptionService.TranscriptionPayload("hello"));

        service.transcribe(audioFile("audio/mp4;codecs=mp4a.40.2", "fake-audio-bytes".getBytes()));

        verify(geminiClient).generateStructuredFromAudio(any(), any(), any(), eq("audio/mp4"), any(), any());
    }

    @Test
    void anEmptyTranscriptFromGeminiIsReturnedAsIsNotAnError() {
        when(geminiClient.generateStructuredFromAudio(any(), any(), any(), any(), any(), eq(AudioTranscriptionService.TranscriptionPayload.class)))
            .thenReturn(new AudioTranscriptionService.TranscriptionPayload(""));

        TranscriptionResponse response = service.transcribe(audioFile("audio/m4a", "silence".getBytes()));

        assertThat(response.transcript()).isEmpty();
    }

    @Test
    void rejectsEmptyAudioWithoutCallingGemini() {
        MultipartFile empty = new MockMultipartFile("audio", "recording.m4a", "audio/m4a", new byte[0]);

        assertThatThrownBy(() -> service.transcribe(empty)).isInstanceOf(ValidationException.class);
        verifyNoInteractions(geminiClient);
    }

    @Test
    void rejectsOversizedAudioWithoutCallingGemini() {
        byte[] tooBig = new byte[16 * 1024 * 1024]; // over the 15MB cap
        MultipartFile oversized = audioFile("audio/m4a", tooBig);

        assertThatThrownBy(() -> service.transcribe(oversized)).isInstanceOf(ValidationException.class);
        verifyNoInteractions(geminiClient);
    }

    @Test
    void rejectsAnUnsupportedMimeTypeWithoutCallingGemini() {
        MultipartFile unsupported = audioFile("video/mp4", "not audio".getBytes());

        assertThatThrownBy(() -> service.transcribe(unsupported)).isInstanceOf(ValidationException.class);
        verify(geminiClient, never()).generateStructuredFromAudio(any(), any(), any(), any(), any(), any());
    }

    @Test
    void rejectsANullFileWithoutCallingGemini() {
        assertThatThrownBy(() -> service.transcribe(null)).isInstanceOf(ValidationException.class);
        verifyNoInteractions(geminiClient);
    }
}
