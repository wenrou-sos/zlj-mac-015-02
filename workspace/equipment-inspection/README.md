# 工厂设备点检系统（Equipment Inspection System）

按班次自动生成设备点检任务，记录设备运行参数与异常现象，串联「异常上报 → 维修派单 → 停机标记 → 维修完工 → 复机确认」的完整闭环。

## 技术栈

- 前端：React 18 + Vite + React Router（纯 CSS，无重型 UI 库）
- 后端：Django 4 + Django REST Framework
- 数据库：默认 SQLite 零配置运行；支持 PostgreSQL（环境变量切换，附 docker-compose）

## 功能清单

| 模块 | 能力 |
| --- | --- |
| 总览看板 | 设备状态分布、今日任务进度、未关闭异常、进行中工单、停机中设备、最近异常 |
| 点检任务 | 选择日期 + 班次（可多选）批量生成任务，幂等可重复执行；停机/维修中设备自动跳过 |
| 点检执行 | 按设备类别加载点检项模板；参数项按上下限自动判异，检查项手动选择正常/异常；异常项可填写现象与严重程度；提交后自动生成异常报告单 |
| 异常报告 | 支持手动上报；待派单异常一键派单，可勾选“同时停机标记” |
| 维修工单 | 派单 → 开工 → 完工（登记维修结果） → 验收（验收后异常单关闭） |
| 设备台账 | 设备状态（运行/待机/维修中/停机），直接做停机标记与复机确认 |
| 停机复机 | 进行中停机清单与复机历史；复机必须登记确认人，确认后设备恢复运行 |

状态流转：

```
点检任务:  待点检 → 点检中 → 已完成 / 有异常
异常报告:  待派单 → 已派单 → 已处理 → 已关闭(工单验收时)
维修工单:  已派单 → 维修中 → 已完成 → 已验收
设备:      运行中 ⇄ 维修中(派单/开工) ；运行中 → 停机 →(复机确认)→ 运行中
```

## 目录结构

```
equipment-inspection/
├── backend/          Django + DRF
│   ├── config/       项目配置（SQLite / PostgreSQL 切换）
│   ├── inspection/   应用：models / views / serializers / seed_demo
│   └── requirements.txt
└── frontend/         React + Vite
    └── src/pages/    看板、任务、异常、工单、设备、停机复机 6 个页面
```

## 本地快速启动（SQLite，无需数据库）

后端：

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo        # 灌入本地设备样例数据；--reset 可重建
python manage.py runserver 8000
```

前端：

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173 ，/api 自动代理到 8000
```

访问 http://localhost:5173 。

Django 管理后台：`python manage.py createsuperuser` 后访问 http://localhost:8000/admin/ 。

## 使用 PostgreSQL

方式一：docker-compose 起数据库：

```bash
docker compose up -d db
```

方式二：使用已有 PostgreSQL，然后设置环境变量启动后端：

```bash
export USE_POSTGRES=1
export POSTGRES_DB=inspection POSTGRES_USER=inspection POSTGRES_PASSWORD=inspection
export POSTGRES_HOST=localhost POSTGRES_PORT=5432
python manage.py migrate
python manage.py seed_demo
```

## 样例数据说明（seed_demo）

- 3 个班次：早班 08:00–16:00 / 中班 16:00–24:00 / 夜班 00:00–08:00
- 12 台设备：CNC 加工中心、注塑机、空压机、水泵、传送带、焊接机器人，分布在 5 个车间
- 28 条点检项模板：数值参数带上下限（温度/压力/转速/电流等）+ 检查项（漏油/异响/急停等）
- 当日 3 个班次点检任务各 10 台可点检设备（停机/维修设备跳过）
- 预置 3 条典型业务链：
  - **INJ-01 注塑机**：早班点检液压油温度 62℃ 超上限 → 异常报告「待派单」，可体验派单
  - **AIR-01 空压机**：排气压力 0.52MPa 偏低 → 已派单、维修中，且已停机（待复机确认）
  - **PMP-02 循环水泵**：机械密封漏水 → 工单已完工「待验收」，设备维修中（可体验验收/复机）

## 主要 API

| 方法 & 路径 | 说明 |
| --- | --- |
| `GET  /api/dashboard/` | 看板统计 |
| `GET/POST /api/equipment/` | 设备台账 |
| `POST /api/equipment/{id}/stop/` | 停机标记（reason、remark） |
| `POST /api/equipment/{id}/resume/` | 复机确认（confirm_by 必填、resume_note） |
| `GET  /api/shifts/`、`/api/items/?category=` | 班次、点检项模板 |
| `POST /api/tasks/generate/` | 生成任务（date、shift_ids 可选，幂等） |
| `POST /api/tasks/{id}/start/` | 开始点检（inspector） |
| `POST /api/tasks/{id}/submit/` | 提交点检结果，超限/异常自动开异常单 |
| `GET/POST /api/abnormals/` | 异常列表/手动上报 |
| `POST /api/abnormals/{id}/dispatch/` | 维修派单（assignee 必填） |
| `POST /api/work-orders/{id}/start|finish|accept/` | 开工 / 完工(result) / 验收 |
| `GET  /api/downtimes/?active=true|false` | 停机记录与复机历史 |

> 演示项目为简化使用 `AllowAny` 权限，未接入登录鉴权；生产使用请补充认证（如 DRF Token/JWT）与权限控制。
