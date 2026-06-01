const { Plugin, Dialog, showMessage } = require("siyuan");

const PREFIX_RE = /^\d{6}-/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UPDATED_RE = /^\d{14}$/;

async function post(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {})
  });
  const json = await response.json();
  if (json.code !== 0) {
    throw new Error(`${url} failed: ${json.msg || JSON.stringify(json)}`);
  }
  return json.data;
}

async function sql(stmt) {
  return await post("/api/query/sql", { stmt });
}

function escapeSql(value) {
  return String(value || "").replace(/'/g, "''");
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function buildSql(scope) {
  const where = [
    "d.type='d'",
    "NOT EXISTS (SELECT 1 FROM blocks x WHERE x.type='d' AND x.id<>d.id AND x.path LIKE substr(d.path, 1, length(d.path)-3) || '/%')"
  ];

  if (scope.kind === "recent") {
    const since = new Date(Date.now() - scope.days * 24 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const ts = `${since.getFullYear()}${pad(since.getMonth() + 1)}${pad(since.getDate())}000000`;
    where.push(`d.updated >= '${ts}'`);
  }

  if (scope.kind === "notebook" && scope.box) {
    where.push(`d.box = '${escapeSql(scope.box)}'`);
  }

  return `
SELECT d.id, d.box, d.path, d.hpath, d.content, d.updated
FROM blocks d
WHERE ${where.join(" AND ")}
ORDER BY d.updated DESC, d.content ASC;`;
}

async function getCurrentNotebookId() {
  const active = document.querySelector(".layout-tab-container .protyle:not(.fn__none) .protyle-title")
    || document.querySelector(".protyle:not(.fn__none) .protyle-title")
    || document.querySelector(".protyle-title");
  const protyle = active && active.closest(".protyle");
  return protyle && protyle.dataset ? protyle.dataset.notebookId : "";
}

async function renameDoc(box, path, title) {
  await post("/api/filetree/renameDoc", { notebook: box, path, title });
}

async function refreshDatePrefixes(scope) {
  const rows = await sql(buildSql(scope));
  const result = {
    scanned: rows.length,
    renamed: 0,
    skipped: 0,
    errors: 0,
    details: [],
    skippedReasons: {}
  };

  for (const row of rows) {
    const title = row.content || "";
    const updated = row.updated || "";
    let reason = "";

    if (!UPDATED_RE.test(updated)) reason = "missing/invalid updated";
    else if (DATE_ONLY_RE.test(title)) reason = "date-only daily note";
    else if (!title || title === "未命名" || title === "未命名文档") reason = "untitled";

    if (reason) {
      result.skipped++;
      result.skippedReasons[reason] = (result.skippedReasons[reason] || 0) + 1;
      continue;
    }

    const desiredPrefix = updated.slice(2, 8);
    const bare = title.replace(PREFIX_RE, "");
    const newTitle = `${desiredPrefix}-${bare}`;
    if (newTitle === title) {
      result.skipped++;
      result.skippedReasons["already correct"] = (result.skippedReasons["already correct"] || 0) + 1;
      continue;
    }

    try {
      await renameDoc(row.box, row.path, newTitle);
      result.renamed++;
      if (result.details.length < 50) {
        result.details.push(`${title}  →  ${newTitle}`);
      }
    } catch (err) {
      result.errors++;
      if (result.details.length < 50) {
        result.details.push(`失败：${title} → ${newTitle}\n${err.message}`);
      }
    }
  }

  return result;
}

class DatePrefixRefreshPlugin extends Plugin {
  onload() {
    this.addIcons(`<symbol id="iconDatePrefixRefresh" viewBox="0 0 32 32"><path d="M8 4h2v4H8V4zm14 0h2v4h-2V4z"/><path d="M6 7h20a2 2 0 0 1 2 2v17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm0 7v12h20V14H6zm0-2h20V9H6v3z"/><path d="M10 17h5v2h-3v2h3v2h-5v-2h3v-2h-3v-2zm8 0h2v6h-2v-6zm3 0h2v6h-2v-6z"/></symbol>`);

    this.topBar = this.addTopBar({
      icon: "iconDatePrefixRefresh",
      title: "刷新文档日期前缀",
      position: "right",
      callback: () => this.openScopeDialog()
    });

    this.addCommand({
      langKey: "refreshDatePrefix",
      langText: "刷新文档日期前缀",
      hotkey: "",
      callback: () => this.openScopeDialog()
    });
  }

  async openScopeDialog() {
    const dialog = new Dialog({
      title: "刷新文档日期前缀",
      content: `<div class="date-prefix-refresh-dialog">
        <div class="b3-label__text">根据文档内部 updated 字段生成 YYMMDD- 前缀。目录型文档永远跳过。</div>
        <div style="margin-top:12px;">
          <button class="b3-button b3-button--outline" data-scope="recent7">最近 7 天</button>
          <button class="b3-button b3-button--outline" data-scope="recent30">最近 30 天</button>
          <button class="b3-button b3-button--outline" data-scope="notebook">当前笔记本</button>
          <button class="b3-button b3-button--outline" data-scope="all">全部笔记本</button>
        </div>
        <div class="date-prefix-refresh-result"></div>
      </div>`,
      width: "560px",
      height: "430px"
    });

    const resultEl = dialog.element.querySelector(".date-prefix-refresh-result");
    const buttons = dialog.element.querySelectorAll("button[data-scope]");
    buttons.forEach((button) => {
      button.addEventListener("click", async () => {
        const key = button.dataset.scope;
        let scope;
        if (key === "recent7") scope = { kind: "recent", days: 7 };
        if (key === "recent30") scope = { kind: "recent", days: 30 };
        if (key === "all") scope = { kind: "all" };
        if (key === "notebook") {
          const box = await getCurrentNotebookId();
          if (!box) {
            showMessage("没拿到当前笔记本 ID，先打开任意文档再试。", 5000, "error");
            return;
          }
          scope = { kind: "notebook", box };
        }

        buttons.forEach((b) => b.setAttribute("disabled", "disabled"));
        resultEl.innerHTML = "正在刷新……";
        try {
          const r = await refreshDatePrefixes(scope);
          const reasonText = Object.entries(r.skippedReasons).map(([k, v]) => `${k}: ${v}`).join("\n") || "无";
          resultEl.innerHTML = `<div>完成：扫描 ${r.scanned}，改名 ${r.renamed}，跳过 ${r.skipped}，错误 ${r.errors}</div>
            <div style="margin-top:8px;">跳过原因：</div><code>${escapeHtml(reasonText)}</code>
            <div style="margin-top:8px;">明细最多显示 50 条：</div><code>${escapeHtml(r.details.join("\n") || "无改名明细")}</code>`;
          showMessage(`日期前缀刷新完成：改名 ${r.renamed}，错误 ${r.errors}`, 5000, r.errors ? "error" : "info");
        } catch (err) {
          resultEl.innerHTML = `<code>${escapeHtml(err.stack || err.message || String(err))}</code>`;
          showMessage("日期前缀刷新失败，见弹窗详情。", 6000, "error");
        } finally {
          buttons.forEach((b) => b.removeAttribute("disabled"));
        }
      });
    });
  }
}

module.exports = DatePrefixRefreshPlugin;
