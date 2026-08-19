from unittest.mock import MagicMock, patch

from dbos import DBOS

import widget_store.main as widget_store
from widget_store.schema import OrderStatus


def test_checkout_workflow(dbos):
    """
    Use mocks to test that the main workflow function (checkout_workflow)
    correctly handles a checkout whose payment succeeds.
    """
    order_id = 123

    # Create a mock for each of the workflow's database transactions
    mock_create_order = MagicMock(return_value=order_id)
    mock_reserve_inventory = MagicMock(return_value=True)
    mock_undo_reserve_inventory = MagicMock()
    mock_update_order_status = MagicMock()
    mocks = {
        widget_store.create_order: mock_create_order,
        widget_store.reserve_inventory: mock_reserve_inventory,
        widget_store.undo_reserve_inventory: mock_undo_reserve_inventory,
        widget_store.update_order_status: mock_update_order_status,
    }

    # Run each transaction against its mock instead of against the database.
    # The app assigns `ds` at startup, so the test supplies its own datasource.
    def run_mocked_tx_step(ds_options, func, *args, **kwargs):
        return mocks[func](*args, **kwargs)

    mock_ds = MagicMock()
    mock_ds.run_tx_step.side_effect = run_mocked_tx_step

    # Also mock the payment message the workflow waits for and the
    # dispatch workflow it starts, then run the workflow.
    with (
        patch.object(widget_store, "ds", mock_ds, create=True),
        patch.object(DBOS, "recv", return_value="paid") as mock_recv,
        patch.object(DBOS, "start_workflow") as mock_start_workflow,
    ):
        widget_store.checkout_workflow()

    # Verify an order was created and inventory was reserved for it
    mock_create_order.assert_called_once_with()
    mock_reserve_inventory.assert_called_once_with()

    # Verify the workflow waited for the payment webhook
    mock_recv.assert_called_once_with(widget_store.PAYMENT_STATUS)

    # Verify the paid order was marked paid and handed to the dispatch workflow
    mock_update_order_status.assert_called_once_with(
        order_id=order_id, status=OrderStatus.PAID.value
    )
    mock_start_workflow.assert_called_once_with(
        widget_store.dispatch_order_workflow, order_id
    )

    # Verify that because payment succeeded, inventory was never returned
    mock_undo_reserve_inventory.assert_not_called()
