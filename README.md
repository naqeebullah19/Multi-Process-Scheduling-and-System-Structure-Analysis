# Multi-Process Scheduling and System Structure Analysis

This is a clean web-based Operating Systems project that simulates a multi-process scheduling scenario.

## Project Topic

Cloud-based university management system using:

- Multiprogramming
- Multithreading
- Multiprocessing
- Kernel-level threads
- Preemptive priority scheduling
- Round-robin among same-priority processes
- Context switching

## Processes

| Process | Description | Priority |
|---|---|---|
| P3 | Real-time attendance tracking service | Highest |
| P5 | Security monitoring daemon | Second |
| P1 | Student registration service | Third |
| P4 | Report generation module | Fourth |
| P2 | Database backup process | Lowest |

Priority order:

```txt
P3 > P5 > P1 > P4 > P2