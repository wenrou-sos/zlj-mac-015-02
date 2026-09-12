"""把班次结束后仍未提交（待点检/点检中）的点检任务落为漏检。

页面访问任务列表/看板时会惰性执行同样的落判；此命令用于定时任务（cron）场景：

    python manage.py mark_missed
"""
from django.core.management.base import BaseCommand

from inspection.models import Task


class Command(BaseCommand):
    help = "班次结束仍未提交的点检任务标记为漏检"

    def handle(self, *args, **options):
        n = Task.mark_overdue_missed()
        self.stdout.write(self.style.SUCCESS(f"已标记 {n} 个漏检任务"))
