const storageKey = "night-flow-admin-v1";
const cloudConfig = window.CABARET_CLOUD_CONFIG || {};
let cloudClient = null;
let cloudSaveTimer = null;
let cloudAuthenticated = false;

if (new URLSearchParams(location.search).has("resetDemo")) {
  localStorage.removeItem(storageKey);
  history.replaceState({}, "", location.pathname);
}

const seedData = {
  casts: [
    { id: 1, name: "美咲", status: "出勤", role: "レギュラー", hourly: 3500, back: 18, nominations: 3, hours: 5 },
    { id: 2, name: "玲奈", status: "出勤", role: "チーフ", hourly: 4200, back: 22, nominations: 4, hours: 5 },
    { id: 3, name: "葵", status: "予定", role: "新人", hourly: 2800, back: 12, nominations: 1, hours: 4 },
    { id: 4, name: "沙羅", status: "退勤", role: "レギュラー", hourly: 3600, back: 16, nominations: 2, hours: 3 }
  ],
  customers: [
    { id: 1, name: "佐藤 様", rank: "VIP", cast: "玲奈", visits: 18, lastVisit: "7/4", note: "山崎12年をキープ。静かな席を希望。" },
    { id: 2, name: "田中 様", rank: "Regular", cast: "美咲", visits: 8, lastVisit: "7/1", note: "同伴相談あり。会計はカード。" },
    { id: 3, name: "高橋 様", rank: "New", cast: "葵", visits: 2, lastVisit: "6/28", note: "接待利用。領収書の宛名確認。" }
  ],
  tables: [
    { id: 1, table: "A1", customer: "佐藤 様", cast: "玲奈", status: "open", guests: 2, set: 36000, drinks: 18000, bottles: 42000, service: 10000 },
    { id: 2, table: "A2", customer: "田中 様", cast: "美咲", status: "open", guests: 1, set: 18000, drinks: 12000, bottles: 0, service: 4000 },
    { id: 3, table: "B1", customer: "高橋 様", cast: "葵", status: "closed", guests: 3, set: 45000, drinks: 22000, bottles: 28000, service: 9000 },
    { id: 4, table: "C1", customer: "フリー", cast: "沙羅", status: "closed", guests: 2, set: 30000, drinks: 9000, bottles: 0, service: 6000 }
  ]
};

let state = loadState();
let currentView = "dashboard";
let tableFilter = "open";
let dialogMode = "sale";
let accountingTableId = null;
let deletingTableId = null;
let editingTableId = null;
let editingCastId = null;
const autoExtensionExitTime = "自動延長中";

const tableOptions = [
  "A卓", "C卓", "D卓", "F卓", "1卓", "5卓", "7卓", "9卓", "11卓", "15卓",
  "17卓", "18卓", "20卓", "22卓", "24卓", "26卓", "28卓", "31卓", "33卓", "36卓"
];

function tableSelectOptions(currentTable) {
  if (currentTable && !tableOptions.includes(currentTable)) {
    return [currentTable, ...tableOptions];
  }
  return tableOptions;
}

const viewTitles = {
  dashboard: "本日の店舗状況",
  casts: "キャスト管理",
  customers: "顧客管理",
  sales: "会計管理",
  payroll: "給与見込"
};

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const attendanceStatuses = ["出勤", "当欠", "無欠", "出欠"];

function timeRangeOptions(center, before = 180, after = 360) {
  const base = timeToMinutes(center);
  const options = [];
  for (let offset = -before; offset <= after; offset += 30) {
    options.push(minutesToTime(base + offset));
  }
  return options;
}

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(seedData);
  try {
    return { ...structuredClone(seedData), ...JSON.parse(saved) };
  } catch {
    return structuredClone(seedData);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  queueCloudSave();
}

function cloudEnabled() {
  return Boolean(
    cloudConfig.enabled &&
    cloudConfig.provider === "supabase" &&
    cloudConfig.supabaseUrl &&
    cloudConfig.supabaseAnonKey &&
    window.supabase
  );
}

function getCloudClient() {
  if (!cloudEnabled()) return null;
  if (!cloudClient) {
    cloudClient = window.supabase.createClient(cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey);
  }
  return cloudClient;
}

async function ensureCloudSession(client) {
  if (!cloudConfig.requireAuth) return true;
  const { data } = await client.auth.getSession();
  if (data.session) {
    cloudAuthenticated = true;
    return true;
  }
  const email = window.prompt("クラウド同期用のメールアドレスを入力してください（GitHub IDではなく、Supabase Authenticationに登録したメールアドレス）");
  if (!email) return false;
  const password = window.prompt("クラウド同期用のパスワードを入力してください（Supabase Authenticationのユーザーパスワード）");
  if (!password) return false;
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    window.alert(`クラウドログインに失敗しました。\n\n理由: ${error.message}\n\n入力するのはGitHubのID/パスワードではなく、Supabase Authenticationに作成したユーザーのメールアドレスとパスワードです。\nログインに失敗している間は、このPCのブラウザ内保存だけで動きます。`);
    console.warn("クラウドログインに失敗しました", error);
    return false;
  }
  cloudAuthenticated = true;
  return true;
}

async function loadCloudState() {
  const client = getCloudClient();
  if (!client) return false;
  const signedIn = await ensureCloudSession(client);
  if (!signedIn) return false;
  const { data, error } = await client
    .from(cloudConfig.stateTable)
    .select("payload")
    .eq("id", cloudConfig.stateId)
    .maybeSingle();
  if (error) {
    console.warn("クラウドデータの読み込みに失敗しました", error);
    return false;
  }
  if (!data?.payload) return false;
  state = { ...structuredClone(seedData), ...data.payload };
  localStorage.setItem(storageKey, JSON.stringify(state));
  return true;
}

function queueCloudSave() {
  const client = getCloudClient();
  if (!client) return;
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(async () => {
    if (!cloudAuthenticated) {
      const signedIn = await ensureCloudSession(client);
      if (!signedIn) return;
    }
    const { error } = await client
      .from(cloudConfig.stateTable)
      .upsert({
        id: cloudConfig.stateId,
        payload: state,
        updated_at: new Date().toISOString()
      });
    if (error) {
      console.warn("クラウドデータの保存に失敗しました", error);
    }
  }, 300);
}

