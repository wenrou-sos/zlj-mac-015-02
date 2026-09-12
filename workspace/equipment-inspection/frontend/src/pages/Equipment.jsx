import { useEffect, useState } from "react";
import { api } from "../api.js";
import Badge from "../components/Badge.jsx";
import Modal from "../components/Modal.jsx";
import { useToast } from "../components/Toast.jsx";

export default function EquipmentPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [stopTarget, setStopTarget] = useState(null);
  const [resumeTarget, setResumeTarget] = useState(null);

  const load = () =>
    api.equipment({ status: statusFilter }).then(setRows).catch(console.error);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <div className="card">
      <div className="toolbar">
        <label className="field">
          设备状态
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">全部</option>
            <option value="running">运行中</option>
            <option value="idle">待机</option>
            <option value="maintenance">维修中</option>
            <option value="down">停机</option>
          </select>
        </label>
        <span className="spacer" />
        <span className="muted">共 {rows.length} 台设备</span>
      </div>

      <div className="table-wrap" style={{ boxShadow: "none" }}>
        <table>
          <thead>
            <tr>
              <th>设备编号</th>
              <th>设备名称</th>
              <th>类别</th>
              <th>车间</th>
              <th>制造商</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{e.code}</td>
                <td>{e.name}</td>
                <td>{e.category}</td>
                <td>{e.area}</td>
                <td>{e.manufacturer}</td>
                <td><Badge value={e.status} /></td>
                <td>
                  {e.active_downtime_id ? (
                    <button className="small" onClick={() => setResumeTarget(e)}>
                      复机确认
                    </button>
                  ) : (
                    <button className="small danger" onClick={() => setStopTarget(e)}>
                      停机标记
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stopTarget && (
        <StopModal
          equipment={stopTarget}
          onClose={() => setStopTarget(null)}
          onDone={() => {
            setStopTarget(null);
            load();
            toast("已标记停机");
          }}
        />
      )}
      {resumeTarget && (
        <ResumeModal
          equipment={resumeTarget}
          onClose={() => setResumeTarget(null)}
          onDone={() => {
            setResumeTarget(null);
            load();
            toast("复机确认完成，设备恢复运行");
          }}
        />
      )}
    </div>
  );
}

function StopModal({ equipment, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ reason: "fault", remark: "" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.stopEquipment(equipment.id, form);
      onDone();
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`停机标记 · ${equipment.code} ${equipment.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>取消</button>
          <button className="danger" onClick={submit} disabled={busy}>
            {busy ? "提交中…" : "确认停机"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field full">
          停机原因
          <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
            <option value="fault">故障停机</option>
            <option value="planned">计划停机</option>
            <option value="other">其他</option>
          </select>
        </label>
        <label className="field full">
          停机说明
          <textarea
            value={form.remark}
            onChange={(e) => setForm({ ...form, remark: e.target.value })}
            placeholder="如：轴承异响，待维修班检查"
          />
        </label>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        停机后该设备不再生成点检任务，复机需登记确认人。
      </p>
    </Modal>
  );
}

function ResumeModal({ equipment, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ confirm_by: "", resume_note: "" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.confirm_by.trim()) return toast("请填写复机确认人", "err");
    setBusy(true);
    try {
      await api.resumeEquipment(equipment.id, form);
      onDone();
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`复机确认 · ${equipment.code} ${equipment.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="secondary" onClick={onClose}>取消</button>
          <button onClick={submit} disabled={busy}>{busy ? "提交中…" : "确认复机"}</button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field full">
          复机确认人 *
          <input
            value={form.confirm_by}
            onChange={(e) => setForm({ ...form, confirm_by: e.target.value })}
            placeholder="现场确认设备可恢复运行的负责人"
          />
        </label>
        <label className="field full">
          复机说明（试运行情况）
          <textarea
            value={form.resume_note}
            onChange={(e) => setForm({ ...form, resume_note: e.target.value })}
            placeholder="如：空载试运行20分钟，温度压力正常，恢复生产"
          />
        </label>
      </div>
    </Modal>
  );
}
