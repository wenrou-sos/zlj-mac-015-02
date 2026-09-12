from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver


class Equipment(models.Model):
    """生产设备台账"""

    class Status(models.TextChoices):
        RUNNING = "running", "运行中"
        IDLE = "idle", "待机"
        DOWN = "down", "停机"
        MAINTENANCE = "maintenance", "维修中"

    code = models.CharField("设备编号", max_length=32, unique=True)
    name = models.CharField("设备名称", max_length=64)
    category = models.CharField("设备类别", max_length=32)
    area = models.CharField("车间/区域", max_length=32)
    manufacturer = models.CharField("制造商", max_length=64, blank=True)
    status = models.CharField(
        "设备状态", max_length=16, choices=Status.choices, default=Status.RUNNING
    )
    created_at = models.DateTimeField("建档时间", auto_now_add=True)

    class Meta:
        verbose_name = "设备"
        verbose_name_plural = "设备"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} {self.name}"


class Shift(models.Model):
    """班次，例如 早班 08:00-16:00"""

    name = models.CharField("班次名称", max_length=16, unique=True)
    start_time = models.TimeField("开始时间")
    end_time = models.TimeField("结束时间")

    class Meta:
        verbose_name = "班次"
        verbose_name_plural = "班次"
        ordering = ["start_time"]

    def __str__(self):
        return self.name


class InspectionItem(models.Model):
    """点检项定义：可以是数值参数（温度、压力）或检查项（异响、漏油）"""

    class Kind(models.TextChoices):
        PARAM = "param", "参数"
        CHECK = "check", "检查项"

    category = models.CharField("适用设备类别", max_length=32)
    name = models.CharField("点检项", max_length=64)
    kind = models.CharField(
        "类型", max_length=8, choices=Kind.choices, default=Kind.PARAM
    )
    unit = models.CharField("单位", max_length=16, blank=True)
    lower_limit = models.FloatField("下限", null=True, blank=True)
    upper_limit = models.FloatField("上限", null=True, blank=True)
    sort_order = models.IntegerField("排序", default=0)

    class Meta:
        verbose_name = "点检项"
        verbose_name_plural = "点检项"
        ordering = ["category", "sort_order", "id"]

    def __str__(self):
        return f"[{self.category}] {self.name}"


class Task(models.Model):
    """按班次生成的点检任务"""

    class Status(models.TextChoices):
        PENDING = "pending", "待点检"
        IN_PROGRESS = "in_progress", "点检中"
        DONE = "done", "已完成"
        ABNORMAL = "abnormal", "有异常"
        MISSED = "missed", "漏检"

    task_no = models.CharField("任务单号", max_length=64, unique=True, blank=True)
    equipment = models.ForeignKey(
        Equipment, verbose_name="设备", on_delete=models.PROTECT, related_name="tasks"
    )
    shift = models.ForeignKey(
        Shift, verbose_name="班次", on_delete=models.PROTECT, related_name="tasks"
    )
    task_date = models.DateField("点检日期")
    status = models.CharField(
        "状态", max_length=16, choices=Status.choices, default=Status.PENDING
    )
    inspector = models.CharField("点检人", max_length=32, blank=True)
    remark = models.TextField("任务备注", blank=True)
    created_at = models.DateTimeField("生成时间", auto_now_add=True)
    started_at = models.DateTimeField("开始时间", null=True, blank=True)
    finished_at = models.DateTimeField("完成时间", null=True, blank=True)

    class Meta:
        verbose_name = "点检任务"
        verbose_name_plural = "点检任务"
        ordering = ["-task_date", "shift__start_time", "equipment__code"]
        constraints = [
            models.UniqueConstraint(
                fields=["equipment", "shift", "task_date"],
                name="uniq_equipment_shift_date",
            )
        ]

    def __str__(self):
        return self.task_no or f"Task#{self.pk}"


class Reading(models.Model):
    """单条点检记录：参数实测值 / 检查项是否正常"""

    item = models.ForeignKey(
        InspectionItem,
        verbose_name="点检项",
        on_delete=models.PROTECT,
        related_name="readings",
    )
    task = models.ForeignKey(
        Task, verbose_name="任务", on_delete=models.CASCADE, related_name="readings"
    )
    value = models.FloatField("实测值", null=True, blank=True)
    normal = models.BooleanField("是否正常", default=True)
    recorded_at = models.DateTimeField("记录时间", auto_now_add=True)

    class Meta:
        verbose_name = "点检记录"
        verbose_name_plural = "点检记录"
        unique_together = ["item", "task"]

    def evaluate(self):
        """根据点检项阈值/检查结果判定是否正常"""
        if self.item.kind == InspectionItem.Kind.PARAM:
            if self.value is None:
                self.normal = False
            else:
                ok_low = self.item.lower_limit is None or self.value >= self.item.lower_limit
                ok_high = self.item.upper_limit is None or self.value <= self.item.upper_limit
                self.normal = ok_low and ok_high
        # check 项以提交的 normal 字段为准
        return self.normal


