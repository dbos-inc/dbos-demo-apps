from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("callWorkflow/<str:a>/<str:b>/", views.callWorkflow, name="callWorkflow"),
]