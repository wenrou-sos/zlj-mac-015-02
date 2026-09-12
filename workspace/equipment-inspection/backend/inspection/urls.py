from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AbnormalReportViewSet,
    DashboardView,
    DowntimeEventViewSet,
    EquipmentViewSet,
    InspectionItemViewSet,
    ShiftViewSet,
    TaskViewSet,
    WorkOrderViewSet,
)

router = DefaultRouter()
router.register("equipment", EquipmentViewSet, basename="equipment")
router.register("shifts", ShiftViewSet, basename="shift")
router.register("items", InspectionItemViewSet, basename="item")
router.register("tasks", TaskViewSet, basename="task")
router.register("abnormals", AbnormalReportViewSet, basename="abnormal")
router.register("work-orders", WorkOrderViewSet, basename="workorder")
router.register("downtimes", DowntimeEventViewSet, basename="downtime")
router.register("dashboard", DashboardView, basename="dashboard")

urlpatterns = [
    path("", include(router.urls)),
]
