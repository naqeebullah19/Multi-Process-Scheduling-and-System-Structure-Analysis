const colors = {
  P1: "#D8E2DC",
  P2: "#FFE5D9",
  P3: "#DDE5B6",
  P4: "#EADCF8",
  P5: "#D7E3FC",
  CS: "#E5E7EB",
  Idle: "#F1F5F9"
};

const defaultProcesses = [
  { id: "P1", service: "Registration", priority: 3, arrival: 0, burst: 9, color: colors.P1 },
  { id: "P2", service: "Backup", priority: 5, arrival: 0, burst: 12, color: colors.P2 },
  { id: "P3", service: "Attendance", priority: 1, arrival: 0, burst: 7, color: colors.P3 },
  { id: "P4", service: "Report", priority: 4, arrival: 0, burst: 8, color: colors.P4 },
  { id: "P5", service: "Security", priority: 2, arrival: 0, burst: 6, color: colors.P5 }
];

let processes = structuredClone(defaultProcesses);
let lastSimulation = null;

const processTable = document.getElementById("processTable");
const resultTable = document.getElementById("resultTable");
const ganttChart = document.getElementById("ganttChart");
const ganttLegend = document.getElementById("ganttLegend");
const validationBox = document.getElementById("validationBox");
const limitWarning = document.getElementById("limitWarning");

const emptyState = document.getElementById("emptyState");
const resultsArea = document.getElementById("resultsArea");
const calculationPanel = document.getElementById("calculationPanel");
const stickySummary = document.getElementById("stickySummary");

const algorithmSelect = document.getElementById("algorithmSelect");
const algorithmInfoBtn = document.getElementById("algorithmInfoBtn");
const algorithmInfoBox = document.getElementById("algorithmInfoBox");
const heroAlgorithm = document.getElementById("heroAlgorithm");

const quantumLabel = document.getElementById("quantumLabel");
const quantumInput = document.getElementById("quantumInput");
const contextInput = document.getElementById("contextInput");
const limitInput = document.getElementById("limitInput");

const avgWaitingCard = document.getElementById("avgWaitingCard");
const avgTurnaroundCard = document.getElementById("avgTurnaroundCard");
const contextSwitchCard = document.getElementById("contextSwitchCard");
const completionTimeCard = document.getElementById("completionTimeCard");

const stickyAvgWaiting = document.getElementById("stickyAvgWaiting");
const stickyAvgTurnaround = document.getElementById("stickyAvgTurnaround");
const stickyCpuUtilization = document.getElementById("stickyCpuUtilization");
const stickyCompletion = document.getElementById("stickyCompletion");

const avgTat = document.getElementById("avgTat");
const avgWt = document.getElementById("avgWt");
const totalContextOverhead = document.getElementById("totalContextOverhead");

document.getElementById("runBtn").addEventListener("click", runSimulation);
document.getElementById("resetBtn").addEventListener("click", resetDefaults);
document.getElementById("downloadCsvBtn").addEventListener("click", downloadCSV);
document.getElementById("downloadPngBtn").addEventListener("click", downloadPNG);
document.getElementById("exportPdfBtn").addEventListener("click", () => window.print());
document.getElementById("copyUrlBtn").addEventListener("click", copyShareUrl);

algorithmSelect.addEventListener("change", () => {
  updateQuantumVisibility();
  updateHeroAlgorithm();
  showAlgorithmInfo(false);
  updateUrlState();
});

algorithmInfoBtn.addEventListener("click", () => {
  showAlgorithmInfo(algorithmInfoBox.classList.contains("hidden"));
});

document.querySelectorAll(".accordion-trigger").forEach((button) => {
  button.addEventListener("click", () => {
    button.closest(".accordion-panel").classList.toggle("open");
  });
});

