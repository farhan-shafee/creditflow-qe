package com.creditflow.banking.web;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public final class RequestControls extends OncePerRequestFilter {
  private final boolean publicMode;
  private final byte[] provisionKey;
  private final RequestBudget budget;

  public RequestControls(
      @Value("${creditflow.public-mode:false}") boolean publicMode,
      @Value("${creditflow.provision-key:}") String provisionKey,
      @Value("${creditflow.request-quota:300}") int quota) {
    if (publicMode && provisionKey.length() < 32)
      throw new IllegalArgumentException("Public mode requires a strong server key");
    this.publicMode = publicMode;
    this.provisionKey = provisionKey.getBytes(StandardCharsets.UTF_8);
    this.budget = new RequestBudget(quota, Duration.ofMinutes(1), Clock.systemUTC());
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    response.setHeader("X-Request-Id", ApiErrors.requestId(request));
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    boolean metadata =
        request.getMethod().equals("GET")
            && (request.getRequestURI().equals("/actuator/health/liveness")
                || request.getRequestURI().equals("/openapi.yaml"));
    if (publicMode && !metadata) {
      String supplied = request.getHeader("X-Sandbox-Provision-Key");
      if (supplied == null
          || !MessageDigest.isEqual(provisionKey, supplied.getBytes(StandardCharsets.UTF_8))) {
        reject(request, response, 403, "SERVER_ACCESS_REQUIRED");
        return;
      }
      if (!budget.acquire(request.getRemoteAddr())) {
        reject(request, response, 429, "RATE_LIMITED");
        return;
      }
    }
    if (request.getContentLengthLong() > 4096) {
      reject(request, response, 413, "REQUEST_TOO_LARGE");
      return;
    }
    if (request.getMethod().equals("POST")) {
      byte[] body = request.getInputStream().readNBytes(4097);
      if (body.length > 4096) {
        reject(request, response, 413, "REQUEST_TOO_LARGE");
        return;
      }
      request = new BoundedBodyRequest(request, body);
    }
    chain.doFilter(request, response);
  }

  private static void reject(
      HttpServletRequest request, HttpServletResponse response, int status, String code)
      throws IOException {
    response.setStatus(status);
    response.setContentType("application/json");
    response
        .getWriter()
        .write(
            "{\"code\":\""
                + code
                + "\",\"message\":\"Request limit exceeded\",\"requestId\":\""
                + ApiErrors.requestId(request)
                + "\",\"timestamp\":\""
                + Instant.now()
                + "\"}");
  }

  private static final class BoundedBodyRequest extends HttpServletRequestWrapper {
    private final byte[] body;

    BoundedBodyRequest(HttpServletRequest request, byte[] body) {
      super(request);
      this.body = body;
    }

    @Override
    public ServletInputStream getInputStream() {
      ByteArrayInputStream input = new ByteArrayInputStream(body);
      return new ServletInputStream() {
        @Override
        public int read() {
          return input.read();
        }

        @Override
        public boolean isFinished() {
          return input.available() == 0;
        }

        @Override
        public boolean isReady() {
          return true;
        }

        @Override
        public void setReadListener(ReadListener listener) {
          throw new UnsupportedOperationException("Synchronous bounded JSON request");
        }
      };
    }
  }
}
