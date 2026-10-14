package com.creditflow.banking;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.*;

import io.restassured.response.Response;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;

class LedgerIT {
  static ConfigurableApplicationContext app;
  static String base;
  static JdbcTemplate db;
  String account;
  String token;

  @BeforeAll
  static void start() {
    app = SpringApplication.run(BankingApplication.class, "--server.port=0");
    base = "http://localhost:" + ((WebServerApplicationContext) app).getWebServer().getPort();
    db = app.getBean(JdbcTemplate.class);
  }

  @AfterAll
  static void stop() {
    if (app != null) app.close();
  }

  @BeforeEach
  void sandbox() {
    Response r =
        given().baseUri(base).post("/api/v1/sandboxes").then().statusCode(201).extract().response();
    account = r.path("accountId");
    token = r.path("token");
  }

  Response post(String route, String amount, String key) {
    return given()
        .baseUri(base)
        .auth()
        .oauth2(token)
        .contentType("application/json")
        .header("Idempotency-Key", key)
        .body(Map.of("amount", amount))
        .post("/api/v1/accounts/" + account + "/" + route);
  }

  String outstanding() {
    return given()
        .baseUri(base)
        .auth()
        .oauth2(token)
        .get("/api/v1/accounts/" + account)
        .then()
        .statusCode(200)
        .extract()
        .path("outstandingBalance");
  }

  @Test
  void persistsAndReconcilesRealLedger() {
    post("purchases", "100", "purchase").then().statusCode(201);
    post("payments", "50", "payment").then().statusCode(201);
    assertEquals("300.00", outstanding());
    BigDecimal ledger =
        db.queryForObject(
            "select initial_balance + coalesce((select sum(case when kind='PURCHASE' then amount else -amount end) from ledger_entries where account_id=?),0) from accounts where id=?",
            BigDecimal.class,
            UUID.fromString(account),
            UUID.fromString(account));
    assertEquals(new BigDecimal("300.00"), ledger);
    assertEquals(
        2,
        db.queryForObject(
            "select count(*) from ledger_entries where account_id=?",
            Integer.class,
            UUID.fromString(account)));
  }

  @Test
  void replayAfterOtherActivityReturnsOriginalReceipt() {
    String id = post("payments", "10", "original").then().statusCode(201).extract().path("id");
    post("purchases", "20", "later").then().statusCode(201);
    Response replay =
        post("payments", "10.00", "original").then().statusCode(200).extract().response();
    assertEquals(id, replay.path("id"));
    assertEquals("240.00", replay.path("balanceAfter"));
    assertEquals("true", replay.header("Idempotency-Replayed"));
    assertEquals("260.00", outstanding());
    post("payments", "11", "original").then().statusCode(409);
    post("purchases", "10", "original").then().statusCode(409);
  }

  @Test
  void concurrentPurchasesCannotOverspend() throws Exception {
    List<Integer> statuses = race(12, i -> post("purchases", "100", "parallel-" + i).statusCode());
    assertEquals(7, statuses.stream().filter(s -> s == 201).count());
    assertEquals(5, statuses.stream().filter(s -> s == 422).count());
    assertEquals("950.00", outstanding());
  }

  @Test
  void concurrentSameKeyPostsOnce() throws Exception {
    List<Integer> statuses = race(8, i -> post("payments", "1", "same").statusCode());
    assertEquals(1, statuses.stream().filter(s -> s == 201).count());
    assertEquals(7, statuses.stream().filter(s -> s == 200).count());
    assertEquals("249.00", outstanding());
  }

  @Test
  void failureDuringInsertRollsBackBalanceAndReturnsSafeError() {
    String suffix = account.replace("-", "");
    String fn = "fail_" + suffix;
    db.execute(
        "create function "
            + fn
            + "() returns trigger language plpgsql as $$ begin if NEW.account_id='"
            + account
            + "'::uuid then raise exception 'controlled database failure'; end if; return NEW; end $$");
    db.execute(
        "create trigger "
            + fn
            + " before insert on ledger_entries for each row execute function "
            + fn
            + "()");
    try {
      Response failed =
          post("payments", "10", "rollback").then().statusCode(500).extract().response();
      assertEquals("INTERNAL_ERROR", failed.path("code"));
      assertFalse(failed.asString().contains("controlled database failure"));
      assertEquals("250.00", outstanding());
      assertEquals(
          0,
          db.queryForObject(
              "select count(*) from ledger_entries where account_id=?",
              Integer.class,
              UUID.fromString(account)));
    } finally {
      db.execute("drop trigger " + fn + " on ledger_entries");
      db.execute("drop function " + fn + "()");
    }
    post("payments", "10", "rollback").then().statusCode(201);
  }

  @Test
  void ownershipExpiryAndInvalidInputAreEnforced() {
    given().baseUri(base).get("/api/v1/accounts/" + account).then().statusCode(401);
    given()
        .baseUri(base)
        .auth()
        .oauth2(token)
        .get("/api/v1/accounts/" + UUID.randomUUID())
        .then()
        .statusCode(404);
    given()
        .baseUri(base)
        .auth()
        .oauth2(token)
        .contentType("application/json")
        .header("Idempotency-Key", "bad")
        .body("{\"amount\":\"1\",\"unexpected\":true}")
        .post("/api/v1/accounts/" + account + "/payments")
        .then()
        .statusCode(400);
    db.update(
        "update accounts set expires_at=now()-interval '1 minute' where id=?",
        UUID.fromString(account));
    given()
        .baseUri(base)
        .auth()
        .oauth2(token)
        .get("/api/v1/accounts/" + account)
        .then()
        .statusCode(401);
  }

