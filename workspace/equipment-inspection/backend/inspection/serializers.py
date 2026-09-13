from rest_framework import serializers

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


class EquipmentSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    active_downtime_id = serializers.SerializerMethodField()

    class Meta:
        model = Equipment
        fields = [
            "id",
            "code",
            "name",
            "category",
            "area",
            "manufacturer",
            "status",
            "status_display",
            "active_downtime_id",
            "created_at",
        ]

    def get_active_downtime_id(self, obj):
        active = obj.downtimes.filter(resumed_at__isnull=True).first()
        return active.id if active else None


class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shift
        fields = ["id", "name", "start_time", "end_time"]


class InspectionItemSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = InspectionItem
        fields = [
            "id",
            "category",
            "name",
            "kind",
            "kind_display",
            "unit",
            "lower_limit",
            "upper_limit",
            "sort_order",
        ]


class ReadingSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True)
    item_kind = serializers.CharField(source="item.kind", read_only=True)
    unit = serializers.CharField(source="item.unit", read_only=True)
    lower_limit = serializers.FloatField(source="item.lower_limit", read_only=True)
    upper_limit = serializers.FloatField(source="item.upper_limit", read_only=True)

    class Meta:
        model = Reading
        fields = [
            "id",
            "item",
            "item_name",
            "item_kind",
            "unit",
            "lower_limit",
            "upper_limit",
            "value",
            "normal",
            "recorded_at",
        ]


class TaskListSerializer(serializers.ModelSerializer):
    equipment_code = serializers.CharField(source="equipment.code", read_only=True)
    equipment_name = serializers.CharField(source="equipment.name", read_only=True)
    equipment_category = serializers.CharField(
        source="equipment.category", read_only=True
    )
    equipment_status = serializers.CharField(source="equipment.status", read_only=True)
    shift_name = serializers.CharField(source="shift.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    source_task_no = serializers.CharField(
        source="source.task_no", read_only=True, default=None
    )
    has_recheck = serializers.SerializerMethodField()
    abnormal_count = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id",
            "task_no",
            "equipment",
            "equipment_code",
            "equipment_name",
            "equipment_category",
            "equipment_status",
            "shift",
            "shift_name",
            "task_date",
            "kind",
            "kind_display",
            "source",
            "source_task_no",
            "has_recheck",
            "status",
            "status_display",
            "inspector",
            "abnormal_count",
            "created_at",
            "started_at",
            "finished_at",
        ]

    def get_has_recheck(self, obj):
        """漏检任务是否已有对应补检（与 recheck 接口的防重判断同一口径）"""
        if obj.status != Task.Status.MISSED:
            return False
        return Task.objects.filter(
            equipment_id=obj.equipment_id,
            shift_id=obj.shift_id,
            task_date=Task.next_schedulable_date(obj.shift),
            kind=Task.Kind.RECHECK,
        ).exists()

    def get_abnormal_count(self, obj):
        return obj.abnormals.count()


class TaskDetailSerializer(TaskListSerializer):
    readings = ReadingSerializer(many=True, read_only=True)
    remark = serializers.CharField()

    class Meta(TaskListSerializer.Meta):
        fields = TaskListSerializer.Meta.fields + ["readings", "remark"]


class AbnormalReportSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    severity_display = serializers.CharField(source="get_severity_display", read_only=True)
    equipment_code = serializers.CharField(source="equipment.code", read_only=True)
    equipment_name = serializers.CharField(source="equipment.name", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True, default=None)
    has_work_order = serializers.SerializerMethodField()
    work_order_id = serializers.SerializerMethodField()

    class Meta:
        model = AbnormalReport
        fields = [
            "id",
            "report_no",
            "task",
            "equipment",
            "equipment_code",
            "equipment_name",
            "item",
            "item_name",
            "reading_value",
            "phenomenon",
            "severity",
            "severity_display",
            "status",
            "status_display",
            "reporter",
            "reported_at",
            "has_work_order",
            "work_order_id",
        ]

    def get_has_work_order(self, obj):
        return hasattr(obj, "work_order")

    def get_work_order_id(self, obj):
        return getattr(getattr(obj, "work_order", None), "id", None)


class WorkOrderSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    equipment_code = serializers.CharField(source="equipment.code", read_only=True)
    equipment_name = serializers.CharField(source="equipment.name", read_only=True)
    abnormal_no = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrder
        fields = [
            "id",
            "order_no",
            "abnormal",
            "abnormal_no",
            "equipment",
            "equipment_code",
            "equipment_name",
            "assignee",
            "description",
            "status",
            "status_display",
            "created_at",
            "started_at",
            "finished_at",
            "accepted_at",
            "result",
        ]

    def get_abnormal_no(self, obj):
        return obj.abnormal.report_no if obj.abnormal else None


class DowntimeEventSerializer(serializers.ModelSerializer):
    reason_display = serializers.CharField(source="get_reason_display", read_only=True)
    equipment_code = serializers.CharField(source="equipment.code", read_only=True)
    equipment_name = serializers.CharField(source="equipment.name", read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = DowntimeEvent
        fields = [
            "id",
            "equipment",
            "equipment_code",
            "equipment_name",
            "reason",
            "reason_display",
            "remark",
            "stopped_at",
            "resumed_at",
            "resume_confirm_by",
            "resume_note",
            "is_active",
        ]
