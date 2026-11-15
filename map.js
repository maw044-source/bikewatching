import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

mapboxgl.accessToken = 'pk.eyJ1IjoibWF5MTIxNHd5cSIsImEiOiJjbXdnMnBqMzEwMjY5MnlvbnZubjhjeHo3In0.nQtQD6-zLpqTeZmL-i1T2g';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

map.on('load', async () => {
  const routes = {
    boston: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
    cambridge: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
  };

  for (const [city, url] of Object.entries(routes)) {
    map.addSource(`${city}-routes`, {
      type: 'geojson',
      data: url,
    });

    map.addLayer({
      id: `${city}-bike-lanes`,
      type: 'line',
      source: `${city}-routes`,
      paint: {
        'line-color': '#16803c',
        'line-width': 3,
        'line-opacity': 0.6,
      },
    });
  }
  const stationData = await d3.json(
    'https://dsc106.com/labs/lab07/data/bluebikes-stations.json',
  );

  const trips = await d3.csv(
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
    (trip) => ({
      ...trip,
      startMinute: minutesSinceMidnight(trip.started_at),
      endMinute: minutesSinceMidnight(trip.ended_at),
    }),
  );

  function computeStationTraffic(matchingTrips) {
    const departures = d3.rollup(matchingTrips, (rows) => rows.length, (trip) => trip.start_station_id);
    const arrivals = d3.rollup(matchingTrips, (rows) => rows.length, (trip) => trip.end_station_id);

    return stationData.data.stations.map((station) => {
      const departureCount = departures.get(station.short_name) ?? 0;
      const arrivalCount = arrivals.get(station.short_name) ?? 0;

      return {
        ...station,
        departures: departureCount,
        arrivals: arrivalCount,
        totalTraffic: departureCount + arrivalCount,
      };
    });
  }

  const allDayStations = computeStationTraffic(trips);
  const radiusScale = d3.scaleSqrt()
    .domain([0, d3.max(allDayStations, (station) => station.totalTraffic)]);
  const flowColor = d3.scaleQuantize()
  .domain([0, 1])
  .range(['#d97706', '#7563a8', '#2878b5']);
  const circles = d3.select('#stations')
    .selectAll('circle')
    .data(allDayStations, (station) => station.short_name)
    .join('circle');

  const stationPopup = new mapboxgl.Popup({
    className: 'station-popup',
    closeButton: false,
    closeOnClick: false,
    offset: 12,
  });

  circles
    .on('pointerenter', (event, station) => {
      stationPopup
        .setLngLat([station.lon, station.lat])
        .setText(station.name + '\n' + station.departures + ' departures · ' + station.arrivals + ' arrivals')
        .addTo(map);
    })
    .on('pointerleave', () => stationPopup.remove());

  function updateStationTraffic() {
    const time = Number(timeSlider.value);
    const stations = time === -1 ? allDayStations : computeStationTraffic(
      trips.filter((trip) =>
        Math.abs(trip.startMinute - time) <= 60 ||
        Math.abs(trip.endMinute - time) <= 60,
      ),
    );

    radiusScale.range(time === -1 ? [0, 25] : [0, 50]);

    circles
      .data(stations, (station) => station.short_name)
      .attr('r', (station) => radiusScale(station.totalTraffic))
      .style('fill', (station) =>
        flowColor(station.totalTraffic ? station.departures / station.totalTraffic : 0.5),
      );

    stationPopup.remove();
  }

  function updatePositions() {
    circles.each(function (station) {
      const { x, y } = map.project([station.lon, station.lat]);
      d3.select(this).attr('cx', x).attr('cy', y);
    });
  }

  updatePositions();
  map.on('move', updatePositions);
  map.on('resize', updatePositions);

  timeSlider.addEventListener('input', updateStationTraffic);
  updateStationTraffic();
});

function minutesSinceMidnight(timestamp) {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
}

const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');

function updateTimeDisplay() {
  const minutes = Number(timeSlider.value);

  selectedTime.textContent = minutes === -1
    ? 'Any time'
    : new Date(2000, 0, 1, 0, minutes).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
}

timeSlider.addEventListener('input', updateTimeDisplay);
updateTimeDisplay();
