const app = (() => {
  'use strict'

  //////////////////////////////////////////////////////////////////////// State Variables
  const REST_ENDPOINT = 'https://geoglows.ecmwf.int/api/v2'
  const ESRI_LAYER_URL = 'https://livefeeds3.arcgis.com/arcgis/rest/services/GEOGLOWS/GlobalWaterModel_Medium/MapServer'
  const LOADING_GIF = 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif'

  //////////////////////////////////////////////////////////////////////// Element Selectors
  const checkboxLoadForecast = document.getElementById('auto-load-forecasts')
  const checkboxLoadRetro = document.getElementById('auto-load-retrospective')
  const checkboxUseLocalTime = document.getElementById('use-local-time')
  const inputForecastDate = document.getElementById('forecast-date-calendar')

  const modalCharts = document.getElementById("charts-modal")
  const chartForecast = document.getElementById("forecastPlot")
  const chartRetro = document.getElementById("retroPlot")

  const playButton = document.getElementById('animationPlay')
  const stopButton = document.getElementById('animationStop')
  const plus1Button = document.getElementById('animationPlus1')
  const back1Button = document.getElementById('animationBack1')
  const slider = document.getElementById('time-slider')
  const currentDate = document.getElementById("current-map-date")

  //////////////////////////////////////////////////////////////////////// Materialize Initialization
  M.AutoInit()

  //////////////////////////////////////////////////////////////////////// Set Date Conditions for Data and Maps
  let now = new Date()
  now.setHours(now.getHours() - 12)
  inputForecastDate.max = now.toISOString().split("T")[0]
  inputForecastDate.value = now.toISOString().split("T")[0]
  now.setHours(now.getHours() - 59 * 24)
  inputForecastDate.min = now.toISOString().split("T")[0]

  //////////////////////////////////////////////////////////////////////// Manipulate Default Controls and DOM Elements
  let loadingStatus = {reachid: "clear", forecast: "clear", retro: "clear"}
  let REACHID
  const MIN_QUERY_ZOOM = 12
  let mapMarker = null

  //////////////////////////////////////////////////////////////////////// Leaflet Map
  const m = L.map("map", {
    zoom: 3,
    minZoom: 2,
    maxZoom: 15,
    boxZoom: true,
    maxBounds: L.latLngBounds(L.latLng(-100, -225), L.latLng(100, 225)),
    center: [20, 0]
  })
  let selectedSegment = L.geoJSON(false, {weight: 5, color: "#00008b"}).addTo(m)
  const basemapsJson = {
    "ESRI Topographic": L.esri.basemapLayer("Topographic").addTo(m),
    "ESRI Grey": L.layerGroup([L.esri.basemapLayer("Gray"), L.esri.basemapLayer("GrayLabels")]),
    "ESRI Terrain": L.layerGroup([L.esri.basemapLayer("Terrain"), L.esri.basemapLayer("TerrainLabels")]),
  }
  m.createPane("watershedlayers")
  m.getPane("watershedlayers").style.zIndex = 250

  //////////////////////////////////////////////////////////////////////// Add legend and lat/lon box
  let latlon = L.control({position: "bottomleft"})
  latlon.onAdd = () => {
    let div = L.DomUtil.create("div")
    div.innerHTML = '<div id="mouse-position" class="map-overlay-element"></div>'
    return div
  }
  latlon.addTo(m)
  m.on("mousemove", event => document.getElementById("mouse-position").innerHTML = `Lat: ${event.latlng.lat.toFixed(3)}, Lon: ${event.latlng.lng.toFixed(3)}`)
  let legend = L.control({position: "bottomright"})
  legend.onAdd = () => {
    let div = L.DomUtil.create("div", "legend")
    const legendEntries = [
      ["purple", "20+ year Flow"],
      ["red", "10+ year Flow"],
      ["gold", "2+ yearFlow"],
      ["blue", "Streams"]
    ]
    const polyLineSVG = (color, label) => `<div><svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><polyline points="19 1, 1 6, 19 14, 1 19" stroke="${color}" fill="transparent" stroke-width="2"/></svg>${label}</div>`
    div.innerHTML = '<div class="legend">' + legendEntries.map(entry => polyLineSVG(...entry)).join("") + "</div>"
    return div
  }
  legend.addTo(m)

  ////////////////////////////////////////////////////////////////////////  Animation Controls
  const getDateAsString = date => {
    if (checkboxUseLocalTime.checked) return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0") + " " + String(date.getHours()).padStart(2, "0") + ":00:00" + " Local Time"
    return currentDate.innerHTML = layerAnimationTime.toISOString().replaceAll("T", " ").replace("Z", "").replace(".000", "") + " UTC"
  }
  let layerAnimationTime = new Date()
  layerAnimationTime = new Date(layerAnimationTime.toISOString())
  layerAnimationTime.setUTCHours(0)
  layerAnimationTime.setUTCMinutes(0)
  layerAnimationTime.setUTCSeconds(0)
  layerAnimationTime.setUTCMilliseconds(0)
  const animationDays = 10  // 15 days
  const stepsPerDay = 8  // 3 hour steps
  const numAnimateSteps = animationDays * stepsPerDay
  const startDateTime = new Date(layerAnimationTime)
  const endDateTime = new Date(layerAnimationTime.setUTCHours(animationDays * 24))
  let animate = false
  let animateSpeed = 750
  layerAnimationTime = new Date(startDateTime)
  currentDate.innerHTML = getDateAsString(layerAnimationTime)
  const refreshLayerAnimation = () => {
    layerAnimationTime = new Date(startDateTime)
    layerAnimationTime.setUTCHours(slider.value * 3)
    currentDate.innerHTML = getDateAsString(layerAnimationTime)
    esriStreamLayer.setTimeRange(layerAnimationTime, endDateTime)
  }
  const playAnimation = (once = false) => {
    if (!animate) return
    animate = !once  // toggle animation if play once (once =true, animate = false)
    layerAnimationTime < endDateTime ? slider.value = Number(slider.value) + 1 : slider.value = 0
    refreshLayerAnimation()
    setTimeout(playAnimation, animateSpeed)
  }
  playButton.addEventListener("click", () => {
    animate = true
    playAnimation()
  })
  stopButton.addEventListener("click", () => animate = false)
  plus1Button.addEventListener("click", () => {
    animate = true
    playAnimation(true)
  })
  back1Button.addEventListener("click", () => {
    layerAnimationTime > startDateTime ? slider.value = Number(slider.value) - 1 : slider.value = numAnimateSteps
    refreshLayerAnimation()
  })
  slider.addEventListener("change", _ => refreshLayerAnimation())

  ////////////////////////////////////////////////////////////////////////  ADD WMS LAYERS FOR DRAINAGE LINES, ETC - SEE HOME.HTML TEMPLATE
  const esriStreamLayer = L
    .esri
    .dynamicMapLayer({
      url: ESRI_LAYER_URL,
      useCors: false,
      layers: [0],
      from: startDateTime,
      to: endDateTime,
    })
    .addTo(m)
  let layerLoaded = false
  esriStreamLayer.on("load", () => layerLoaded = true)
  esriStreamLayer.on("loading", () => layerLoaded = false)

  L
    .control
    .layers(
      basemapsJson,
      {
        "Stream Network": esriStreamLayer,
      },
      {collapsed: true}
    )
    .addTo(m)

  m
    .on("click", event => {
      if (m.getZoom() < MIN_QUERY_ZOOM) {
        m.flyTo(event.latlng, MIN_QUERY_ZOOM, {duration: 1.5})
        m.fire('zoomend')
        return
      }
      m.flyTo(event.latlng, m.getZoom(), {duration: 0.25})
      if (mapMarker) m.removeLayer(mapMarker)
      mapMarker = L.marker(event.latlng).addTo(m)

      updateStatusIcons({reachid: "load", forecast: "clear", retro: "clear"})

      const queryLayerForID = () => {
        L
          .esri
          .identifyFeatures({url: ESRI_LAYER_URL})
          .on(m)
          .at(event.latlng)
          .tolerance(25) // map pixels to buffer search point
          .precision(5) // decimals in the returned coordinate pairs
          .run((error, featureCollection) => {
            if (error) {
              updateStatusIcons({reachid: "fail"})
              M.toast({html: "Error querying river number. Please try again.", classes: "red", displayDuration: 5000})
              console.error(error)
              return
            }
            REACHID = featureCollection?.features[0]?.properties["TDX Hydro Link Number"]
            if (REACHID === "Null" || !REACHID || !featureCollection.features[0].geometry) {
              updateStatusIcons({reachid: "fail"})
              M.toast({html: "River not found. Try to zoom in and be precise when clicking the stream.", classes: "red", displayDuration: 5000})
              console.error(error)
              return
            }
            selectedSegment.clearLayers()
            selectedSegment.addData(featureCollection.features[0].geometry)
            fetchData(REACHID)
          })
      }
      // check if the layer esriStreamLayer is loaded
      if (layerLoaded) {
        M.toast({html: "Identifying river segment. Charts will load soon.", classes: "orange"})
        queryLayerForID()  // if it is, run the identifyFeatures function
      } else {
        M.toast({html: "The map is still loading streams. Charts will load soon.", classes: "orange"})
        esriStreamLayer.once("load", () => queryLayerForID())  // if not trigger it with a "once" (runs one time, not wait until) event listener
      }
    })

  //////////////////////////////////////////////////////////////////////// OTHER UTILITIES ON THE LEFT COLUMN
  const fetchData = reachid => {
    REACHID = reachid ? reachid : REACHID
    if (!REACHID) return updateStatusIcons({reachid: "fail"})
    M.Modal.getInstance(modalCharts).open()
    updateStatusIcons({reachid: "ready", forecast: "clear", retro: "clear"})
    clearChartDivs()
    checkboxLoadForecast.checked ? getForecastData() : giveForecastRetryButton(REACHID)
    checkboxLoadRetro.checked ? getRetrospectiveData() : giveRetrospectiveRetryButton(REACHID)
  }

  const setReachID = () => {
    REACHID = prompt("Please enter a 9 digit River ID to search for.")
    if (!REACHID) return
    if (!/^\d{9}$/.test(REACHID)) return alert("River ID numbers should be 9 digit numbers") // check that it is a 9 digit number
    fetchData(parseInt(REACHID))
  }

  //////////////////////////////////////////////////////////////////////// UPDATE DOWNLOAD LINKS FUNCTION
  const updateDownloadLinks = type => {
    if (type === "clear") {
      document.getElementById("download-forecast-btn").href = ""
      document.getElementById("download-historical-btn").href = ""
    } else if (type === "set") {
      document.getElementById("download-forecast-btn").href = `${REST_ENDPOINT}forecast/${REACHID}`
      document.getElementById("download-historical-btn").href = `${REST_ENDPOINT}retrospective/${REACHID}`
    }
  }

  ////////////////////////////////////////////////////////////////////////  GET DATA FROM API AND MANAGING PLOTS
  const getForecastData = reachID => {
    REACHID = reachID ? reachID : REACHID
    if (!REACHID) return
    chartForecast.innerHTML = `<img alt="loading signal" src=${LOADING_GIF}>`
    updateStatusIcons({forecast: "load"})
    fetch(
      `${REST_ENDPOINT}/forecast/${REACHID}/?format=json&date=${inputForecastDate.value.replaceAll("-", "")}`
    )
      .then(response => response.json())
      .then(response => {
        chartForecast.innerHTML = ``
        Plotly.newPlot(
          chartForecast,
          [
            {
              x: response.datetime.concat(response.datetime.slice().toReversed()),
              y: response.flow_uncertainty_lower.concat(response.flow_uncertainty_upper.slice().toReversed()),
              name: 'Uncertainty Interval',
              fill: 'toself',
              fillcolor: 'rgba(44,182,255,0.6)',
              line: {color: 'rgba(0,0,0,0)'}
            },
            {
              x: response.datetime,
              y: response.flow_uncertainty_lower,
              name: 'Uncertainty Lower',
              line: {color: 'rgb(0,166,255)'},
              showlegend: false,
            },
            {
              x: response.datetime,
              y: response.flow_uncertainty_upper,
              name: 'Uncertainty Upper',
              line: {color: 'rgb(0,166,255)'},
              showlegend: false,
            },
            {
              x: response.datetime,
              y: response.flow_median,
              name: 'Predicted Flow',
              line: {color: 'black'}
            },
          ],
          {
            title: `River Forecast for ${REACHID}`,
            xaxis: {title: "Date (UTC +00:00)"},
            yaxis: {title: "Discharge (m³/s)"},
          }
        )
        updateDownloadLinks("set")
        updateStatusIcons({forecast: "ready"})
      })
      .catch(response => {
        updateStatusIcons({forecast: "fail"})
        giveForecastRetryButton(REACHID)
      })
  }

  const getRetrospectiveData = () => {
    if (!REACHID) return
    updateStatusIcons({retro: "load"})
    updateDownloadLinks("clear")
    chartRetro.innerHTML = `<img alt="loading signal" src=${LOADING_GIF}>`
    fetch(
      `${REST_ENDPOINT}/retrospective/${REACHID}/?format=json`
    )
      .then(response => response.json())
      .then(response => {
        chartRetro.innerHTML = ``
        Plotly.newPlot(
          chartRetro,
          [
            {
              x: response.datetime,
              y: response[REACHID],
            }
          ]
        )
        updateDownloadLinks("set")
        updateStatusIcons({retro: "ready"})
      })
      .catch(() => {
        updateStatusIcons({retro: "fail"})
        giveRetrospectiveRetryButton(REACHID)
      })
  }

  //////////////////////////////////////////////////////////////////////// UPDATE STATUS ICONS FUNCTION
  const updateStatusIcons = status => {
    for (let key in status) {
      loadingStatus[key] = status[key]
    }
    let statusDivs = [
      ['reachid', 'River ID'],
      ['forecast', 'Forecast'],
      ['retro', 'Retrospective']
    ].map(key => {
      let message
      switch (loadingStatus[key[0]]) {
        case "load":
          message = key[0] === "reachid" ? "Identifying" : "Loading"
          break
        case "ready":
          message = key[0] === "reachid" ? REACHID : "Ready"
          break
        case "fail":
          message = "Failed"
          break
        case "clear":
          message = "none"
      }
      return `<span class="status-${loadingStatus[key[0]]}">${key[1]}: ${message}</span>`
    }).join(' - ')

    document.getElementById("request-status").innerHTML = statusDivs
  }

  const clearChartDivs = (chartTypes) => {
    if (chartTypes === "forecast" || chartTypes === null) {
      chartForecast.innerHTML = ""
    }
    if (chartTypes === "retrospective" || chartTypes === null) {
      chartRetro.innerHTML = ""
    }
  }

  //////////////////////////////////////////////////////////////////////// Event Listeners
  inputForecastDate.addEventListener("change", () => getForecastData())
  checkboxUseLocalTime.addEventListener("change", () => currentDate.innerHTML = getDateAsString(layerAnimationTime))

  const giveForecastRetryButton = reachid => {
    clearChartDivs({chartTypes: "forecast"})
    chartForecast.innerHTML = `<button class="btn btn-warning" onclick="app.getForecastData(${reachid})">Retry Retrieve Forecast</button>`
  }
  const giveRetrospectiveRetryButton = reachid => {
    clearChartDivs({chartTypes: "historical"})
    chartRetro.innerHTML = `<button class="btn btn-warning" onclick="app.getRetrospectiveData(${reachid})">Retrieve Retrospective Data</button>`
  }

  const clearMarkers = () => {
    if (mapMarker) m.removeLayer(mapMarker)
  }
  return {
    clearMarkers,
    getForecastData,
    getRetrospectiveData,
    setReachID,
  }
})()