class AbnormalReport(models.Model):
    """点检异常报告单"""

    class Status(models.TextChoices):
        OPEN = "open", "待派单"
        DISPATCHED = "dispatched", "已派单"
        RESOLVED = "resolved", "已处理"
        CLOSED = "closed", "已关闭"

    report_no = models.CharField("异常单号", max_length=32, unique=True, blank=True)
    task = models.ForeignKey(
        Task,
        verbose_name="点检任务",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="abnormals",
    )
    equipment = models.ForeignKey(
        Equipment,
        verbose_name="设备",
        on_delete=models.PROTECT,
        related_name="abnormals",
    )
    item = models.ForeignKey(
        InspectionItem,
        verbose_name="点检项",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    reading_value = models.CharField("异常读数", max_length=64, blank=True)
    phenomenon = models.TextField("异常现象")
    severity = models.CharField(
        "严重程度",
        max_length=8,
        choices=[("low", "一般"), ("high", "严重"), ("critical", "紧急")],
        default="low",
    )
    status = models.CharField(
        "状态", max_length=16, choices=Status.choices, default=Status.OPEN
    )
    reporter = models.CharField("上报人", max_length=32, blank=True)
    reported_at = models.DateTimeField("上报时间", auto_now_add=True)

    class Meta:
        verbose_name = "异常报告"
        verbose_name_plural = "异常报告"
        ordering = ["-reported_at"]

    def __str__(self):
        return self.report_no or f"Abnormal#{self.pk}"


class WorkOrder(models.Model):
    """维修工单"""

    class Status(models.TextChoices):
        ASSIGNED = "assigned", "已派单"
        REPAIRING = "repairing", "维修中"
        DONE = "done", "已完成"
        ACCEPTED = "accepted", "已验收"

    order_no = models.CharField("工单号", max_length=32, unique=True, blank=True)
    abnormal = models.OneToOneField(
        AbnormalReport,
        verbose_name="异常报告",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_order",
    )
    equipment = models.ForeignKey(
        Equipment,
        verbose_name="设备",
        on_delete=models.PROTECT,
        related_name="work_orders",
    )
    assignee = models.CharField("维修负责人", max_length=32)
    description = models.TextField("故障描述")
    status = models.CharField(
        "状态", max_length=16, choices=Status.choices, default=Status.ASSIGNED
    )
    created_at = models.DateTimeField("派单时间", auto_now_add=True)
    started_at = models.DateTimeField("开工时间", null=True, blank=True)
    finished_at = models.DateTimeField("完工时间", null=True, blank=True)
    accepted_at = models.DateTimeField("验收时间", null=True, blank=True)
    result = models.TextField("维修结果", blank=True)

    class Meta:
        verbose_name = "维修工单"
        verbose_name_plural = "维修工单"
        ordering = ["-created_at"]

    def __str__(self):
        return self.order_no or f"WorkOrder#{self.pk}"


class DowntimeEvent(models.Model):
    """停机/复机记录"""

    class Reason(models.TextChoices):
        FAULT = "fault", "故障停机"
        PLANNED = "planned", "计划停机"
        OTHER = "other", "其他"

    equipment = models.ForeignKey(
        Equipment,
        verbose_name="设备",
        on_delete=models.CASCADE,
        related_name="downtimes",
    )
    reason = models.CharField(
        "停机原因", max_length=16, choices=Reason.choices, default=Reason.FAULT
    )
    remark = models.TextField("停机说明", blank=True)
    stopped_at = models.DateTimeField("停机时间", auto_now_add=True)
    resumed_at = models.DateTimeField("复机时间", null=True, blank=True)
    resume_confirm_by = models.CharField("复机确认人", max_length=32, blank=True)
    resume_note = models.TextField("复机说明", blank=True)

    class Meta:
        verbose_name = "停机记录"
        verbose_name_plural = "停机记录"
        ordering = ["-stopped_at"]

    @property
    def is_active(self):
        return self.resumed_at is None


# 新增记录后按主键生成业务单号
@receiver(post_save, sender=Task)
def set_task_no(sender, instance, created, **kwargs):
    if created and not instance.task_no:
        # 班次段用开班时间、尾段用设备编号，均为业务标识而非自增主键，
        # 保证 (设备, 班次, 日期) 唯一的前提下，重建数据后单号保持稳定
        instance.task_no = (
            f"T{instance.task_date:%Y%m%d}"
            f"-S{instance.shift.start_time:%H%M}"
            f"-{instance.equipment.code}"
        )
        instance.save(update_fields=["task_no"])


@receiver(post_save, sender=AbnormalReport)
def set_report_no(sender, instance, created, **kwargs):
    if created and not instance.report_no:
        instance.report_no = f"AB{instance.id:05d}"
        instance.save(update_fields=["report_no"])


@receiver(post_save, sender=WorkOrder)
def set_order_no(sender, instance, created, **kwargs):
    if created and not instance.order_no:
        instance.order_no = f"WO{instance.id:05d}"
        instance.save(update_fields=["order_no"])
