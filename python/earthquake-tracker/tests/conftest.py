import pytest
from dbos import DBOS


@pytest.fixture()
def dbos():
    DBOS.destroy(destroy_registry=False)
    DBOS()
    DBOS.launch()
