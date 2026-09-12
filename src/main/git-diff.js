/**
 * Git-интеграция для панели «Изменения».
 * Берёт данные из git (status + unified diff), а не из in-memory лога.
 */
const { execFile } = require('child_process');

/**
 * Запустить git-команду.
 * @param {string} cwd - рабочая директория (корень проекта)
 * @param {string[]} args
 * @returns {Promise<{ok:boolean, stdout:string, stderr:string, code:number}>}
 */
function git(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: stdout || '',
        stderr: stderr || '',
        code: err && typeof err.code === 'number' ? err.code : (err ? 1 : 0),
      });
    });
  });
}

/**
 * Проверить, что директория — git-репозиторий.
 * @returns {Promise<{isRepo:boolean, root:string|null, reason?:string}>}
 */
async function checkRepo(projectDir) {
  if (!projectDir) return { isRepo: false, root: null, reason: 'Проект не инициализирован' };
  const r = await git(projectDir, ['rev-parse', '--show-toplevel']);
  if (!r.ok) {
    return { isRepo: false, root: null, reason: r.stderr.trim() || 'Не git-репозиторий' };
  }
  return { isRepo: true, root: r.stdout.trim() };
}

/**
 * Разобрать вывод `git status --porcelain=v1`.
 * @returns {Array<{path:string, origPath:string|null, index:string, worktree:string, status:string}>}
 */
function parseStatus(stdout) {
  const out = [];
  for (const raw of stdout.split(/\r?\n/)) {
    if (!raw) continue;
    const x = raw[0];
    const y = raw[1];
    let rest = raw.slice(3);
    let origPath = null;
    // Переименования: "R  old -> new"
    const arrow = rest.indexOf(' -> ');
    if (arrow !== -1 && (x === 'R' || y === 'R')) {
      origPath = rest.slice(0, arrow).replace(/^"|"$/g, '');
      rest = rest.slice(arrow + 4);
    }
    const path = rest.replace(/^"|"$/g, '');
    let status;
    if (x === '?' && y === '?') status = 'untracked';
    else if (x === 'A') status = 'added';
    else if (x === 'D' || y === 'D') status = 'deleted';
    else if (x === 'R') status = 'renamed';
    else if (x === 'M' || y === 'M') status = 'modified';
    else status = 'changed';
    out.push({ path, origPath, index: x, worktree: y, status });
  }
  return out;
}

/**
 * Получить список изменённых файлов.
 * @returns {Promise<{success:boolean, files?:Array, reason?:string}>}
 */
async function getStatus(projectDir) {
  const repo = await checkRepo(projectDir);
  if (!repo.isRepo) return { success: false, reason: 'git не найден: ' + (repo.reason || '') };
  const r = await git(repo.root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (!r.ok) return { success: false, reason: r.stderr.trim() || 'git status failed' };

  // -z формат: записи разделены NUL; переименования содержат два NUL-поля
  const parts = r.stdout.split('\u0000').filter(Boolean);
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i];
    const x = rec[0], y = rec[1];
    let path = rec.slice(3);
    let origPath = null;
    if (x === 'R' || x === 'C') {
      // следующий элемент — исходный путь
      origPath = parts[++i] || null;
    }
    let status;
    if (x === '?' && y === '?') status = 'untracked';
    else if (x === 'A') status = 'added';
    else if (x === 'D' || y === 'D') status = 'deleted';
    else if (x === 'R') status = 'renamed';
    else if (x === 'M' || y === 'M') status = 'modified';
    else status = 'changed';
    files.push({ path, origPath, index: x, worktree: y, status });
  }
  return { success: true, root: repo.root, files };
}

/**
 * Получить unified diff одного файла (против HEAD, включая stage+worktree).
 * Для untracked — синтетический diff через --no-index с /dev/null.
 * @param {string} projectDir
 * @param {string} filePath - относительный путь (как в git status)
 * @param {string} status - тип (untracked → --no-index)
 * @returns {Promise<{success:boolean, diff?:string, reason?:string}>}
 */
async function getFileDiff(projectDir, filePath, status) {
  const repo = await checkRepo(projectDir);
  if (!repo.isRepo) return { success: false, reason: 'git не найден: ' + (repo.reason || '') };

  if (status === 'untracked') {
    // /dev/null через git показываем как новый файл
    const r = await git(repo.root, ['diff', '--no-index', '--no-color', '--', process.platform === 'win32' ? 'NUL' : '/dev/null', filePath]);
    // --no-index возвращает код 1 при наличии различий — это нормально
    const diff = r.stdout || '';
    if (diff) return { success: true, diff };
    // fallback: просто показать содержимое файла как «+» строки
    try {
      const fs = require('fs');
      const path = require('path');
      const abs = path.join(repo.root, filePath);
      const content = fs.readFileSync(abs, 'utf-8');
      const lines = content.split(/\r?\n/);
      const fake = ['diff --git a/' + filePath + ' b/' + filePath, 'new file mode 100644', '--- /dev/null', '+++ b/' + filePath, '@@ -0,0 +1,' + lines.length + ' @@']
        .concat(lines.map(l => '+' + l)).join('\n');
      return { success: true, diff: fake };
    } catch (e) {
      return { success: false, reason: 'Не удалось прочитать файл: ' + e.message };
    }
  }

  const r = await git(repo.root, ['diff', 'HEAD', '--no-color', '--', filePath]);
  if (!r.ok) return { success: false, reason: r.stderr.trim() || 'git diff failed' };
  return { success: true, diff: r.stdout };
}

module.exports = { checkRepo, getStatus, getFileDiff, parseStatus };
