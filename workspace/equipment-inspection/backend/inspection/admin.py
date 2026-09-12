from django.contrib import admin

from .models import (
    AbnormalReport,
    DowntimeEvent,
    Equipment,
    InspectionItem,
    Reading,
    Shift,
    Task,
    WorkOrder,
)


@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "category", "area", "status")
    list_filter = ("status", "category", "area")
    search_fields = ("code", "name")


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ("name", "start_time", "end_time")


@admin.register(InspectionItem)
class InspectionItemAdmin(admin.ModelAdmin):
    list_display = ("category", "name", "kind", "unit", "lower_limit", "upper_limit")
    list_filter = ("category", "kind")


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ("task_no", "equipment", "shift", "task_date", "status", "inspector")
    list_filter = ("status", "shift", "task_date")


@admin.register(Reading)
class ReadingAdmin(admin.ModelAdmin):
    list_display = ("task", "item", "value", "normal")


@admin.register(AbnormalReport)
class AbnormalReportAdmin(admin.ModelAdmin):
    list_display = ("report_no", "equipment", "severity", "status", "reporter", "reported_at")
    list_filter = ("status", "severity")


@admin.register(WorkOrder)
class WorkOrderAdmin(admin.ModelAdmin):
    list_display = ("order_no", "equipment", "assignee", "status", "created_at")
    list_filter = ("status",)


@admin.register(DowntimeEvent)
class DowntimeEventAdmin(admin.ModelAdmin):
    list_display = ("equipment", "reason", "stopped_at", "resumed_at", "resume_confirm_by")
