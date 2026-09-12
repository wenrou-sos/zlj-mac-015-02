import { useEffect, useState } from "react";
import { api } from "../api.js";
import Badge from "../components/Badge.jsx";
import Modal from "../components/Modal.jsx";
import { useToast } from "../components/Toast.jsx";

export default function Downtimes() {
  const toast = useToast();
  const [active, setActive] = useState([]);
  const [history, setHistory] = useState([]);
  const [resumeTarget, setResumeTarget] = useState(null);

  const load = () =>
    Promise.all([
      api.downtimes({ active: "true" }),
      api.downtimes({ active: "false" }),
    ]).then(([a, h]) => {
      setActive(a);
      setHistory(h);
    }).catch(console.error);

  useEffect(() => {
    load();
  }, []);

  const equipmentOf = (d) => ({
    id: d.equipment,
    code: d.equipment_code,
    name: d.equipment_name,
  });

  return (
    <div>
      <div className="card">
        <h2>停机中（待复机确认） · {active.length}</h2>
        <div className="table-wrap" style={{ boxShadow: "none" }}>
          <table>
            <thead>
              <tr>
                <th>设备</th>
                <th>停机原因</th>
                <th>说明</th>
                <th>停机时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {active.map((d) => (
                <tr key={d.id}>
                  <td>{d.equipment_code} {d.equipment_name}</td>
                  <td><Badge value={d.reason} /></td>
                  <td style={{ whiteSpace: "normal", maxWidth: 300 }}>{d.remark || "—"}</td>
                  <td>{fmt(d.stopped_at)}</td>
                  <td>
                    <button className="small" onClick={() => setResumeTarget(equipmentOf(d))}>
                      复机确认
                    </button>
                  </td>
                </tr>
              ))}
              {active.length === 0 && (
                <tr><td colSpan={5} className="empty">当前没有停机中的设备</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>复机历史</h2>
        <div className="table-wrap" style={{ boxShadow: "none" }}>
          <table>
            <thead>
              <tr>
                <th>设备</th>
                <th>停机原因</th>
                <th>停机时间</th>
                <th>复机时间</th>
                <th>确认人</th>
                <th>复机说明</th>
              </tr>
            </thead>
            <tbody>
              {history.map((d) => (
                <tr key={d.id}>
                  <td>{d.equipment_code} {d.equipment_name}</td>
                  <td><Badge value={d.reason} /></td>
                  <td>{fmt(d.stopped_at)}</td>
                  <td>{fmt(d.resumed_at)}</td>
                  <td>{d.resume_confirm_by}</td>
                  <td style={{ whiteSpace: "normal", maxWidth: 280 }}>{d.resume_note || "—"}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={6} className="empty">暂无复机记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {resumeTarget && (
        <ResumeModal
          equipment={resumeTarget}
          onClose={() => setResumeTarget(null)}
          onDone={() => {
            setResumeTarget(null);
            load();
            toast("复机确认完成");
          }}
        />
      )}
    </div>
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
          />
        </label>
        <label className="field full">
          复机说明
          <textarea
            value={form.resume_note}
            onChange={(e) => setForm({ ...form, resume_note: e.target.value })}
            placeholder="试运行结果、参数恢复情况"
          />
        </label>
      </div>
    </Modal>
  );
}

function fmt(v) {
  return v ? v.replace("T", " ").slice(0, 16) : "—";
}
