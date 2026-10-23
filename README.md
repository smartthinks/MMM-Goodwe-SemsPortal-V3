# MMM-GoodWe
A Solar Module for MagicMirror2 designed to integrate with a GoodWe System

## Dependencies
  * A [MagicMirror<sup>2</sup>](https://github.com/MichMich/MagicMirror) installation

## Installation
  1. Clone repo into MagicMirror/modules directory
  2. Create an entry in 'config/config.js' with your username, password and powerstationId and other options.

 **Example:**
```
{
  module: 'MMM-GoodWe',
  position: 'bottom_right',
  config: {
    username: "test@gmail.com", // Your GoodWe account email
    password: "test", // Your GoodWe Password
    powerstationId: "test-id", // The ID of your powerstation
    totalCapacity: 5600, // The total capacity all your inverters can handle
    updateIntervalMinutes: 0, // How often the data should be refreshed, defaults to every 5 minutes unless set to a value higher than or equal to 1.
    showInverterGauges: true, // Show the gauges at the top
    showBottomTotalGauge: true, // Show the large gauge at the bottom
    showInterverDetail: true, // Show the details of the inverters
    enableCustomGaugeColors: false, // give the gauges your own color, use hex codes or keywords see (https://www.w3.org/wiki/CSS/Properties/color/keywords)
    customGaugeColors: {
      innerCircleColor: "#3a455e", // color of the inner circle of the gauge
      outerCircleColor: "transparent", // color of the outer circle of the gauge, by default transparent
      currentValueRingColor: "red" // color of the ring indicating the value/percentage
    }
  }
},
```
**Note:** Only enter your credentials in the `config.js` file. Your credentials are yours alone, _do not_ post or use it elsewhere.

3. In the MagicMirror directory, run:
```
npm install node-fetch
```

4. Start your Magic Mirror and the module should appear.

## Additional Options
In the `goodwe-options.json` file, you can enable extra fields in the info section. To enable or disable a field, change the value `enabled` to `true` or `false` and save the file. Restart your MagicMirror after applying your changes and they should appear. You don't need to change anything else in this file.

```
{
  "config": {
      "left": [
          {
              "name": "Device Name",
              "NL_title": "Device Naam:",
              "EN_title": "Device Name:",
              "API_field": "dmDeviceType",
              "enabled": true
          },
          {
              "name": "Serial Number",
              "NL_title": "Serienummer:",
              "EN_title": "Serial Number:",
              "API_field": "serialNum",
              "enabled": true
          },
          {
              "name": "Checkcode",
              "NL_title": "Checkcode:",
              "EN_title": "Checkcode:",
              "API_field": "laCheckcode",
              "enabled": false
          }, 
          ....
      ],
      "right": [
        {
              "name": "Indoor temperature",
              "NL_title": "Binnentemperatuur:",
              "EN_title": "Indoor temperature:",
              "API_field": "innerTemp",
              "enabled": false
        },
        ...
      ]
    }
}
```