package com.creditflow.banking.web;

import com.creditflow.banking.domain.DomainException;
import com.creditflow.banking.ledger.ApiModels.ApiError;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.*;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class ApiErrors {
  private static final Logger LOG = LoggerFactory.getLogger(ApiErrors.class);

  @ExceptionHandler(DomainException.class)
  ResponseEntity<ApiError> domain(DomainException e, HttpServletRequest request) {
    return error(e.status(), e.code(), e.getMessage(), request);
  }

  @ExceptionHandler({
    HttpMessageNotReadableException.class,
    MethodArgumentTypeMismatchException.class
  })
  ResponseEntity<ApiError> invalid(Exception e, HttpServletRequest request) {
    return error(400, "INVALID_BODY", "Malformed request", request);
  }

  @ExceptionHandler(NoResourceFoundException.class)
  ResponseEntity<ApiError> missing(Exception e, HttpServletRequest request) {
    return error(404, "NOT_FOUND", "Resource not found", request);
  }

  @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
  ResponseEntity<ApiError> method(Exception e, HttpServletRequest request) {
    return error(405, "METHOD_NOT_ALLOWED", "HTTP method not allowed", request);
  }

  @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
  ResponseEntity<ApiError> media(Exception e, HttpServletRequest request) {
    return error(415, "UNSUPPORTED_MEDIA_TYPE", "Use application/json", request);
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<ApiError> unexpected(Exception e, HttpServletRequest request) {
    // Do not log exception messages or SQL parameter values; they can contain request data.
    LOG.error(
        "request_failed type={} requestId={}", e.getClass().getSimpleName(), requestId(request));
    return error(500, "INTERNAL_ERROR", "Request could not be completed", request);
  }

  static ResponseEntity<ApiError> error(
      int status, String code, String message, HttpServletRequest request) {
    return ResponseEntity.status(status)
        .body(new ApiError(code, message, requestId(request), Instant.now()));
  }

  static String requestId(HttpServletRequest request) {
    Object id = request.getAttribute("creditflow.requestId");
    if (id == null) {
      id = UUID.randomUUID().toString();
      request.setAttribute("creditflow.requestId", id);
    }
    return id.toString();
  }
}
