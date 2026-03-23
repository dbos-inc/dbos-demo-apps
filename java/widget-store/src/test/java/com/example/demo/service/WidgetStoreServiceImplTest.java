package com.example.demo.service;

import static com.example.demo.service.WidgetStoreService.ORDER_ID;
import static com.example.demo.service.WidgetStoreService.PAYMENT_ID;
import static com.example.demo.service.WidgetStoreService.PAYMENT_STATUS;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.execution.ThrowingRunnable;
import dev.dbos.transact.execution.ThrowingSupplier;

import com.example.demo.repository.WidgetStoreRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.InOrder;
import org.mockito.Mockito;

class WidgetStoreServiceImplTest {

  private static ThrowingRunnable<RuntimeException> anyRunnable() {
    return ArgumentMatchers.any();
  }

  private static <T> ThrowingSupplier<T, RuntimeException> anySupplier() {
    return ArgumentMatchers.any();
  }

  private DBOS mockDBOS;
  private WidgetStoreRepository mockRepo;
  private WidgetStoreService mockSelf;
  private WidgetStoreServiceImpl service;

  @BeforeEach
  void setUp() {
    mockDBOS = mock(DBOS.class);
    mockRepo = mock(WidgetStoreRepository.class);
    mockSelf = mock(WidgetStoreService.class);
    service = new WidgetStoreServiceImpl(mockDBOS, mockRepo);
    service.setSelf(mockSelf);
  }

  @AfterEach
  void verifyNoDirectRepoOrSelfCalls() {
    // the injected repo and self instances are only ever called indirectly via startWorkflow or
    // runStep
    verifyNoInteractions(mockRepo, mockSelf);
  }

  @Test
  void checkoutWorkflow_paymentSuccessful_paysAndDispatchesOrder() throws Exception {
    // Arrange
    int orderId = 42;
    when(mockDBOS.runStep(anySupplier(), eq("createOrder"))).thenReturn(orderId);
    when(mockDBOS.recv(eq(PAYMENT_STATUS), any())).thenReturn("paid");

    // Act
    service.checkoutWorkflow();

    // Assert
    InOrder inOrder = Mockito.inOrder(mockDBOS, mockSelf);
    inOrder.verify(mockDBOS).runStep(anyRunnable(), eq("subtractInventory"));
    inOrder.verify(mockDBOS).runStep(anySupplier(), eq("createOrder"));
    inOrder.verify(mockDBOS).setEvent(eq(PAYMENT_ID), any());
    inOrder.verify(mockDBOS).recv(eq(PAYMENT_STATUS), any());
    inOrder.verify(mockDBOS).runStep(anyRunnable(), eq("markOrderPaid"));
    inOrder.verify(mockDBOS).startWorkflow(anyRunnable());
    inOrder.verify(mockDBOS).setEvent(eq(ORDER_ID), eq(String.valueOf(orderId)));

    verify(mockDBOS, never()).runStep(anyRunnable(), eq("errorOrder"));
    verify(mockDBOS, never()).runStep(anyRunnable(), eq("undoSubtractInventory"));
  }

  @Test
  void checkoutWorkflow_paymentFailed_cancelsOrderAndRestoresInventory() throws Exception {
    // Arrange
    int orderId = 42;
    when(mockDBOS.runStep(anySupplier(), eq("createOrder"))).thenReturn(orderId);
    when(mockDBOS.recv(eq(PAYMENT_STATUS), any())).thenReturn(null);

    // Act
    service.checkoutWorkflow();

    // Assert
    InOrder inOrder = Mockito.inOrder(mockDBOS);
    inOrder.verify(mockDBOS).runStep(anyRunnable(), eq("errorOrder"));
    inOrder.verify(mockDBOS).runStep(anyRunnable(), eq("undoSubtractInventory"));
    inOrder.verify(mockDBOS).setEvent(eq(ORDER_ID), eq(String.valueOf(orderId)));

    verify(mockDBOS, never()).runStep(anyRunnable(), eq("markOrderPaid"));
  }

  @Test
  void checkoutWorkflow_insufficientInventory_setsNullPaymentIdAndReturns() throws Exception {
    // Arrange
    doThrow(new RuntimeException("Insufficient Inventory"))
        .when(mockDBOS)
        .runStep(anyRunnable(), eq("subtractInventory"));

    // Act
    service.checkoutWorkflow();

    // Assert
    verify(mockDBOS).setEvent(eq(PAYMENT_ID), eq(null));
    verify(mockDBOS, never()).runStep(anySupplier(), eq("createOrder"));
    verify(mockDBOS, never()).setEvent(eq(ORDER_ID), any());
  }

  @Test
  void dispatchOrderWorkflow_runsUpdateProgressTenTimes() throws Exception {
    // Arrange
    int orderId = 7;

    // Act
    service.dispatchOrderWorkflow(orderId);

    // Assert
    verify(mockDBOS, times(10)).sleep(any());
    verify(mockDBOS, times(10)).runStep(anyRunnable(), eq("updateOrderProgress"));
  }

  @Test
  void dispatchOrderWorkflow_sleepsBeforeEachProgressUpdate() throws Exception {
    // Arrange
    int orderId = 7;

    // Act
    service.dispatchOrderWorkflow(orderId);

    // Assert - sleep always precedes the step in each iteration
    InOrder inOrder = Mockito.inOrder(mockDBOS);
    for (int i = 0; i < 10; i++) {
      inOrder.verify(mockDBOS).sleep(any());
      inOrder.verify(mockDBOS).runStep(anyRunnable(), eq("updateOrderProgress"));
    }
  }
}
