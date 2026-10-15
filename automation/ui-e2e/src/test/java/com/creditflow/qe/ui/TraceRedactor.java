package com.creditflow.qe.ui;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import org.openqa.selenium.json.Json;

final class TraceRedactor {
  private TraceRedactor() {}

  private static boolean sensitive(String name) {
    String key = name.toLowerCase(Locale.ROOT);
    return key.contains("cookie")
        || key.contains("authorization")
        || key.contains("token")
        || key.contains("password")
        || key.contains("secret")
        || key.equals("creditflow_session");
  }

  static Object scrub(Object input) {
    if (input instanceof Map<?, ?> map) {
      Map<String, Object> output = new LinkedHashMap<>();
      boolean header = sensitive(String.valueOf(map.get("name")));
      for (var item : map.entrySet()) {
        String key = String.valueOf(item.getKey());
        output.put(
            key,
            key.equalsIgnoreCase("cookies")
                ? List.of()
                : sensitive(key) || (header && key.equals("value"))
                    ? "REDACTED"
                    : scrub(item.getValue()));
      }
      return output;
    }
    if (input instanceof List<?> list) return list.stream().map(TraceRedactor::scrub).toList();
    return input;
  }

  static void redact(Path raw, Path output, List<String> forbidden) throws IOException {
    Json json = new Json();
    try (ZipInputStream input = new ZipInputStream(Files.newInputStream(raw));
        ZipOutputStream target = new ZipOutputStream(Files.newOutputStream(output))) {
      ZipEntry entry;
      while ((entry = input.getNextEntry()) != null) {
        byte[] bytes = input.readAllBytes();
        if (entry.getName().endsWith(".trace") || entry.getName().endsWith(".network")) {
          StringBuilder content = new StringBuilder();
          for (String line : new String(bytes, StandardCharsets.UTF_8).split("\\R")) {
            if (!line.isBlank())
              content.append(json.toJson(scrub(json.toType(line, Map.class)))).append('\n');
          }
          bytes = content.toString().getBytes(StandardCharsets.UTF_8);
        }
        String text = new String(bytes, StandardCharsets.UTF_8);
        for (String secret : forbidden)
          if (!secret.isEmpty() && text.contains(secret))
            throw new IOException("Sensitive session value remained in trace; artifact rejected");
        target.putNextEntry(new ZipEntry(entry.getName()));
        target.write(bytes);
        target.closeEntry();
      }
    }
  }
}
