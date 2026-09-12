from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

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
from .serializers import (
    AbnormalReportSerializer,
    DowntimeEventSerializer,
    EquipmentSerializer,
    InspectionItemSerializer,
    ShiftSerializer,
    TaskDetailSerializer,
    TaskListSerializer,
    WorkOrderSerializer,
)


class EquipmentViewSet(viewsets.ModelViewSet):
    queryset = Equipment.objects.all()
    serializer_class = EquipmentSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        area = self.request.query_params.get("area")
        category = self.request.query_params.get("category")
        equipment_status = self.request.query_params.get("status")
        if area:
            qs = qs.filter(area=area)
        if category:
            qs = qs.filter(category=category)
        if equipment_status:
            qs = qs.filter(status=equipment_status)
        return qs

    @action(detail=True, methods=["post"])
    def stop(self, request, pk=None):
        """停机标记：设备置为停机，并生成一条停机记录"""
        equipment = self.get_object()
        if equipment.downtimes.filter(resumed_at__isnull=True).exists():
            return Response(
                {"detail": "该设备已有未复机的停机记录"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = request.data.get("reason", DowntimeEvent.Reason.FAULT)
        remark = request.data.get("remark", "")
        event = DowntimeEvent.objects.create(
            equipment=equipment, reason=reason, remark=remark
        )
        equipment.status = Equipment.Status.DOWN
        equipment.save(update_fields=["status"])
        return Response(
            {
                "equipment": EquipmentSerializer(equipment).data,
                "downtime": DowntimeEventSerializer(event).data,
            }
        )

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        """复机确认：确认人登记后恢复运行"""
        equipment = self.get_object()
        event = equipment.downtimes.filter(resumed_at__isnull=True).first()
        if not event:
            return Response(
                {"detail": "该设备没有进行中的停机记录"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        confirm_by = (request.data.get("confirm_by") or "").strip()
        if not confirm_by:
            return Response(
                {"detail": "请填写复机确认人"}, status=status.HTTP_400_BAD_REQUEST
            )
        event.resumed_at = timezone.now()
        event.resume_confirm_by = confirm_by
        event.resume_note = request.data.get("resume_note", "")
        event.save()
        equipment.status = Equipment.Status.RUNNING
        equipment.save(update_fields=["status"])
        return Response(
            {
                "equipment": EquipmentSerializer(equipment).data,
                "downtime": DowntimeEventSerializer(event).data,
            }
        )


class ShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.all()
    serializer_class = ShiftSerializer


class InspectionItemViewSet(viewsets.ModelViewSet):
    queryset = InspectionItem.objects.all()
    serializer_class = InspectionItemSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        return qs


class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.select_related("equipment", "shift").all()

    def get_serializer_class(self):
        if self.action == "retrieve":
            return TaskDetailSerializer
        return TaskListSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        task_date = self.request.query_params.get("date")
        shift_id = self.request.query_params.get("shift")
        task_status = self.request.query_params.get("status")
        equipment_id = self.request.query_params.get("equipment")
        if task_date:
            qs = qs.filter(task_date=task_date)
        if shift_id:
            qs = qs.filter(shift_id=shift_id)
        if task_status:
            qs = qs.filter(status=task_status)
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)
        keyword = self.request.query_params.get("keyword")
        if keyword:
            qs = qs.filter(
                Q(equipment__code__icontains=keyword)
                | Q(equipment__name__icontains=keyword)
                | Q(task_no__icontains=keyword)
            )
        return qs

    @action(detail=False, methods=["post"])
    @transaction.atomic
    def generate(self, request):
        """按班次为可点检设备批量生成点检任务（幂等：同设备/班次/日期不重复）"""
        from datetime import datetime as _dt

        raw_date = request.data.get("date") or timezone.localdate().isoformat()
        try:
            task_date = _dt.strptime(raw_date, "%Y-%m-%d").date()
        except (TypeError, ValueError):
            return Response(
                {"detail": "日期格式应为 YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        shift_ids = request.data.get("shift_ids")
        if shift_ids:
            shifts = Shift.objects.filter(id__in=shift_ids)
        else:
            shifts = Shift.objects.all()

        # 停机/维修中的设备不安排点检
        equipment_qs = Equipment.objects.exclude(
            status__in=[Equipment.Status.DOWN, Equipment.Status.MAINTENANCE]
        )
        equipment_ids = request.data.get("equipment_ids")
        if equipment_ids:
            equipment_qs = equipment_qs.filter(id__in=equipment_ids)

        created, skipped = [], []
        for shift in shifts:
            for equipment in equipment_qs:
                task, was_created = Task.objects.get_or_create(
                    equipment=equipment, shift=shift, task_date=task_date
                )
                (created if was_created else skipped).append(task.task_no)

        return Response(
            {
                "date": task_date,
                "created_count": len(created),
                "skipped_count": len(skipped),
                "created": created,
            }
        )

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        task = self.get_object()
        if task.status not in (Task.Status.PENDING, Task.Status.IN_PROGRESS):
            return Response(
                {"detail": f"任务当前状态为{task.get_status_display()}，无法开始"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        task.status = Task.Status.IN_PROGRESS
        task.started_at = task.started_at or timezone.now()
        if request.data.get("inspector"):
            task.inspector = request.data["inspector"]
        task.save()
        return Response(TaskListSerializer(task).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def submit(self, request, pk=None):
        """提交点检结果：写入参数/检查项记录，异常自动生成异常报告"""
        task = self.get_object()
        readings_data = request.data.get("readings", [])
        if not readings_data:
            return Response(
                {"detail": "请至少提交一条点检记录"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task.inspector = request.data.get("inspector", task.inspector)
        task.remark = request.data.get("remark", "")

        abnormal_reports = []
        for row in readings_data:
            item = InspectionItem.objects.get(pk=row["item"])
            reading, _ = Reading.objects.update_or_create(
                task=task,
                item=item,
                defaults={
                    "value": row.get("value"),
                    "normal": row.get("normal", True),
                },
            )
            reading.evaluate()
            reading.save(update_fields=["value", "normal"])

            if not reading.normal:
                phenomenon = (row.get("phenomenon") or "").strip()
                if not phenomenon:
                    if item.kind == InspectionItem.Kind.PARAM:
                        phenomenon = (
                            f"{item.name}实测 {reading.value}{item.unit}，"
                            f"超出标准范围 "
                            f"{item.lower_limit if item.lower_limit is not None else '-'}~"
                            f"{item.upper_limit if item.upper_limit is not None else '-'}"
                            f"{item.unit}"
                        )
                    else:
                        phenomenon = f"{item.name}检查异常"
                report = AbnormalReport.objects.create(
                    task=task,
                    equipment=task.equipment,
                    item=item,
                    reading_value=(
                        str(reading.value)
                        if item.kind == InspectionItem.Kind.PARAM
                        else "异常"
                    ),
                    phenomenon=phenomenon,
                    severity=row.get("severity", "low"),
                    reporter=task.inspector,
                )
                abnormal_reports.append(report)

        task.status = (
            Task.Status.ABNORMAL if abnormal_reports else Task.Status.DONE
        )
        task.finished_at = timezone.now()
        task.save()

        return Response(
            {
                "task": TaskDetailSerializer(task).data,
                "abnormal_reports": AbnormalReportSerializer(
                    abnormal_reports, many=True
                ).data,
            }
        )


class AbnormalReportViewSet(viewsets.ModelViewSet):
    queryset = AbnormalReport.objects.select_related(
        "equipment", "item", "work_order"
    ).all()
    serializer_class = AbnormalReportSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        report_status = self.request.query_params.get("status")
        equipment_id = self.request.query_params.get("equipment")
        if report_status:
            qs = qs.filter(status=report_status)
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)
        return qs

    @action(detail=True, methods=["post"], url_path="dispatch")
    @transaction.atomic
    def assign_order(self, request, pk=None):
        """维修派单：生成维修工单，设备转为维修中"""
        report = self.get_object()
        if hasattr(report, "work_order"):
            return Response(
                {"detail": "该异常已派单"}, status=status.HTTP_400_BAD_REQUEST
            )
        assignee = (request.data.get("assignee") or "").strip()
        if not assignee:
            return Response(
                {"detail": "请指定维修负责人"}, status=status.HTTP_400_BAD_REQUEST
            )
        order = WorkOrder.objects.create(
            abnormal=report,
            equipment=report.equipment,
            assignee=assignee,
            description=request.data.get("description") or report.phenomenon,
        )
        report.status = AbnormalReport.Status.DISPATCHED
        report.save(update_fields=["status"])
        if report.equipment.status == Equipment.Status.RUNNING:
            report.equipment.status = Equipment.Status.MAINTENANCE
            report.equipment.save(update_fields=["status"])
        return Response(
            {
                "report": AbnormalReportSerializer(report).data,
                "work_order": WorkOrderSerializer(order).data,
            }
        )


class WorkOrderViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = WorkOrder.objects.select_related("equipment", "abnormal").all()
    serializer_class = WorkOrderSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        order_status = self.request.query_params.get("status")
        if order_status:
            qs = qs.filter(status=order_status)
        return qs

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """开工：工单维修中，设备维修中"""
        order = self.get_object()
        if order.status != WorkOrder.Status.ASSIGNED:
            return Response(
                {"detail": "只有已派单状态的工单可以开工"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order.status = WorkOrder.Status.REPAIRING
        order.started_at = timezone.now()
        order.save(update_fields=["status", "started_at"])
        if order.equipment.status != Equipment.Status.DOWN:
            order.equipment.status = Equipment.Status.MAINTENANCE
            order.equipment.save(update_fields=["status"])
        return Response(WorkOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def finish(self, request, pk=None):
        """完工：登记维修结果，异常报告转为已处理（复机需另行确认）"""
        order = self.get_object()
        if order.status != WorkOrder.Status.REPAIRING:
            return Response(
                {"detail": "只有维修中的工单可以完工"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        result = (request.data.get("result") or "").strip()
        if not result:
            return Response(
                {"detail": "请填写维修结果"}, status=status.HTTP_400_BAD_REQUEST
            )
        order.status = WorkOrder.Status.DONE
        order.finished_at = timezone.now()
        order.result = result
        order.save(update_fields=["status", "finished_at", "result"])
        if order.abnormal:
            order.abnormal.status = AbnormalReport.Status.RESOLVED
            order.abnormal.save(update_fields=["status"])
        return Response(WorkOrderSerializer(order).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def accept(self, request, pk=None):
        """验收通过：工单验收、异常报告关闭"""
        order = self.get_object()
        if order.status != WorkOrder.Status.DONE:
            return Response(
                {"detail": "只有已完工的工单可以验收"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        order.status = WorkOrder.Status.ACCEPTED
        order.accepted_at = timezone.now()
        order.save(update_fields=["status", "accepted_at"])
        if order.abnormal:
            order.abnormal.status = AbnormalReport.Status.CLOSED
            order.abnormal.save(update_fields=["status"])
        return Response(WorkOrderSerializer(order).data)


class DowntimeEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DowntimeEvent.objects.select_related("equipment").all()
    serializer_class = DowntimeEventSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        active = self.request.query_params.get("active")
        if active is not None:
            qs = qs.filter(resumed_at__isnull=active.lower() in ("1", "true", "yes"))
        equipment_id = self.request.query_params.get("equipment")
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)
        return qs


class DashboardView(viewsets.ViewSet):
    def list(self, request):
        today = timezone.localdate()
        equipment_qs = Equipment.objects.all()
        equipment_by_status = {
            row["status"]: row["n"]
            for row in equipment_qs.values("status").annotate(n=Count("id"))
        }
        tasks_today = Task.objects.filter(task_date=today)
        tasks_by_status = {
            row["status"]: row["n"]
            for row in tasks_today.values("status").annotate(n=Count("id"))
        }
        active_downtimes = DowntimeEvent.objects.filter(resumed_at__isnull=True)
        recent_abnormals = AbnormalReport.objects.select_related("equipment").order_by(
            "-reported_at"
        )[:8]
        return Response(
            {
                "equipment": {
                    "total": equipment_qs.count(),
                    "running": equipment_by_status.get("running", 0),
                    "idle": equipment_by_status.get("idle", 0),
                    "down": equipment_by_status.get("down", 0),
                    "maintenance": equipment_by_status.get("maintenance", 0),
                },
                "tasks_today": {
                    "total": tasks_today.count(),
                    "pending": tasks_by_status.get("pending", 0),
                    "in_progress": tasks_by_status.get("in_progress", 0),
                    "done": tasks_by_status.get("done", 0),
                    "abnormal": tasks_by_status.get("abnormal", 0),
                    "missed": tasks_by_status.get("missed", 0),
                },
                "open_abnormals": AbnormalReport.objects.exclude(
                    status=AbnormalReport.Status.CLOSED
                ).count(),
                "active_work_orders": WorkOrder.objects.exclude(
                    status__in=[
                        WorkOrder.Status.ACCEPTED,
                    ]
                ).count(),
                "active_downtimes": active_downtimes.count(),
                "recent_abnormals": AbnormalReportSerializer(
                    recent_abnormals, many=True
                ).data,
            }
        )
