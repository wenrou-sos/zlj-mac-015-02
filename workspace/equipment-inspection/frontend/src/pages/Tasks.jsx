import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import Badge from "../components/Badge.jsx";
import Modal from "../components/Modal.jsx";
import { useToast } from "../components/Toast.jsx";

// 用本地时区取日期；toISOString() 是 UTC，早班时段（UTC+8 早 8 点前）会拿到昨天
const today = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};
const STATUS_OPTIONS = [
  ["", "全部状态"],
  ["pending", "待点检"],
  ["in_progress", "点检中"],
  ["done", "已完成"],
  ["abnormal", "有异常"],
  ["missed", "漏检"],
];

export default function Tasks() {
  const toast = useToast();
  const [shifts, setShifts] = useState([]);
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState("");
  const [status, setStatus] = useState("");
  const [tasks, setTasks] = useState([]);
  const [showGenerate, setShowGenerate] = useState(false);
  const [inspectTask, setInspectTask] = useState(null);

  const load = () =>
    api.tasks({ date, shift, status }).then(setTasks).catch(console.error);

  const recheck = async (t) => {
    try {
      const created = await api.recheckTask(t.id);
      toast(`已生成补检任务 ${created.task_no}`);
      load();
    } catch (e) {
      toast(e.message, "err");
    }
  };

  useEffect(() => {
    api.shifts().then(setShifts).catch(console.error);
  }, []);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, shift, status]);

  return (
    <div>
      <div className="card">
        <div className="toolbar">
          <label className="field" style={{ minWidth: 150 }}>
            点检日期
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field" style={{ minWidth: 130 }}>
            班次
            <select value={shift} onChange={(e) => setShift(e.target.value)}>
              <option value="">全部班次</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 130 }}>
            状态
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <div className="spacer" />
          <button onClick={() => setShowGenerate(true)}>⚙ 按班次生成任务</button>
        </div>

        <div className="table-wrap" style={{ boxShadow: "none" }}>
          <table>
            <thead>
              <tr>
                <th>任务单号</th>
                <th>设备</th>
                <th>班次</th>
                <th>设备状态</th>
                <th>点检人</th>
                <th>任务状态</th>
                <th>异常</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    {t.task_no}
                    {t.kind === "recheck" && (
                      <>
                        {" "}
                        <Badge value="recheck" />
                      </>
                    )}
                  </td>
                  <td>{t.equipment_code} {t.equipment_name}</td>
                  <td>{t.shift_name}</td>
                  <td><Badge value={t.equipment_status} /></td>
                  <td>{t.inspector || "—"}</td>
                  <td><Badge value={t.status} /></td>
                  <td>{t.abnormal_count > 0 ? `${t.abnormal_count} 条` : "—"}</td>
                  <td>
                    {t.status === "missed" ? (
                      t.has_recheck ? (
                        <button className="small secondary" disabled>
                          已生成补检
                        </button>
                      ) : (
                        <button className="small" onClick={() => recheck(t)}>
                          生成补检
                        </button>
                      )
                    ) : t.status === "pending" || t.status === "in_progress" ? (
                      <button className="small" onClick={() => setInspectTask(t)}>
                        执行点检
                      </button>
                    ) : (
                      <button className="small secondary" onClick={() => setInspectTask(t)}>
                        查看记录
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">
                    该条件下暂无任务，可点击右上角按班次生成
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showGenerate && (
        <GenerateModal
          date={date}
          shifts={shifts}
          onClose={() => setShowGenerate(false)}
          onDone={() => {
            setShowGenerate(false);
            load();
            toast("任务生成完成");
          }}
        />
      )}
      {inspectTask && (
        <InspectModal
          taskId={inspectTask.id}
          readonly={["done", "abnormal", "missed"].includes(inspectTask.status)}
          onClose={() => setInspectTask(null)}
          onSubmitted={() => {
            setInspectTask(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// 班次在指定日期是否已结束（结束时间不晚于开始时间视为跨天，顺延到次日）
const shiftEnded = (s, dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [sh, sm] = s.start_time.slice(0, 5).split(":").map(Number);
  const [eh, em] = s.end_time.slice(0, 5).split(":").map(Number);
  const end = new Date(y, m - 1, d, eh, em);
  if (eh * 60 + em <= sh * 60 + sm) end.setDate(end.getDate() + 1);
  return end <= new Date();
};
const openShiftIds = (shifts, dateStr) =>
  shifts.filter((s) => !shiftEnded(s, dateStr)).map((s) => s.id);

function GenerateModal({ date: initialDate, shifts, onClose, onDone }) {
  const toast = useToast();
  const [date, setDate] = useState(initialDate);
  // 默认勾选所选日期尚未结束的班次；已结束的班次生成后会立刻落漏检
  const [shiftIds, setShiftIds] = useState(
    () => new Set(openShiftIds(shifts, initialDate))
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const changeDate = (v) => {
    setDate(v);
    setShiftIds(new Set(openShiftIds(shifts, v)));
  };

  const toggle = (id) => {
    const next = new Set(shiftIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setShiftIds(next);
  };

  const submit = async () => {
    if (!shiftIds.size) return toast("请至少选择一个班次", "err");
    setBusy(true);
    try {
      setResult(
        await api.generateTasks({ date, shift_ids: [...shiftIds] })
      );
      onDone();
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="按班次生成点检任务"
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>关闭</button>
          <button onClick={submit} disabled={busy}>
            {busy ? "生成中…" : "生成"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          点检日期
          <input type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
        </label>
        <div className="field">
          班次（可多选）
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            {shifts.map((s) => {
              const ended = shiftEnded(s, date);
              return (
                <button
                  type="button"
                  key={s.id}
                  disabled={ended}
                  title={ended ? "该班次已结束，生成后会立即落为漏检" : ""}
                  className={`small ${shiftIds.has(s.id) ? "" : "secondary"}`}
                  onClick={() => toggle(s.id)}
                >
                  {s.name}
                  {ended ? "（已结束）" : ""}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
        将为所有非停机/维修中的设备逐台生成任务；同设备、同班次、同日期已存在任务时自动跳过（可重复生成）；已结束的班次不生成。
      </p>
      {result && (
        <>
          <p style={{ color: "var(--ok)", marginBottom: 0 }}>
            新生成 {result.created_count} 个任务，跳过已存在 {result.skipped_count} 个。
          </p>
          {result.ended_shifts?.length > 0 && (
            <p className="muted" style={{ marginBottom: 0 }}>
              已结束班次未生成：{result.ended_shifts.join("、")}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

function InspectModal({ taskId, readonly, onClose, onSubmitted }) {
  const toast = useToast();
  const [task, setTask] = useState(null);
  const [items, setItems] = useState([]);
  const [inspector, setInspector] = useState("");
  const [remark, setRemark] = useState("");
  // itemId -> { value, normal, phenomenon, severity }
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.task(taskId).then(async (detail) => {
      setTask(detail);
      setInspector(detail.inspector || "");
      setRemark(detail.remark || "");
      const itemsData = await api.itemsByCategory(detail.equipment_category);
      setItems(itemsData);
      const initial = {};
      itemsData.forEach((it) => {
        const existing = detail.readings?.find((r) => r.item === it.id);
        initial[it.id] = existing
          ? {
              value: existing.value ?? "",
              normal: existing.normal,
              phenomenon: "",
              severity: "low",
            }
          : { value: "", normal: true, phenomenon: "", severity: "low" };
      });
      setForm(initial);
    });
  }, [taskId]);

  const update = (id, patch) =>
    setForm((f) => ({ ...f, [id]: { ...f[id], ...patch } }));

  const evaluateParam = (item, value) => {
    if (value === "" || value === null) return true;
    const v = Number(value);
    if (Number.isNaN(v)) return false;
    const lo = item.lower_limit, hi = item.upper_limit;
    return (lo === null || v >= lo) && (hi === null || v <= hi);
  };

  const abnormalRows = useMemo(
    () =>
      items.filter((it) => {
        const row = form[it.id];
        if (!row) return false;
        return it.kind === "param"
          ? !evaluateParam(it, row.value)
          : row.normal === false;
      }),
    [items, form]
  );

  const submit = async () => {
    if (!inspector.trim()) return toast("请填写点检人", "err");
    // 参数项必须填写
    const missing = items.filter(
      (it) => it.kind === "param" && form[it.id]?.value === ""
    );
    if (missing.length)
      return toast(`请填写参数：${missing.map((m) => m.name).join("、")}`, "err");

    const readings = items.map((it) => {
      const row = form[it.id];
      const normal =
        it.kind === "param" ? evaluateParam(it, row.value) : row.normal;
      return {
        item: it.id,
        value: it.kind === "param" ? Number(row.value) : null,
        normal,
        phenomenon: normal ? "" : row.phenomenon,
        severity: normal ? "low" : row.severity,
      };
    });
    setBusy(true);
    try {
      await api.startTask(taskId, { inspector });
      const res = await api.submitTask(taskId, {
        inspector,
        remark,
        readings,
      });
      const n = res.abnormal_reports.length;
      toast(n ? `已提交，自动生成 ${n} 张异常报告` : "点检完成，全部正常");
      onSubmitted();
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  if (!task)
    return (
      <Modal title="加载中" onClose={onClose}>
        <div className="empty">加载任务详情…</div>
      </Modal>
    );

  return (
    <Modal
      wide
      title={`点检 · ${task.task_no} · ${task.equipment_code} ${task.equipment_name}`}
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>取消</button>
          {!readonly && (
            <button onClick={submit} disabled={busy}>
              {busy ? "提交中…" : `提交点检${abnormalRows.length ? `（${abnormalRows.length} 项异常）` : ""}`}
            </button>
          )}
        </>
      }
    >
      <div className="form-grid" style={{ marginBottom: 12 }}>
        <label className="field">
          点检人
          <input
            value={inspector}
            disabled={readonly}
            onChange={(e) => setInspector(e.target.value)}
            placeholder="请输入姓名"
          />
        </label>
        <label className="field">
          班次 / 日期
          <input value={`${task.shift_name} · ${task.task_date}`} disabled />
        </label>
      </div>

      {items.map((it) => {
        const row = form[it.id] || {};
        const isAbnormal =
          it.kind === "param"
            ? !evaluateParam(it, row.value)
            : row.normal === false;
        return (
          <div key={it.id} className={isAbnormal ? "reading-row abnormal" : "reading-row"}>
            <div>
              <strong>{it.name}</strong>
              {it.kind === "param" && (
                <div className="rng">
                  标准范围：
                  {it.lower_limit ?? "−"} ~ {it.upper_limit ?? "−"} {it.unit}
                </div>
              )}
            </div>
            {it.kind === "param" ? (
              <input
                type="number"
                step="0.1"
                disabled={readonly}
                value={row.value ?? ""}
                placeholder={`数值${it.unit ? `（${it.unit}）` : ""}`}
                onChange={(e) => update(it.id, { value: e.target.value })}
              />
            ) : (
              <div className="radio-group">
                <button
                  type="button"
                  disabled={readonly}
                  className={row.normal === true ? "on-ok" : "off"}
                  onClick={() => update(it.id, { normal: true })}
                >
                  ✓ 正常
                </button>
                <button
                  type="button"
                  disabled={readonly}
                  className={row.normal === false ? "on-bad" : "off"}
                  onClick={() => update(it.id, { normal: false })}
                >
                  ✗ 异常
                </button>
              </div>
            )}
            <div>{isAbnormal ? <Badge value="abnormal" /> : <Badge value="done" />}</div>
            <div />
            {isAbnormal && !readonly && (
              <div className="full" style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                <input
                  style={{ flex: 1 }}
                  placeholder="描述异常现象（留空则按超限值自动生成）"
                  value={row.phenomenon || ""}
                  onChange={(e) => update(it.id, { phenomenon: e.target.value })}
                />
                <select
                  value={row.severity || "low"}
                  onChange={(e) => update(it.id, { severity: e.target.value })}
                >
                  <option value="low">一般</option>
                  <option value="high">严重</option>
                  <option value="critical">紧急</option>
                </select>
              </div>
            )}
          </div>
        );
      })}

      <label className="field" style={{ marginTop: 14 }}>
        备注
        <textarea
          value={remark}
          disabled={readonly}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="整体备注（可选）"
        />
      </label>
      {readonly && (
        <p className="muted" style={{ marginTop: 10 }}>
          该任务已提交，记录只读。异常处理请前往「异常报告」页面。
        </p>
      )}
    </Modal>
  );
}