  @Test
  void foreignKeyAndBalanceConstraintsRejectCorruption() {
    assertThrows(
        org.springframework.dao.DataIntegrityViolationException.class,
        () ->
            db.update(
                "update accounts set outstanding_balance=credit_limit+1 where id=?",
                UUID.fromString(account)));
    assertEquals("250.00", outstanding());
    assertThrows(
        org.springframework.dao.DataIntegrityViolationException.class,
        () ->
            db.update(
                "insert into ledger_entries(id,account_id,kind,amount,balance_after,available_after,idempotency_key) values (?,?, 'PAYMENT',1,1,1,'orphan')",
                UUID.randomUUID(),
                UUID.randomUUID()));
  }

  @Test
  void paginationHasStableNonOverlappingPages() {
    for (int i = 0; i < 3; i++) post("payments", "1", "page-" + i).then().statusCode(201);
    Response first =
        given()
            .baseUri(base)
            .auth()
            .oauth2(token)
            .queryParam("limit", 2)
            .get("/api/v1/accounts/" + account + "/transactions")
            .then()
            .statusCode(200)
            .extract()
            .response();
    List<String> firstIds = first.jsonPath().getList("entries.id");
    assertEquals(2, firstIds.size());
    Number cursor = first.path("nextCursor");
    assertNotNull(cursor);
    Response next =
        given()
            .baseUri(base)
            .auth()
            .oauth2(token)
            .queryParam("limit", 2)
            .queryParam("before", cursor.longValue())
            .get("/api/v1/accounts/" + account + "/transactions")
            .then()
            .statusCode(200)
            .extract()
            .response();
    assertEquals(1, next.jsonPath().getList("entries").size());
    assertFalse(firstIds.contains(next.path("entries[0].id")));
    assertNull(next.path("nextCursor"));
  }

  @Test
  void protocolErrorsAndRequestLimitsAreStructured() {
    given()
        .baseUri(base)
        .contentType("application/json")
        .body("x".repeat(5000))
        .post("/api/v1/sandboxes")
        .then()
        .statusCode(413);
    given().baseUri(base).delete("/api/v1/sandboxes").then().statusCode(405);
    post("payments", "1", "invalid key").then().statusCode(400);
    assertEquals("250.00", outstanding());
  }

  @Test
  void sandboxRouteCannotBypassQuota() {
    try (ConfigurableApplicationContext limited =
        SpringApplication.run(
            BankingApplication.class, "--server.port=0", "--creditflow.sandbox-quota=1")) {
      String url =
          "http://localhost:" + ((WebServerApplicationContext) limited).getWebServer().getPort();
      given().baseUri(url).post("/api/v1/sandboxes").then().statusCode(201);
      given()
          .baseUri(url)
          .urlEncodingEnabled(false)
          .post("/api/v1/sandboxes;probe=1")
          .then()
          .statusCode(429);
    }
  }

  @Test
  void waitingMutationRechecksExpiryAfterLock() throws Exception {
    ExecutorService pool = Executors.newSingleThreadExecutor();
    try (java.sql.Connection guard = Objects.requireNonNull(db.getDataSource()).getConnection()) {
      guard.setAutoCommit(false);
      try (java.sql.PreparedStatement lock =
          guard.prepareStatement("select id from accounts where id=? for update")) {
        lock.setObject(1, UUID.fromString(account));
        lock.executeQuery().close();
      }
      Future<Response> waiting = pool.submit(() -> post("payments", "1", "expires-while-waiting"));
      try {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        boolean blocked = false;
        while (System.nanoTime() < deadline) {
          blocked =
              Boolean.TRUE.equals(
                  db.queryForObject(
                      "select exists(select 1 from pg_stat_activity where wait_event_type='Lock' and query like '%accounts%' and pid<>pg_backend_pid())",
                      Boolean.class));
          if (blocked) break;
          Thread.sleep(10);
        }
        assertTrue(blocked, "Mutation must be waiting for the held account lock");
        try (java.sql.PreparedStatement expire =
            guard.prepareStatement(
                "update accounts set expires_at=clock_timestamp()+interval '300 milliseconds' where id=?")) {
          expire.setObject(1, UUID.fromString(account));
          expire.executeUpdate();
        }
        // Hold until the database's own expiry condition becomes true, not a guessed client delay.
        try (java.sql.PreparedStatement expired =
            guard.prepareStatement(
                "select clock_timestamp()>=expires_at from accounts where id=?")) {
          expired.setObject(1, UUID.fromString(account));
          boolean elapsed = false;
          while (System.nanoTime() < deadline) {
            try (java.sql.ResultSet r = expired.executeQuery()) {
              r.next();
              elapsed = r.getBoolean(1);
            }
            if (elapsed) break;
            Thread.sleep(10);
          }
          assertTrue(elapsed, "Controlled expiry did not elapse");
        }
        guard.commit();
        assertEquals(401, waiting.get(20, TimeUnit.SECONDS).statusCode());
        assertEquals(
            new BigDecimal("250.00"),
            db.queryForObject(
                "select outstanding_balance from accounts where id=?",
                BigDecimal.class,
                UUID.fromString(account)));
      } finally {
        guard.rollback();
      }
    } finally {
      pool.shutdownNow();
    }
  }

  static List<Integer> race(int n, java.util.function.IntFunction<Integer> work) throws Exception {
    try (ExecutorService pool = Executors.newFixedThreadPool(n)) {
      CountDownLatch start = new CountDownLatch(1);
      List<Future<Integer>> futures = new ArrayList<>();
      for (int i = 0; i < n; i++) {
        final int j = i;
        futures.add(
            pool.submit(
                () -> {
                  start.await();
                  return work.apply(j);
                }));
      }
      start.countDown();
      List<Integer> statuses = new ArrayList<>();
      for (Future<Integer> f : futures) statuses.add(f.get(20, TimeUnit.SECONDS));
      return statuses;
    }
  }
}
