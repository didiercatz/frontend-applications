// Utils
import {
  getData,
  checkIfDataExistsInLocalStorage,
  storeDataToLocalStorage,
  getLocationFromDescription,
  groupBy,
  average,
} from './utils'

// Constants
import {
  TARIEFDEEL,
  SPECIFICATIES_PARKEERGEBIED,
  GEO_PARKEERGARAGES,
} from './constants'

export default async function cleanData() {
  // Check if localstorage contains data.
  // TODO: Fix this for Safari.
  const hasData = checkIfDataExistsInLocalStorage()

  // A. Get data from localStorage, and return early
  if (hasData && process.env.NODE_ENV !== 'development') {
    return JSON.parse(window.localStorage.getItem('data'))
  }

  // B. Fetch data from API
  // Destructure data after all three promises have been resolved
  const [tariefData, geoData, specsData] = await getData([
    TARIEFDEEL,
    GEO_PARKEERGARAGES,
    SPECIFICATIES_PARKEERGEBIED,
  ])
  const mergedData = geoData
    .map((location) => {
      // Merge specs and geo based on AreaId
      const spec = specsData.find((spec) => location.areaid === spec.areaid)
      return { ...location, ...spec }
    })
    .map((entry) => {
      // Merge tarief, specs and geo based on AreaManagerId
      const tarief = tariefData.find(
        (tarief) => entry.areamanagerid === tarief.areamanagerid
      )
      return { ...entry, ...tarief }
    })
    .map((entry) => {
      const chargingPointCapacity = Number.isNaN(entry.chargingpointcapacity)
        ? 0
        : +entry.chargingpointcapacity || 0
      const capacity = Number.isNaN(entry.capacity) ? 0 : +entry.capacity || 0

      return {
        // ...entry,
        wheelchairAccessible: Boolean(+entry.disabledaccess),
        parkingCapacity: +capacity,
        chargingPointCapacity,

        // Cost of parking for one hour.
        hourlyCost: (entry.amountfarepart / entry.stepsizefarepart) * 60 + 0,

        // The area ID of the parking zone.
        areaManagerId: +entry.areamanagerid,
        areaId: entry.areaid,
        description: entry.areadesc,
        area: getLocationFromDescription(entry.areadesc),
        location: {
          latitude: +entry.location.latitude,
          longitude: +entry.location.longitude,
          humanReadableAdress: JSON.parse(entry.location.human_address || '{}'),
        },
      }
    })

  // storeDataToLocalStorage(JSON.stringify(mergedData))

  // Return ✨utterly pristine✨ data
  return mergedData
}

export function locationCostData({ data, isSorted = false }) {
  const groupedByLocation = groupBy(data, 'area')
  const groupedByLocationArray = Object.entries(groupedByLocation)
    .filter((entry) => entry[0] !== undefined || 'undefined')
    .map((entry) => {
      return {
        location: entry[0],
        data: entry[1],
      }
    })
    .map((entry) => {
      const tariffs = entry.data.map((entry) => entry.hourlyCost)
      const chargingPoints = entry.data.map(
        (entry) => entry.chargingPointCapacity
      )

      return {
        area: entry.location,
        averageHourlyCost: average(tariffs),
        averageChargingPoints: +average(chargingPoints).toFixed(0) || 0,
      }
    })
    .filter((entry) => entry.averageHourlyCost > 0)
    .filter((_, index) => index < 20)

  if (isSorted) {
    return groupedByLocationArray.sort(
      (a, b) => a.averageHourlyCost - b.averageHourlyCost
    )
  }
  return groupedByLocationArray
}