function totalSale(table) {
  if (table.accountingAmount !== undefined && table.accountingAmount !== null && table.accountingAmount !== "") {
    return Number(table.accountingAmount);
  }
  return Number(table.set || 0) + Number(table.drinks || 0) + Number(table.bottles || 0) + Number(table.service || 0);
}

function castPay(cast) {
  const personalSales = state.tables
    .filter((table) => tableCasts(table).includes(cast.name))
    .reduce((sum, table) => sum + Number(table.drinks) + Number(table.bottles), 0);
  return Number(cast.hourly) * Number(cast.hours) + Math.round(personalSales * (Number(cast.back) / 100));
}

function activeCasts() {
  return state.casts.filter(isWorkingToday);
}

function tableCasts(table) {
  if (Array.isArray(table.casts)) return table.casts;
  if (table.cast) return [table.cast];
  return [];
}

function companionCasts(table) {
  if (Array.isArray(table.companionCasts)) return table.companionCasts;
  return [];
}

function castDisplay(table) {
  const casts = tableCasts(table);
  const companions = companionCasts(table);
  return casts.length
    ? casts.map((name) => companions.includes(name) ? `${name}（同伴）` : name).join("、")
    : "未設定";
}

function inStoreNominations(table) {
  if (Array.isArray(table.inStoreNominations)) return table.inStoreNominations;
  return [];
}

function inStoreNominationDisplay(table) {
  const nominations = inStoreNominations(table).filter((name) => name && name !== "なし");
  return nominations.length ? nominations.join("、") : "なし";
}

function bottleEntries(table) {
  if (Array.isArray(table.bottleEntries)) return table.bottleEntries;
  return [];
}

function bottleDisplay(table) {
  const bottles = bottleEntries(table).filter((bottle) => bottle.name || Number(bottle.amount));
  if (!bottles.length) return "なし";
  return bottles.map((bottle) => {
    const amount = Number(bottle.amount || 0);
    return `${bottle.name || "ボトル"} ${yen.format(amount)}`;
  }).join("、");
}

function paymentEntries(table) {
  if (Array.isArray(table.paymentEntries)) return table.paymentEntries;
  return [];
}

function visiblePaymentEntries(table) {
  return paymentEntries(table).filter((payment) => Number(payment.amount || 0) > 0);
}

function paymentDisplay(table) {
  const payments = visiblePaymentEntries(table);
  if (!payments.length) return "未入力";
  return payments.map((payment) => {
    const amount = Number(payment.amount || 0);
    const detail = payment.method?.startsWith("カード") && payment.cardName ? ` / 名義 ${payment.cardName}` : payment.method === "売掛" && payment.responsible ? ` / 責任者 ${payment.responsible}` : "";
    return amount > 0 ? `${payment.method} ${yen.format(amount)}${detail}` : payment.method;
  }).join("、");
}

function extensionTime(table) {
  const entryMinutes = timeToMinutes(table.entryTime);
  const extensionMinutes = Number(table.extensionMinutes || 0);
  if (entryMinutes === null || extensionMinutes <= 0) return "";
  return minutesToTime(entryMinutes + 60 + extensionMinutes);
}

function callWarningTime(table) {
  const entryMinutes = timeToMinutes(table.entryTime);
  if (entryMinutes === null) return "";
  const extensionMinutes = Number(table.extensionMinutes || 0);
  return minutesToTime(entryMinutes + 60 + extensionMinutes);
}

function minutesUntil(time) {
  const target = timeToMinutes(time);
  if (target === null) return false;
  const now = currentMinutes();
  const adjustedTarget = target < now - 12 * 60 ? target + 24 * 60 : target;
  const adjustedNow = now > adjustedTarget ? now - 24 * 60 : now;
  return adjustedTarget - adjustedNow;
}

function extensionWarningActive(table) {
  if (!table.call || table.status === "closed") return false;
  const remaining = minutesUntil(callWarningTime(table));
  return remaining !== false && remaining >= 0 && remaining <= 10;
}

function tableOverdueActive(table) {
  if (table.status === "closed") return false;
  const callRemaining = table.call ? minutesUntil(callWarningTime(table)) : false;
  const exitRemaining = table.exitTime ? minutesUntil(table.exitTime) : false;
  return (callRemaining !== false && callRemaining < 0) || (exitRemaining !== false && exitRemaining < 0);
}

function extensionHistory(table) {
  if (Array.isArray(table.extensionHistory)) return table.extensionHistory;
  return [];
}

function defaultExitTime(table) {
  if (table.call) {
    const callTime = callWarningTime(table);
    if (callTime) return callTime;
  }
  return nearestExitTime(table.entryTime);
}

function defaultAccountingExitTime(table) {
  if (!table.call && !table.exitTime) return autoExtensionExitTime;
  return table.exitTime || defaultExitTime(table);
}

function isAutoExtensionExitTime(exitTime) {
  return exitTime === autoExtensionExitTime;
}

function normalTableExitDisplay(table) {
  if (table.exitTime && !isAutoExtensionExitTime(table.exitTime)) return table.exitTime;
  return "自動延長";
}

function isClosed(table) {
  return table.status === "closed";
}

function activeTables() {
  return state.tables.filter((table) => !isClosed(table));
}

function isWorkingToday(cast) {
  if (cast.todayWorking !== undefined) return Boolean(cast.todayWorking);
  return cast.status !== "退勤";
}

function castAttendanceStatus(cast) {
  return cast.attendanceStatus || (cast.status === "退勤" ? "出欠" : "出勤");
}

function castStats(name) {
  const openTables = activeTables();
  const companion = openTables.reduce((sum, table) => sum + (companionCasts(table).includes(name) ? 1 : 0), 0);
  const nominations = openTables.reduce((sum, table) => sum + (tableCasts(table).includes(name) ? 1 : 0), 0);
  const inStore = openTables.reduce((sum, table) => sum + (inStoreNominations(table).includes(name) ? 1 : 0), 0);
  return { companion, nominations, inStore };
}

function businessDateLabel() {
  const now = new Date();
  if (now.getHours() < 8) {
    now.setDate(now.getDate() - 1);
  }
  const month = now.getMonth() + 1;
  const date = now.getDate();
  return `${month}/${date}（${weekdays[now.getDay()]}）`;
}

