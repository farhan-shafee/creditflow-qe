package com.creditflow.banking.domain;

public final class DomainException extends RuntimeException {
  private static final long serialVersionUID = 1L;
  private final String code;
  private final int status;

  public DomainException(String code, int status, String message) {
    super(message);
    this.code = code;
    this.status = status;
  }

  public String code() {
    return code;
  }

  public int status() {
    return status;
  }
}
