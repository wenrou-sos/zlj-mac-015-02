const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: options.body
      ? { "Content-Type": "application/json" }
      : {},
    ...options,
  });
  if (!res.ok) {
    let detail = `请求失败（${res.status}）`;
    try {
      const data = await res.json();
      detail = data.detail || JSON.stringify(data);
    } catch {
      /* 非 JSON 错误 */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) =>
    request(path, { method: "POST", body: JSON.stringify(body || {}) }),

  dashboard: () => request("/dashboard/"),

  equipment: (params = {}) =>
    request(`/equipment/${toQuery(params)}`),
  stopEquipment: (id, payload) => request(`/equipment/${id}/stop/`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  resumeEquipment: (id, payload) => request(`/equipment/${id}/resume/`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),

  shifts: () => request("/shifts/"),
  itemsByCategory: (category) =>
    request(`/items/?category=${encodeURIComponent(category)}`),

  tasks: (params = {}) => request(`/tasks/${toQuery(params)}`),
  task: (id) => request(`/tasks/${id}/`),
  generateTasks: (payload) => request(`/tasks/generate/`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  startTask: (id, payload) => request(`/tasks/${id}/start/`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  submitTask: (id, payload) => request(`/tasks/${id}/submit/`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),

  abnormals: (params = {}) => request(`/abnormals/${toQuery(params)}`),
  createAbnormal: (payload) => request(`/abnormals/`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  dispatch: (id, payload) => request(`/abnormals/${id}/dispatch/`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),

  workOrders: (params = {}) => request(`/work-orders/${toQuery(params)}`),
  startOrder: (id) => request(`/work-orders/${id}/start/`, { method: "POST" }),
  finishOrder: (id, result) =>
    request(`/work-orders/${id}/finish/`, {
      method: "POST",
      body: JSON.stringify({ result }),
    }),
  acceptOrder: (id) =>
    request(`/work-orders/${id}/accept/`, { method: "POST" }),

  downtimes: (params = {}) => request(`/downtimes/${toQuery(params)}`),
};

function toQuery(params) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.append(k, v);
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}
