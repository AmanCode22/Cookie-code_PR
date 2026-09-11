/**
 * process-manager.js
 * Отслеживание и экстренная остановка (kill) активных дочерних процессов команд.
 */
const { exec } = require('child_process');

class ProcessManager {
  constructor() {
    this.activeProcesses = new Set();
    // PID, завершённые пользователем через кнопку Kill — чтобы инструменты
    // могли отличить намеренную остановку от обычного ненулевого exit code.
    this.killedPids = new Set();
  }

  /** Пометить pid как убитый пользователем (вызывается из killAll). */
  markKilled(pid) {
    if (!pid) return;
    this.killedPids.add(pid);
    // Не держим память бесконечно — чистим старые записи.
    if (this.killedPids.size > 256) {
      const first = this.killedPids.values().next().value;
      this.killedPids.delete(first);
    }
  }

  /** Был ли процесс с данным pid остановлен пользователем. */
  wasKilled(pid) {
    return !!pid && this.killedPids.has(pid);
  }

  track(child) {
    if (!child || !child.pid) return;
    this.activeProcesses.add(child);
    const cleanup = () => {
      this.activeProcesses.delete(child);
    };
    child.once('exit', cleanup);
    child.once('close', cleanup);
    child.once('error', cleanup);
  }

  untrack(child) {
    if (child) this.activeProcesses.delete(child);
  }

  async killAll() {
    const list = Array.from(this.activeProcesses);
    if (list.length === 0) {
      return { success: true, count: 0 };
    }

    let killedCount = 0;
    const isWin = process.platform === 'win32';

    const killPromises = list.map((child) => {
      return new Promise((resolve) => {
        const pid = child.pid;
        if (!pid) {
          resolve();
          return;
        }

        killedCount++;
        this.markKilled(pid);
        if (isWin) {
          exec(`taskkill /pid ${pid} /T /F`, { windowsHide: true }, () => {
            try { child.kill('SIGKILL'); } catch (_) {}
            resolve();
          });
        } else {
          try {
            process.kill(-pid, 'SIGKILL');
          } catch (_) {
            try { child.kill('SIGKILL'); } catch (__) {}
          }
          resolve();
        }
      });
    });

    await Promise.all(killPromises);
    this.activeProcesses.clear();
    return { success: true, count: killedCount };
  }
}

const processManager = new ProcessManager();

module.exports = { processManager };
