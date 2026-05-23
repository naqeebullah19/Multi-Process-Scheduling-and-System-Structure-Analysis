const defaultProcesses = [
  {
    id: "P1",
    service: "Student registration service",
    type: "CPU-intensive, periodic bursts",
    priority: 3,
    arrival: 0,
    burst: 9,
    color: "#496a81"
  },
  {
    id: "P2",
    service: "Database backup process",
    type: "I/O intensive, long-running",
    priority: 5,
    arrival: 0,
    burst: 12,
    color: "#8b6f47"
  },
  {
    id: "P3",
    service: "Real-time attendance tracking",
    type: "Interactive, high priority",
    priority: 1,
    arrival: 0,
    burst: 7,
    color: "#4f6f52"
  },
  {
    id: "P4",
    service: "Report generation module",
    type: "Batch processing, medium priority",
    priority: 4,
    arrival: 0,
    burst: 8,
    color: "#7c5f77"
  },
  {
    id: "P5",
    service: "Security monitoring daemon",
    type: "Background continuous service",
    priority: 2,
    arrival: 0,
    burst: 6,
    color: "#a05f45"
  }
];

let processes = structuredClone(defaultProcesses);

const processTable = document.getElementById("processTable");
const resultTable = document.getElementById("resultTable");
const ganttChart = document.getElementById("ganttChart");
const ganttLegend = document.getElementById("ganttLegend");
const quantumInput = document.getElementById("quantumInput");
const contextInput = document.getElementById("contextInput");
const limitInput = document.getElementById("limitInput");
const avgTat = document.getElementById("avgTat");
const avgWt = document.getElementById("avgWt");
const contextSwitchBadge = document.getElementById("contextSwitchBadge");
const runBtn = document.getElementById("runBtn");
const resetBtn = document.getElementById("resetBtn");

