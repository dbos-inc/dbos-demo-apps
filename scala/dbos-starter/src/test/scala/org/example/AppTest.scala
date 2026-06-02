package org.example

import dev.dbos.transact.DBOS
import dev.dbos.transact.execution.ThrowingRunnable
import org.mockito.ArgumentMatchers.{anyString, eq as eqTo}
import org.mockito.Mockito.{inOrder as mockInOrder, mock, times, verify}

class AppTest extends munit.FunSuite:
  // Typed matcher that resolves the ThrowingRunnable vs ThrowingSupplier overload ambiguity
  private def anyRunnable: ThrowingRunnable[Exception] =
    org.mockito.ArgumentMatchers.any(classOf[ThrowingRunnable[Exception]])

  test("exampleWorkflow executes all steps in order") {
    val mockDBOS = mock(classOf[DBOS])

    exampleWorkflow(mockDBOS)

    val ordered = mockInOrder(mockDBOS)

    ordered.verify(mockDBOS).runStep(anyRunnable, eqTo("stepOne"))
    ordered.verify(mockDBOS).setEvent(eqTo(STEPS_EVENT), eqTo(Integer.valueOf(1)))
    ordered.verify(mockDBOS).runStep(anyRunnable, eqTo("stepTwo"))
    ordered.verify(mockDBOS).setEvent(eqTo(STEPS_EVENT), eqTo(Integer.valueOf(2)))
    ordered.verify(mockDBOS).runStep(anyRunnable, eqTo("stepThree"))
    ordered.verify(mockDBOS).setEvent(eqTo(STEPS_EVENT), eqTo(Integer.valueOf(3)))

    verify(mockDBOS, times(3)).runStep(anyRunnable, anyString())
    verify(mockDBOS, times(3)).setEvent(eqTo(STEPS_EVENT), org.mockito.ArgumentMatchers.any(classOf[Integer]))
  }
