package com.creditflow.banking;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.zaxxer.hikari.HikariDataSource;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;

class HealthAvailabilityIT {
  static ConfigurableApplicationContext app;
  static String base;
  static final String serverKey = UUID.randomUUID().toString();

  @BeforeAll
  static void startWithoutReachableDatabase() throws Exception {
    int unavailablePort;
    try (ServerSocket reservation = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
      unavailablePort = reservation.getLocalPort();
    }
    // Only this test application's JDBC target is unavailable; no database is interrupted.
    app =
        new SpringApplication(BankingApplication.class, UnavailablePostgres.class)
            .run(
                "--server.port=0",
                "--creditflow.public-mode=true",
                "--creditflow.provision-key=" + serverKey,
                "--creditflow.test-unavailable-port=" + unavailablePort,
                "--spring.flyway.enabled=false",
                "--spring.datasource.hikari.initialization-fail-timeout=-1",
                "--spring.datasource.hikari.connection-timeout=500",
                "--spring.datasource.hikari.validation-timeout=250");
    base = "http://localhost:" + ((WebServerApplicationContext) app).getWebServer().getPort();
  }

  @AfterAll
  static void stop() {
    if (app != null) app.close();
  }

  @Test
  void livenessRemainsUpWithoutDatabase() {
    given()
        .baseUri(base)
        .get("/actuator/health/liveness")
        .then()
        .statusCode(200)
        .body("status", equalTo("UP"));
  }

  @Test
  void databaseBackedProbesRequireServerAccess() {
    given().baseUri(base).get("/actuator/health").then().statusCode(403);
    given().baseUri(base).get("/actuator/health/readiness").then().statusCode(403);
  }

  @Test
  void readinessReportsUnavailableDatabase() {
    assertThrows(
        SQLException.class,
        () -> {
          try (Connection ignored = app.getBean(HikariDataSource.class).getConnection()) {
            // A successful connection would invalidate this controlled outage fixture.
          }
        });
    given()
        .baseUri(base)
        .header("X-Sandbox-Provision-Key", serverKey)
        .get("/actuator/health/readiness")
        .then()
        .statusCode(503)
        .body("status", equalTo("DOWN"));
    given()
        .baseUri(base)
        .header("X-Sandbox-Provision-Key", serverKey)
        .get("/actuator/health")
        .then()
        .statusCode(503)
        .body("status", equalTo("DOWN"));
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class UnavailablePostgres {
    @Bean
    @ConfigurationProperties("spring.datasource.hikari")
    HikariDataSource unavailableDataSource(Environment environment) {
      PGSimpleDataSource postgres = new PGSimpleDataSource();
      postgres.setServerNames(new String[] {"127.0.0.1"});
      postgres.setPortNumbers(
          new int[] {
            environment.getRequiredProperty("creditflow.test-unavailable-port", int.class)
          });
      postgres.setDatabaseName("creditflow_unavailable_health_fixture");
      postgres.setConnectTimeout(1);
      postgres.setSocketTimeout(1);
      HikariDataSource pool = new HikariDataSource();
      pool.setDataSource(postgres);
      return pool;
    }
  }
}
