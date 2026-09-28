package com.sortme.backend.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Exercises the real HTTP layer: device bootstrap, the bearer interceptor
 * rejecting missing/garbage tokens, and a valid session reaching a
 * protected endpoint. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class BearerAuthIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;

    private String issueSessionToken(String installId) throws Exception {
        String body = mockMvc.perform(post("/api/auth/device")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"installId\":\"" + installId + "\"}"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode json = objectMapper.readTree(body);
        return json.get("sessionToken").asText();
    }

    @Test
    void deviceAuthIsStableAcrossCallsForTheSameInstallId() throws Exception {
        String installId = "device-" + System.nanoTime();

        String firstBody = mockMvc.perform(post("/api/auth/device")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"installId\":\"" + installId + "\"}"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        String secondBody = mockMvc.perform(post("/api/auth/device")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"installId\":\"" + installId + "\"}"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        String firstUserId = objectMapper.readTree(firstBody).get("userId").asText();
        String secondUserId = objectMapper.readTree(secondBody).get("userId").asText();
        org.assertj.core.api.Assertions.assertThat(secondUserId).isEqualTo(firstUserId);
    }

    @Test
    void protectedRouteRejectsRequestsWithNoAuthorizationHeader() throws Exception {
        mockMvc.perform(get("/api/connections")).andExpect(status().isUnauthorized());
    }

    @Test
    void protectedRouteRejectsAGarbageBearerToken() throws Exception {
        mockMvc.perform(get("/api/connections").header("Authorization", "Bearer not-a-real-token"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void protectedRouteAcceptsAValidSessionAndReturnsAllProvidersAsDisconnected() throws Exception {
        String token = issueSessionToken("device-" + System.nanoTime());

        mockMvc.perform(get("/api/connections").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(3)))
            .andExpect(jsonPath("$[*].status", everyItem(is("DISCONNECTED"))));
    }
}
