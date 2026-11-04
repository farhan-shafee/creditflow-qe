package com.creditflow.qe.ui;

import static org.junit.jupiter.api.Assertions.*;

import com.microsoft.playwright.options.Cookie;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class TraceRedactorTest {
  @TempDir Path folder;

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

  @Test
  void collectsBothBankingAndLabSessionSecrets() {
    List<String> secrets =
        TraceRedactor.sessionSecrets(
            List.of(
                new Cookie("creditflow_session", "banking-value"),
                new Cookie("creditflow_lab_session", "lab-value"),
                new Cookie("unrelated", "other-value")));
    assertEquals(List.of("banking-value", "lab-value"), secrets);
    String scrubbed =
        new org.openqa.selenium.json.Json()
            .toJson(
                TraceRedactor.scrub(
                    Map.of(
                        "creditflow_session",
                        "banking-value",
                        "creditflow_lab_session",
                        "lab-value")));
    assertFalse(scrubbed.contains("banking-value"));
    assertFalse(scrubbed.contains("lab-value"));
  }

  @Test
  void rejectsUnstructuredResourcesContainingEitherSessionSecret() throws Exception {
    for (String secret : List.of("banking-value", "lab-value")) {
      Path raw = folder.resolve(secret + "-raw.zip");
      try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(raw))) {
        zip.putNextEntry(new ZipEntry("resources/unstructured.txt"));
        zip.write(
            ("Unstructured resource: " + secret).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        zip.closeEntry();
      }
      assertThrows(
          IOException.class,
          () ->
              TraceRedactor.redact(
                  raw,
                  folder.resolve(secret + "-redacted.zip"),
                  List.of("banking-value", "lab-value")));
    }
  }

  @Test
  void redactsEveryRecordInMultilineTraceAndNetworkFiles() throws Exception {
    Path raw = folder.resolve("multiline-raw.zip");
    String records =
        "{\"status\":200}\n"
            + "{\"headers\":[{\"name\":\"Cookie\",\"value\":\"creditflow_lab_session=lab-value\"}]}\n";
    try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(raw))) {
      for (String name : List.of("trace.trace", "trace.network")) {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(records.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        zip.closeEntry();
      }
    }
    Path redacted = folder.resolve("multiline-redacted.zip");
    TraceRedactor.redact(raw, redacted, List.of("lab-value"));
    try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(redacted))) {
      int entries = 0;
      while (zip.getNextEntry() != null) {
        String content = new String(zip.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        assertEquals(2, content.lines().count());
        assertTrue(content.contains("REDACTED"));
        assertTrue(content.contains("200"));
        assertFalse(content.contains("lab-value"));
        entries++;
      }
      assertEquals(2, entries);
    }
  }
}
