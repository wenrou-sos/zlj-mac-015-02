"""初始化本地设备样例数据：班次、设备台账、点检项模板，并生成当日点检任务与几条典型异常/工单/停机记录。

用法：
    python manage.py seed_demo            # 若已有数据则跳过
    python manage.py seed_demo --reset    # 清空业务数据后重建
"""
import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from inspection.models import (
    AbnormalReport,
    DowntimeEvent,
    Equipment,
    InspectionItem,
    Reading,
    Shift,
    Task,
    WorkOrder,
)

# (编号, 名称, 类别, 车间, 厂商, 初始状态)
EQUIPMENTS = [
    ("CNC-01", "立式加工中心1号", "CNC加工中心", "机加一车间", "DMG MORI", "running"),
    ("CNC-02", "立式加工中心2号", "CNC加工中心", "机加一车间", "DMG MORI", "running"),
    ("CNC-03", "立式加工中心3号", "CNC加工中心", "机加一车间", "HAAS", "idle"),
    ("INJ-01", "注塑机1号", "注塑机", "注塑车间", "海天精工", "running"),
    ("INJ-02", "注塑机2号", "注塑机", "注塑车间", "海天精工", "running"),
    ("AIR-01", "螺杆空压机1号", "空压机", "动力站房", "阿特拉斯", "maintenance"),
    ("AIR-02", "螺杆空压机2号", "空压机", "动力站房", "阿特拉斯", "running"),
    ("PMP-01", "循环水泵1号", "水泵", "动力站房", "格兰富", "running"),
    ("PMP-02", "循环水泵2号", "水泵", "动力站房", "格兰富", "running"),
    ("CV-01", "传送带A线", "传送带", "装配车间", "德马泰克", "running"),
    ("CV-02", "传送带B线", "传送带", "装配车间", "德马泰克", "running"),
    ("ROB-01", "焊接机器人1号", "工业机器人", "焊装车间", "FANUC", "running"),
]

# 点检项模板：(名称, 类型, 单位, 下限, 上限)
ITEM_TEMPLATES = {
    "CNC加工中心": [
        ("主轴温度", "param", "℃", 20, 55),
        ("主轴转速", "param", "rpm", 0, 8000),
        ("润滑系统压力", "param", "MPa", 0.3, 0.6),
        ("冷却液液位", "check", "", None, None),
        ("有无异响", "check", "", None, None),
    ],
    "注塑机": [
        ("液压油温度", "param", "℃", 20, 55),
        ("系统压力", "param", "MPa", 8, 14),
        ("料筒温度", "param", "℃", 180, 230),
        ("冷却水流量", "check", "", None, None),
        ("有无漏油", "check", "", None, None),
    ],
    "空压机": [
        ("排气压力", "param", "MPa", 0.6, 0.8),
        ("排气温度", "param", "℃", 70, 95),
        ("润滑油压力", "param", "MPa", 0.2, 0.4),
        ("排水是否正常", "check", "", None, None),
        ("有无异响振动", "check", "", None, None),
    ],
    "水泵": [
        ("出口压力", "param", "MPa", 0.25, 0.45),
        ("电机电流", "param", "A", 10, 25),
        ("轴承温度", "param", "℃", 30, 70),
        ("有无漏水", "check", "", None, None),
    ],
    "传送带": [
        ("运行速度", "param", "m/s", 0.8, 1.5),
        ("电机温度", "param", "℃", 30, 75),
        ("皮带张紧度", "check", "", None, None),
        ("急停按钮", "check", "", None, None),
    ],
    "工业机器人": [
        ("控制柜温度", "param", "℃", 15, 45),
        ("伺服温度", "param", "℃", 20, 70),
        ("气源压力", "param", "MPa", 0.45, 0.65),
        ("线缆磨损情况", "check", "", None, None),
        ("报警代码检查", "check", "", None, None),
    ],
}

SHIFTS = [
    ("早班", "08:00", "16:00"),
    ("中班", "16:00", "00:00"),
    ("夜班", "00:00", "08:00"),
]


