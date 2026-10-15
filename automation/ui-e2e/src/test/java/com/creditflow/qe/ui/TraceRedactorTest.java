package com.creditflow.qe.ui;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;

class TraceRedactorTest {
  @Test
  void stripsCookieAndAuthorizationValuesRecursively() {
    Map<String, Object> input =
        new LinkedHashMap<>(
            Map.of(
                "headers",
                List.of(
                    new LinkedHashMap<>(Map.of("name", "Cookie", "value", "secret-cookie")),
                    new LinkedHashMap<>(Map.of("name", "Authorization", "value", "Bearer secret"))),
                "cookies",
                List.of(Map.of("value", "secret")),
                "status",
                200));
    Object result = TraceRedactor.scrub(input);
    String json = new org.openqa.selenium.json.Json().toJson(result);
    assertFalse(json.contains("secret"));
    assertTrue(json.contains("REDACTED"));
    assertTrue(json.contains("200"));
  }
}
