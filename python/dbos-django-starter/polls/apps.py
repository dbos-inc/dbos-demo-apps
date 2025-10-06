import os
from django.apps import AppConfig
from dbos import DBOS, DBOSConfig

class PollsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'polls'

    def ready(self):
        dbos_config: DBOSConfig = {
            "name": "django-app",
            "application_database_url": os.environ.get("DBOS_DATABASE_URL"),
        }
        DBOS(config=dbos_config)
        DBOS.launch()
        return super().ready()
