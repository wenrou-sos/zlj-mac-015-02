import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import Badge from "../components/Badge.jsx";

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.dashboard().then(setData).catch(console.error);
  }, []);

  if (!data) return <div className="empty">加载中…</div>;

  const e = data.equipment;
  const t = data.tasks_today;

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card ok">
          <div className="label">设备总数 / 运行中</div>
          <div className="value">
            {e.total}
            <span className="muted" style={{ fontSize: 15 }}> / {e.running}</span>
          </div>
        </div>
        <div className="stat-card info">
          <div className="label">今日点检任务</div>
          <div className="value">
            {t.total}
            <span className="muted" style={{ fontSize: 14 }}>
              {" "}
              待检 {t.pending + t.in_progress}
            </span>
          </div>
        </div>
        <div className="stat-card danger">
          <div className="label">未关闭异常</div>
          <div className="value">{data.open_abnormals}</div>
        </div>
        <div className="stat-card warn">
          <div className="label">进行中工单</div>
          <div className="value">{data.active_work_orders}</div>
        </div>
        <div className="stat-card danger">
          <div className="label">停机中设备</div>
          <div className="value">{data.active_downtimes}</div>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h2>设备状态分布</h2>
          <div className="kv">
            <dt>运行中</dt>
            <dd><Badge value="running" /> {e.running} 台</dd>
            <dt>待机</dt>
            <dd><Badge value="idle" /> {e.idle} 台</dd>
            <dt>维修中</dt>
            <dd><Badge value="maintenance" /> {e.maintenance} 台</dd>
            <dt>停机</dt>
            <dd><Badge value="down" /> {e.down} 台</dd>
          </div>
        </div>

        <div className="card">
          <h2>今日任务进度</h2>
          <ProgressBar
            items={[
              ["待点检", t.pending, "#c0c6cc"],
              ["点检中", t.in_progress, "#1677ff"],
              ["已完成", t.done, "#52c41a"],
              ["有异常", t.abnormal, "#ff4d4f"],
              ["漏检", t.missed, "#722ed1"],
            ]}
            total={t.total}
          />
          <p className="muted" style={{ marginTop: 12 }}>
            可在 <Link to="/tasks">点检任务</Link> 页按班次生成并执行任务
          </p>
        </div>
      </div>

      <div className="card">
        <h2>最近异常</h2>
        <div className="table-wrap" style={{ boxShadow: "none" }}>
          <table>
            <thead>
              <tr>
                <th>异常单号</th>
                <th>设备</th>
                <th>异常现象</th>
                <th>严重程度</th>
                <th>状态</th>
                <th>上报时间</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_abnormals.map((r) => (
                <tr key={r.id}>
                  <td>{r.report_no}</td>
                  <td>{r.equipment_code} {r.equipment_name}</td>
                  <td style={{ whiteSpace: "normal", maxWidth: 380 }}>
                    {r.phenomenon}
                  </td>
                  <td><Badge value={r.severity} /></td>
                  <td><Badge value={r.status} /></td>
                  <td>{r.reported_at.replace("T", " ").slice(0, 16)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ items, total }) {
  if (!total) return <div className="empty">今日尚未生成任务</div>;
  return (
    <div>
      <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", background: "#f0f2f5" }}>
        {items.map(([label, n, color]) =>
          n > 0 ? (
            <div
              key={label}
              title={`${label} ${n}`}
              style={{ width: `${(n / total) * 100}%`, background: color }}
            />
          ) : null
        )}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
        {items.map(([label, n, color]) => (
          <span key={label} className="muted">
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: color, marginRight: 5 }} />
            {label} {n}
          </span>
        ))}
      </div>
    </div>
  );
}
