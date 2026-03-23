package com.example.demo.controller;

import static com.example.demo.service.WidgetStoreService.ORDER_ID;
import static com.example.demo.service.WidgetStoreService.PAYMENT_ID;
import static com.example.demo.service.WidgetStoreService.PAYMENT_STATUS;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.execution.ThrowingRunnable;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import com.example.demo.dto.OrderDto;
import com.example.demo.dto.ProductDto;
import com.example.demo.repository.WidgetStoreRepository;
import com.example.demo.service.WidgetStoreService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(WidgetStoreController.class)
class WidgetStoreControllerTest {

  @Autowired private MockMvc mockMvc;

  @MockitoBean private DBOS mockDBOS;
  @MockitoBean private WidgetStoreService mockService;
  @MockitoBean private WidgetStoreRepository mockRepo;

  private static ThrowingRunnable<RuntimeException> anyRunnable() {
    return ArgumentMatchers.any();
  }

  @Test
  void getProduct_returnsProduct_whenFound() throws Exception {
    var product = new ProductDto(1, "Widget", "A widget", 10, BigDecimal.valueOf(9.99));
    when(mockRepo.retrieveProduct()).thenReturn(product);

    mockMvc
        .perform(get("/product"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.product_id").value(1))
        .andExpect(jsonPath("$.product").value("Widget"));
  }

  @Test
  void getProduct_returns404_whenNotFound() throws Exception {
    when(mockRepo.retrieveProduct()).thenReturn(null);

    mockMvc.perform(get("/product")).andExpect(status().isNotFound());
  }

  @Test
  void getOrder_returnsOrder_whenFound() throws Exception {
    var order = new OrderDto(42, 0, LocalDateTime.now(), 1, 10);
    when(mockRepo.retrieveOrder(42)).thenReturn(order);

    mockMvc
        .perform(get("/order/42"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.order_id").value(42));
  }

  @Test
  void getOrder_returns404_whenNotFound() throws Exception {
    when(mockRepo.retrieveOrder(42)).thenReturn(null);

    mockMvc.perform(get("/order/42")).andExpect(status().isNotFound());
  }

  @Test
  void getOrders_returnsList() throws Exception {
    var orders =
        List.of(
            new OrderDto(1, 0, LocalDateTime.now(), 1, 10),
            new OrderDto(2, 2, LocalDateTime.now(), 1, 0));
    when(mockRepo.retrieveOrders()).thenReturn(orders);

    mockMvc
        .perform(get("/orders"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(2));
  }

  @Test
  void restock_returns200AndSetsInventory() throws Exception {
    mockMvc.perform(post("/restock")).andExpect(status().isOk());

    verify(mockRepo).setInventory(100);
  }

  @Test
  void checkout_returnsPaymentId_whenItemAvailable() throws Exception {
    String key = "test-key";
    String paymentId = "workflow-123";
    when(mockDBOS.getEvent(eq(key), eq(PAYMENT_ID), any())).thenReturn(paymentId);

    mockMvc
        .perform(post("/checkout/{key}", key))
        .andExpect(status().isOk())
        .andExpect(content().string(paymentId));

    verify(mockDBOS).startWorkflow(anyRunnable(), any());
  }

  @Test
  void checkout_throwsRuntimeException_whenItemNotAvailable() {
    String key = "test-key";
    when(mockDBOS.getEvent(eq(key), eq(PAYMENT_ID), any())).thenReturn(null);

    var ex = assertThrows(Exception.class, () -> mockMvc.perform(post("/checkout/{key}", key)));
    assertInstanceOf(RuntimeException.class, ex.getCause());
    assertEquals("Item not available", ex.getCause().getMessage());
  }

  @Test
  void paymentWebhook_sendsStatusAndReturnsOrderId() throws Exception {
    String key = "test-key";
    String orderId = "42";
    when(mockDBOS.getEvent(eq(key), eq(ORDER_ID), any())).thenReturn(orderId);

    mockMvc
        .perform(post("/payment_webhook/{key}/paid", key))
        .andExpect(status().isOk())
        .andExpect(content().string(orderId));

    verify(mockDBOS).send(eq(key), eq("paid"), eq(PAYMENT_STATUS));
  }
}
