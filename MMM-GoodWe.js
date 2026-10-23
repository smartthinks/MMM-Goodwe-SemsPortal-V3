/* eslint-disable prettier/prettier */
Module.register("MMM-GoodWe", {
    // Default module config.
    defaults: {
        refInterval: 1000 * 60 * 5, //5 minutes
        basicHeader: false,
    },

    start: async function() {
        // Logging appears in Chrome developer tools console
        Log.info("Starting module: " + this.name);
        this.titles = ["Huidig Vermogen", "Vandaag opgewekt", "Totaal opgewekt"];
        this.suffixes = ["kW", "kWh", "kWh", "kW", "kWh", "kWh"];
        this.inverters = [];
        this.currentPowerTitle = "";
        this.currentPowerTotal = 0;
        this.totalCapacity = 5600;
        this.loaded = false;
        this.dayGeneration = 0;
        this.invertersOffline = false;
        this.customGaugeColors = this.config.customGaugeColors;
        this.goodWeOptions = null;

        if (this.config.totalCapacity !== 0) {
            this.totalCapacity = this.config.totalCapacity;
        }

        if (this.config.updateIntervalMinutes >= 1) {
            // if an interval was set through the config, update the interval time
            this.config.refInterval = 1000 * 60 * this.config.updateIntervalMinutes;
        }

        // get our token so that we can request our data
        this.authenticateUser();
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
    },

    //Import additional CSS Styles
    getStyles: function() {
        return ['solar.css']
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
        Log.info("SolarApp: getting data");

        this.sendSocketNotification("GET_SOLAR", {
            config: this.config
        });
    },

    // Handle node helper response
    socketNotificationReceived: function(notification, payload) {
        if (notification === "SOLAR_DATA") {
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

            if (payload.kpi.power < 1) {
                // convert to Watt if it is a small number in kW
                this.dayGeneration = (payload.kpi.power * 1000).toFixed(0).toString() + " W"
            } else {
                this.dayGeneration = payload.kpi.power + " kWh";
            }

            this.loaded = true;
            this.updateDom(1000);
        } else if (notification === "LOGIN_USER") {
            Log.info(`%c[SEMS-API][OK] - Authenticated`, "color: green");
            this.getSolarData();
        } else if (notification === "LOAD_OPTIONS") {
            this.goodWeOptions = payload;
        }
    },

    // Override dom generator
    getDom: function() {
        var wrapper = document.createElement("div");
        wrapper.className += "goodwe-content-wrapper"
        
        if (this.config.username === "" || this.config.password === "") {
            wrapper.innerHTML = "Missing configuration.";
            return wrapper;
        }

        // Display loading while waiting for API response
        if (!this.loaded) {
      	    wrapper.innerHTML = "Loading...";
            return wrapper;
      	}

        var imgDiv = document.createElement("div");
        var img = document.createElement("img");
        img.className += "solar-image"

        const hours = new Date().getHours()
        const isDayTime = hours > 6 && hours < 20;  
        
        if (isDayTime) {
            img.src = "/modules/MMM-GoodWe/solar_white.png";
        } else {
            img.src = "/modules/MMM-GoodWe/moon.png";
        }

        var sTitle = document.createElement("p");
        sTitle.innerHTML = "Vandaag: " + this.dayGeneration;
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
                const calculation = (parseInt(currentPower) / parseInt(capacity)) * 360;
                var degree = Math.round(calculation);
    
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
                gaugeRow.appendChild(inverterWrap);
            }
    
            // append our gauges at the top
            wrapper.appendChild(gaugeRow);
        }
        
        if (this.config.showInterverDetail) {
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
                    offlineTitle.innerHTML = "Offline";
                    offlineTitle.className += " thin normal no-margin content-title offline-status";
    
                    wrapper.appendChild(offlineTitle);
    
                    // continue to next inverter
                    continue;
                }
    
                var tb = document.createElement("table");
    
                const resultsArray = [];
                resultsArray[0] = inverter.d.output_power;
                resultsArray[1] = inverter.eday + " kWh";
                resultsArray[2] = inverter.etotal + " kWh";
    
                for (let j=0; j < this.goodWeOptions.config.main.length; j++) {
                    if (this.goodWeOptions.config.main[j].enabled === false) continue;
                    var row = document.createElement("tr");
    
                    var titleTr = document.createElement("td");
                    var dataTr = document.createElement("td");

                    titleTr.innerHTML = this.goodWeOptions.config.main[j].NL_title;
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

                    fieldtitleTr.innerHTML = field.NL_title;
                    fielddataTr.innerHTML = apiFieldLeft.value + " " + apiFieldLeft.unit;
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

                    fieldRighttitleTd.innerHTML = fieldRight.NL_title;
                    fieldRightdataTd.innerHTML = apiField.value + " " + apiField.unit;
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
            const math = (parseInt(this.currentPowerTotal) / parseInt(this.totalCapacity)) * 360;
            var value = Math.round(math);

            if (value >= 360) {
                value = 360;
            }

            if (this.config.enableCustomGaugeColors) {
                totalGauge.style.backgroundImage = `radial-gradient(${this.customGaugeColors.innerCircleColor} 0px, ${this.customGaugeColors.innerCircleColor} 50%, transparent 50%, transparent 100%), 
                conic-gradient(${this.customGaugeColors.currentValueRingColor} ${value}deg, ${this.customGaugeColors.outerCircleColor} 0deg)`;
            } else {
                totalGauge.style.backgroundImage = `radial-gradient(#3a455e 0px, #3a455e 50%, transparent 50%, transparent 100%), conic-gradient(green ${value}deg, transparent 0deg)`;
            }

            wrapper.appendChild(totalGauge);      
        }

        // return our document
        return wrapper;
    }
});
