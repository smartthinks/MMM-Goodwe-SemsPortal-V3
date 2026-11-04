# MMM-Goodwe-SemsPortal-V3

Versie 0.2.4: update van de bestaande module met SEMS+, vertalingen, energietellers en een apart inlogbestand. De modulenaam blijft `MMM-Goodwe-SemsPortal-V3`.
Node.js 22 of nieuwer is vereist. Geen extra npm-pakketten nodig.
Maak vóór het bijwerken een reservekopie van je modulemap en `config/config.js`.

## Installeren of bijwerken

Nieuwe installatie:

```bash
cd ~/MagicMirror/modules
git clone https://github.com/smartthinks/MMM-Goodwe-SemsPortal-V3.git
```

Bestaande installatie (na je reservekopie):

```bash
cd ~/MagicMirror/modules/MMM-Goodwe-SemsPortal-V3
git pull --ff-only
```

Gebruik één configuratieblok met `module: "MMM-Goodwe-SemsPortal-V3"`.
De aparte login wordt hieronder uitgelegd; verwijder daarna de accountvelden uit `config/config.js`.

## Eerst testen zonder inloggegevens

Bij installatie via een ZIP hernoem je de uitgepakte map naar `MMM-Goodwe-SemsPortal-V3` en plaats je die in `~/MagicMirror/modules/`. De structuur moet zijn:
`modules/MMM-Goodwe-SemsPortal-V3/MMM-Goodwe-SemsPortal-V3.js`.

Maak een reservekopie van `config/config.js`. Vervang het bestaande GoodWe-configuratieblok door het onderstaande voorbeeld (voeg geen tweede exemplaar toe):

```js
{
    module: "MMM-Goodwe-SemsPortal-V3",
    disabled: false,
    position: "bottom_right",
    config: {
        testMode: true,
        totalCapacity: 7500,
        updateIntervalMinutes: 3,
        showInverterGauges: true,
        inverterGaugeStyle: "circle",
        showBottomTotalGauge: true,
        totalGaugeStyle: "semicircle",
        showInterverDetail: false,
        enableCustomGaugeColors: false,
        showAlarms: true,
        alarmLimit: 3,
        showEnergyTotals: true,
        showWeekYield: true,
        showMonthYield: true,
        showYearYield: true,
        showLifetimeYield: true
    }
},
```

Herstart MagicMirror. De teststand toont een duidelijk testlabel en fictieve gegevens:
1.500 W, 4,2 kWh vandaag, 28,6 kWh deze week, 124,8 kWh deze maand,
2.450,5 kWh dit jaar en 12.840,7 kWh totaal. Getalnotatie volgt de taal.
De teststand doet geen login- of productie-aanvragen.

`showEnergyTotals: false` verbergt het nieuwe overzicht. De vier andere opbrengstinstellingen
regelen de afzonderlijke regels. De bestaande dagopbrengst blijft staan.
`showInterverDetail` behoudt de bestaande spelling voor compatibiliteit.

## Echte gegevens: apart inlogbestand

Voer op de Pi uit als dezelfde gebruiker die MagicMirror start:

```bash
mkdir -p ~/.config/magicmirror
chmod 700 ~/.config/magicmirror
(umask 077; touch ~/.config/magicmirror/goodwe.json)
chmod 600 ~/.config/magicmirror/goodwe.json
nano ~/.config/magicmirror/goodwe.json
```

Zet hierin je eigen gegevens:

```json
{
    "username": "JOUW_GOODWE_EMAIL",
    "password": "JOUW_GOODWE_WACHTWOORD",
    "powerstationId": "JOUW_POWERSTATION_ID"
}
```

Dit bestand hoort buiten de modulemap en buiten GitHub. De locatie gebruikt de thuismap van
de gebruiker die MagicMirror start. Bij een dienst onder een andere gebruiker geldt diens thuismap.
Het bestand is beschermd met bestandsrechten, niet versleuteld.

De module leest `username`, `password` en `powerstationId` uit dit aparte bestand.
Verwijder die drie velden uit het configuratieblok van de module.
Zet `testMode: false` en herstart MagicMirror.
Vergelijk de dag-, week-, maand-, jaar- en totaalcijfers met de SEMS-app.
Er is geen UUID uit de browser nodig.

Optioneel: `GOODWE_USERNAME`, `GOODWE_PASSWORD` en `GOODWE_POWERSTATION_ID` als server-omgevingsvariabelen kunnen het bestand vervangen.
Gebruikersnaam en wachtwoord moeten dan beide aanwezig zijn. Gebruik ook `GOODWE_POWERSTATION_ID` voor het station.
Bij bestandslogin kan `GOODWE_POWERSTATION_ID` alleen het station uit het bestand overschrijven. Een ander bestandspad kan via de server-omgevingsvariabele
`GOODWE_CREDENTIALS_FILE`. Deze variabelen moeten beschikbaar zijn voor het MagicMirror-proces.
Inloggegevens worden niet naar de schermweergave verstuurd.

## Tellers en vertalingen

