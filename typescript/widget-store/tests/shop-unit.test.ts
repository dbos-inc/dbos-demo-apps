import { checkoutWorkflow, PAYMENT_TOPIC, PAYMENT_ID_EVENT, ORDER_ID_EVENT } from '../src/main';
import { DBOS } from '@dbos-inc/dbos-sdk';
import {
  subtractInventory,
  createOrder,
  markOrderPaid,
  dispatchOrder,
  errorOrder,
  undoSubtractInventory,
} from '../src/shop';

// Mock steps in the shop module
jest.mock('../src/shop', () => ({
  subtractInventory: jest.fn(),
  createOrder: jest.fn(),
  markOrderPaid: jest.fn(),
  dispatchOrder: jest.fn(),
  errorOrder: jest.fn(),
  undoSubtractInventory: jest.fn(),
}));

// Mock DBOS
jest.mock('@dbos-inc/dbos-sdk', () => ({
  DBOS: {
    // IMPORTANT: Mock registerWorkflow to just return the workflow function
    registerWorkflow: jest.fn((fn) => fn),
    setEvent: jest.fn(),
    recv: jest.fn(),
    startWorkflow: jest.fn(),
    workflowID: 'test-workflow-id-123',
  },
}));

describe('checkout workflow unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful checkout flow', () => {
    it('should complete checkout when inventory is available and payment succeeds', async () => {
      const mockOrderID = 'order-456';

      // Mock successful inventory subtraction
      (subtractInventory as jest.Mock).mockResolvedValue(undefined);

      // Mock order creation
      (createOrder as jest.Mock).mockResolvedValue(mockOrderID);

      // Mock payment notification as successful
      (DBOS.recv as jest.Mock).mockResolvedValue('paid');

      // Mock marking order as paid
      (markOrderPaid as jest.Mock).mockResolvedValue(undefined);

      // Mock startWorkflow to return a function
      const mockWorkflowFunction = jest.fn().mockResolvedValue(undefined);
      (DBOS.startWorkflow as jest.Mock).mockReturnValue(mockWorkflowFunction);

      // Mock setEvent
      (DBOS.setEvent as jest.Mock).mockResolvedValue(undefined);

      // Execute the workflow
      await checkoutWorkflow();

      // Verify inventory was subtracted
      expect(subtractInventory).toHaveBeenCalledTimes(1);

      // Verify order was created
      expect(createOrder).toHaveBeenCalledTimes(1);

      // Verify payment ID event was set with workflow ID
      expect(DBOS.setEvent).toHaveBeenCalledWith(PAYMENT_ID_EVENT, 'test-workflow-id-123');

      // Verify it waited for payment notification
      expect(DBOS.recv).toHaveBeenCalledWith(PAYMENT_TOPIC, 120);

      // Verify order was marked as paid
      expect(markOrderPaid).toHaveBeenCalledWith(mockOrderID);

      // Verify dispatch workflow was started
      expect(DBOS.startWorkflow).toHaveBeenCalledWith(dispatchOrder);
      expect(mockWorkflowFunction).toHaveBeenCalledWith(mockOrderID);

      // Verify order ID event was set
      expect(DBOS.setEvent).toHaveBeenCalledWith(ORDER_ID_EVENT, mockOrderID);

      // Verify no error handling was triggered
      expect(errorOrder).not.toHaveBeenCalled();
      expect(undoSubtractInventory).not.toHaveBeenCalled();
    });
  });

  describe('inventory failure', () => {
    it('should handle inventory subtraction failure and return early', async () => {
      const inventoryError = new Error('Insufficient inventory');

      // Mock inventory subtraction to fail
      (subtractInventory as jest.Mock).mockRejectedValue(inventoryError);

      // Mock setEvent
      (DBOS.setEvent as jest.Mock).mockResolvedValue(undefined);

      // Execute the workflow
      await checkoutWorkflow();

      // Verify inventory subtraction was attempted
      expect(subtractInventory).toHaveBeenCalledTimes(1);

      // Verify payment ID event was set to null
      expect(DBOS.setEvent).toHaveBeenCalledWith(PAYMENT_ID_EVENT, null);

      // Verify workflow returned early - no order creation or payment processing
      expect(createOrder).not.toHaveBeenCalled();
      expect(DBOS.recv).not.toHaveBeenCalled();
      expect(markOrderPaid).not.toHaveBeenCalled();
      expect(DBOS.startWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('payment failure', () => {
    it('should handle payment failure by cancelling order and returning inventory', async () => {
      const mockOrderID = 'order-789';

      // Mock successful inventory subtraction
      (subtractInventory as jest.Mock).mockResolvedValue(undefined);

      // Mock order creation
      (createOrder as jest.Mock).mockResolvedValue(mockOrderID);

      // Mock payment notification as failed
      (DBOS.recv as jest.Mock).mockResolvedValue('failed');

      // Mock error handling functions
      (errorOrder as jest.Mock).mockResolvedValue(undefined);
      (undoSubtractInventory as jest.Mock).mockResolvedValue(undefined);

      // Mock setEvent
      (DBOS.setEvent as jest.Mock).mockResolvedValue(undefined);

      // Execute the workflow
      await checkoutWorkflow();

      // Verify inventory was subtracted
      expect(subtractInventory).toHaveBeenCalledTimes(1);

      // Verify order was created
      expect(createOrder).toHaveBeenCalledTimes(1);

      // Verify payment ID event was set
      expect(DBOS.setEvent).toHaveBeenCalledWith(PAYMENT_ID_EVENT, 'test-workflow-id-123');

      // Verify it waited for payment notification
      expect(DBOS.recv).toHaveBeenCalledWith(PAYMENT_TOPIC, 120);

      // Verify order was marked as errored
      expect(errorOrder).toHaveBeenCalledWith(mockOrderID);

      // Verify inventory was returned
      expect(undoSubtractInventory).toHaveBeenCalledTimes(1);

      // Verify order ID event was set
      expect(DBOS.setEvent).toHaveBeenCalledWith(ORDER_ID_EVENT, mockOrderID);

      // Verify successful payment path was not taken
      expect(markOrderPaid).not.toHaveBeenCalled();
      expect(DBOS.startWorkflow).not.toHaveBeenCalled();
    });

    it('should handle payment timeout (null notification)', async () => {
      const mockOrderID = 'order-timeout-123';

      // Mock successful inventory subtraction
      (subtractInventory as jest.Mock).mockResolvedValue(undefined);

      // Mock order creation
      (createOrder as jest.Mock).mockResolvedValue(mockOrderID);

      // Mock payment notification as timeout (null)
      (DBOS.recv as jest.Mock).mockResolvedValue(null);

      // Mock error handling functions
      (errorOrder as jest.Mock).mockResolvedValue(undefined);
      (undoSubtractInventory as jest.Mock).mockResolvedValue(undefined);

      // Mock setEvent
      (DBOS.setEvent as jest.Mock).mockResolvedValue(undefined);

      // Execute the workflow
      await checkoutWorkflow();

      // Verify payment failure handling was triggered
      expect(errorOrder).toHaveBeenCalledWith(mockOrderID);
      expect(undoSubtractInventory).toHaveBeenCalledTimes(1);

      // Verify successful payment path was not taken
      expect(markOrderPaid).not.toHaveBeenCalled();
      expect(DBOS.startWorkflow).not.toHaveBeenCalled();
    });
  });
});
