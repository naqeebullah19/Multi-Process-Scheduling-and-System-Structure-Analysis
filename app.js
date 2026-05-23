const processColors = ["#D8E2DC", "#FFE5D9", "#DDE5B6", "#EADCF8", "#D7E3FC", "#FDE2E4"];

const defaultProcesses = [
  { id: "P1", service: "Registration", priority: 3, arrival: 0, burst: 9, color: processColors[0] },
  { id: "P2", service: "Backup", priority: 5, arrival: 0, burst: 12, color: processColors[1] },
  { id: "P3", service: "Attendance", priority: 1, arrival: 0, burst: 7, color: processColors[2] },
  { id: "P4", service: "Report", priority: 4, arrival: 0, burst: 8, color: processColors[3] },
  { id: "P5", service: "Security", priority: 2, arrival: 0, burst: 6, color: processColors[4] }
];

let processes = structuredClone(defaultProcesses);
let lastSimulation = null;

const processTable = document.getElementById("processTable");
const validationBox = document.getElementById("validationBox");
const emptyState = document.getElementById("emptyState");
const resultsArea = document.getElementById("resultsArea");
const calculationSection = document.getElementById("calculationSection");

const ganttChart = document.getElementById("ganttChart");
const ganttLegend = document.getElementById("ganttLegend");
const resultTable = document.getElementById("resultTable");
const logicExplanation = document.getElementById("logicExplanation");

const quantumInput = document.getElementById("quantumInput");
const contextInput = document.getElementById("contextInput");
const limitInput = document.getElementById("limitInput");

const summaryAvgWaiting = document.getElementById("summaryAvgWaiting");
const summaryAvgTurnaround = document.getElementById("summaryAvgTurnaround");
const summaryContextSwitches = document.getElementById("summaryContextSwitches");
const summaryCpuUtilization = document.getElementById("summaryCpuUtilization");

const avgTat = document.getElementById("avgTat");
const avgWt = document.getElementById("avgWt");
const avgRt = document.getElementById("avgRt");

document.getElementById("runBtn").addEventListener("click", runSimulation);
document.getElementById("resetBtn").addEventListener("click", resetDefaults);
document.getElementById("addProcessBtn").addEventListener("click", addProcess);
document.getElementById("copyTableBtn").addEventListener("click", copyResultsTable);
document.getElementById("downloadCsvBtn").addEventListener("click", downloadCSV);
document.getElementById("downloadPngBtn").addEventListener("click", downloadGanttPNG);
document.getElementById("exportPdfBtn").addEventListener("click", () => window.print());

document.querySelectorAll(".scenario-btn").forEach((button) => {
  button.addEventListener("click", () => loadScenario(button.dataset.scenario));
});

