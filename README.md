# MMM-Goodwe-SemsPortal
A simple solar module for MagicMirror2 designed to integrate with a Goodwe-SemsPortal system



## Installation

In your terminal, go to your MagicMirror's Module folder:
````
cd ~/MagicMirror/modules
````

Clone this repository:
````
git clone https://github.com/smartthinks/MMM-Goodwe-SemsPortal.git




## Configure integration

The required ID of your Power Station can be retrieved by logging in to the SEMS Portal with your credentials:
https://www.semsportal.com

After login you'll see the ID in your URL, e.g.:
https://semsportal.com/PowerStation/PowerStatusSnMin/12345678-1234-1234-1234-123456789012

In this example the ID of the Power Station is: 12345678-1234-1234-1234-123456789012

In the home assistant GUI, go to `Configuration` > `Integrations` and click the `Add Integration` button. Search for `GoodWe SEMS API`.

Fill in the required configuration and it should find your inverters.

Note that changed to `configuration.yaml` are no longer necessary and can be removed.

### Recommended: use visitor account to login with this integration

Create via the official app, or via the web portal:
Login to www.semsportal.com, go to https://semsportal.com/powerstation/stationInfonew. Create a new visitor account. 
Login to the visitor account once to accept the EULA. Now you should be able to use it in this component.
