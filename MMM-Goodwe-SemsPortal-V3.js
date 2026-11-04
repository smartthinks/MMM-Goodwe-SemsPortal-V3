/* eslint-disable prettier/prettier */
Module.register("MMM-Goodwe-SemsPortal-V3", {
    // Default module config.
    defaults: {
        refInterval: 1000 * 60 * 5, //5 minutes
        basicHeader: false,
        testMode: false,
        showAlarms: true,
        showResolvedAlarms: false,
        alarmLimit: 3,
        showEnergyTotals: true,
        showWeekYield: true,
        showMonthYield: true,
        showYearYield: true,
        showLifetimeYield: true,
        totalCapacity: 5600,
        inverterGaugeStyle: "circle", // "circle" or "semicircle"
        totalGaugeStyle: "circle", // "circle" or "semicircle"
    },

    start: async function() {
        // Logging appears in Chrome developer tools console
        Log.info("Starting module: " + this.name);
        this.titles = [this.translate("CURRENT_POWER"), this.translate("GENERATED_TODAY"), this.translate("GENERATED_TOTAL")];
        this.suffixes = ["kW", "kWh", "kWh", "kW", "kWh", "kWh"];
        this.inverters = [];
        this.currentPowerTitle = "";
        this.currentPowerTotal = 0;
        this.totalCapacity = 5600;
        this.loaded = false;
        this.dayGeneration = "—";
        this.energyTotals = {};
        this.errorCode = null;
        this.alarms = [];
        this.alarmState = "loading";
        this.invertersOffline = false;
        this.customGaugeColors = { innerCircleColor: "#3a455e", outerCircleColor: "transparent", currentValueRingColor: "green", ...(this.config.customGaugeColors || {}) };
        this.goodWeOptions = null;

        if (Number(this.config.totalCapacity) > 0) {
            this.totalCapacity = Number(this.config.totalCapacity);
        }

        if (this.config.updateIntervalMinutes >= 1) {
            // if an interval was set through the config, update the interval time
            this.config.refInterval = 1000 * 60 * this.config.updateIntervalMinutes;
        }

        // get our token so that we can request our data
        if (!this.config.testMode) this.authenticateUser();
        this.loadGoodWeOptions();

        if (this.config.basicHeader) {
            this.data.header = 'GoodWe PV';
        }

        var self = this;
        //Schedule updates
        setInterval(function() {
            self.getSolarData();
            self.updateDom();
        }, this.config.refInterval);
        setInterval(() => this.getAlarmData(), 5 * 60 * 1000);
    },

    //Import additional CSS Styles
    getStyles: function() {
        return ['solar.css']
    },

    getTranslations: function() {
        return {
            en: "translations/en.json",
            nl: "translations/nl.json",
            de: "translations/de.json",
            fr: "translations/fr.json"
        };
    },

    // Follow the global MagicMirror language for detail labels as well.
    fieldTitle: function(field) {
        const key = "FIELD_" + field.API_field;
        const label = this.translate(key);
        // Unknown custom fields keep their supplied English name.
        return label !== key ? label : (field.EN_title || field["EN-title"] || field.name || field.API_field || "");
    },

    authenticateUser: function() {
        Log.info("SolarApp: Retrieving Token"); 

        this.sendSocketNotification("LOGIN_USER", this.config);
    },

    loadGoodWeOptions: function() {
        Log.info("SolarApp: Retrieving Options"); 

        this.sendSocketNotification("LOAD_OPTIONS", null);
    },

    //Contact node helper for solar data
    getSolarData: function() {
        if (this.config.testMode) return;
        Log.info("SolarApp: getting data");

        this.sendSocketNotification("GET_SOLAR", {
            config: this.config
        });
    },

    getAlarmData: function() {
        if (this.config.testMode || !this.config.showAlarms) return;
        const language = typeof config !== "undefined" ? config.language : "en";
        this.sendSocketNotification("GET_ALARMS", { config: this.config, language });
    },

    visibleAlarms: function() {
        const alarms = Array.isArray(this.alarms) ? this.alarms : [];
        return this.config.showResolvedAlarms ? alarms : alarms.filter(alarm => alarm.state !== "resolved");
    },

    hasAlarmMessages: function() {
        return this.config.showAlarms && this.visibleAlarms().length > 0;
    },

    makeAlarmOverview: function() {
        const section = document.createElement("div");
        section.className = "goodwe-alarms";
        const add = (className, label) => {
            const el = document.createElement("div");
            el.className = className;
            el.textContent = label;
            section.appendChild(el);
        };
        add("goodwe-alarm-title", this.translate("ALARMS_TITLE"));
        if (this.alarmState !== "ok") {
            add("goodwe-alarm-notice", this.translate(this.alarmState === "error" ? "ALARMS_ERROR" : "ALARMS_LOADING"));
        }
        const limit = Math.max(1, Math.min(15, Math.floor(Number(this.config.alarmLimit)) || 3));
        for (const alarm of this.visibleAlarms().slice(0, limit)) {
            const row = document.createElement("div");
            row.className = "goodwe-alarm-item goodwe-alarm-" + alarm.state;
            const device = document.createElement("div");
            device.className = "goodwe-alarm-meta";
            const matched = this.inverters.find(inverter => inverter.dict?.left?.some(field => field.key === "serialNum" && field.value === alarm.deviceSerial));
            const name = alarm.deviceName || matched?.name || "";
            const identity = name && alarm.deviceSerial && name !== alarm.deviceSerial
                ? name + " (" + alarm.deviceSerial + ")" : name || alarm.deviceSerial;
            device.textContent = identity ? this.translate("ALARM_DEVICE") + ": " + identity : this.translate("ALARM_DEVICE_UNKNOWN");
            row.appendChild(device);
            const title = document.createElement("div");
            title.textContent = alarm.message || this.translate("ALARM_UNKNOWN");
            const status = document.createElement("div");
            status.className = "goodwe-alarm-meta";
            const key = { active: "ALARM_ACTIVE", resolved: "ALARM_RESOLVED" }[alarm.state] || "ALARM_STATE_UNKNOWN";
            status.textContent = this.translate(key) + (alarm.time ? " · " + alarm.time : "");
            row.appendChild(title);
            row.appendChild(status);
            section.appendChild(row);
        }
        return section;
    },

    numberLocale: function() {
        const language = typeof config !== "undefined" ? config.language : "en";
        return { nl: "nl-NL", en: "en-GB", de: "de-DE", fr: "fr-FR" }[String(language || "en").toLowerCase()] || "en-GB";
    },

    formatEnergy: function(value, compact = false) {
        if (typeof value !== "number" || !Number.isFinite(value)) return "—";
        const wh = compact && value < 1;
        return new Intl.NumberFormat(this.numberLocale(), { maximumFractionDigits: wh ? 0 : 2 })
            .format(wh ? value * 1000 : value) + (wh ? " Wh" : " kWh");
    },

    // Handle node helper response
    socketNotificationReceived: function(notification, payload) {
        if (notification === "SOLAR_DATA") {
            if (this.config.testMode) return;
            this.errorCode = null;
            this.energyTotals = payload.energy || {};
            this.inverters = [];
            var currentPower = 0;

            for (let i=0; i < payload.inverter.length; i++) {
                // setup our array with inverters from the returned payload by SEMS
                this.inverters[i] = payload.inverter[i];
                currentPower = currentPower + payload.inverter[i].out_pac;
            }

            if (payload.inverter.filter(elem => elem.invert_full.status !== 1).length === payload.inverter.length) {
                this.invertersOffline = true;
            } else {
                this.invertersOffline = false;
            }

            if (currentPower > 1000) {
                // if more than 1000W is being generated in total, we should display it in kW. 
                this.currentPowerTitle = (currentPower / 1000).toFixed(2) + " kW";
            } else {
                this.currentPowerTitle = currentPower + " W";
            }

            this.currentPowerTotal = currentPower;

            this.dayGeneration = this.formatEnergy(payload.energy?.today ?? payload.kpi?.power, true);

            this.loaded = true;
            this.updateDom(1000);
        } else if (notification === "GOODWE_ERROR") {
            if (this.config.testMode) return;
            this.errorCode = ["CREDENTIALS_ERROR", "MISSING_CONFIGURATION"].includes(payload) ? payload : "CONNECTION_ERROR";
            this.updateDom();
        } else if (notification === "LOGIN_USER") {
            Log.info(`%c[SEMS-API][OK] - Authenticated`, "color: green");
            this.getSolarData();
            this.getAlarmData();
        } else if (notification === "ALARM_DATA") {
            if (this.config.testMode) return;
            this.alarms = Array.isArray(payload) ? payload : [];
            this.alarmState = "ok";
            this.updateDom();
        } else if (notification === "ALARM_ERROR") {
            if (this.config.testMode) return;
            this.alarmState = "error";
            this.updateDom();
        } else if (notification === "LOAD_OPTIONS") {
            this.goodWeOptions = payload;
        }
    },

    // Optional half-circle display; existing circle rendering stays available.
    makeSemicircle: function(power, capacity, label, small) {
        const wrapper = document.createElement("div");
        wrapper.className = "goodwe-semicircle" + (small ? " goodwe-semicircle--small" : "");
        const value = Number(power);
        const maximum = Number(capacity);
        const ratio = Number.isFinite(value) && Number.isFinite(maximum) && maximum > 0
            ? Math.max(0, Math.min(1, value / maximum)) : 0;
        const colors = this.config.enableCustomGaugeColors ? (this.config.customGaugeColors || {}) : {};
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", "0 0 220 120");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", label);
        const addArc = function(color, progress) {
            const path = document.createElementNS(ns, "path");
            path.setAttribute("d", "M 20 110 A 90 90 0 0 1 200 110");
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", color);
            path.setAttribute("stroke-width", "30");
            path.setAttribute("pathLength", "100");
            if (progress !== undefined) {
                path.setAttribute("stroke-dasharray", (progress * 100) + " 100");
            }
            svg.appendChild(path);
        };
        addArc(colors.outerCircleColor || "#f5f5f5");
        addArc(colors.currentValueRingColor || "#1abc9c", ratio);
        wrapper.appendChild(svg);
        const caption = document.createElement("div");
        caption.className = "goodwe-semicircle-value";
        caption.textContent = label;
        wrapper.appendChild(caption);
        return wrapper;
    },

    // Override dom generator
    getDom: function() {
        if (this.config.testMode === true) {
            const capacity = Number(this.config.totalCapacity) > 0 ? Number(this.config.totalCapacity) : 7500;
            this.loaded = true;
            this.invertersOffline = false;
            this.currentPowerTotal = 1500;
            this.currentPowerTitle = "1.50 kW";
            this.alarmState = "ok";
            this.alarms = [
                { message: this.translate("TEST_ALARM_ACTIVE"), deviceName: this.translate("TEST_INVERTER") + " 1", time: "12:00", state: "active" },
                { message: this.translate("TEST_ALARM_RESOLVED"), deviceName: this.translate("TEST_INVERTER") + " 2", time: "09:00", state: "resolved" }
            ];
            this.energyTotals = { today: 4.2, week: 28.6, month: 124.8, year: 2450.5, total: 12840.7 };
            this.dayGeneration = this.formatEnergy(this.energyTotals.today, true);
            this.totalCapacity = capacity;
            const fields = (side) => (this.goodWeOptions?.config?.[side] || []).map(field => ({
                key: field.API_field, value: "—", unit: ""
            })).filter(field => !["capacity", "InverterPowerOfPlantMonitor"].includes(field.key));
            this.inverters = [{
                name: this.translate("TEST_INVERTER"), out_pac: 1500,
                eday: 4.2, etotal: 1000, invert_full: { status: 1 },
                d: { output_power: "1500 W" },
                dict: {
                    left: [...fields("left"),
                        { key: "capacity", value: capacity / 1000, unit: "kW" },
                        { key: "InverterPowerOfPlantMonitor", value: 1.5, unit: "kW" }],
                    right: fields("right")
                }
            }];
        }
        var wrapper = document.createElement("div");
        wrapper.className += "goodwe-content-wrapper"
        
        if (!this.config.testMode && this.errorCode) {
            const error = document.createElement("div");
            error.className = "goodwe-test-error";
            error.textContent = this.translate(this.errorCode);
            wrapper.appendChild(error);
            if (!this.loaded) {
                if (this.hasAlarmMessages()) wrapper.appendChild(this.makeAlarmOverview());
                return wrapper;
            }
        }
        if (this.config.testMode) {
            const badge = document.createElement("div");
            badge.className = "goodwe-test-badge";
            badge.textContent = this.translate("TEST_MODE");
            wrapper.appendChild(badge);
        }

        // Display loading while waiting for API response
        if (!this.loaded) {
            const loading = document.createElement("div");
            loading.textContent = this.translate("LOADING");
            wrapper.appendChild(loading);
            if (this.hasAlarmMessages()) wrapper.appendChild(this.makeAlarmOverview());
            return wrapper;
      	}

        var imgDiv = document.createElement("div");
        var img = document.createElement("img");
        img.className += "solar-image"

        const hours = new Date().getHours()
        const isDayTime = hours > 6 && hours < 20;  
        
        if (isDayTime) {
            img.src = "/modules/MMM-Goodwe-SemsPortal-V3/solar_white.png";
        } else {
            img.src = "/modules/MMM-Goodwe-SemsPortal-V3/moon.png";
        }

        var sTitle = document.createElement("p");
        sTitle.textContent = this.translate("TODAY") + ": " + this.dayGeneration;
        sTitle.className += " thin normal main-title content-title";
        imgDiv.appendChild(img);
        imgDiv.appendChild(sTitle);

        var divider = document.createElement("hr");
        divider.className += "solar-width dimmed h-ruler";

        if (this.config.showInverterGauges) {
            var gaugeRow = document.createElement("div");
            gaugeRow.className += "gauge-box";
    
            for (let i=0; i < this.inverters.length; i++) {
                // display a gauge for each inverter
                const inverter = this.inverters[i];
    
                // if the inverter is offline, don't display a gauge
                if (inverter.invert_full.status !== 1) continue;
    
                var capacity = inverter.dict.left.filter(elem => elem.key === "capacity")[0].value;
                var currentPower = inverter.dict.left.filter(elem => elem.key === "InverterPowerOfPlantMonitor")[0].value;
                var currentPowerTitleLine = inverter.d.output_power;
    
                if (currentPower < 1) {
                    // convert to Watt if it is a small number in kW
                    currentPower = (currentPower * 1000).toFixed(0);
                    capacity = (capacity * 1000).toFixed(0);
                }
    
                // build the gauge
                var inverterWrap = document.createElement("div");
                inverterWrap.className += "ring ring--small";
    
                var gaugeInverter = document.createElement("div");
                gaugeInverter.className += "ring-value";
                inverterWrap.appendChild(gaugeInverter);
    
                var maskWrap = document.createElement("div");
                maskWrap.innerHTML = currentPowerTitleLine;
    
                gaugeInverter.appendChild(maskWrap);
    
                // calculate the percentage
                const calculation = (Number(currentPower) / Number(capacity)) * 360;
                var degree = Number.isFinite(calculation) ? Math.max(0, Math.min(360, Math.round(calculation))) : 0;
    
                if (degree >= 360) {
                    // 360 is our max. degree and may not be proceeded.
                    degree = 360;
                }
    
                // set the circle radius
                if (this.config.enableCustomGaugeColors) {
                    inverterWrap.style.backgroundImage = `radial-gradient(${this.customGaugeColors.innerCircleColor} 0px, ${this.customGaugeColors.innerCircleColor} 50%, transparent 50%, transparent 100%), 
                    conic-gradient(${this.customGaugeColors.currentValueRingColor} ${degree}deg, ${this.customGaugeColors.outerCircleColor} 0deg)`;
                } else {
                    inverterWrap.style.backgroundImage = `radial-gradient(#3a455e 0px, #3a455e 50%, transparent 50%, transparent 100%), conic-gradient(green ${degree}deg, transparent 0deg)`;
                }
                
                // append the gauge to the flexbox
                gaugeRow.appendChild(this.config.inverterGaugeStyle === "semicircle"
                    ? this.makeSemicircle(Number(inverter.out_pac), Number(inverter.dict.left.find(elem => elem.key === "capacity").value) * 1000, currentPowerTitleLine, true)
                    : inverterWrap);
            }
    
            // append our gauges at the top
            wrapper.appendChild(gaugeRow);
        }
        
        if (this.config.showInterverDetail && this.goodWeOptions) {
            for (let i=0; i < this.inverters.length; i++) {
                // display additional info about our inverters in tables
                const inverter = this.inverters[i];
        
                var title = document.createElement("h2");
                title.innerHTML = inverter.name;
                title.className += " thin normal no-margin content-title";
                wrapper.appendChild(title);
    
                if (inverter.invert_full.status !== 1) {
                    // this inverter is offline, display a message
                    var offlineTitle = document.createElement("h2");
                    offlineTitle.textContent = this.translate("OFFLINE");
                    offlineTitle.className += " thin normal no-margin content-title offline-status";
    
                    wrapper.appendChild(offlineTitle);
    
                    // continue to next inverter
                    continue;
                }
    
                var tb = document.createElement("table");
    
                const resultsArray = [];
                resultsArray[0] = inverter.d.output_power;
                resultsArray[1] = this.formatEnergy(inverter.eday);
                resultsArray[2] = this.formatEnergy(inverter.etotal);
    
                for (let j=0; j < this.goodWeOptions.config.main.length; j++) {
                    if (this.goodWeOptions.config.main[j].enabled === false) continue;
                    var row = document.createElement("tr");
    
                    var titleTr = document.createElement("td");
                    var dataTr = document.createElement("td");

                    titleTr.textContent = [this.translate("CURRENT_POWER"), this.translate("GENERATED_TODAY"), this.translate("GENERATED_TOTAL")][j] || this.fieldTitle(this.goodWeOptions.config.main[j]);
                    dataTr.innerHTML = resultsArray[j];
                    titleTr.className += " medium regular bright title-row table-cell";
                    dataTr.className += " medium regular bright title-row table-cell";
    
                    row.appendChild(titleTr);
                    row.appendChild(dataTr);
    
                    tb.appendChild(row);
                }

                for (let j=0; j < this.goodWeOptions.config.left.length; j++) {
                    // left column
                    var field = this.goodWeOptions.config.left[j];

                    if (field.enabled === false) continue;

                    var fieldRow = document.createElement("tr");
    
                    var fieldtitleTr = document.createElement("td");
                    var fielddataTr = document.createElement("td");

                    var apiFieldLeft = inverter.dict.left.filter(elem => elem.key === field.API_field)[0];

                    fieldtitleTr.textContent = this.fieldTitle(field);
                    fielddataTr.textContent = apiFieldLeft ? apiFieldLeft.value + " " + (apiFieldLeft.unit || "") : "—";
                    fieldtitleTr.className += " medium regular bright title-row table-cell";
                    fielddataTr.className += " medium regular bright title-row table-cell";

                    fieldRow.appendChild(fieldtitleTr);
                    fieldRow.appendChild(fielddataTr);

                    tb.appendChild(fieldRow);
                }

                for (let j=0; j < this.goodWeOptions.config.right.length; j++) {
                    // right column
                    var fieldRight = this.goodWeOptions.config.right[j];

                    if (fieldRight.enabled === false) continue;

                    var fieldRightRow = document.createElement("tr");
    
                    var fieldRighttitleTd = document.createElement("td");
                    var fieldRightdataTd = document.createElement("td");

                    var apiField = inverter.dict.right.filter(elem => elem.key === fieldRight.API_field)[0];

                    fieldRighttitleTd.textContent = this.fieldTitle(fieldRight);
                    fieldRightdataTd.textContent = apiField ? apiField.value + " " + (apiField.unit || "") : "—";
                    fieldRighttitleTd.className += " medium regular bright title-row table-cell";
                    fieldRightdataTd.className += " medium regular bright title-row table-cell";

                    fieldRightRow.appendChild(fieldRighttitleTd);
                    fieldRightRow.appendChild(fieldRightdataTd);

                    tb.appendChild(fieldRightRow);
                }
    
                wrapper.appendChild(tb);
            }
        }
        
        // append the devider and total at the bottom
        wrapper.appendChild(divider);
        wrapper.appendChild(imgDiv);

        if (this.config.showBottomTotalGauge && !this.invertersOffline) {
            // setup bottom gauge
            var totalGauge = document.createElement("div");
            totalGauge.className += "ring ring--total";

            var gaugeDiv = document.createElement("div");
            gaugeDiv.className += "ring-value";
            totalGauge.appendChild(gaugeDiv);

            var maskDiv = document.createElement("div");
            maskDiv.innerHTML = this.currentPowerTitle;

            gaugeDiv.appendChild(maskDiv);

            // calculate percentage
            const math = (Number(this.currentPowerTotal) / Number(this.totalCapacity)) * 360;
            var value = Number.isFinite(math) ? Math.max(0, Math.min(360, Math.round(math))) : 0;

            if (value >= 360) {
                value = 360;
            }

            if (this.config.enableCustomGaugeColors) {
                totalGauge.style.backgroundImage = `radial-gradient(${this.customGaugeColors.innerCircleColor} 0px, ${this.customGaugeColors.innerCircleColor} 50%, transparent 50%, transparent 100%), 
                conic-gradient(${this.customGaugeColors.currentValueRingColor} ${value}deg, ${this.customGaugeColors.outerCircleColor} 0deg)`;
            } else {
                totalGauge.style.backgroundImage = `radial-gradient(#3a455e 0px, #3a455e 50%, transparent 50%, transparent 100%), conic-gradient(green ${value}deg, transparent 0deg)`;
            }

            wrapper.appendChild(this.config.totalGaugeStyle === "semicircle"
                ? this.makeSemicircle(this.currentPowerTotal, this.totalCapacity, this.currentPowerTitle, false)
                : totalGauge);      
        }

        if (this.config.showEnergyTotals) {
            const totals = document.createElement("table");
            totals.className = "goodwe-yield-table";
            totals.style.width = "100%";
            totals.style.marginTop = "12px";
            totals.style.fontSize = "16px";
            totals.style.borderCollapse = "collapse";
            const body = document.createElement("tbody");
            totals.appendChild(body);
            for (const [setting, key, label] of [
                ["showWeekYield", "week", "YIELD_WEEK"],
                ["showMonthYield", "month", "YIELD_MONTH"],
                ["showYearYield", "year", "YIELD_YEAR"],
                ["showLifetimeYield", "total", "GENERATED_TOTAL"]
            ]) {
                if (!this.config[setting]) continue;
                const row = document.createElement("tr");
                row.className = "goodwe-yield-table-row";
                const title = document.createElement("td");
                title.textContent = this.translate(label);
                title.style.textAlign = "left";
                title.style.padding = "4px 16px 4px 0";
                const formatted = this.formatEnergy(this.energyTotals[key]);
                const known = formatted.endsWith(" kWh");
                const value = document.createElement("td");
                value.textContent = known ? formatted.slice(0, -4) : formatted;
                value.style.textAlign = "right";
                value.style.whiteSpace = "nowrap";
                value.style.fontVariantNumeric = "tabular-nums";
                value.style.padding = "4px 0";
                value.style.color = "#fff";
                const unit = document.createElement("td");
                unit.textContent = known ? "kWh" : "";
                unit.style.textAlign = "left";
                unit.style.whiteSpace = "nowrap";
                unit.style.padding = "4px 0 4px 8px";
                unit.style.width = "1%";
                unit.style.color = "#fff";
                row.appendChild(title);
                row.appendChild(value);
                row.appendChild(unit);
                body.appendChild(row);
            }
            wrapper.appendChild(totals);
        }

        if (this.hasAlarmMessages()) wrapper.appendChild(this.makeAlarmOverview());

        // return our document
        return wrapper;
    }
});