function renderProcessTable() {
  processTable.innerHTML = "";

  processes.forEach((process, index) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td><input class="input-small" value="${process.id}" data-index="${index}" data-field="id"></td>
      <td><input class="input-service" value="${process.service}" data-index="${index}" data-field="service"></td>
      <td><input class="input-small editable" type="number" min="1" value="${process.priority}" data-index="${index}" data-field="priority"></td>
      <td><input class="input-small editable" type="number" min="0" value="${process.arrival}" data-index="${index}" data-field="arrival"></td>
      <td><input class="input-small editable" type="number" min="1" value="${process.burst}" data-index="${index}" data-field="burst"></td>
      <td><button class="delete-btn" data-index="${index}">Delete</button></td>
    `;

    processTable.appendChild(row);
  });

  processTable.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", updateProcessValue);
  });

  processTable.querySelectorAll(".delete-btn").forEach((button) => {
    button.addEventListener("click", () => {
      processes.splice(Number(button.dataset.index), 1);
      renderProcessTable();
      showEmptyState();
    });
  });
}

function updateProcessValue(event) {
  const index = Number(event.target.dataset.index);
  const field = event.target.dataset.field;

  if (field === "id" || field === "service") {
    processes[index][field] = event.target.value;
  } else {
    processes[index][field] = Number(event.target.value);
  }
}

function validateInputs() {
  const errors = [];

  if (processes.length === 0) {
    errors.push("At least one process is required.");
  }

  processes.forEach((process, index) => {
    if (!process.id.trim()) errors.push(`Process ${index + 1}: Process ID is required.`);
    if (!process.service.trim()) errors.push(`${process.id || "Process"}: Service name is required.`);
    if (!Number.isFinite(process.priority) || process.priority <= 0) errors.push(`${process.id}: Priority must be greater than 0.`);
    if (!Number.isFinite(process.arrival) || process.arrival < 0) errors.push(`${process.id}: Arrival time cannot be negative.`);
    if (!Number.isFinite(process.burst) || process.burst <= 0) errors.push(`${process.id}: Burst time must be greater than 0.`);
  });

  if (Number(quantumInput.value) <= 0) errors.push("Time quantum must be greater than 0.");
  if (Number(contextInput.value) < 0) errors.push("Context switch time cannot be negative.");

  if (errors.length > 0) {
    validationBox.innerHTML = errors.map((error) => `<div>${error}</div>`).join("");
    validationBox.classList.remove("hidden");
    return false;
  }

  validationBox.classList.add("hidden");
  return true;
}

function addProcess() {
  const next = processes.length + 1;

  processes.push({
    id: `P${next}`,
    service: "New Process",
    priority: next,
    arrival: 0,
    burst: 5,
    color: processColors[processes.length % processColors.length]
  });

  renderProcessTable();
  showEmptyState();
}

function simulatePriorityRR(inputProcesses, quantum, contextSwitchTime) {
  const jobs = inputProcesses.map((process, index) => ({
    ...process,
    color: process.color || processColors[index % processColors.length],
    remaining: process.burst,
    completion: null,
    firstStart: null,
    lastQueuedAt: process.arrival
  }));

  let time = 0;
  let completed = 0;
  let lastProcessId = null;
  let contextSwitches = 0;
  const timeline = [];

  const safetyLimit = jobs.reduce((sum, job) => sum + job.burst, 0) + 5000;

  while (completed < jobs.length && time <= safetyLimit) {
    const ready = jobs
      .filter((job) => job.arrival <= time && job.remaining > 0)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.lastQueuedAt !== b.lastQueuedAt) return a.lastQueuedAt - b.lastQueuedAt;
        return a.id.localeCompare(b.id);
      });

    if (ready.length === 0) {
      const nextArrival = Math.min(...jobs.filter((job) => job.remaining > 0).map((job) => job.arrival));

      timeline.push({
        id: "Idle",
        service: "CPU Idle",
        start: time,
        end: nextArrival,
        color: "#F1F5F9",
        isIdle: true,
        isContextSwitch: false
      });

      time = nextArrival;
      lastProcessId = null;
      continue;
    }

    const current = ready[0];

    if (lastProcessId && lastProcessId !== current.id && contextSwitchTime > 0) {
      timeline.push({
        id: "CS",
        service: "Context Switch",
        start: time,
        end: time + contextSwitchTime,
        color: "#E5E7EB",
        isContextSwitch: true
      });

      time += contextSwitchTime;
      contextSwitches++;
    }

    if (current.firstStart === null) {
      current.firstStart = time;
    }

    const samePriorityReady = ready.filter((job) => job.priority === current.priority);
    const runFor = samePriorityReady.length > 1
      ? Math.min(quantum, current.remaining)
      : current.remaining;

    timeline.push({
      id: current.id,
      service: current.service,
      start: time,
      end: time + runFor,
      color: current.color,
      isContextSwitch: false
    });

    time += runFor;
    current.remaining -= runFor;

    if (current.remaining === 0) {
      current.completion = time;
      completed++;
    } else {
      current.lastQueuedAt = time;
    }

    lastProcessId = current.id;
  }

  const results = jobs.map((job) => {
    const turnaround = job.completion - job.arrival;
    const waiting = turnaround - job.burst;
    const response = job.firstStart - job.arrival;

    return {
      id: job.id,
      service: job.service,
      arrival: job.arrival,
      burst: job.burst,
      completion: job.completion,
      turnaround,
      waiting,
      response
    };
  });

  return { timeline, results, contextSwitches };
}

function runSimulation() {
  if (!validateInputs()) return;

  const quantum = Number(quantumInput.value);
  const contextSwitchTime = Number(contextInput.value);
  const limit = Number(limitInput.value);

  lastSimulation = simulatePriorityRR(processes, quantum, contextSwitchTime);

  emptyState.classList.add("hidden");
  resultsArea.classList.remove("hidden");
  calculationSection.classList.remove("hidden");

  renderSummary(lastSimulation);
  renderLegend();
  renderGanttChart(lastSimulation.timeline, limit);
  renderResults(lastSimulation.results);
  renderExplanation();
}

function renderSummary(simulation) {
  const totalBurst = simulation.results.reduce((sum, item) => sum + item.burst, 0);
  const finalTime = Math.max(...simulation.timeline.map((item) => item.end));
  const cpuUtilization = finalTime > 0 ? (totalBurst / finalTime) * 100 : 0;

  summaryAvgWaiting.textContent = `${average(simulation.results.map((item) => item.waiting)).toFixed(2)} ms`;
  summaryAvgTurnaround.textContent = `${average(simulation.results.map((item) => item.turnaround)).toFixed(2)} ms`;
  summaryContextSwitches.textContent = simulation.contextSwitches;
  summaryCpuUtilization.textContent = `${cpuUtilization.toFixed(1)}%`;
}

function renderLegend() {
  ganttLegend.innerHTML = "";

  const items = [
    ...processes.map((process, index) => ({
      label: `${process.id} = ${process.service}`,
      color: process.color || processColors[index % processColors.length]
    })),
    { label: "CS = Context Switch", color: "#E5E7EB" }
  ];

  items.forEach((item) => {
    const legendItem = document.createElement("div");
    legendItem.className = "legend-item";

    legendItem.innerHTML = `
      <span class="legend-color" style="background:${item.color}"></span>
      <span>${item.label}</span>
    `;

    ganttLegend.appendChild(legendItem);
  });
}

function renderGanttChart(timeline, limit) {
  ganttChart.innerHTML = "";

  const visibleTimeline = clipTimeline(mergeTimeline(timeline), limit);

  visibleTimeline.forEach((segment) => {
    const duration = segment.end - segment.start;
    const block = document.createElement("div");

    block.className = "gantt-block";
    block.style.background = segment.color;
    block.style.flex = String(Math.max(duration, 1));

    block.dataset.tooltip =
      `Process: ${segment.id}\n` +
      `Name: ${segment.service}\n` +
      `Start: ${segment.start} ms\n` +
      `End: ${segment.end} ms\n` +
      `Duration: ${duration} ms`;

    block.innerHTML = `
      <strong>${segment.id}</strong>
      <span>${segment.service}</span>
      <span class="time">${segment.start} - ${segment.end} ms</span>
    `;

    ganttChart.appendChild(block);
  });
}

function renderResults(results) {
  resultTable.innerHTML = "";

  const avgWaiting = average(results.map((item) => item.waiting));
  let totalTat = 0;
  let totalWt = 0;
  let totalRt = 0;

  results.forEach((result) => {
    totalTat += result.turnaround;
    totalWt += result.waiting;
    totalRt += result.response;

    const waitingClass = result.waiting <= avgWaiting ? "waiting-good" : "waiting-bad";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${result.id}</strong></td>
      <td>${result.arrival} ms</td>
      <td>${result.burst} ms</td>
      <td>${result.completion} ms</td>
      <td>${result.turnaround} ms</td>
      <td class="${waitingClass}">${result.waiting} ms</td>
      <td>${result.response} ms</td>
    `;

    resultTable.appendChild(row);
  });

  avgTat.textContent = `${(totalTat / results.length).toFixed(2)} ms`;
  avgWt.textContent = `${(totalWt / results.length).toFixed(2)} ms`;
  avgRt.textContent = `${(totalRt / results.length).toFixed(2)} ms`;
}