class Command(BaseCommand):
    help = "生成设备点检演示数据"

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset", action="store_true", help="清空业务数据后重新生成"
        )

    def handle(self, *args, **options):
        if options["reset"]:
            self.stdout.write("清空旧数据 ...")
            Reading.objects.all().delete()
            Task.objects.all().delete()
            WorkOrder.objects.all().delete()
            AbnormalReport.objects.all().delete()
            DowntimeEvent.objects.all().delete()
            Equipment.objects.all().delete()
            InspectionItem.objects.all().delete()
            Shift.objects.all().delete()
        elif Equipment.objects.exists():
            self.stdout.write(
                self.style.WARNING("已存在样例数据，跳过。如需重建请加 --reset")
            )
            return

        rng = random.Random(20260912)

        # 班次
        shifts = []
        for name, start, end in SHIFTS:
            shifts.append(
                Shift.objects.create(
                    name=name,
                    start_time=start,
                    end_time=end,
                )
            )
        self.stdout.write(f"班次：{', '.join(s.name for s in shifts)}")

        # 点检项模板
        item_index = {}
        for category, templates in ITEM_TEMPLATES.items():
            for sort_order, (name, kind, unit, low, high) in enumerate(templates):
                item = InspectionItem.objects.create(
                    category=category,
                    name=name,
                    kind=kind,
                    unit=unit,
                    lower_limit=low,
                    upper_limit=high,
                    sort_order=sort_order,
                )
                item_index.setdefault(category, []).append(item)
        self.stdout.write(f"点检项模板：{InspectionItem.objects.count()} 条")

        # 设备台账
        equipments = []
        for code, name, category, area, maker, eq_status in EQUIPMENTS:
            equipments.append(
                Equipment.objects.create(
                    code=code,
                    name=name,
                    category=category,
                    area=area,
                    manufacturer=maker,
                    status=eq_status,
                )
            )
        self.stdout.write(f"设备台账：{Equipment.objects.count()} 台")

        today = timezone.localdate()
        morning = shifts[0]
        evening = shifts[1]

        def make_normal_readings(task, force_bad_item=None, bad_value=None):
            readings, abnormal_reading = [], None
            for item in item_index[task.equipment.category]:
                if item.kind == "param":
                    low, high = item.lower_limit, item.upper_limit
                    if force_bad_item and item.name == force_bad_item:
                        value = bad_value
                    else:
                        margin = (high - low) * 0.12
                        value = round(
                            rng.uniform(low + margin, high - margin), 1
                        )
                    reading = Reading(task=task, item=item, value=value)
                    reading.evaluate()
                    if force_bad_item and item.name == force_bad_item:
                        reading.normal = False
                        abnormal_reading = reading
                else:
                    reading = Reading(
                        task=task, item=item, value=None, normal=True
                    )
                reading.save()
                readings.append(reading)
            return readings, abnormal_reading

        # 1) INJ-01 早班任务：液压油温度超上限 -> 待派单异常
        inj01 = Equipment.objects.get(code="INJ-01")
        t_inj = Task.objects.create(
            equipment=inj01, shift=morning, task_date=today,
            status=Task.Status.ABNORMAL, inspector="王建国",
            started_at=timezone.now() - timedelta(hours=3),
            finished_at=timezone.now() - timedelta(hours=2, minutes=40),
        )
        _, bad = make_normal_readings(
            t_inj, force_bad_item="液压油温度", bad_value=62.0
        )
        AbnormalReport.objects.create(
            task=t_inj, equipment=inj01, item=bad.item,
            reading_value="62.0℃",
            phenomenon="液压油温度持续偏高，冷却器表面烫手，怀疑冷却水流量不足",
            severity="high", reporter="王建国",
        )

        # 2) AIR-01 早班任务：排气压力低 -> 已派单、维修中 + 停机记录
        air01 = Equipment.objects.get(code="AIR-01")
        t_air = Task.objects.create(
            equipment=air01, shift=morning, task_date=today,
            status=Task.Status.ABNORMAL, inspector="李志强",
            started_at=timezone.now() - timedelta(hours=3, minutes=20),
            finished_at=timezone.now() - timedelta(hours=3),
        )
        _, bad_air = make_normal_readings(
            t_air, force_bad_item="排气压力", bad_value=0.52
        )
        rpt_air = AbnormalReport.objects.create(
            task=t_air, equipment=air01, item=bad_air.item,
            reading_value="0.52MPa",
            phenomenon="排气压力低于下限，加载后压力上升缓慢",
            severity="critical", reporter="李志强",
        )
        downtime = DowntimeEvent.objects.create(
            equipment=air01, reason="fault",
            remark="排气压力不足，停机检修进气阀",
        )
        # 停机时间稍微提前
        DowntimeEvent.objects.filter(pk=downtime.pk).update(
            stopped_at=timezone.now() - timedelta(hours=2, minutes=50)
        )
        wo_air = WorkOrder.objects.create(
            abnormal=rpt_air, equipment=air01, assignee="赵维修",
            description="空压机加载无力，排查进气阀与进气滤清器，必要时更换",
            status=WorkOrder.Status.REPAIRING,
            started_at=timezone.now() - timedelta(hours=2, minutes=40),
        )
        rpt_air.status = AbnormalReport.Status.DISPATCHED
        rpt_air.save(update_fields=["status"])

        # 3) PMP-02 昨日中班：漏水异常 -> 已完工待验收，设备维修中待复机确认
        yesterday = today - timedelta(days=1)
        pmp02 = Equipment.objects.get(code="PMP-02")
        pmp02.status = Equipment.Status.MAINTENANCE
        pmp02.save(update_fields=["status"])
        pmp_downtime = DowntimeEvent.objects.create(
            equipment=pmp02, reason="fault", remark="机械密封漏水，停机更换密封件"
        )
        DowntimeEvent.objects.filter(pk=pmp_downtime.pk).update(
            stopped_at=timezone.now() - timedelta(days=1, hours=1, minutes=40)
        )
        t_pmp = Task.objects.create(
            equipment=pmp02, shift=evening, task_date=yesterday,
            status=Task.Status.ABNORMAL, inspector="孙丽",
            started_at=timezone.now() - timedelta(days=1, hours=2),
            finished_at=timezone.now() - timedelta(days=1, hours=1, minutes=50),
        )
        leak_item = item_index["水泵"]
        check_item = next(i for i in leak_item if i.name == "有无漏水")
        for item in leak_item:
            if item.kind == "param":
                low, high = item.lower_limit, item.upper_limit
                Reading(
                    task=t_pmp, item=item,
                    value=round(rng.uniform(low + 1, high - 1), 1),
                    normal=True,
                ).save()
            else:
                reading = Reading(
                    task=t_pmp, item=item,
                    normal=item.name != "有无漏水",
                )
                reading.save()
        rpt_pmp = AbnormalReport.objects.create(
            task=t_pmp, equipment=pmp02, item=check_item,
            reading_value="异常",
            phenomenon="机械密封处滴漏，地面有积水",
            severity="low", reporter="孙丽",
        )
        wo_pmp = WorkOrder.objects.create(
            abnormal=rpt_pmp, equipment=pmp02, assignee="周工",
            description="更换循环水泵机械密封并紧固进出口法兰",
            status=WorkOrder.Status.DONE,
            started_at=timezone.now() - timedelta(days=1, hours=1),
            finished_at=timezone.now() - timedelta(hours=20),
            result="已更换机械密封组件，试运行30分钟无渗漏",
        )
        rpt_pmp.status = AbnormalReport.Status.RESOLVED
        rpt_pmp.save(update_fields=["status"])

        # 4) 给其余“可点检”设备生成今日早班待点检任务
        busy = {inj01.pk, air01.pk}
        for eq in equipments:
            if eq.pk in busy or eq.status in ("down", "maintenance"):
                continue
            Task.objects.create(
                equipment=eq, shift=morning, task_date=today,
                status=Task.Status.PENDING,
            )
        # 中班、夜班任务也一并生成（演示按班次生成）
        for eq in equipments:
            if eq.status in ("down", "maintenance"):
                continue
            for shift in shifts[1:]:
                Task.objects.get_or_create(
                    equipment=eq, shift=shift, task_date=today,
                    kind=Task.Kind.NORMAL,
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"\n样例数据生成完成：\n"
                f"  设备 {Equipment.objects.count()} 台\n"
                f"  点检任务 {Task.objects.count()} 个\n"
                f"  异常报告 {AbnormalReport.objects.count()} 张\n"
                f"  维修工单 {WorkOrder.objects.count()} 张\n"
                f"  停机记录 {DowntimeEvent.objects.count()} 条（进行中 "
                f"{DowntimeEvent.objects.filter(resumed_at__isnull=True).count()} 条）"
            )
        )
