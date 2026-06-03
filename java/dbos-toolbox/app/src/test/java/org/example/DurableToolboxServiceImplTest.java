package org.example;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.StartWorkflowOptions;
import dev.dbos.transact.execution.ThrowingRunnable;
import dev.dbos.transact.txstep.JdbcStepFactory;
import dev.dbos.transact.workflow.WorkflowHandle;

import java.sql.SQLException;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

class DurableToolboxServiceImplTest {

  @Test
  void exampleWorkflow_runsTwoStepsInOrder() {
    var mockDBOS = mock(DBOS.class);
    var mockStepFactory = mock(JdbcStepFactory.class);
    var service = new DurableToolboxServiceImpl(mockDBOS, mockStepFactory);

    service.exampleWorkflow();

    InOrder inOrder = inOrder(mockDBOS);
    inOrder.verify(mockDBOS).runStep((ThrowingRunnable<RuntimeException>) any(), eq("stepOne"));
    inOrder.verify(mockDBOS).runStep((ThrowingRunnable<RuntimeException>) any(), eq("stepTwo"));
    verify(mockDBOS, times(2)).runStep((ThrowingRunnable<RuntimeException>) any(), anyString());
  }

  @Test
  @SuppressWarnings("unchecked")
  void queueWorkflow_startsAndAwaitsChildWorkflows() {
    var mockDBOS = mock(DBOS.class);
    var mockStepFactory = mock(JdbcStepFactory.class);
    var mockSelf = mock(DurableToolboxService.class);
    WorkflowHandle<Void, RuntimeException> mockHandle = mock(WorkflowHandle.class);

    when(mockDBOS.startWorkflow(
            (ThrowingRunnable<RuntimeException>) any(), any(StartWorkflowOptions.class)))
        .thenReturn(mockHandle);

    var service = new DurableToolboxServiceImpl(mockDBOS, mockStepFactory);
    service.setSelf(mockSelf);

    service.queueWorkflow();

    verify(mockDBOS, times(10))
        .startWorkflow((ThrowingRunnable<RuntimeException>) any(), any(StartWorkflowOptions.class));
    verify(mockHandle, times(10)).getResult();
  }

  @Test
  @SuppressWarnings("unchecked")
  void txStepWorkflow_callsTxStepAndReturnsCount() throws SQLException {
    var mockDBOS = mock(DBOS.class);
    var mockStepFactory = mock(JdbcStepFactory.class);

    when(mockStepFactory.txStep(
            (JdbcStepFactory.TransactionalFunction<Integer, SQLException>) any(),
            eq("insertGreeting")))
        .thenReturn(42);

    var service = new DurableToolboxServiceImpl(mockDBOS, mockStepFactory);

    var result = service.txStepWorkflow("Alice");

    assertEquals(42, result);
    verify(mockStepFactory)
        .txStep(
            (JdbcStepFactory.TransactionalFunction<Integer, SQLException>) any(),
            eq("insertGreeting"));
  }

  @Test
  void scheduledWorkflow_runsWithoutInteractingWithDependencies() {
    var mockDBOS = mock(DBOS.class);
    var mockStepFactory = mock(JdbcStepFactory.class);
    var service = new DurableToolboxServiceImpl(mockDBOS, mockStepFactory);

    service.scheduledWorkflow(Instant.now(), null);

    verifyNoInteractions(mockDBOS, mockStepFactory);
  }

  @Test
  void debouncerWorkflow_runsWithoutInteractingWithDependencies() {
    var mockDBOS = mock(DBOS.class);
    var mockStepFactory = mock(JdbcStepFactory.class);
    var service = new DurableToolboxServiceImpl(mockDBOS, mockStepFactory);

    service.debouncerWorkflow("test-key");

    verifyNoInteractions(mockDBOS, mockStepFactory);
  }
}