function renderExplanation() {
  const highest = [...processes].sort((a, b) => a.priority - b.priority)[0];

  const duplicatePriorities = processes
    .filter((process, index, arr) =>
      arr.some((other, otherIndex) => other.priority === process.priority && otherIndex !== index)
    )
    .map((process) => process.id);

  const rrText = duplicatePriorities.length
    ? `${[...new Set(duplicatePriorities)].join(", ")} share priority levels, so Round Robin is used for tie-breaking.`
    : `No equal-priority conflict was found, so execution mainly follows priority order.`;

  logicExplanation.innerHTML = `
    <p>
      <strong>How scheduling works:</strong>
      ${highest.id} executes first because it has the highest priority. ${rrText}
      A context switch is added whenever the CPU changes from one process to another.
    </p>
  `;
}

function mergeTimeline(timeline) {
  const merged = [];

  timeline.forEach((segment) => {
    const previous = merged[merged.length - 1];

    if (
      previous &&
      previous.id === segment.id &&
      previous.end === segment.start &&
      !segment.isContextSwitch &&
      !segment.isIdle
    ) {
      previous.end = segment.end;
    } else {
      merged.push({ ...segment });
    }
  });

  return merged;
}

function clipTimeline(timeline, limit) {
  return timeline
    .filter((segment) => segment.start < limit)
    .map((segment) => ({
      ...segment,
      end: Math.min(segment.end, limit)
    }))
    .filter((segment) => segment.end > segment.start);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function showEmptyState() {
  lastSimulation = null;
  emptyState.classList.remove("hidden");
  resultsArea.classList.add("hidden");
  calculationSection.classList.add("hidden");
}

function resetDefaults() {
  processes = structuredClone(defaultProcesses);
  quantumInput.value = 4;
  contextInput.value = 1;
  limitInput.value = 30;
  renderProcessTable();
  showEmptyState();
}

function loadScenario(type) {
  if (type === "equal") {
    processes = structuredClone(defaultProcesses);
  }

  if (type === "samePriority") {
    processes = [
      { id: "P1", service: "Registration", priority: 2, arrival: 0, burst: 8, color: processColors[0] },
      { id: "P2", service: "Backup", priority: 3, arrival: 0, burst: 10, color: processColors[1] },
      { id: "P3", service: "Attendance", priority: 1, arrival: 0, burst: 6, color: processColors[2] },
      { id: "P4", service: "Report", priority: 2, arrival: 0, burst: 7, color: processColors[3] }
    ];
  }

  if (type === "starvation") {
    processes = [
      { id: "P1", service: "High Priority", priority: 1, arrival: 0, burst: 18, color: processColors[0] },
      { id: "P2", service: "Backup", priority: 5, arrival: 0, burst: 10, color: processColors[1] },
      { id: "P3", service: "Security", priority: 2, arrival: 0, burst: 12, color: processColors[2] },
      { id: "P4", service: "Report", priority: 4, arrival: 0, burst: 8, color: processColors[3] }
    ];
  }

  if (type === "highSwitch") {
    processes = [
      { id: "P1", service: "Service A", priority: 1, arrival: 0, burst: 5, color: processColors[0] },
      { id: "P2", service: "Service B", priority: 1, arrival: 0, burst: 5, color: processColors[1] },
      { id: "P3", service: "Service C", priority: 1, arrival: 0, burst: 5, color: processColors[2] },
      { id: "P4", service: "Service D", priority: 1, arrival: 0, burst: 5, color: processColors[3] }
    ];
  }

  renderProcessTable();
  showEmptyState();
}

function copyResultsTable() {
  if (!lastSimulation) return alert("Run the simulation first.");

  const rows = [
    ["Process", "Arrival", "Burst", "Completion", "Turnaround", "Waiting", "Response Time"],
    ...lastSimulation.results.map((result) => [
      result.id,
      result.arrival,
      result.burst,
      result.completion,
      result.turnaround,
      result.waiting,
      result.response
    ])
  ];

  navigator.clipboard.writeText(rows.map((row) => row.join("\t")).join("\n"));
  alert("Results table copied.");
}

function downloadCSV() {
  if (!lastSimulation) return alert("Run the simulation first.");

  const rows = [
    ["Process", "Arrival", "Burst", "Completion", "Turnaround", "Waiting", "Response Time"],
    ...lastSimulation.results.map((result) => [
      result.id,
      result.arrival,
      result.burst,
      result.completion,
      result.turnaround,
      result.waiting,
      result.response
    ])
  ];

  const csv = rows.map((row) => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "scheduling-results.csv";
  link.click();

  URL.revokeObjectURL(url);
}

function downloadGanttPNG() {
  if (!lastSimulation) return alert("Run the simulation first.");

  const visibleTimeline = clipTimeline(mergeTimeline(lastSimulation.timeline), Number(limitInput.value));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const blockWidth = 120;
  const blockHeight = 70;
  const gap = 8;
  const padding = 24;

  canvas.width = Math.max(900, padding * 2 + visibleTimeline.length * (blockWidth + gap));
  canvas.height = 170;

  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#202833";
  ctx.font = "bold 20px Arial";
  ctx.fillText("CPU Scheduling Gantt Chart", padding, 32);

  visibleTimeline.forEach((segment, index) => {
    const x = padding + index * (blockWidth + gap);
    const y = 58;

    ctx.fillStyle = segment.color;
    roundRect(ctx, x, y, blockWidth, blockHeight, 14);
    ctx.fill();

    ctx.strokeStyle = "#c9c0b2";
    ctx.stroke();

    ctx.fillStyle = "#202833";
    ctx.font = "bold 15px Arial";
    ctx.fillText(segment.id, x + 12, y + 26);

    ctx.font = "12px Arial";
    ctx.fillText(`${segment.start} - ${segment.end} ms`, x + 12, y + 52);
  });

  const link = document.createElement("a");
  link.download = "gantt-chart.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

renderProcessTable();
showEmptyState();