package com.creditflow.qe;

import io.restassured.response.Response;
import java.util.List;

public final class ScenarioContext {
  final ApiClient client = new ApiClient();
  String accountId;
  String token;
  Response response;
  String originalReceipt;
  List<Integer> concurrentStatuses;

  String accountPath() {
    return "/api/v1/accounts/" + accountId;
  }
}
