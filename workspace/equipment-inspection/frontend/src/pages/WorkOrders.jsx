import { useEffect, useState } from "react";
import { api } from "../api.js";
import Badge from "../components/Badge.jsx";
import Modal from "../components/Modal.jsx";
import { useToast } from "../components/Toast.jsx";

const STATUS_OPTIONS = [
  ["", "全部状态"],
  ["assigned", "已派单"],
  ["repairing", "维修中"],
  ["done", "已完成"],
  ["accepted", "已验收"],
];

export default function WorkOrders() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("");
  const [finishTarget, setFinishTarget] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = () => api.workOrders({ status }).then(setRows).catch(console.error);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const act = async (fn, okMsg) => {
    try {
      await fn();
      toast(okMsg);
      load();
    } catch (e) {
      toast(e.message, "err");
    }
  };

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
        <span className="spacer" />
        <span className="muted">流程：派单 → 开工 → 完工（登记结果） → 验收关闭异常单</span>
      </div>

      <div className="table-wrap" style={{ boxShadow: "none" }}>
        <table>
          <thead>
            <tr>
              <th>工单号</th>
              <th>来源异常</th>
              <th>设备</th>
              <th>维修负责人</th>
              <th>故障描述</th>
              <th>状态</th>
              <th>派单时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>{o.order_no}</td>
                <td>{o.abnormal_no || "—"}</td>
                <td>{o.equipment_code}<br /><span className="muted">{o.equipment_name}</span></td>
                <td>{o.assignee}</td>
                <td style={{ whiteSpace: "normal", maxWidth: 260 }}>{o.description}</td>
                <td><Badge value={o.status} /></td>
                <td>{o.created_at.replace("T", " ").slice(0, 16)}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="small secondary" onClick={() => setDetail(o)}>详情</button>
                    {o.status === "assigned" && (
                      <button className="small" onClick={() => act(() => api.startOrder(o.id), "已开工")}>
                        开工
                      </button>
                    )}
                    {o.status === "repairing" && (
                      <button className="small" onClick={() => setFinishTarget(o)}>
                        完工
                      </button>
                    )}
                    {o.status === "done" && (
                      <button className="small" onClick={() => act(() => api.acceptOrder(o.id), "已验收，异常单关闭")}>
                        验收
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="empty">暂无维修工单</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {finishTarget && (
        <FinishModal
          order={finishTarget}
          onClose={() => setFinishTarget(null)}
          onDone={() => {
            setFinishTarget(null);
            load();
            toast("工单已完工，等待验收");
          }}
        />
      )}
      {detail && (
        <Modal title={`维修工单 ${detail.order_no}`} onClose={() => setDetail(null)}
          footer={<button onClick={() => setDetail(null)}>关闭</button>}>
          <dl className="kv">
            <dt>设备</dt><dd>{detail.equipment_code} {detail.equipment_name}</dd>
            <dt>来源异常</dt><dd>{detail.abnormal_no || "手工创建"}</dd>
            <dt>负责人</dt><dd>{detail.assignee}</dd>
            <dt>状态</dt><dd><Badge value={detail.status} /></dd>
            <dt>派单时间</dt><dd>{fmt(detail.created_at)}</dd>
            <dt>开工时间</dt><dd>{fmt(detail.started_at)}</dd>
            <dt>完工时间</dt><dd>{fmt(detail.finished_at)}</dd>
            <dt>验收时间</dt><dd>{fmt(detail.accepted_at)}</dd>
            <dt>故障描述</dt><dd style={{ whiteSpace: "pre-wrap" }}>{detail.description}</dd>
            <dt>维修结果</dt><dd style={{ whiteSpace: "pre-wrap" }}>{detail.result || "—"}</dd>
          </dl>
        </Modal>
      )}
    </div>
  );
}

function FinishModal({ order, onClose, onDone }) {
  const toast = useToast();
  const [result, setResult] = useState(order.result || "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!result.trim()) return toast("请填写维修结果", "err");
    setBusy(true);
    try {
      await api.finishOrder(order.id, result);
      onDone();
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`完工登记 · ${order.order_no}`}
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>取消</button>
          <button onClick={submit} disabled={busy}>{busy ? "提交中…" : "确认完工"}</button>
        </>
      }
    >
      <p className="muted">
        {order.equipment_code} {order.equipment_name} · 维修人 {order.assignee}
      </p>
      <label className="field">
        维修结果 / 处理措施 *
        <textarea
          rows={4}
          value={result}
          onChange={(e) => setResult(e.target.value)}
          placeholder="如：更换进气阀密封圈，清洗滤清器，试机压力恢复 0.72MPa"
        />
      </label>
      <p className="muted" style={{ marginBottom: 0 }}>
        完工后设备仍保持停机/维修状态，需在「设备台账」或「停机复机」页面做复机确认。
      </p>
    </Modal>
  );
}

function fmt(v) {
  return v ? v.replace("T", " ").slice(0, 16) : "—";
}
