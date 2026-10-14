package com.creditflow.banking.ledger;

import static com.creditflow.banking.ledger.ApiModels.*;

import com.creditflow.banking.domain.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LedgerService {
  private final JdbcTemplate db;
  private final SecureRandom random = new SecureRandom();

  public LedgerService(JdbcTemplate db) {
    this.db = db;
  }

  @Transactional
  public Sandbox createSandbox() {
    db.execute("select pg_advisory_xact_lock(746391420)");
    db.update("delete from accounts where expires_at < now()");
    Integer count = db.queryForObject("select count(*) from accounts", Integer.class);
    if (count != null && count >= 10000)
      throw new DomainException("SANDBOX_CAPACITY", 429, "Sandbox capacity reached; try later");
    byte[] secret = new byte[32];
    random.nextBytes(secret);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(secret);
    UUID id = UUID.randomUUID();
    Instant expires = Instant.now().plusSeconds(1800);
    db.update(
        "insert into accounts(id,token_hash,credit_limit,initial_balance,outstanding_balance,expires_at) values (?,?,1000.00,250.00,250.00,?)",
        id,
        hash(token),
        java.sql.Timestamp.from(expires));
    return new Sandbox(id, token, expires);
  }

  private String authenticate(String header) {
    if (header == null || !header.matches("Bearer [A-Za-z0-9_-]{43}")) throw unauthorized();
    String digest = hash(header.substring(7));
    Integer count =
        db.queryForObject(
            "select count(*) from accounts where token_hash=? and expires_at>clock_timestamp()",
            Integer.class,
            digest);
    if (count == null || count != 1) throw unauthorized();
    return digest;
  }

  private Row accountRow(UUID id, String header, boolean lock) {
    String digest = authenticate(header);
    List<Row> rows =
        db.query(
            "select * from accounts where id=? and token_hash=?" + (lock ? " for update" : ""),
            (r, n) ->
                new Row(
                    r.getObject("id", UUID.class),
                    r.getBigDecimal("credit_limit"),
                    r.getBigDecimal("outstanding_balance"),
                    r.getTimestamp("expires_at").toInstant()),
            id,
            digest);
    if (rows.isEmpty())
      throw new DomainException("ACCOUNT_NOT_FOUND", 404, "Synthetic account not found");
    Row row = rows.getFirst();
    if (!row.expires().isAfter(Instant.now())) throw unauthorized();
    return row;
  }

  public Account account(UUID id, String auth) {
    Row r = accountRow(id, auth, false);
    return new Account(
        r.id(),
        "USD",
        Money.format(r.limit()),
        Money.format(r.balance()),
        Money.format(r.limit().subtract(r.balance())),
        r.expires());
  }

  @Transactional
  public Posting post(UUID id, String auth, String key, String kind, BigDecimal amount) {
    if (key == null || !key.matches("[A-Za-z0-9_-]{1,80}"))
      throw new DomainException(
          "INVALID_IDEMPOTENCY_KEY",
          400,
          "Idempotency-Key must contain 1 to 80 letters, digits, underscores or hyphens");
    Row r = accountRow(id, auth, true);
    List<StoredEntry> previous =
        db.query(
            "select * from ledger_entries where account_id=? and idempotency_key=?",
            (rs, n) ->
                new StoredEntry(mapEntry(rs), rs.getString("kind"), rs.getBigDecimal("amount")),
            id,
            key);
    if (!previous.isEmpty()) {
      StoredEntry old = previous.getFirst();
      if (!old.kind().equals(kind) || old.amount().compareTo(amount) != 0)
        throw new DomainException(
            "IDEMPOTENCY_CONFLICT", 409, "Key already used with another operation or amount");
      return new Posting(old.entry(), true);
    }
    AccountState next = new AccountState(r.limit(), r.balance()).post(kind, amount);
    db.update("update accounts set outstanding_balance=? where id=?", next.outstanding(), id);
    UUID entryId = UUID.randomUUID();
    Entry entry =
        db.queryForObject(
            "insert into ledger_entries(id,account_id,kind,amount,balance_after,available_after,idempotency_key) values (?,?,?,?,?,?,?) returning *",
            ENTRY_MAPPER,
            entryId,
            id,
            kind,
            amount,
            next.outstanding(),
            next.available(),
            key);
    return new Posting(Objects.requireNonNull(entry), false);
  }

  @Transactional(readOnly = true)
  public History history(UUID id, String auth, long before, int limit) {
    accountRow(id, auth, false);
    if (limit < 1 || limit > 100 || before < 1)
      throw new DomainException(
          "INVALID_PAGINATION", 400, "limit must be 1..100 and before must be positive");
    List<Entry> entries =
        db.query(
            "select * from ledger_entries where account_id=? and sequence<? order by sequence desc limit ?",
            ENTRY_MAPPER,
            id,
            before,
            limit + 1);
    boolean more = entries.size() > limit;
    List<Entry> page = List.copyOf(entries.subList(0, Math.min(limit, entries.size())));
    return new History(page, more ? page.getLast().sequence() : null);
  }

  private static final RowMapper<Entry> ENTRY_MAPPER = (rs, n) -> mapEntry(rs);

  private static Entry mapEntry(ResultSet r) throws SQLException {
    return new Entry(
        r.getObject("id", UUID.class),
        r.getLong("sequence"),
        r.getObject("account_id", UUID.class),
        r.getString("kind"),
        Money.format(r.getBigDecimal("amount")),
        Money.format(r.getBigDecimal("balance_after")),
        Money.format(r.getBigDecimal("available_after")),
        r.getTimestamp("posted_at").toInstant());
  }

  private static DomainException unauthorized() {
    return new DomainException(
        "UNAUTHORIZED", 401, "Valid unexpired sandbox bearer token required");
  }

  private static String hash(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("Required digest unavailable", e);
    }
  }

  private record Row(UUID id, BigDecimal limit, BigDecimal balance, Instant expires) {}

  private record StoredEntry(Entry entry, String kind, BigDecimal amount) {}
}
