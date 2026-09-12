// 各类业务状态对应的中文文案与徽标颜色
const MAP = {
  // 设备状态
  running: ["运行中", "green"],
  idle: ["待机", "gray"],
  down: ["停机", "red"],
  maintenance: ["维修中", "orange"],
  // 任务状态
  pending: ["待点检", "gray"],
  in_progress: ["点检中", "blue"],
  done: ["已完成", "green"],
  abnormal: ["有异常", "red"],
  missed: ["漏检", "purple"],
  // 任务类型
  recheck: ["补检", "purple"],
  // 异常单状态
  open: ["待派单", "orange"],
  dispatched: ["已派单", "blue"],
  resolved: ["已处理", "green"],
  closed: ["已关闭", "gray"],
  // 工单状态
  assigned: ["已派单", "blue"],
  repairing: ["维修中", "orange"],
  accepted: ["已验收", "green"],
  // 严重程度
  low: ["一般", "gray"],
  high: ["严重", "orange"],
  critical: ["紧急", "red"],
  // 停机原因
  fault: ["故障停机", "red"],
  planned: ["计划停机", "blue"],
  other: ["其他", "gray"],
};

export default function Badge({ value }) {
  const [text, color] = MAP[value] || [value, "gray"];
  return <span className={`badge badge-${color}`}>{text}</span>;
}