function renderProcessTable() {
  processTable.innerHTML = "";

  processes.forEach((process, index) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td><strong>${process.id}</strong></td>
      <td>${process.service}</td>
      <td>${process.type}</td>
      <td>
        <input 
          class="process-input"
          type="number"
          min="1"
          value="${process.priority}"
          data-index="${index}"
          data-field="priority"
          aria-label="${process.id} priority"
        />
      </td>
      <td>
        <input 
          class="process-input"
          type="number"
          min="0"
          value="${process.arrival}"
          data-index="${index}"
          data-field="arrival"
          aria-label="${process.id} arrival time"
        />
      </td>
      <td>
        <input 
          class="process-input"
          type="number"
          min="1"
          value="${process.burst}"
          data-index="${index}"
          data-field="burst"
          aria-label="${process.id} burst time"
        />
      </td>
    `;

    processTable.appendChild(row);
  });

  processTable.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", updateProcessValue);
  });
}

function updateProcessValue(event) {
  const index = Number(event.target.dataset.index);
  const field = event.target.dataset.field;
  const value = Number(event.target.value);

  if (!Number.isNaN(value)) {
    processes[index][field] = value;
  }
}

function simulateScheduling(inputProcesses, quantum, contextSwitchTime) {
  const jobs = inputProcesses.map((process) => ({
    ...process,
    remaining: process.burst,
    completion: null,
    lastQueuedAt: process.arrival
  }));

  const totalBurst = jobs.reduce((sum, job) => sum + job.burst, 0);
  const safetyLimit = totalBurst + 1000;

  let time = 0;
  let completed = 0;
  let lastProcessId = null;
  let contextSwitches = 0;
  const timeline = [];

  while (completed < jobs.length && time <= safetyLimit) {
    const ready = jobs
      .filter((job) => job.arrival <= time && job.remaining > 0)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.lastQueuedAt !== b.lastQueuedAt) return a.lastQueuedAt - b.lastQueuedAt;
        return a.id.localeCompare(b.id);
      });

    if (ready.length === 0) {
      const nextArrival = Math.min(
        ...jobs.filter((job) => job.remaining > 0).map((job) => job.arrival)
      );

      timeline.push({
        id: "Idle",
        start: time,
        end: nextArrival,
        color: "#9ca3af",
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
        start: time,
        end: time + contextSwitchTime,
        color: "#756a5d",
        isContextSwitch: true
      });

      time += contextSwitchTime;
      contextSwitches++;
    }

    const samePriorityReady = ready.filter((job) => job.priority === current.priority);
    const runFor = samePriorityReady.length > 1
      ? Math.min(quantum, current.remaining)
      : current.remaining;

    const start = time;
    const end = time + runFor;

    timeline.push({
      id: current.id,
      start,
      end,
      color: current.color,
      isContextSwitch: false
    });

    time = end;
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

    return {
      id: job.id,
      completion: job.completion,
      turnaround,
      waiting
    };
  });

  return {
    timeline,
    results,
    contextSwitches
  };
}

function mergeTimelineSegments(timeline) {
  const merged = [];

  timeline.forEach((segment) => {
    const previous = merged[merged.length - 1];

    if (
      previous &&
      previous.id === segment.id &&
      previous.end === segment.start &&
      !segment.isContextSwitch
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

function renderGanttChart(timeline, limit) {
  ganttChart.innerHTML = "";

  const clippedTimeline = clipTimeline(mergeTimelineSegments(timeline), limit);

  if (clippedTimeline.length === 0) {
    ganttChart.innerHTML = `<p class="muted">No timeline available.</p>`;
    return;
  }

  clippedTimeline.forEach((segment) => {
    const duration = segment.end - segment.start;
    const block = document.createElement("div");

    block.className = `gantt-segment ${segment.isContextSwitch ? "cs" : ""}`;
    block.style.background = segment.isContextSwitch ? "" : segment.color;
    block.style.flex = String(Math.max(duration, 1));

    block.innerHTML = `
      <strong>${segment.id}</strong>
      <span>${segment.start} - ${segment.end} ms</span>
    `;

    ganttChart.appendChild(block);
  });
}

function renderLegend() {
  ganttLegend.innerHTML = "";

  const legendItems = [
    ...processes.map((process) => ({
      id: process.id,
      label: process.service,
      color: process.color
    })),
    {
      id: "CS",
      label: "Context Switch",
      color: "#756a5d"
    }
  ];

  legendItems.forEach((item) => {
    const element = document.createElement("div");
    element.className = "legend-item";

    element.innerHTML = `
      <span class="legend-color" style="background:${item.color}"></span>
      <span><strong>${item.id}</strong> — ${item.label}</span>
    `;

    ganttLegend.appendChild(element);
  });
}

function renderResults(results) {
  resultTable.innerHTML = "";

  let totalTat = 0;
  let totalWt = 0;

  results.forEach((result) => {
    totalTat += result.turnaround;
    totalWt += result.waiting;

    const row = document.createElement("tr");

    row.innerHTML = `
      <td><strong>${result.id}</strong></td>
      <td>${result.completion} ms</td>
      <td>${result.turnaround} ms</td>
      <td>${result.waiting} ms</td>
    `;

    resultTable.appendChild(row);
  });

  avgTat.textContent = `${(totalTat / results.length).toFixed(2)} ms`;
  avgWt.textContent = `${(totalWt / results.length).toFixed(2)} ms`;
}

function runSimulation() {
  const quantum = Math.max(1, Number(quantumInput.value));
  const contextSwitchTime = Math.max(0, Number(contextInput.value));
  const limit = Math.max(5, Number(limitInput.value));

  const simulation = simulateScheduling(processes, quantum, contextSwitchTime);

  renderGanttChart(simulation.timeline, limit);
  renderResults(simulation.results);
  renderLegend();

  const visibleContextSwitches = simulation.timeline.filter(
    (segment) => segment.isContextSwitch && segment.start < limit
  ).length;

  contextSwitchBadge.textContent = `${visibleContextSwitches} context switches in first ${limit} ms`;
}

function resetDefaults() {
  processes = structuredClone(defaultProcesses);
  quantumInput.value = 4;
  contextInput.value = 1;
  limitInput.value = 30;
  renderProcessTable();
  runSimulation();
}

runBtn.addEventListener("click", runSimulation);
resetBtn.addEventListener("click", resetDefaults);

renderProcessTable();
runSimulation();