function renderProcessTable() {
  processTable.innerHTML = "";

  processes.forEach((process, index) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td><strong>${process.id}</strong></td>
      <td>${process.service}</td>
      <td><input type="number" min="1" value="${process.priority}" data-index="${index}" data-field="priority" /></td>
      <td><input type="number" min="0" value="${process.arrival}" data-index="${index}" data-field="arrival" /></td>
      <td><input type="number" min="0" value="${process.burst}" data-index="${index}" data-field="burst" /></td>
    `;

    processTable.appendChild(row);
  });

  processTable.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", updateProcess);
  });
}

function updateProcess(event) {
  const index = Number(event.target.dataset.index);
  const field = event.target.dataset.field;
  let value = Number(event.target.value);

  if (field === "priority" && value < 1) value = 1;
  if ((field === "arrival" || field === "burst") && value < 0) value = 0;

  event.target.value = value;
  processes[index][field] = value;

  showEmptyState();
  updateUrlState();
}

function validateInputs() {
  const errors = [];

  processes.forEach((process) => {
    if (!Number.isFinite(process.priority) || process.priority < 1) {
      errors.push(`${process.id}: Priority must be 1 or higher.`);
    }

    if (!Number.isFinite(process.arrival) || process.arrival < 0) {
      errors.push(`${process.id}: Arrival time cannot be negative.`);
    }

    if (!Number.isFinite(process.burst) || process.burst < 0) {
      errors.push(`${process.id}: Burst time cannot be negative.`);
    }
  });

  if (Number(contextInput.value) < 0) {
    errors.push("Context switch overhead cannot be negative.");
  }

  if (requiresQuantum() && Number(quantumInput.value) < 1) {
    errors.push("Time quantum must be at least 1 for this algorithm.");
  }

  if (Number(limitInput.value) < 5) {
    errors.push("Chart limit must be at least 5 ms.");
  }

  if (errors.length > 0) {
    validationBox.innerHTML = errors.map((error) => `<div>${error}</div>`).join("");
    validationBox.classList.remove("hidden");
    return false;
  }

  validationBox.classList.add("hidden");
  return true;
}

function simulatePriorityRR(processList, quantum, contextSwitch) {
  const jobs = makeJobs(processList);
  let time = 0;
  let completed = 0;
  let previousProcess = null;
  let contextSwitches = 0;
  const timeline = [];
  const safetyLimit = getSafetyLimit(jobs);

  while (completed < jobs.length && time <= safetyLimit) {
    const ready = jobs
      .filter((job) => job.arrival <= time && job.remaining > 0)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.lastQueuedAt !== b.lastQueuedAt) return a.lastQueuedAt - b.lastQueuedAt;
        return a.id.localeCompare(b.id);
      });

    if (ready.length === 0) {
      time = addIdleBlock(jobs, timeline, time);
      previousProcess = null;
      continue;
    }

    const current = ready[0];

    if (previousProcess && previousProcess !== current.id && contextSwitch > 0) {
      addContextSwitch(timeline, time, contextSwitch);
      time += contextSwitch;
      contextSwitches++;
    }

    if (current.firstStart === null) current.firstStart = time;

    const samePriority = ready.filter((job) => job.priority === current.priority);
    const nextHigherArrival = getNextHigherPriorityArrival(jobs, current, time);
    const baseRunTime = samePriority.length > 1 ? Math.min(quantum, current.remaining) : current.remaining;
    const runTime = nextHigherArrival === null ? baseRunTime : Math.min(baseRunTime, nextHigherArrival - time);

    addRunBlock(timeline, current, time, runTime);
    time += runTime;
    current.remaining -= runTime;

    if (current.remaining === 0) {
      current.completion = time;
      completed++;
    } else {
      current.lastQueuedAt = time;
    }

    previousProcess = current.id;
  }

  return finalizeSimulation(jobs, timeline, contextSwitches, time, safetyLimit);
}

function simulateNonPreemptivePriority(processList, contextSwitch) {
  return simulateNonPreemptive(processList, contextSwitch, (a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.arrival !== b.arrival) return a.arrival - b.arrival;
    return a.id.localeCompare(b.id);
  });
}

function simulateFCFS(processList, contextSwitch) {
  return simulateNonPreemptive(processList, contextSwitch, (a, b) => {
    if (a.arrival !== b.arrival) return a.arrival - b.arrival;
    return a.id.localeCompare(b.id);
  });
}

function simulateSJF(processList, contextSwitch) {
  return simulateNonPreemptive(processList, contextSwitch, (a, b) => {
    if (a.burst !== b.burst) return a.burst - b.burst;
    if (a.arrival !== b.arrival) return a.arrival - b.arrival;
    return a.id.localeCompare(b.id);
  });
}

function simulateNonPreemptive(processList, contextSwitch, sorter) {
  const jobs = makeJobs(processList);
  let time = 0;
  let completed = 0;
  let previousProcess = null;
  let contextSwitches = 0;
  const timeline = [];
  const safetyLimit = getSafetyLimit(jobs);

  while (completed < jobs.length && time <= safetyLimit) {
    const ready = jobs.filter((job) => job.arrival <= time && job.remaining > 0).sort(sorter);

    if (ready.length === 0) {
      time = addIdleBlock(jobs, timeline, time);
      previousProcess = null;
      continue;
    }

    const current = ready[0];

    if (previousProcess && previousProcess !== current.id && contextSwitch > 0) {
      addContextSwitch(timeline, time, contextSwitch);
      time += contextSwitch;
      contextSwitches++;
    }

    if (current.firstStart === null) current.firstStart = time;

    const runTime = current.remaining;
    addRunBlock(timeline, current, time, runTime);
    time += runTime;
    current.remaining = 0;
    current.completion = time;
    completed++;
    previousProcess = current.id;
  }

  return finalizeSimulation(jobs, timeline, contextSwitches, time, safetyLimit);
}

function simulateRR(processList, quantum, contextSwitch) {
  const jobs = makeJobs(processList).sort((a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  const readyQueue = [];
  const timeline = [];
  let time = 0;
  let completed = 0;
  let index = 0;
  let previousProcess = null;
  let contextSwitches = 0;
  const safetyLimit = getSafetyLimit(jobs);

  while (completed < jobs.length && time <= safetyLimit) {
    while (index < jobs.length && jobs[index].arrival <= time) {
      readyQueue.push(jobs[index]);
      index++;
    }

    if (readyQueue.length === 0) {
      if (index < jobs.length) {
        timeline.push({
          id: "Idle",
          service: "CPU Idle",
          start: time,
          end: jobs[index].arrival,
          color: colors.Idle
        });
        time = jobs[index].arrival;
        previousProcess = null;
        continue;
      }
      break;
    }

    const current = readyQueue.shift();

    if (previousProcess && previousProcess !== current.id && contextSwitch > 0) {
      addContextSwitch(timeline, time, contextSwitch);
      time += contextSwitch;
      contextSwitches++;

      while (index < jobs.length && jobs[index].arrival <= time) {
        readyQueue.push(jobs[index]);
        index++;
      }
    }

    if (current.firstStart === null) current.firstStart = time;

    const runTime = Math.min(quantum, current.remaining);
    addRunBlock(timeline, current, time, runTime);
    time += runTime;
    current.remaining -= runTime;

    while (index < jobs.length && jobs[index].arrival <= time) {
      readyQueue.push(jobs[index]);
      index++;
    }

    if (current.remaining === 0) {
      current.completion = time;
      completed++;
    } else {
      readyQueue.push(current);
    }

    previousProcess = current.id;
  }

  return finalizeSimulation(jobs, timeline, contextSwitches, time, safetyLimit);
}

function makeJobs(processList) {
  return processList.map((process) => ({
    ...process,
    remaining: process.burst,
    completion: process.burst === 0 ? process.arrival : null,
    firstStart: process.burst === 0 ? process.arrival : null,
    lastQueuedAt: process.arrival
  }));
}

function getSafetyLimit(jobs) {
  const totalBurst = jobs.reduce((sum, job) => sum + job.burst, 0);
  const lastArrival = Math.max(...jobs.map((job) => job.arrival));
  return Math.max(1000, totalBurst * 20 + lastArrival + 1000);
}

function addIdleBlock(jobs, timeline, time) {
  const pendingArrivals = jobs.filter((job) => job.remaining > 0).map((job) => job.arrival);
  const nextArrival = Math.min(...pendingArrivals);

  timeline.push({
    id: "Idle",
    service: "CPU Idle",
    start: time,
    end: nextArrival,
    color: colors.Idle
  });

  return nextArrival;
}

function addContextSwitch(timeline, time, contextSwitch) {
  timeline.push({
    id: "CS",
    service: "Context Switch",
    start: time,
    end: time + contextSwitch,
    color: colors.CS
  });
}

function addRunBlock(timeline, current, time, runTime) {
  if (runTime <= 0) return;

  timeline.push({
    id: current.id,
    service: current.service,
    start: time,
    end: time + runTime,
    color: current.color
  });
}

function getNextHigherPriorityArrival(jobs, current, time) {
  const arrivals = jobs
    .filter((job) => job.arrival > time && job.remaining > 0 && job.priority < current.priority)
    .map((job) => job.arrival);

  if (arrivals.length === 0) return null;
  return Math.min(...arrivals);
}

function finalizeSimulation(jobs, timeline, contextSwitches, time, safetyLimit) {
  const stopped = jobs.some((job) => job.remaining > 0) || time > safetyLimit;
  const starved = jobs.filter((job) => job.remaining > 0).map((job) => job.id);

  const results = jobs.map((job) => {
    const completion = job.completion ?? time;
    const turnaround = completion - job.arrival;
    const waiting = Math.max(0, turnaround - job.burst);
    const contextOverhead = countContextOverheadForProcess(timeline, job.id);

    return {
      id: job.id,
      arrival: job.arrival,
      burst: job.burst,
      completion,
      turnaround,
      waiting,
      contextOverhead
    };
  });

  return {
    timeline,
    results,
    contextSwitches,
    totalCompletionTime: time,
    stopped,
    starved
  };
}

function countContextOverheadForProcess(timeline, processId) {
  let overhead = 0;

  timeline.forEach((item, index) => {
    if (item.id === "CS") {
      const previous = timeline[index - 1];
      const next = timeline[index + 1];

      if ((previous && previous.id === processId) || (next && next.id === processId)) {
        overhead += item.end - item.start;
      }
    }
  });

  return overhead;
}

function runSimulation() {
  if (!validateInputs()) return;

  const algorithm = algorithmSelect.value;
  const quantum = Number(quantumInput.value);
  const contextSwitch = Number(contextInput.value);
  const limit = Number(limitInput.value);

  if (algorithm === "priority_rr") {
    lastSimulation = simulatePriorityRR(processes, quantum, contextSwitch);
  }

  if (algorithm === "non_preemptive_priority") {
    lastSimulation = simulateNonPreemptivePriority(processes, contextSwitch);
  }

  if (algorithm === "rr") {
    lastSimulation = simulateRR(processes, quantum, contextSwitch);
  }

  if (algorithm === "fcfs") {
    lastSimulation = simulateFCFS(processes, contextSwitch);
  }

  if (algorithm === "sjf") {
    lastSimulation = simulateSJF(processes, contextSwitch);
  }

  emptyState.classList.add("hidden");
  resultsArea.classList.remove("hidden");
  calculationPanel.classList.remove("hidden");
  stickySummary.classList.remove("hidden");

  renderSummary(lastSimulation);
  renderLegend();
  renderGantt(lastSimulation.timeline, limit);
  renderResults(lastSimulation.results);
  renderLimitWarning(lastSimulation, limit);
  updateUrlState();
}

function renderSummary(simulation) {
  const avgWaiting = average(simulation.results.map((r) => r.waiting));
  const avgTurnaround = average(simulation.results.map((r) => r.turnaround));
  const totalBurst = simulation.results.reduce((sum, r) => sum + r.burst, 0);
  const cpuUtilization = simulation.totalCompletionTime > 0
    ? (totalBurst / simulation.totalCompletionTime) * 100
    : 0;

  avgWaitingCard.textContent = `${avgWaiting.toFixed(2)} ms`;
  avgTurnaroundCard.textContent = `${avgTurnaround.toFixed(2)} ms`;
  contextSwitchCard.textContent = simulation.contextSwitches;
  completionTimeCard.textContent = `${simulation.totalCompletionTime} ms`;

  stickyAvgWaiting.textContent = `${avgWaiting.toFixed(2)} ms`;
  stickyAvgTurnaround.textContent = `${avgTurnaround.toFixed(2)} ms`;
  stickyCpuUtilization.textContent = `${cpuUtilization.toFixed(1)}%`;
  stickyCompletion.textContent = `${simulation.totalCompletionTime} ms`;
}

function renderLegend() {
  ganttLegend.innerHTML = "";

  const items = [
    ...processes.map((process) => ({
      label: `${process.id} = ${process.service}`,
      color: process.color
    })),
    { label: "CS = Context Switch", color: colors.CS }
  ];

  items.forEach((item) => {
    const element = document.createElement("div");
    element.className = "legend-item";

    element.innerHTML = `
      <span class="legend-color" style="background:${item.color}"></span>
      <span>${item.label}</span>
    `;

    ganttLegend.appendChild(element);
  });
}

function renderGantt(timeline, limit) {
  ganttChart.innerHTML = "";

  const visible = timeline
    .filter((item) => item.start < limit)
    .map((item) => ({ ...item, end: Math.min(item.end, limit) }))
    .filter((item) => item.end > item.start);

  visible.forEach((item) => {
    const duration = item.end - item.start;
    const block = document.createElement("div");

    block.className = "gantt-block";
    block.style.background = item.color;
    block.style.flex = String(Math.max(duration, 1));

    block.dataset.tooltip =
      `Process ID: ${item.id}\n` +
      `Start Time: ${item.start} ms\n` +
      `End Time: ${item.end} ms\n` +
      `Burst Consumed: ${duration} ms`;

    block.innerHTML = `
      <strong>${item.id}</strong>
      <span>${item.service}</span>
      <span class="time">${item.start} - ${item.end} ms</span>
    `;

    ganttChart.appendChild(block);
  });
}

function renderResults(results) {
  resultTable.innerHTML = "";

  let totalTat = 0;
  let totalWt = 0;
  let totalOverhead = 0;

  results.forEach((result) => {
    totalTat += result.turnaround;
    totalWt += result.waiting;
    totalOverhead += result.contextOverhead;

    const row = document.createElement("tr");

    row.innerHTML = `
      <td><strong>${result.id}</strong></td>
      <td>${result.arrival} ms</td>
      <td>${result.burst} ms</td>
      <td>${result.completion} ms</td>
      <td>${result.turnaround} ms</td>
      <td>${result.waiting} ms</td>
      <td>${result.contextOverhead} ms</td>
    `;

    resultTable.appendChild(row);
  });

  avgTat.textContent = `${(totalTat / results.length).toFixed(2)} ms`;
  avgWt.textContent = `${(totalWt / results.length).toFixed(2)} ms`;
  totalContextOverhead.textContent = `${totalOverhead} ms`;
}

function renderLimitWarning(simulation, limit) {
  const unfinishedByLimit = simulation.results
    .filter((result) => result.completion > limit)
    .map((result) => result.id);

  if (simulation.stopped && simulation.starved.length > 0) {
    limitWarning.textContent = `Simulation stopped at limit ${limit} ms. Process ${simulation.starved.join(", ")} starved.`;
    limitWarning.classList.remove("hidden");
    return;
  }

  if (unfinishedByLimit.length > 0) {
    limitWarning.textContent = `Chart stopped at ${limit} ms. Process ${unfinishedByLimit.join(", ")} continues after the visible chart limit.`;
    limitWarning.classList.remove("hidden");
    return;
  }

  limitWarning.classList.add("hidden");
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function requiresQuantum() {
  return algorithmSelect.value === "priority_rr" || algorithmSelect.value === "rr";
}

function updateQuantumVisibility() {
  const enabled = requiresQuantum();
  quantumInput.disabled = !enabled;
  quantumLabel.style.opacity = enabled ? "1" : "0.55";
}

function updateHeroAlgorithm() {
  const labels = {
    priority_rr: "Priority + RR",
    non_preemptive_priority: "Priority",
    rr: "Round Robin",
    fcfs: "FCFS",
    sjf: "SJF"
  };

  heroAlgorithm.textContent = labels[algorithmSelect.value];
}

function showAlgorithmInfo(show) {
  if (!show) {
    algorithmInfoBox.classList.add("hidden");
    return;
  }

  const info = {
    priority_rr: "Preemptive Priority + RR: The highest-priority ready process runs first. If multiple ready processes have the same priority, they share CPU time using the selected quantum.",
    non_preemptive_priority: "Non-Preemptive Priority: The ready process with the highest priority runs until completion. Lower priority number means higher priority.",
    rr: "Round Robin: All ready processes receive equal CPU time in cyclic order using the selected time quantum.",
    fcfs: "FCFS: First Come First Serve executes processes in the order of their arrival time.",
    sjf: "SJF: Shortest Job First selects the ready process with the smallest burst time."
  };

  algorithmInfoBox.textContent = info[algorithmSelect.value];
  algorithmInfoBox.classList.remove("hidden");
}

function showEmptyState() {
  lastSimulation = null;
  emptyState.classList.remove("hidden");
  resultsArea.classList.add("hidden");
  calculationPanel.classList.add("hidden");
  stickySummary.classList.add("hidden");
}

function resetDefaults() {
  processes = structuredClone(defaultProcesses);
  algorithmSelect.value = "priority_rr";
  quantumInput.value = 4;
  contextInput.value = 1;
  limitInput.value = 30;

  renderProcessTable();
  updateQuantumVisibility();
  updateHeroAlgorithm();
  showAlgorithmInfo(false);
  showEmptyState();
  updateUrlState();
}

function downloadCSV() {
  if (!lastSimulation) {
    alert("Run the simulation first.");
    return;
  }

  const rows = [
    ["Process", "Arrival", "Burst", "Completion", "Turnaround", "Waiting", "Context Switch Overhead"],
    ...lastSimulation.results.map((r) => [
      r.id,
      r.arrival,
      r.burst,
      r.completion,
      r.turnaround,
      r.waiting,
      r.contextOverhead
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

function downloadPNG() {
  if (!lastSimulation) {
    alert("Run the simulation first.");
    return;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const visible = lastSimulation.timeline
    .filter((item) => item.start < Number(limitInput.value))
    .map((item) => ({ ...item, end: Math.min(item.end, Number(limitInput.value)) }))
    .filter((item) => item.end > item.start);

  const blockWidth = 120;
  const blockHeight = 64;
  const gap = 8;
  const padding = 28;

  canvas.width = Math.max(1000, padding * 2 + visible.length * (blockWidth + gap));
  canvas.height = 420;

  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#1f2933";
  ctx.font = "bold 24px Arial";
  ctx.fillText("CPU Scheduling Simulator", padding, 34);

  ctx.font = "14px Arial";
  ctx.fillText(`Algorithm: ${algorithmSelect.options[algorithmSelect.selectedIndex].text}`, padding, 62);
  ctx.fillText(`Quantum: ${requiresQuantum() ? quantumInput.value + " ms" : "Not required"}   Context Switch: ${contextInput.value} ms   Chart Limit: ${limitInput.value} ms`, padding, 84);

  ctx.font = "bold 15px Arial";
  ctx.fillText("Input Configuration", padding, 120);

  ctx.font = "13px Arial";
  processes.forEach((p, index) => {
    ctx.fillText(`${p.id}: arrival ${p.arrival} ms, burst ${p.burst} ms, priority ${p.priority}`, padding, 145 + index * 20);
  });

  const summaryY = 255;
  ctx.font = "bold 15px Arial";
  ctx.fillText("Averages", padding, summaryY);
  ctx.font = "13px Arial";
  ctx.fillText(`Average Waiting: ${avgWaitingCard.textContent}`, padding, summaryY + 24);
  ctx.fillText(`Average Turnaround: ${avgTurnaroundCard.textContent}`, padding + 230, summaryY + 24);
  ctx.fillText(`Context Switches: ${contextSwitchCard.textContent}`, padding + 500, summaryY + 24);
  ctx.fillText(`Completion Time: ${completionTimeCard.textContent}`, padding + 710, summaryY + 24);

  const chartY = 320;

  visible.forEach((item, index) => {
    const x = padding + index * (blockWidth + gap);

    ctx.fillStyle = item.color;
    roundRect(ctx, x, chartY, blockWidth, blockHeight, 12);
    ctx.fill();

    ctx.strokeStyle = "#c9c0b2";
    ctx.stroke();

    ctx.fillStyle = "#1f2933";
    ctx.font = "bold 14px Arial";
    ctx.fillText(item.id, x + 10, chartY + 24);

    ctx.font = "12px Arial";
    ctx.fillText(`${item.start} - ${item.end} ms`, x + 10, chartY + 48);
  });

  const link = document.createElement("a");
  link.download = "cpu-scheduling-simulation.png";
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

function updateUrlState() {
  const params = new URLSearchParams();

  params.set("algorithm", algorithmSelect.value);
  params.set("quantum", quantumInput.value);
  params.set("context", contextInput.value);
  params.set("limit", limitInput.value);

  processes.forEach((p) => {
    params.set(p.id.toLowerCase(), `${p.arrival},${p.burst},${p.priority}`);
  });

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", newUrl);
}

function loadUrlState() {
  const params = new URLSearchParams(window.location.search);

  if (params.has("algorithm")) algorithmSelect.value = params.get("algorithm");
  if (params.has("quantum")) quantumInput.value = params.get("quantum");
  if (params.has("context")) contextInput.value = params.get("context");
  if (params.has("limit")) limitInput.value = params.get("limit");

  processes = processes.map((process) => {
    const value = params.get(process.id.toLowerCase());

    if (!value) return process;

    const [arrival, burst, priority] = value.split(",").map(Number);

    return {
      ...process,
      arrival: Number.isFinite(arrival) ? arrival : process.arrival,
      burst: Number.isFinite(burst) ? burst : process.burst,
      priority: Number.isFinite(priority) ? priority : process.priority
    };
  });
}

function copyShareUrl() {
  updateUrlState();
  navigator.clipboard.writeText(window.location.href);
  alert("Share URL copied.");
}

loadUrlState();
renderProcessTable();
updateQuantumVisibility();
updateHeroAlgorithm();
showEmptyState();