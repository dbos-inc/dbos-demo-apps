package org.example;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.execution.ThrowingRunnable;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.InOrder;
import org.mockito.Mockito;

class AppTest {

  @Test
  void exampleWorkflowExecutesAllStepsInOrder() throws Exception {
    // Arrange
    var mockDBOS = mock(DBOS.class);
    var service = new DurableStarterServiceImpl(mockDBOS);

    // Act
    service.exampleWorkflow();

    // Assert - Verify all steps are executed in correct order
    InOrder inOrder = Mockito.inOrder(mockDBOS);

    // Verify step execution and event setting sequence
    inOrder
        .verify(mockDBOS)
        .runStep(ArgumentMatchers.<ThrowingRunnable<RuntimeException>>any(), eq("stepOne"));
    inOrder.verify(mockDBOS).setEvent(eq("steps_event"), eq(1));
    inOrder
        .verify(mockDBOS)
        .runStep(ArgumentMatchers.<ThrowingRunnable<RuntimeException>>any(), eq("stepTwo"));
    inOrder.verify(mockDBOS).setEvent(eq("steps_event"), eq(2));
    inOrder
        .verify(mockDBOS)
        .runStep(ArgumentMatchers.<ThrowingRunnable<RuntimeException>>any(), eq("stepThree"));
    inOrder.verify(mockDBOS).setEvent(eq("steps_event"), eq(3));

    // Verify total interaction counts
    verify(mockDBOS, times(3))
        .runStep(ArgumentMatchers.<ThrowingRunnable<RuntimeException>>any(), any(String.class));
    verify(mockDBOS, times(3)).setEvent(eq("steps_event"), any(Integer.class));
  }
}
