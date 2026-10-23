/* MMM-GoodWe: SEMS+ compatibility helper. Requires Node.js 22. */
const NodeHelper = require("node_helper");
const crypto = require("node:crypto");
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
  if (!Array.isArray(groups)) throw new Error("Onbekend meetgegevensformaat");
  for (const group of groups) {
    for (const factor of Array.isArray(group?.factors) ? group.factors : [group]) {
      if (factor?.code) values.set(factor.code, factor);
    }
  }
  return values;
}

function number(factor, expectedUnit) {
  if (factor?.data === undefined || factor.data === null || factor.data === "") return null;
  let value = Number(factor.data);
  if (!Number.isFinite(value)) return null;
  const unit = String(factor.unit || expectedUnit).toLowerCase();
  if (expectedUnit === "kW" && unit === "w") value /= 1000;
  else if (expectedUnit === "kWh" && unit === "wh") value /= 1000;
  else if (unit !== expectedUnit.toLowerCase()) throw new Error("Onverwachte meeteenheid");
  return value;
}

module.exports = NodeHelper.create({
  start: function () {
    this.session = null;
    this.config = null;
    this.loginPending = null;
    this.busy = false;
    this.retryAfter = 0;
    console.log("[GoodWe] SEMS+ helper gestart");
  },

  request: async function (url, token, body) {
    if (Date.now() < this.retryAfter) throw new Error("Tijdelijke API-pauze actief");
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
      const code = String(result?.code || "onbekend");
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

  performLogin: async function () {
    this.session = null;
    if (!this.config?.username || !this.config?.password) {
      throw new Error("Inloggegevens ontbreken");
    }
    const passwordHash = crypto.createHash("md5")
      .update(this.config.password, "utf8").digest("hex");
    const result = await this.request(
      origin + "/web/sems/sems-user/api/v1/auth/cross-login",
      { uid: "", timestamp: 0, token: "", client: "semsPlusWeb", version: "", language: "en" },
      {
        account: this.config.username,
        pwd: Buffer.from(passwordHash).toString("base64"),
        agreement: 1, isChinese: false, isLocal: false
      }
    );
    if (!result.data?.token || !result.data?.uid) throw new Error("Geen sessie ontvangen");
    const api = new URL(result.data.api || result.api);
    if (api.protocol !== "https:" ||
        !/(^|\.)(goodwe\.com|semsportal\.com)$/.test(api.hostname)) {
      throw new Error("Onverwacht serveradres");
    }
    this.base = api.origin + "/web/sems";
    this.session = {
      ...result.data, api: this.base,
      client: "semsPlusWeb", version: "", language: "en"
    };
    console.log("[GoodWe] SEMS+ login geslaagd");
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
    const stationId = this.config.powerstationId;
    if (!stationId) throw new Error("powerstationId ontbreekt");
    const devices = await this.get("/sems-plant/api/stations/device/all-status", { stationId });
    if (!Array.isArray(devices?.deviceDetailList)) throw new Error("Apparatenlijst ontbreekt");
    const inverters = new Map();
    for (const group of devices.deviceDetailList) {
      if (!["INVERTER", "ENERGY_STORAGE_INTEGRATED_CABINET"].includes(group.deviceType)) continue;
      for (const status of group.statusDetailList || []) {
        for (const [sn, detail] of Object.entries(status.detailMap || {})) {
          inverters.set(sn, { ...detail, sn, deviceType: group.deviceType });
        }
      }
    }
    if (!inverters.size) throw new Error("Geen ondersteunde omvormers gevonden");
    const output = [];
    for (const device of inverters.values()) {
      const path = "/sems-plant/api/equipments/" + encodeURIComponent(device.sn);
      const query = { deviceType: device.deviceType, pwId: stationId };
      const telemetry = factors(await this.get(path + "/telemetry", query));
      const counters = factors(await this.get(path + "/telecounting", query));
      const kw = number(telemetry.get("pAc"), "kW");
      const today = number(counters.get("proPvStatsToday"), "kWh");
      const total = number(counters.get("proPvStatsTotal"), "kWh");
      if (today === null) throw new Error("Dagopbrengst ontbreekt in SEMS+-antwoord");
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
        out_pac: kw === null ? 0 : kw * 1000,
        eday: today,
        etotal: total ?? "—",
        invert_full: { status: kw === null ? 0 : 1 },
        d: { output_power: kw === null ? "—" : (kw * 1000).toFixed(0) + " W" },
        dict
      });
    }
    this.sendSocketNotification("LOAD_OPTIONS", options);
    this.sendSocketNotification("SOLAR_DATA", {
      inverter: output,
      kpi: { power: output.reduce((sum, inv) => sum + inv.eday, 0) }
    });
    console.log(`[GoodWe] Gegevens verzonden: ${output.length} omvormer(s)`);
  },

  socketNotificationReceived: async function (notification, payload) {
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
        await this.login();
        // The existing frontend requests data after this notification.
        this.busy = false;
        this.sendSocketNotification("LOGIN_USER", "Success");
      } else {
        this.config = payload.config;
        await this.solar();
      }
    } catch (error) {
      console.error("[GoodWe fout]", error.message);
    } finally {
      this.busy = false;
    }
  }
});
