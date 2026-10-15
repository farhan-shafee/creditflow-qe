package com.creditflow.banking;

import static org.junit.jupiter.api.Assertions.*;

import com.creditflow.banking.ledger.ApiModels.Entry;
import com.creditflow.banking.ledger.ApiModels.History;
import java.util.ArrayList;
import org.junit.jupiter.api.Test;

class HistoryTest {
  @Test
  void historyDefensivelyCopiesItsCollection() {
    ArrayList<Entry> source = new ArrayList<>();
    History history = new History(source, null);
    assertThrows(UnsupportedOperationException.class, () -> history.entries().clear());
    source.add(null);
    assertTrue(history.entries().isEmpty());
  }
}
