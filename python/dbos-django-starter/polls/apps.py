import os
from django.apps import AppConfig
from dbos import DBOS

class PollsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'polls'

    def ready(self):
        dbos_config = {
            "name": "django-app",
            "database_url": os.environ.get("DBOS_DATABASE_URL"),
        }
        dbos = DBOS(config=dbos_config)
        dbos.launch()
        return super().ready()
