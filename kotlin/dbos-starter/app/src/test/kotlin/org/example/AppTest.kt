package org.example

import dev.dbos.transact.*
import dev.dbos.transact.execution.ThrowingSupplier
import kotlin.test.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
import org.mockito.ArgumentMatchers.eq
import org.mockito.Mockito.*

class AppTest {

  @Test
  fun exampleWorkflowExecutesAllStepsInOrder() {
    // Arrange
    val mockDBOS = mock<DBOS>()
    val service = DurableStarterServiceImpl(mockDBOS)

    // Act
    service.exampleWorkflow()

    // Assert - Verify all steps are executed in correct order
    val inOrder = inOrder(mockDBOS)

    // Verify step execution and event setting sequence
    // Note: Using more flexible matchers since Kotlin extensions convert lambdas differently
    inOrder.verify(mockDBOS).runStep(any<ThrowingSupplier<Unit, Exception>>(), eq("stepOne"))
    inOrder.verify(mockDBOS).setEvent(eq(STEPS_EVENT), eq(1))
    inOrder.verify(mockDBOS).runStep(any<ThrowingSupplier<Unit, Exception>>(), eq("stepTwo"))
    inOrder.verify(mockDBOS).setEvent(eq(STEPS_EVENT), eq(2))
    inOrder.verify(mockDBOS).runStep(any<ThrowingSupplier<Unit, Exception>>(), eq("stepThree"))
    inOrder.verify(mockDBOS).setEvent(eq(STEPS_EVENT), eq(3))

    // Verify total interaction counts
    verify(mockDBOS, times(3)).runStep(any<ThrowingSupplier<Unit, Exception>>(), anyString())
    verify(mockDBOS, times(3)).setEvent(eq(STEPS_EVENT), any(Int::class.java))
  }
}
