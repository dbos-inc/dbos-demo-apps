import os
from django.apps import AppConfig
from dbos import DBOS, DBOSConfig

class PollsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'polls'

    def ready(self):
        dbos_config: DBOSConfig = {
            "name": "django-app",
            "system_database_url": os.environ.get("DBOS_SYSTEM_DATABASE_URL"),
            "application_version": "0.1.0",
        }
        DBOS(config=dbos_config)
        DBOS.launch()
        return super().ready()
