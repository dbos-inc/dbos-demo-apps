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

import java.util.Optional;

import com.example.demo.repository.WidgetStoreRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.InOrder;
import org.mockito.Mockito;

class WidgetStoreServiceTest {

  private static ThrowingRunnable<RuntimeException> anyRunnable() {
    return ArgumentMatchers.any();
  }

  private DBOS mockDBOS;
  private WidgetStoreRepository mockRepo;
  private WidgetStoreService mockSelf;
  private WidgetStoreService service;

  @BeforeEach
  void setUp() {
    mockDBOS = mock(DBOS.class);
    mockRepo = mock(WidgetStoreRepository.class);
    mockSelf = mock(WidgetStoreService.class);
    service = new WidgetStoreService(mockDBOS, mockRepo);
    service.setSelf(mockSelf);
  }

  @AfterEach
  void verifyNoDirectSelfCalls() {
    verifyNoInteractions(mockSelf);
  }

  @Test
  void checkoutWorkflow_paymentSuccessful_paysAndDispatchesOrder() throws Exception {
    // Arrange
    int orderId = 42;
    when(mockRepo.createOrder()).thenReturn(orderId);
    when(mockDBOS.recv(eq(PAYMENT_STATUS), any())).thenReturn(Optional.of("paid"));

    // Act
    service.checkoutWorkflow();

    // Assert
    InOrder inOrder = Mockito.inOrder(mockDBOS, mockRepo);
    inOrder.verify(mockRepo).subtractInventory();
    inOrder.verify(mockRepo).createOrder();
    inOrder.verify(mockDBOS).setEvent(eq(PAYMENT_ID), any());
    inOrder.verify(mockDBOS).recv(eq(PAYMENT_STATUS), any());
    inOrder.verify(mockRepo).markOrderPaid(orderId);
    inOrder.verify(mockDBOS).startWorkflow(anyRunnable());
    inOrder.verify(mockDBOS).setEvent(eq(ORDER_ID), eq(String.valueOf(orderId)));

    verify(mockRepo, never()).errorOrder(orderId);
    verify(mockRepo, never()).undoSubtractInventory();
  }

  @Test
  void checkoutWorkflow_paymentFailed_cancelsOrderAndRestoresInventory() throws Exception {
    // Arrange
    int orderId = 42;
    when(mockRepo.createOrder()).thenReturn(orderId);
    when(mockDBOS.recv(eq(PAYMENT_STATUS), any())).thenReturn(Optional.empty());

    // Act
    service.checkoutWorkflow();

    // Assert
    InOrder inOrder = Mockito.inOrder(mockDBOS, mockRepo);
    inOrder.verify(mockRepo).errorOrder(orderId);
    inOrder.verify(mockRepo).undoSubtractInventory();
    inOrder.verify(mockDBOS).setEvent(eq(ORDER_ID), eq(String.valueOf(orderId)));

    verify(mockRepo, never()).markOrderPaid(orderId);
  }

  @Test
  void checkoutWorkflow_insufficientInventory_setsNullPaymentIdAndReturns() throws Exception {
    // Arrange
    doThrow(new RuntimeException("Insufficient Inventory")).when(mockRepo).subtractInventory();

    // Act
    service.checkoutWorkflow();

    // Assert
    verify(mockDBOS).setEvent(eq(PAYMENT_ID), eq(null));
    verify(mockRepo, never()).createOrder();
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
    verify(mockRepo, times(10)).updateOrderProgress(orderId);
  }

  @Test
  void dispatchOrderWorkflow_sleepsBeforeEachProgressUpdate() throws Exception {
    // Arrange
    int orderId = 7;

    // Act
    service.dispatchOrderWorkflow(orderId);

    // Assert - sleep always precedes the step in each iteration
    InOrder inOrder = Mockito.inOrder(mockDBOS, mockRepo);
    for (int i = 0; i < 10; i++) {
      inOrder.verify(mockDBOS).sleep(any());
      inOrder.verify(mockRepo).updateOrderProgress(orderId);
    }
  }
}
