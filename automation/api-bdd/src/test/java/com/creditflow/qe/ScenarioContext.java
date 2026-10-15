package com.creditflow.qe;

import io.restassured.response.Response;
import java.util.*;

public final class ScenarioContext {
  final ApiClient client = new ApiClient();
  String accountId;
  String token;
  Response response;
  String originalReceipt;
  List<Integer> concurrentStatuses;
  List<Response> concurrentResponses;
  final Set<String> postedReceiptIds = new LinkedHashSet<>();
  String otherAccountId;
  String otherToken;

  String accountPath() {
    return "/api/v1/accounts/" + accountId;
  }
}
