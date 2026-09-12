import { useEffect, useState } from "react";
import { api } from "../api.js";
import Badge from "../components/Badge.jsx";
import Modal from "../components/Modal.jsx";
import { useToast } from "../components/Toast.jsx";

const STATUS_OPTIONS = [
  ["", "全部状态"],
  ["open", "待派单"],
  ["dispatched", "已派单"],
  ["resolved", "已处理"],
  ["closed", "已关闭"],
];

export default function Abnormals() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("");
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = () =>
    api.abnormals({ status }).then(setRows).catch(console.error);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="card">
      <div className="toolbar">
        <label className="field">
          状态
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <div className="spacer" />
        <button onClick={() => setShowCreate(true)}>+ 手动上报异常</button>
      </div>

      <div className="table-wrap" style={{ boxShadow: "none" }}>
        <table>
          <thead>
            <tr>
              <th>异常单号</th>
              <th>设备</th>
              <th>点检项</th>
              <th>异常读数</th>
              <th>异常现象</th>
              <th>程度</th>
              <th>状态</th>
              <th>上报人/时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.report_no}</td>
                <td>{r.equipment_code}<br /><span className="muted">{r.equipment_name}</span></td>
                <td>{r.item_name || "—"}</td>
                <td>{r.reading_value || "—"}</td>
                <td style={{ whiteSpace: "normal", maxWidth: 280 }}>{r.phenomenon}</td>
                <td><Badge value={r.severity} /></td>
                <td><Badge value={r.status} /></td>
                <td>
                  {r.reporter || "—"}
                  <br />
                  <span className="muted">{r.reported_at.replace("T", " ").slice(0, 16)}</span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="small secondary" onClick={() => setDetail(r)}>
                      详情
                    </button>
                    {r.status === "open" && (
                      <button className="small" onClick={() => setDispatchTarget(r)}>
                        派单维修
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="empty">暂无异常报告</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {dispatchTarget && (
        <DispatchModal
          report={dispatchTarget}
          onClose={() => setDispatchTarget(null)}
          onDone={() => {
            setDispatchTarget(null);
            load();
            toast("维修工单已派发");
          }}
        />
      )}
      {showCreate && (
        <CreateAbnormalModal
          onClose={() => setShowCreate(false)}
          onDone={() => {
            setShowCreate(false);
            load();
            toast("异常已上报");
          }}
        />
      )}
      {detail && (
        <Modal title={`异常报告 ${detail.report_no}`} onClose={() => setDetail(null)}
          footer={<button onClick={() => setDetail(null)}>关闭</button>}>
          <dl className="kv">
            <dt>设备</dt><dd>{detail.equipment_code} {detail.equipment_name}</dd>
            <dt>点检项</dt><dd>{detail.item_name || "—"}</dd>
            <dt>异常读数</dt><dd>{detail.reading_value || "—"}</dd>
            <dt>严重程度</dt><dd><Badge value={detail.severity} /></dd>
            <dt>状态</dt><dd><Badge value={detail.status} /></dd>
            <dt>上报人</dt><dd>{detail.reporter || "—"}</dd>
            <dt>异常现象</dt><dd style={{ whiteSpace: "pre-wrap" }}>{detail.phenomenon}</dd>
          </dl>
        </Modal>
      )}
    </div>
  );
}

function DispatchModal({ report, onClose, onDone }) {
  const toast = useToast();
  const [assignee, setAssignee] = useState("");
  const [description, setDescription] = useState(report.phenomenon);
  const [alsoStop, setAlsoStop] = useState(true);
  const [stopReason, setStopReason] = useState(report.severity === "critical" ? "故障严重，先停机再维修" : "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!assignee.trim()) return toast("请填写维修负责人", "err");
    setBusy(true);
    try {
      const res = await api.dispatch(report.id, { assignee, description });
      // 紧急/严重异常可同时做停机标记；已有进行中停机记录时跳过
      if (alsoStop) {
        try {
          await api.stopEquipment(res.work_order.equipment, {
            reason: "fault",
            remark: stopReason || `异常 ${report.report_no} 派单维修，同步停机`,
          });
        } catch (stopErr) {
          toast(`派单成功，但停机标记未做：${stopErr.message}`, "err");
          onDone();
          return;
        }
      }
      onDone();
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`维修派单 · ${report.report_no}`}
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>取消</button>
          <button onClick={submit} disabled={busy}>{busy ? "提交中…" : "确认派单"}</button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          设备
          <input value={`${report.equipment_code} ${report.equipment_name}`} disabled />
        </label>
        <label className="field">
          维修负责人 *
          <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="如：赵维修" />
        </label>
        <label className="field full">
          故障描述
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="full" style={{ borderTop: "1px dashed var(--border)", paddingTop: 12 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={alsoStop} onChange={(e) => setAlsoStop(e.target.checked)} />
            同时做停机标记（设备状态置为停机，等待维修后复机确认）
          </label>
          {alsoStop && (
            <textarea
              style={{ width: "100%", marginTop: 10 }}
              value={stopReason}
              placeholder="停机说明（可选）"
              onChange={(e) => setStopReason(e.target.value)}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

function CreateAbnormalModal({ onClose, onDone }) {
  const toast = useToast();
  const [equipments, setEquipments] = useState([]);
  const [form, setForm] = useState({
    equipment: "",
    phenomenon: "",
    severity: "low",
    reporter: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.equipment().then(setEquipments).catch(console.error);
  }, []);

  const submit = async () => {
    if (!form.equipment) return toast("请选择设备", "err");
    if (!form.phenomenon.trim()) return toast("请描述异常现象", "err");
    setBusy(true);
    try {
      await api.createAbnormal(form);
      onDone();
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="手动上报异常"
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>取消</button>
          <button onClick={submit} disabled={busy}>{busy ? "提交中…" : "上报"}</button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field full">
          设备 *
          <select
            value={form.equipment}
            onChange={(e) => setForm({ ...form, equipment: e.target.value })}
          >
            <option value="">请选择设备</option>
            {equipments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} {e.name}（{e.status_display}）
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          严重程度
          <select
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: e.target.value })}
          >
            <option value="low">一般</option>
            <option value="high">严重</option>
            <option value="critical">紧急</option>
          </select>
        </label>
        <label className="field">
          上报人
          <input
            value={form.reporter}
            onChange={(e) => setForm({ ...form, reporter: e.target.value })}
          />
        </label>
        <label className="field full">
          异常现象 *
          <textarea
            value={form.phenomenon}
            onChange={(e) => setForm({ ...form, phenomenon: e.target.value })}
            placeholder="如：运行时有金属摩擦声，机台轻微振动"
          />
        </label>
      </div>
    </Modal>
  );
}