De module volgt de algemene MagicMirror-instelling `language`: nl, en, de en fr.
Andere talen vallen terug op Engels. De energietellers komen rechtstreeks uit SEMS+:
`proPvStatsToday`, `proPvStatsWeek`, `proPvStatsMonth`, `proPvStatsYear`, `proPvStatsTotal`.
Dit zijn GoodWe-periodetellers; de module berekent geen terugkijkende 7/30/365 dagen.
GoodWe bepaalt de periodegrenzen. Alle opbrengsten zijn energie in kWh, geen bedragen in euro's.
Als een omvormer een teller mist, wordt het betreffende totaal `—`, geen gedeeltelijke som.

`goodwe-options.json` regelt detailvelden en hun API-koppeling; labels komen uit `translations`.
Neem eigen `enabled`-aanpassingen desgewenst over uit je bestaande optiesbestand.
Niet alle optionele detailmetingen zijn gevuld; ontbrekende waarden worden `—`.
Laat de volgorde van de drie `main`-velden intact: vermogen, dagopbrengst, totaalopbrengst.

## Controles en beperkingen

Gecontroleerd met gesimuleerde antwoorden: alle meterstijlen, vier talen en Engelse terugval,
login via bestand/omgeving, ongeldige inlogbestanden, twee omvormers, ontbrekende tellers,
kommagetallen en foutmeldingen. Er zijn geen echte accountgegevens gebruikt.
Nog niet op een Raspberry Pi of met een live GoodWe-installatie getest.

## Terug naar de vorige versie

Stop MagicMirror, herstel de reservekopie van de modulemap en `config/config.js`, en herstart MagicMirror.
De vorige versie gebruikt haar oorspronkelijke manier van inloggen.

## Herkomst

Gebaseerd op https://github.com/smartthinks/MMM-Goodwe-SemsPortal-V3; de oorspronkelijke MIT-licentie is meegeleverd.
De extra tellers gebruiken de SEMS+-veldnamen die ook voorkomen in
https://github.com/marcovanwoudenberg/MMM-GoodWe. De dashboard- en inlogcode van dat project is niet overgenomen.

## Alarmmeldingen

`showAlarms: true` blijft alarmen controleren, maar toont het overzicht alleen als er meldingen zijn.
Bij een lege lijst verdwijnen ook de kop en de tussenruimte automatisch. Ontvangen meldingen laten het overzicht weer verschijnen. `alarmLimit: 3` toont maximaal drie van de ontvangen meldingen
(instelbaar van 1 tot 15). Vernieuwing gebeurt na de login en daarna elke vijf minuten, onafhankelijk van de productieverversing.
Met `showAlarms: false` worden geen alarm-aanvragen gedaan.

De teststand bevat één fictieve actieve en één fictieve herstelde melding. Standaard is alleen de actieve melding zichtbaar; `showResolvedAlarms: true` toont beide.
De live-aanvraag gebruikt de SEMS+-alarmroute `/sems-alarm/api/v2/alarm/page`, pagina 1, maximaal 15 resultaten,
90 dagen terug en de API-selectie `status: 1`, `timeType: 1`, zoals de vergelijkingsmodule.
De precieze betekenis van die selecties en de volledigheid moeten met jouw SEMS-account worden bevestigd.
Dit is geen onbeperkt historisch archief of garantie dat alle storingen ontbreken.

De interface onderscheidt actief, hersteld en onbekende status op basis van het herstelveld dat GoodWe terugstuurt.
Bij ontbrekende statusgegevens staat er 'Status onbekend'. Een mislukte controle wordt in het overzicht als fout getoond als er eerdere meldingen zichtbaar zijn;
eerder ontvangen meldingen kunnen dan nog zichtbaar zijn en worden als mogelijk verouderd aangeduid.
Een lege succesvolle selectie betekent uitsluitend dat voor die aanvraag geen meldingen zijn ontvangen.

Koppen en statuswoorden volgen de MagicMirror-taal. De aanvraag gebruikt die taal ook waar ondersteund.
De eigenlijke storingstekst komt van GoodWe; een ontbrekende lokale tekst valt terug op de geleverde Engelse of algemene tekst.
De alarmroute kan voor sommige accounts aanvullende GoodWe-vereisten hebben: dit moet live op de Pi worden getest.

Versie 0.2.2: alarmoverzicht automatisch verborgen zonder ontvangen meldingen.
De vijfminutencontrole blijft doorlopen. De teststand bevat twee voorbeeldmeldingen; vanaf 0.2.4 is de herstelde melding standaard verborgen.
Vanaf 0.2.4 worden herstelde meldingen standaard weggefilterd. Meldingen met onbekende status blijven zichtbaar, met die status expliciet vermeld.

Versie 0.2.3: ook `powerstationId` staat in het aparte inlogbestand.
Een oude `powerstationId` in de schermconfiguratie blijft als terugval werken; het aparte bestand heeft voorrang.
In de teststand zijn de drie accountvelden niet nodig.

Versie 0.2.4: omvormernaam en/of serienummer bij alarmmeldingen, wanneer ontvangen van GoodWe.
Als geen apparaat kan worden gekoppeld, verschijnt 'Omvormer onbekend'.
Herstelde meldingen zijn standaard verborgen; als alleen herstelde meldingen overblijven verdwijnt het hele blok.
Optioneel `showResolvedAlarms: true` toont ook historische herstelde meldingen.
De teststand toont standaard één actieve voorbeeldmelding voor TEST omvormer 1.
Een herstel wordt zichtbaar bij de volgende succesvolle alarmcontrole (normaal elke vijf minuten).
