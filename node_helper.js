/* MMM-GoodWe: SEMS+ compatibility helper. Requires Node.js 22. */
const NodeHelper = require("node_helper");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const energyCodes = {
  today: "proPvStatsToday", week: "proPvStatsWeek", month: "proPvStatsMonth",
  year: "proPvStatsYear", total: "proPvStatsTotal"
};
const options = require("./goodwe-options.json");
const origin = "https://semsplus.goodwe.com";

function signature(token) {
  const now = Date.now();
  const digest = crypto.createHash("sha256")
    .update(`${now}@${token.uid}@${token.token}`).digest("hex");
  return Buffer.from(`${digest}@${now}`).toString("base64");
}

function factors(groups) {
  const values = new Map();
  if (!Array.isArray(groups)) throw new Error("Unknown telemetry format");
  for (const group of groups) {
    for (const factor of Array.isArray(group?.factors) ? group.factors : [group]) {
      if (factor?.code) values.set(factor.code, factor);
    }
  }
  return values;
}

function number(factor, expectedUnit) {
  if (factor?.data === undefined || factor.data === null || factor.data === "") return null;
  let value = Number(String(factor.data).trim().replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return null;
  const unit = String(factor.unit || expectedUnit).toLowerCase();
  if (expectedUnit === "kW" && unit === "w") value /= 1000;
  else if (expectedUnit === "kWh" && unit === "wh") value /= 1000;
  else if (unit !== expectedUnit.toLowerCase()) return null;
  return value;
}

module.exports = NodeHelper.create({
  start: function () {
    this.session = null;
    this.config = null;
    this.loginPending = null;
    this.busy = false;
    this.alarmBusy = false;
    this.inverterNames = new Map();
    this.retryAfter = 0;
    console.log("[GoodWe] SEMS+ helper started");
  },

  request: async function (url, token, body) {
    if (Date.now() < this.retryAfter) throw new Error("API cooldown active");
    const response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      signal: AbortSignal.timeout(30000),
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: origin,
        Referer: origin + "/",
        "User-Agent": "Mozilla/5.0",
        token: JSON.stringify(token),
        "X-Signature": signature(token)
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (response.status === 429) this.retryAfter = Date.now() + 300000;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (!["0", "00000"].includes(String(result?.code))) {
      const code = String(result?.code || "unknown");
      if (code === "GY0429") this.retryAfter = Date.now() + 300000;
      const error = new Error("API-code " + code);
      error.code = code;
      throw error;
    }
    return result;
  },

  login: async function () {
    if (this.loginPending) return this.loginPending;
    this.loginPending = this.performLogin();
    try { return await this.loginPending; }
    finally { this.loginPending = null; }
  },

  // Credentials never pass through the browser or socket notifications.
  readCredentials: function () {
    const username = process.env.GOODWE_USERNAME;
    const password = process.env.GOODWE_PASSWORD;
    if (username || password) {
      if (!username || !password) throw Object.assign(new Error("Incomplete credential environment"), { code: "CREDENTIALS_ERROR" });
      return { username, password, powerstationId: process.env.GOODWE_POWERSTATION_ID };
    }
    const filename = process.env.GOODWE_CREDENTIALS_FILE || path.join(os.homedir(), ".config", "magicmirror", "goodwe.json");
    try {
      const value = JSON.parse(fs.readFileSync(filename, "utf8"));
      if (typeof value.username !== "string" || !value.username.trim() || typeof value.password !== "string" || !value.password) throw new Error("Invalid credentials");
      return { username: value.username, password: value.password, powerstationId: process.env.GOODWE_POWERSTATION_ID || value.powerstationId };
    } catch (_) {
      // Do not log JSON parse errors: they can contain credential text.
      throw Object.assign(new Error("Credentials file missing or invalid"), { code: "CREDENTIALS_ERROR" });
    }
  },

  resolveStationId: function (legacyId) {
    const value = this.readCredentials().powerstationId || legacyId;
    if (typeof value !== "string" || !value.trim()) {
      throw Object.assign(new Error("Missing powerstationId in credentials file"), { code: "MISSING_CONFIGURATION" });
    }
    return value.trim();
  },

  performLogin: async function () {
    this.session = null;
    const credentials = this.readCredentials();
    const passwordHash = crypto.createHash("md5")
      .update(credentials.password, "utf8").digest("hex");
    const result = await this.request(
      origin + "/web/sems/sems-user/api/v1/auth/cross-login",
      { uid: "", timestamp: 0, token: "", client: "semsPlusWeb", version: "", language: "en" },
      {
        account: credentials.username,
        pwd: Buffer.from(passwordHash).toString("base64"),
        agreement: 1, isChinese: false, isLocal: false
      }
    );
    if (!result.data?.token || !result.data?.uid) throw new Error("No session received");
    const api = new URL(result.data.api || result.api);
    if (api.protocol !== "https:" ||
        !/(^|\.)(goodwe\.com|semsportal\.com)$/.test(api.hostname)) {
      throw new Error("Unexpected server address");
    }
    this.base = api.origin + "/web/sems";
    this.session = {
      ...result.data, api: this.base,
      client: "semsPlusWeb", version: "", language: "en"
    };
    console.log("[GoodWe] SEMS+ login successful");
  },

  get: async function (path, query, retry = true) {
    if (!this.session) await this.login();
    try {
      const response = await this.request(
        this.base + path + "?" + new URLSearchParams(query), this.session
      );
      return response.data;
    } catch (error) {
      if (retry && ["100002", "C0602"].includes(error.code)) {
        await this.login();
        return this.get(path, query, false);
      }
      throw error;
    }
  },

  solar: async function () {
    const stationId = this.resolveStationId(this.config?.powerstationId);
    if (!stationId) throw new Error("Missing powerstationId");
    const devices = await this.get("/sems-plant/api/stations/device/all-status", { stationId });
    if (!Array.isArray(devices?.deviceDetailList)) throw new Error("Missing device list");
    const inverters = new Map();
    for (const group of devices.deviceDetailList) {
      if (!["INVERTER", "ENERGY_STORAGE_INTEGRATED_CABINET"].includes(group.deviceType)) continue;
      for (const status of group.statusDetailList || []) {
        for (const sn of status.snList || []) {
          if (typeof sn === "string" && sn) inverters.set(sn, { sn, deviceType: group.deviceType });
        }
        for (const [sn, detail] of Object.entries(status.detailMap || {})) {
          inverters.set(sn, { ...detail, sn, deviceType: group.deviceType });
        }
      }
    }
    if (!inverters.size) throw new Error("No supported inverters found");
    this.inverterNames = new Map([...inverters].map(([sn, detail]) => [sn, detail.name || detail.deviceName || ""]));
    const output = [];
    for (const device of inverters.values()) {
      const path = "/sems-plant/api/equipments/" + encodeURIComponent(device.sn);
      const query = { deviceType: device.deviceType, pwId: stationId };
      let telemetry = new Map();
      let counters = new Map();
      try { telemetry = factors(await this.get(path + "/telemetry", query)); }
      catch (_) { console.warn("[GoodWe] Telemetry unavailable for one inverter"); }
      try { counters = factors(await this.get(path + "/telecounting", query)); }
      catch (_) { console.warn("[GoodWe] Energy counters unavailable for one inverter"); }
      const energy = Object.fromEntries(Object.entries(energyCodes).map(([key, code]) => [key, number(counters.get(code), "kWh")]));
      const kw = number(telemetry.get("pAc"), "kW");
      const today = energy.today;
      const total = energy.total;
      const capacity = Number(this.config.totalCapacity) / 1000 / inverters.size;
      const known = {
        serialNum: { value: device.sn, unit: "" },
        capacity: { value: capacity > 0 ? capacity : "—", unit: "kW" },
        InverterPowerOfPlantMonitor: { value: kw ?? 0, unit: "kW" },
        innerTemp: { value: telemetry.get("Temperature")?.data ?? "—", unit: "°C" }
      };
      const dict = {};
      for (const side of ["left", "right"]) {
        const keys = new Set((options.config?.[side] || []).map(field => field.API_field));
        if (side === "left") {
          keys.add("capacity");
          keys.add("InverterPowerOfPlantMonitor");
        }
        dict[side] = [...keys].map(key => ({ key, ...(known[key] || { value: "—", unit: "" }) }));
      }
      output.push({
        name: device.name || device.sn,
        energy,
        powerWatts: kw === null ? null : kw * 1000,
        out_pac: kw === null ? 0 : kw * 1000,
        eday: today,
        etotal: total ?? "—",
        invert_full: { status: kw === null ? 0 : 1 },
        d: { output_power: kw === null ? "—" : (kw * 1000).toFixed(0) + " W" },
        dict
      });
    }
    this.sendSocketNotification("LOAD_OPTIONS", options);
    // A total is unknown if any inverter lacks that counter; never show a partial sum.
    const energy = Object.fromEntries(Object.keys(energyCodes).map(key => [key,
      output.every(inv => Number.isFinite(inv.energy[key]))
        ? Math.round(output.reduce((sum, inv) => sum + inv.energy[key], 0) * 1000) / 1000
        : null
    ]));
    this.sendSocketNotification("SOLAR_DATA", {
      inverter: output, energy, kpi: { power: energy.today }
    });
    console.log(`[GoodWe] Data sent: ${output.length} inverter(s)`);
  },

  alarms: async function (stationId, language = "en", retry = true) {
    stationId = this.resolveStationId(stationId);
    if (!this.session) await this.login();
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    const date = (value, last = false) => {
      const pad = n => String(n).padStart(2, "0");
      return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${last ? "23:59:59" : "00:00:00"}`;
    };
    let result;
    try {
      result = await this.request(this.base + "/sems-alarm/api/v2/alarm/page",
        { ...this.session, language: ["nl", "en", "de", "fr"].includes(language) ? language : "en" },
        { stationId, startTime: date(start), endTime: date(end, true), pageIndex: 1, pageSize: 15, status: 1, timeType: 1 });
    } catch (error) {
      if (retry && ["100002", "C0602"].includes(error.code)) {
        await this.login();
        return this.alarms(stationId, language, false);
      }
      throw error;
    }
    if (!Array.isArray(result.data?.dataList)) throw new Error("Unexpected alarm response");
    const text = value => typeof value === "string" || typeof value === "number" ? String(value).slice(0, 500) : "";
    const localized = { nl: "warningNameNl", de: "warningNameDe", fr: "warningNameFr", en: "warningNameEn" }[language];
    const alarms = result.data.dataList.slice(0, 15).filter(a => a && typeof a === "object").map(alarm => {
      const recoveryKey = ["recoverytimes", "recoverytime", "recoverTime", "recoveryTime"].find(key => Object.prototype.hasOwnProperty.call(alarm, key));
      const recovery = recoveryKey ? text(alarm[recoveryKey]) : "";
      const state = !recoveryKey ? "unknown" : !recovery ? "active" : /^\d{4}-\d{2}-\d{2}/.test(recovery) && !recovery.startsWith("0000") ? "resolved" : "unknown";
      const firstText = keys => keys.map(key => text(alarm[key])).find(value => value.trim()) || "";
      const deviceSerial = firstText(["sn", "deviceSn", "devicesn", "inverterSn", "invertersn", "serialNum", "serialNumber", "equipmentSn"]);
      const deviceName = firstText(["deviceName", "devicename", "inverterName", "invertername", "equipmentName", "deviceAlias", "snName"])
        || text(this.inverterNames.get(deviceSerial));
      return {
        deviceName, deviceSerial,
        message: text(alarm[localized] || alarm.warningNameEn || alarm.warningname || alarm.alarmName || alarm.alarmname || alarm.name || alarm.title || alarm.content),
        time: text(alarm.happentimes || alarm.happentime || alarm.startTime || alarm.createTime),
        state
      };
    });
    this.sendSocketNotification("ALARM_DATA", alarms);
  },

  socketNotificationReceived: async function (notification, payload) {
    if (notification === "GET_ALARMS") {
      if (this.alarmBusy) return;
      this.alarmBusy = true;
      try {
        if (!this.config) this.config = payload?.config || {};
        await this.alarms(payload?.config?.powerstationId, payload?.language);
      } catch (_) {
        console.warn("[GoodWe] Alarm refresh failed");
        this.sendSocketNotification("ALARM_ERROR", "ALARMS_ERROR");
      } finally { this.alarmBusy = false; }
      return;
    }

    if (notification === "LOAD_OPTIONS") {
      this.sendSocketNotification("LOAD_OPTIONS", options);
      return;
    }
    if (!["LOGIN_USER", "GET_SOLAR"].includes(notification)) return;
    if (this.busy) return;
    this.busy = true;
    try {
      if (notification === "LOGIN_USER") {
        this.config = payload;
        this.resolveStationId(payload?.powerstationId);
        await this.login();
        // The existing frontend requests data after this notification.
        this.busy = false;
        this.sendSocketNotification("LOGIN_USER", "Success");
      } else {
        this.config = payload.config;
        await this.solar();
      }
    } catch (error) {
      const code = ["CREDENTIALS_ERROR", "MISSING_CONFIGURATION"].includes(error.code) ? error.code : "CONNECTION_ERROR";
      console.error("[GoodWe] " + code);
      this.sendSocketNotification("GOODWE_ERROR", code);
    } finally {
      this.busy = false;
    }
  }
});