function timeToMinutes(time) {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function exitTimeOptions(entryTime, selectedTime, includeAutoExtension = false) {
  const start = timeToMinutes(entryTime) ?? timeToMinutes("20:00");
  const selected = timeToMinutes(selectedTime);
  const options = [];
  for (let offset = 60; offset <= 8 * 60; offset += 30) {
    options.push(minutesToTime(start + offset));
  }
  if (includeAutoExtension) {
    options.unshift(autoExtensionExitTime);
  }
  if (selected !== null && !options.includes(selectedTime)) {
    options.unshift(selectedTime);
  }
  return options;
}

function initials(name) {
  return name.replace(/\s/g, "").slice(0, 1);
}

function render() {
  renderMetrics();
  renderTables();
  renderTodayCasts();
  renderCastTable();
  renderCustomers();
  renderSales();
  renderPayroll();
}

function renderMetrics() {
  const sales = state.tables.reduce((sum, table) => sum + totalSale(table), 0);
  const openCount = state.tables.filter((table) => table.status === "open").length;
  const groupCount = state.tables.length;
  const guestCount = state.tables.reduce((sum, table) => sum + Number(table.guests || 0), 0);
  const activeGroupCount = activeTables().length;
  const activeGuestCount = activeTables().reduce((sum, table) => sum + Number(table.guests || 0), 0);
  const companionCount = activeTables().reduce((sum, table) => sum + companionCasts(table).length, 0);
  const nominationCount = activeTables().reduce((sum, table) => sum + tableCasts(table).filter((name) => name && name !== "フリー").length, 0);
  const inStoreCount = activeTables().reduce((sum, table) => sum + inStoreNominations(table).length, 0);

  document.querySelector("#todayGroupsGuests").textContent = `${groupCount}組 / ${guestCount}名`;
  document.querySelector("#activeGroupsGuests").textContent = `店内 ${activeGroupCount}組 / ${activeGuestCount}名`;
  document.querySelector("#todaySales").textContent = yen.format(sales);
  document.querySelector("#salesDelta").textContent = `未会計 ${openCount}卓`;
  document.querySelector("#nominationCount").textContent = `${companionCount} / ${nominationCount} / ${inStoreCount}`;
  document.querySelector("#businessDateLabel").textContent = businessDateLabel();
}

function renderTables() {
  const grid = document.querySelector("#tableGrid");
  const tables = state.tables.filter((table) => tableFilter === "all" || table.status === tableFilter);
  grid.innerHTML = tables.map((table) => `
    <article class="table-card ${isClosed(table) ? "closed" : ""} ${extensionWarningActive(table) ? "extension-warning" : ""} ${tableOverdueActive(table) ? "extension-overdue" : ""}">
      <header>
        <span class="table-no">${table.table}<small>${table.guests}名</small></span>
        <div class="table-status-actions">
          <span class="pill ${isClosed(table) ? "closed" : "warning"}">${isClosed(table) ? "退店済" : "未会計"}</span>
          <button class="status-edit-button" type="button" data-edit-table="${table.id}">修正</button>
        </div>
      </header>
      <div>
        ${table.entryTime ? `
          <div class="time-control-row ${table.call ? "is-call" : "is-normal"}">
            <div class="entry-time-display ${table.call ? "call" : ""}"><span>入店</span><strong>${table.entryTime}</strong></div>
            ${table.call ? `
              <div class="extension-time-display"><span>${extensionTime(table) ? "延長時間" : "セット時間"}</span><strong>${extensionTime(table) || callWarningTime(table)}</strong></div>
              <div class="extension-actions">
                <button class="mini-button extension-button" type="button" data-extend-table="${table.id}" data-extend-minutes="30">30分</button>
                <button class="mini-button extension-button" type="button" data-extend-table="${table.id}" data-extend-minutes="60">60分</button>
                <button class="mini-button extension-cancel-button" type="button" data-cancel-extension-table="${table.id}" ${Number(table.extensionMinutes || 0) <= 0 ? "disabled" : ""}>延長取消</button>
              </div>
            ` : `<div class="extension-time-display auto-extension-display"><span>退店時間</span><strong>${normalTableExitDisplay(table)}</strong></div>`}
          </div>
        ` : ""}
        <p>${table.customer}</p>
        <p>指名 ${castDisplay(table)}</p>
        ${inStoreNominations(table).length ? `<p>場内 ${inStoreNominationDisplay(table)}</p>` : ""}
        <strong>${yen.format(totalSale(table))}</strong>
        ${bottleEntries(table).length ? `<p>ボトル ${bottleDisplay(table)}</p>` : ""}
        ${visiblePaymentEntries(table).length ? `<p>支払 ${paymentDisplay(table)}</p>` : ""}
        ${isClosed(table) && table.exitTime ? `<p>退店 ${table.exitTime}</p>` : ""}
      </div>
      <div class="table-actions">
        <button class="mini-button" type="button" data-accounting-table="${table.id}">入力</button>
        <button class="mini-button" type="button" data-close-table="${table.id}">${isClosed(table) ? "未会計に戻す" : "退店済にする"}</button>
        <button class="mini-button danger-button" type="button" data-delete-table="${table.id}">削除</button>
      </div>
    </article>
  `).join("");
}

function renderTodayCasts() {
  const list = document.querySelector("#todayCastList");
  const workingCasts = state.casts.filter(isWorkingToday);
  list.innerHTML = workingCasts.map((cast) => {
    const stats = castStats(cast.name);
    return `
    <div class="cast-row">
      <div class="profile">
        <span class="avatar">${initials(cast.name)}</span>
        <div>
          <strong>${cast.name}</strong>
          <span>指名 ${stats.nominations}本 / 場内 ${stats.inStore}本</span>
        </div>
      </div>
      <div class="shift-controls">
        ${selectInline(`shiftStart-${cast.id}`, cast.shiftStart || "20:00", timeRangeOptions("20:00"))}
        ${selectInline(`shiftEnd-${cast.id}`, cast.shiftEnd || "23:30", timeRangeOptions("23:30"))}
        ${selectInline(`attendanceStatus-${cast.id}`, castAttendanceStatus(cast), attendanceStatuses)}
      </div>
    </div>
  `}).join("") || `<p class="empty-note">本日の出勤キャストは未選択です。</p>`;
}

function renderCastTable() {
  const table = document.querySelector("#castTable");
  table.innerHTML = `
    <div class="data-row header">
      <span>名前</span><span>本日</span><span>区分</span><span>時給</span><span>操作</span>
    </div>
    ${state.casts.map((cast) => `
      <div class="data-row">
        <span class="profile"><span class="avatar">${initials(cast.name)}</span><strong>${cast.name}</strong></span>
        <label class="toggle"><input type="checkbox" data-cast-today="${cast.id}" ${isWorkingToday(cast) ? "checked" : ""}><span>出勤</span></label>
        <span>${cast.role}</span>
        <span>${yen.format(cast.hourly)}</span>
        <span class="row-actions"><button class="mini-button" type="button" data-edit-cast="${cast.id}">編集</button><button class="mini-button danger-button" type="button" data-delete-cast="${cast.id}">削除</button></span>
      </div>
    `).join("")}
  `;
}

function renderCustomers() {
  const board = document.querySelector("#customerBoard");
  const query = document.querySelector("#globalSearch").value.trim().toLowerCase();
  const customers = state.customers.filter((customer) => {
    const target = `${customer.name} ${customer.rank} ${customer.cast} ${customer.note}`.toLowerCase();
    return !query || target.includes(query);
  });

  board.innerHTML = customers.map((customer) => `
    <article class="customer-card">
      <header>
        <h4>${customer.name}</h4>
        <span class="pill ${customer.rank === "VIP" ? "warning" : ""}">${customer.rank}</span>
      </header>
      <div class="customer-meta">
        <span class="pill closed">担当 ${customer.cast}</span>
        <span class="pill">来店 ${customer.visits}回</span>
        <span class="pill">最終 ${customer.lastVisit}</span>
      </div>
      <p class="customer-note">${customer.note}</p>
    </article>
  `).join("");
}

function renderSales() {
  const totalGuests = state.tables.reduce((sum, table) => sum + Number(table.guests), 0);
  const total = state.tables.reduce((sum, table) => sum + totalSale(table), 0);
  const totalGroups = state.tables.length;

  document.querySelector("#currentSales").textContent = yen.format(total);
  document.querySelector("#averageGroupSpend").textContent = yen.format(totalGroups ? Math.round(total / totalGroups) : 0);
  document.querySelector("#averageSpend").textContent = yen.format(totalGuests ? Math.round(total / totalGuests) : 0);

  document.querySelector("#salesTable").innerHTML = `
    <div class="data-row sales-row header">
      <span>卓</span><span>入退店</span><span>顧客</span><span>指名</span><span>場内</span><span>ボトル</span><span>会計金額</span><span>状態</span>
    </div>
    ${state.tables.map((table) => `
      <div class="data-row sales-row">
        <span><strong>${table.table}</strong> / ${table.guests}名</span>
        <span>${table.entryTime || "-"} / ${table.exitTime || "-"}</span>
        <span>${table.customer}</span>
        <span>${castDisplay(table)}</span>
        <span>${inStoreNominationDisplay(table)}</span>
        <span>${bottleDisplay(table)}</span>
        <span>${yen.format(totalSale(table))}</span>
        <span class="pill ${isClosed(table) ? "closed" : "warning"}">${isClosed(table) ? "退店済" : "未会計"}</span>
      </div>
    `).join("")}
  `;
}

function renderPayroll() {
  const showInactive = document.querySelector("#showInactive").checked;
  const casts = state.casts.filter((cast) => showInactive || cast.status !== "退勤");
  document.querySelector("#payrollTable").innerHTML = `
    <div class="data-row header">
      <span>名前</span><span>勤務</span><span>時給</span><span>バック率</span><span>支給見込</span>
    </div>
    ${casts.map((cast) => `
      <div class="data-row">
        <span class="profile"><span class="avatar">${initials(cast.name)}</span><strong>${cast.name}</strong></span>
        <span>${cast.hours}時間 / ${cast.status}</span>
        <span>${yen.format(cast.hourly)}</span>
        <span>${cast.back}%</span>
        <strong>${yen.format(castPay(cast))}</strong>
      </div>
    `).join("")}
  `;
}

function switchView(view) {
  currentView = view;
  document.querySelector("#pageTitle").textContent = viewTitles[view];
  document.querySelectorAll(".view").forEach((element) => element.classList.remove("active"));
  document.querySelector(`#${view}View`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
}

function selectInline(name, selectedValue, options) {
  return `
    <select class="inline-select" name="${name}" data-inline-select="${name}">
      ${options.map((option) => `<option value="${option}" ${option === selectedValue ? "selected" : ""}>${option}</option>`).join("")}
    </select>
  `;
}

function openDialog(mode) {
  dialogMode = mode;
  accountingTableId = null;
  deletingTableId = null;
  editingTableId = null;
  editingCastId = null;
  const dialog = document.querySelector("#entryDialog");
  const title = document.querySelector("#dialogTitle");
  const kicker = document.querySelector("#dialogKicker");
  const fields = document.querySelector("#dialogFields");

  if (mode === "cast") {
    kicker.textContent = "Cast";
    title.textContent = "キャスト登録";
    fields.innerHTML = `
      ${field("name", "名前", "text", "例: 花音")}
      ${field("role", "区分", "text", "レギュラー")}
      ${field("hourly", "時給", "number", "3500")}
      ${field("back", "バック率（%）", "number", "15")}
      ${checkboxField("todayWorking", "本日の出勤", true)}
    `;
  } else if (mode === "customer") {
    kicker.textContent = "Customer";
    title.textContent = "顧客登録";
    fields.innerHTML = `
      ${field("name", "名前", "text", "例: 山田 様")}
      ${selectField("rank", "ランク", ["New", "Regular", "VIP"])}
      ${field("cast", "担当キャスト", "text", "美咲")}
      ${field("visits", "来店回数", "number", "1")}
      ${field("lastVisit", "最終来店", "text", "7/5")}
      ${textareaField("note", "メモ", "好み、NG、領収書など")}
    `;
  } else {
    kicker.textContent = "Sales";
    title.textContent = "新規会計";
    fields.innerHTML = `
      ${entryTimeField()}
      ${selectField("table", "卓番号", tableOptions)}
      ${field("guests", "人数", "number", "1", { value: "1" })}
      ${field("customer", "顧客名", "text", "未入力でも登録できます", { required: false })}
      ${nominationField()}
    `;
  }

  document.querySelector("#entryForm").reset();
  if (mode === "sale") {
    document.querySelector("#entryTime").value = currentTimeValue();
  }
  dialog.showModal();
}

function openCastEditDialog(castId) {
  dialogMode = "editCast";
  editingCastId = castId;
  const cast = state.casts.find((item) => item.id === castId);
  const dialog = document.querySelector("#entryDialog");
  document.querySelector("#dialogKicker").textContent = "Cast";
  document.querySelector("#dialogTitle").textContent = `${cast.name} 編集`;
  document.querySelector("#dialogFields").innerHTML = `
    ${field("name", "名前", "text", "例: 花音", { value: cast.name })}
    ${field("role", "区分", "text", "レギュラー", { value: cast.role || "" })}
    ${field("hourly", "時給", "number", "3500", { value: String(cast.hourly || 0) })}
    ${field("back", "バック率（%）", "number", "15", { value: String(cast.back || 0) })}
    ${checkboxField("todayWorking", "本日の出勤", isWorkingToday(cast))}
  `;
  document.querySelector("#entryForm").reset();
  document.querySelector("#name").value = cast.name;
  document.querySelector("#role").value = cast.role || "";
  document.querySelector("#hourly").value = cast.hourly || 0;
  document.querySelector("#back").value = cast.back || 0;
  document.querySelector("#todayWorking").checked = isWorkingToday(cast);
  dialog.showModal();
}

function openEditDialog(tableId) {
  dialogMode = "editTable";
  editingTableId = tableId;
  const table = state.tables.find((item) => item.id === tableId);
  const dialog = document.querySelector("#entryDialog");
  const title = document.querySelector("#dialogTitle");
  const kicker = document.querySelector("#dialogKicker");
  const fields = document.querySelector("#dialogFields");

  kicker.textContent = "Edit";
  title.textContent = `${table.table} 卓情報修正`;
  fields.innerHTML = `
    ${entryTimeField(table.entryTime || currentTimeValue(), Boolean(table.call))}
    ${selectField("table", "卓番号", tableSelectOptions(table.table))}
    ${field("guests", "人数", "number", "1", { value: String(table.guests || 1) })}
    ${field("customer", "顧客名", "text", "未入力でも登録できます", { value: table.customer === "未入力" ? "" : table.customer, required: false })}
    ${nominationField(tableCasts(table), companionCasts(table))}
  `;

  document.querySelector("#entryForm").reset();
  document.querySelector("#entryTime").value = table.entryTime || currentTimeValue();
  document.querySelector("#table").value = table.table;
  document.querySelector("#guests").value = table.guests || 1;
  document.querySelector("#customer").value = table.customer === "未入力" ? "" : table.customer;
  dialog.showModal();
}

function openDeleteDialog(tableId) {
  dialogMode = "deleteTable";
  deletingTableId = tableId;
  const table = state.tables.find((item) => item.id === tableId);
  const dialog = document.querySelector("#entryDialog");
  const title = document.querySelector("#dialogTitle");
  const kicker = document.querySelector("#dialogKicker");
  const fields = document.querySelector("#dialogFields");

  kicker.textContent = "Delete";
  title.textContent = `${table.table} を削除`;
  fields.innerHTML = `
    <div class="field full">
      <label>削除する卓</label>
      <div class="readonly-box">${table.entryTime ? `${table.entryTime} 入店 / ` : ""}${table.customer} / ${table.guests}名 / 指名 ${castDisplay(table)}</div>
    </div>
    <p class="dialog-note">入力ミスなどで不要になった卓状況を削除します。この操作は保存後すぐに反映されます。</p>
  `;

  document.querySelector("#entryForm").reset();
  dialog.showModal();
}

function openAccountingDialog(tableId) {
  dialogMode = "accounting";
  accountingTableId = tableId;
  const table = state.tables.find((item) => item.id === tableId);
  const dialog = document.querySelector("#entryDialog");
  const title = document.querySelector("#dialogTitle");
  const kicker = document.querySelector("#dialogKicker");
  const fields = document.querySelector("#dialogFields");

  kicker.textContent = "Checkout";
  title.textContent = `${table.table} 会計入力`;
  fields.innerHTML = `
    <div class="field full">
      <label>対象卓</label>
      <div class="readonly-box">${table.entryTime ? `${table.entryTime} 入店 / ` : ""}${table.customer} / ${table.guests}名 / 指名 ${castDisplay(table)}</div>
    </div>
    ${selectField("exitTime", "退店時間", exitTimeOptions(table.entryTime, defaultAccountingExitTime(table), !table.call))}
    ${inStoreNominationField(table)}
    ${bottleField(table)}
    ${field("accountingAmount", "会計金額", "number", "0")}
    ${paymentField(table)}
  `;

  document.querySelector("#entryForm").reset();
  const exitTime = defaultAccountingExitTime(table);
  document.querySelector("#exitTime").value = exitTime;
  document.querySelector("#accountingAmount").value = totalSale(table);
  syncPaymentAmount();
  dialog.showModal();
}

function field(name, label, type, placeholder, options = {}) {
  const step = name === "entryTime" || name === "exitTime" ? " step=\"300\"" : "";
  const min = name === "accountingAmount" ? " min=\"0\"" : "";
  const value = options.value !== undefined ? ` value="${options.value}"` : "";
  const required = options.required === false ? "" : " required";
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <input id="${name}" name="${name}" type="${type}" placeholder="${placeholder}"${step}${min}${value}${required}>
    </div>
  `;
}

function entryTimeField(value = "", isCall = false) {
  return `
    <div class="field entry-call-field">
      <label for="entryTime">入店時間</label>
      <div class="entry-call-row">
        <input id="entryTime" name="entryTime" type="time" step="300" value="${value}" required>
        <label class="call-check">
          <input name="call" type="checkbox" value="1" ${isCall ? "checked" : ""}>
          <span>コール</span>
        </label>
      </div>
    </div>
  `;
}

function checkboxField(name, label, checked = false) {
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <label class="call-check form-check">
        <input id="${name}" name="${name}" type="checkbox" value="1" ${checked ? "checked" : ""}>
        <span>${label}</span>
      </label>
    </div>
  `;
}

function selectField(name, label, options) {
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <select id="${name}" name="${name}">
        ${options.map((option) => `<option value="${option}">${option}</option>`).join("")}
      </select>
    </div>
  `;
}

function textareaField(name, label, placeholder) {
  return `
    <div class="field full">
      <label for="${name}">${label}</label>
      <textarea id="${name}" name="${name}" placeholder="${placeholder}" required></textarea>
    </div>
  `;
}

function nominationField(selectedCasts = [], selectedCompanions = []) {
  const rows = selectedCasts.length ? selectedCasts : ["フリー"];
  return `
    <div class="field full">
      <label>指名キャスト</label>
      <div class="nomination-list" id="nominationList">
        ${rows.map((name) => nominationSelect(name, selectedCompanions.includes(name))).join("")}
      </div>
      <button class="ghost-button add-nomination" type="button" id="addNominationButton">
        <span aria-hidden="true">＋</span>
        <span>指名キャストを追加</span>
      </button>
    </div>
  `;
}

function nominationSelect(selectedName = "フリー", isCompanion = false) {
  const castNames = ["フリー", ...activeCasts().map((cast) => cast.name)];
  return `
    <div class="nomination-row">
      <select name="casts" required>
        ${castNames.map((name) => `<option value="${name}" ${name === selectedName ? "selected" : ""}>${name}</option>`).join("")}
      </select>
      <label class="companion-check">
        <input name="companions" type="checkbox" value="${selectedName}" ${isCompanion ? "checked" : ""}>
        <span>同伴</span>
      </label>
      <button class="icon-button remove-nomination" type="button" aria-label="指名キャスト欄を削除">×</button>
    </div>
  `;
}

function inStoreNominationField(table) {
  const nominations = inStoreNominations(table);
  const rows = nominations.length ? nominations : ["なし"];
  return `
    <div class="field full">
      <label>場内指名</label>
      <div class="nomination-list" id="inStoreNominationList">
        ${rows.map((name) => inStoreNominationSelect(name)).join("")}
      </div>
      <button class="ghost-button add-nomination" type="button" id="addInStoreNominationButton">
        <span aria-hidden="true">＋</span>
        <span>場内指名を追加</span>
      </button>
    </div>
  `;
}

function inStoreNominationSelect(selectedName = "なし") {
  const castNames = ["なし", ...activeCasts().map((cast) => cast.name)];
  return `
    <div class="nomination-row">
      <select name="inStoreNominations" required>
        ${castNames.map((name) => `<option value="${name}" ${name === selectedName ? "selected" : ""}>${name}</option>`).join("")}
      </select>
      <button class="icon-button remove-instore-nomination" type="button" aria-label="場内指名欄を削除">×</button>
    </div>
  `;
}

function bottleField(table) {
  const bottles = bottleEntries(table);
  const rows = bottles.length ? bottles : [{ name: "", amount: "" }];
  return `
    <div class="field full">
      <label>ボトル</label>
      <div class="bottle-list" id="bottleList">
        ${rows.map((bottle) => bottleRow(bottle)).join("")}
      </div>
      <button class="ghost-button add-nomination" type="button" id="addBottleButton">
        <span aria-hidden="true">＋</span>
        <span>ボトルを追加</span>
      </button>
    </div>
  `;
}

function bottleRow(bottle = {}) {
  return `
    <div class="bottle-row">
      <input name="bottleNames" type="text" placeholder="ボトル名" value="${bottle.name || ""}">
      <input name="bottleAmounts" type="number" min="0" placeholder="金額" value="${bottle.amount || ""}">
      <button class="icon-button remove-bottle" type="button" aria-label="ボトル欄を削除">×</button>
    </div>
  `;
}

function paymentField(table) {
  const payments = paymentEntries(table);
  const rows = payments.length ? payments : [{ method: "現金", amount: "" }];
  return `
    <div class="field full">
      <label>会計方法</label>
      <div class="payment-list" id="paymentList">
        ${rows.map((payment) => paymentRow(payment)).join("")}
      </div>
      <button class="ghost-button add-nomination" type="button" id="addPaymentButton">
        <span aria-hidden="true">＋</span>
        <span>支払方法を追加</span>
      </button>
    </div>
  `;
}

function paymentRow(payment = {}) {
  const methods = ["現金", "カード（CAT）", "カード（楽天）", "売掛"];
  const selectedMethod = payment.method || "現金";
  const detailValue = selectedMethod === "売掛" ? payment.responsible || "" : payment.cardName || "";
  const detailPlaceholder = selectedMethod === "売掛" ? "責任者名（必須）" : selectedMethod.startsWith("カード") ? "カード名義（未入力可）" : "補足";
  return `
    <div class="payment-row">
      <select name="paymentMethods" required>
        ${methods.map((method) => `<option value="${method}" ${method === selectedMethod ? "selected" : ""}>${method}</option>`).join("")}
      </select>
      <input name="paymentAmounts" type="number" min="0" placeholder="金額" value="${payment.amount || ""}">
      <input name="paymentDetails" type="text" placeholder="${detailPlaceholder}" value="${detailValue}" ${selectedMethod === "売掛" ? "required" : ""}>
      <button class="icon-button remove-payment" type="button" aria-label="支払方法欄を削除">×</button>
    </div>
  `;
}

function syncPaymentAmount() {
  if (dialogMode !== "accounting") return;
  const accountingAmount = document.querySelector("#accountingAmount");
  const firstPaymentAmount = document.querySelector('[name="paymentAmounts"]');
  if (!accountingAmount || !firstPaymentAmount) return;
  firstPaymentAmount.value = accountingAmount.value;
}

function currentTimeValue() {
  const now = new Date();
  now.setMinutes(Math.round(now.getMinutes() / 5) * 5, 0, 0);
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function nearestExitTime(entryTime) {
  const options = exitTimeOptions(entryTime);
  const now = timeToMinutes(currentTimeValue());
  const option = options.find((time) => timeToMinutes(time) >= now);
  return option || options[0];
}

function selectedCastRows(form) {
  return [...form.querySelectorAll("#nominationList .nomination-row")]
    .map((row) => ({
      name: row.querySelector('select[name="casts"]')?.value || "",
      companion: Boolean(row.querySelector('[name="companions"]')?.checked)
    }))
    .filter((row) => row.name);
}

function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const values = Object.fromEntries(formData.entries());

  if (dialogMode === "deleteTable") {
    state.tables = state.tables.filter((item) => item.id !== deletingTableId);
    deletingTableId = null;
  } else if (dialogMode === "editTable") {
    const table = state.tables.find((item) => item.id === editingTableId);
    const castRows = selectedCastRows(event.currentTarget);
    const casts = castRows.map((row) => row.name);
    const companions = castRows.filter((row) => row.companion).map((row) => row.name);
    table.table = values.table;
    table.entryTime = values.entryTime;
    table.call = values.call === "1";
    if (!table.call) {
      table.extensionMinutes = 0;
      table.extensionHistory = [];
    }
    table.customer = values.customer.trim() || "未入力";
    table.guests = Number(values.guests || 1);
    table.cast = casts[0] || "";
    table.casts = casts;
    table.companionCasts = companions;
    editingTableId = null;
  } else if (dialogMode === "editCast") {
    const cast = state.casts.find((item) => item.id === editingCastId);
    cast.name = values.name.trim();
    cast.role = values.role.trim();
    cast.hourly = Number(values.hourly || 0);
    cast.back = Number(values.back || 0);
    cast.todayWorking = values.todayWorking === "1";
    if (!cast.shiftStart) cast.shiftStart = "20:00";
    if (!cast.shiftEnd) cast.shiftEnd = "23:30";
    if (!cast.attendanceStatus) cast.attendanceStatus = "出勤";
    editingCastId = null;
  } else if (dialogMode === "accounting") {
    const table = state.tables.find((item) => item.id === accountingTableId);
    const inStore = formData.getAll("inStoreNominations").filter((name) => name && name !== "なし");
    const bottleNames = formData.getAll("bottleNames");
    const bottleAmounts = formData.getAll("bottleAmounts");
    const bottles = bottleNames.map((name, index) => ({
      name: String(name).trim(),
      amount: Number(bottleAmounts[index] || 0)
    })).filter((bottle) => bottle.name || bottle.amount > 0);
    const paymentMethods = formData.getAll("paymentMethods");
    const paymentAmounts = formData.getAll("paymentAmounts");
    const paymentDetails = formData.getAll("paymentDetails");
    const missingReceivable = paymentMethods.some((method, index) => method === "売掛" && !String(paymentDetails[index] || "").trim());
    if (missingReceivable) {
      window.alert("売掛の場合は責任者名を入力してください。");
      return;
    }
    const payments = paymentMethods.map((method, index) => ({
      method: String(method).trim(),
      amount: Number(paymentAmounts[index] || 0),
      cardName: String(method).startsWith("カード") ? String(paymentDetails[index] || "").trim() : "",
      responsible: method === "売掛" ? String(paymentDetails[index] || "").trim() : ""
    })).filter((payment) => payment.method || payment.amount > 0);
    table.exitTime = event.currentTarget.querySelector("#exitTime")?.value || values.exitTime;
    table.accountingAmount = Number(values.accountingAmount);
    table.inStoreNominations = inStore;
    table.bottleEntries = bottles;
    table.bottles = bottles.reduce((sum, bottle) => sum + Number(bottle.amount || 0), 0);
    table.paymentEntries = payments;
  } else if (dialogMode === "cast") {
    state.casts.push({
      id: Date.now(),
      name: values.name.trim(),
      status: values.todayWorking === "1" ? "出勤" : "退勤",
      todayWorking: values.todayWorking === "1",
      attendanceStatus: "出勤",
      shiftStart: "20:00",
      shiftEnd: "23:30",
      role: values.role.trim(),
      hourly: Number(values.hourly || 0),
      back: Number(values.back || 0),
      nominations: 0,
      hours: 5
    });
  } else if (dialogMode === "customer") {
    state.customers.push({
      id: Date.now(),
      name: values.name,
      rank: values.rank,
      cast: values.cast,
      visits: Number(values.visits),
      lastVisit: values.lastVisit,
      note: values.note
    });
  } else {
    const castRows = selectedCastRows(event.currentTarget);
    const casts = castRows.map((row) => row.name);
    const companions = castRows.filter((row) => row.companion).map((row) => row.name);
    state.tables.push({
      id: Date.now(),
      table: values.table,
      entryTime: values.entryTime,
      call: values.call === "1",
      extensionMinutes: 0,
      extensionHistory: [],
      customer: values.customer.trim() || "未入力",
      cast: casts[0] || "",
      casts,
      companionCasts: companions,
      status: "open",
      guests: Number(values.guests),
      set: 0,
      drinks: 0,
      bottles: 0,
      service: 0
    });
  }

  saveState();
  render();
  document.querySelector("#entryDialog").close();
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelectorAll(".segment").forEach((button) => {
  button.addEventListener("click", () => {
    tableFilter = button.dataset.filter;
    document.querySelectorAll(".segment").forEach((segment) => segment.classList.remove("active"));
    button.classList.add("active");
    renderTables();
  });
});

document.body.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-close-table]");
  const accountingButton = event.target.closest("[data-accounting-table]");
  const extendButton = event.target.closest("[data-extend-table]");
  const cancelExtensionButton = event.target.closest("[data-cancel-extension-table]");
  const deleteButton = event.target.closest("[data-delete-table]");
  const editButton = event.target.closest("[data-edit-table]");
  const castEditButton = event.target.closest("[data-edit-cast]");
  const castDeleteButton = event.target.closest("[data-delete-cast]");
  const addNominationButton = event.target.closest("#addNominationButton");
  const removeNominationButton = event.target.closest(".remove-nomination");
  const addInStoreNominationButton = event.target.closest("#addInStoreNominationButton");
  const removeInStoreNominationButton = event.target.closest(".remove-instore-nomination");
  const addBottleButton = event.target.closest("#addBottleButton");
  const addPaymentButton = event.target.closest("#addPaymentButton");
  const removeBottleButton = event.target.closest(".remove-bottle");
  const removePaymentButton = event.target.closest(".remove-payment");

  if (closeButton) {
    const table = state.tables.find((item) => item.id === Number(closeButton.dataset.closeTable));
    table.status = table.status === "closed" ? "open" : "closed";
    if (table.status === "open") {
      table.exitTime = "";
    } else if (!table.exitTime || isAutoExtensionExitTime(table.exitTime)) {
      table.exitTime = currentTimeValue();
    }
    saveState();
    render();
  }

  if (accountingButton) {
    openAccountingDialog(Number(accountingButton.dataset.accountingTable));
  }

  if (extendButton) {
    const table = state.tables.find((item) => item.id === Number(extendButton.dataset.extendTable));
    const minutes = Number(extendButton.dataset.extendMinutes || 0);
    table.extensionMinutes = Number(table.extensionMinutes || 0) + minutes;
    table.extensionHistory = [...extensionHistory(table), minutes];
    saveState();
    renderTables();
  }

  if (cancelExtensionButton) {
    const table = state.tables.find((item) => item.id === Number(cancelExtensionButton.dataset.cancelExtensionTable));
    const history = extensionHistory(table);
    const minutes = history.length ? history.pop() : Math.min(30, Number(table.extensionMinutes || 0));
    table.extensionMinutes = Math.max(0, Number(table.extensionMinutes || 0) - minutes);
    table.extensionHistory = history;
    saveState();
    renderTables();
  }

  if (deleteButton) {
    openDeleteDialog(Number(deleteButton.dataset.deleteTable));
  }

  if (editButton) {
    openEditDialog(Number(editButton.dataset.editTable));
  }

  if (castEditButton) {
    openCastEditDialog(Number(castEditButton.dataset.editCast));
  }

  if (castDeleteButton) {
    const cast = state.casts.find((item) => item.id === Number(castDeleteButton.dataset.deleteCast));
    if (cast && window.confirm(`${cast.name} を削除しますか？`)) {
      state.casts = state.casts.filter((item) => item.id !== cast.id);
      saveState();
      render();
    }
  }

  if (addNominationButton) {
    document.querySelector("#nominationList").insertAdjacentHTML("beforeend", nominationSelect());
  }

  const castSelect = event.target.closest('select[name="casts"]');
  if (castSelect) {
    const row = castSelect.closest(".nomination-row");
    const companion = row.querySelector('[name="companions"]');
    companion.value = castSelect.value;
    if (castSelect.value === "フリー") {
      companion.checked = false;
    }
  }

  if (addInStoreNominationButton) {
    document.querySelector("#inStoreNominationList").insertAdjacentHTML("beforeend", inStoreNominationSelect());
  }

  if (addBottleButton) {
    document.querySelector("#bottleList").insertAdjacentHTML("beforeend", bottleRow());
  }

  if (addPaymentButton) {
    document.querySelector("#paymentList").insertAdjacentHTML("beforeend", paymentRow());
  }

  if (removeNominationButton) {
    const rows = document.querySelectorAll(".nomination-row");
    if (rows.length > 1) {
      removeNominationButton.closest(".nomination-row").remove();
    }
  }

  if (removeInStoreNominationButton) {
    const rows = document.querySelectorAll("#inStoreNominationList .nomination-row");
    if (rows.length > 1) {
      removeInStoreNominationButton.closest(".nomination-row").remove();
    }
  }

  if (removeBottleButton) {
    const rows = document.querySelectorAll("#bottleList .bottle-row");
    if (rows.length > 1) {
      removeBottleButton.closest(".bottle-row").remove();
    } else {
      const row = removeBottleButton.closest(".bottle-row");
      row.querySelector('[name="bottleNames"]').value = "";
      row.querySelector('[name="bottleAmounts"]').value = "";
    }
  }

  if (removePaymentButton) {
    const rows = document.querySelectorAll("#paymentList .payment-row");
    if (rows.length > 1) {
      removePaymentButton.closest(".payment-row").remove();
    } else {
      const row = removePaymentButton.closest(".payment-row");
      row.querySelector('[name="paymentMethods"]').value = "現金";
      row.querySelector('[name="paymentAmounts"]').value = "";
      row.querySelector('[name="paymentDetails"]').value = "";
      row.querySelector('[name="paymentDetails"]').required = false;
      row.querySelector('[name="paymentDetails"]').placeholder = "補足";
    }
  }
});

document.querySelector("#globalSearch").addEventListener("input", renderCustomers);
document.querySelector("#showInactive").addEventListener("change", renderPayroll);
document.querySelector("#sidebarToggle").addEventListener("click", () => {
  document.querySelector(".app-shell").classList.toggle("sidebar-collapsed");
});
document.querySelector("#openSaleButton").addEventListener("click", () => openDialog("sale"));
document.querySelector("#openSaleButtonSecondary").addEventListener("click", () => openDialog("sale"));
document.querySelector("#openCastButton").addEventListener("click", () => openDialog("cast"));
document.querySelector("#openCustomerButton").addEventListener("click", () => openDialog("customer"));
document.querySelector("#closeDialog").addEventListener("click", () => document.querySelector("#entryDialog").close());
document.querySelector("#cancelDialog").addEventListener("click", () => document.querySelector("#entryDialog").close());
document.querySelector("#entryForm").addEventListener("submit", handleSubmit);
document.querySelector("#entryForm").addEventListener("input", (event) => {
  if (event.target.id === "accountingAmount") {
    syncPaymentAmount();
  }
});
document.body.addEventListener("change", (event) => {
  const todayToggle = event.target.closest("[data-cast-today]");
  const inlineSelect = event.target.closest("[data-inline-select]");
  const paymentMethod = event.target.closest('select[name="paymentMethods"]');

  if (todayToggle) {
    const cast = state.casts.find((item) => item.id === Number(todayToggle.dataset.castToday));
    cast.todayWorking = todayToggle.checked;
    cast.status = todayToggle.checked ? "出勤" : "退勤";
    if (!cast.shiftStart) cast.shiftStart = "20:00";
    if (!cast.shiftEnd) cast.shiftEnd = "23:30";
    if (!cast.attendanceStatus) cast.attendanceStatus = "出勤";
    saveState();
    render();
  }

  if (inlineSelect) {
    const [field, id] = inlineSelect.dataset.inlineSelect.split("-");
    const cast = state.casts.find((item) => item.id === Number(id));
    if (cast) {
      cast[field] = inlineSelect.value;
      saveState();
      renderTodayCasts();
    }
  }

  if (paymentMethod) {
    const row = paymentMethod.closest(".payment-row");
    const detail = row.querySelector('[name="paymentDetails"]');
    if (paymentMethod.value === "売掛") {
      detail.placeholder = "責任者名（必須）";
      detail.required = true;
    } else if (paymentMethod.value.startsWith("カード")) {
      detail.placeholder = "カード名義（未入力可）";
      detail.required = false;
    } else {
      detail.placeholder = "補足";
      detail.required = false;
    }
  }
});
setInterval(renderTables, 60 * 1000);

async function boot() {
  await loadCloudState();
  switchView(currentView);
  render();
}

boot();
