-- Second Seat: district (level) definitions.
-- 12 districts across one sun-faded repair-shop town + endless courier mode.
-- Mission types: "deliver" (make N deliveries), "score" (reach a score
-- target by the end of the route), "nostall" (make N deliveries with
-- zero stalls - a stall ends the run at once).
local M = {}

M.NAMES = {
  "Repair Row", "Market Bend", "Old Depot", "Harbor Gate",
  "Cafe Corner", "Plaza Shade", "Workshop Lane", "Rooftop Run",
  "Orchard Road", "Station Steps", "Junction Nine", "Hilltop Garage",
}

-- distance in metres, deliveries N, density 0..1, time limit seconds.
-- L1 is deliberately easy: short route, 2 deliveries, light traffic,
-- generous time, low score bar.
local DEFS = {
  { distance = 600,  deliveries = 2, density = 0.15, time = 150,
    mission = { type = "deliver", target = 2, text = "Deliver 2 parcels" },
    stars = { 400, 700, 1000 } },
  { distance = 700,  deliveries = 3, density = 0.22, time = 160,
    mission = { type = "deliver", target = 3, text = "Deliver 3 parcels" },
    stars = { 600, 1000, 1400 } },
  { distance = 800,  deliveries = 3, density = 0.30, time = 170,
    mission = { type = "score", target = 1200, text = "Score 1200 by the depot" },
    stars = { 1200, 1600, 2100 } },
  { distance = 850,  deliveries = 4, density = 0.34, time = 180,
    mission = { type = "deliver", target = 4, text = "Deliver 4 parcels" },
    stars = { 900, 1400, 1900 } },
  { distance = 900,  deliveries = 4, density = 0.38, time = 180,
    mission = { type = "nostall", target = 3, text = "Deliver 3 parcels, no stalls" },
    stars = { 1000, 1500, 2000 } },
  { distance = 950,  deliveries = 4, density = 0.42, time = 190,
    mission = { type = "score", target = 1800, text = "Score 1800 by the plaza" },
    stars = { 1800, 2300, 2900 } },
  { distance = 1000, deliveries = 5, density = 0.46, time = 200,
    mission = { type = "deliver", target = 5, text = "Deliver 5 parcels" },
    stars = { 1300, 1900, 2500 } },
  { distance = 1050, deliveries = 5, density = 0.50, time = 200,
    mission = { type = "score", target = 2200, text = "Score 2200 on the rooftops" },
    stars = { 2200, 2800, 3500 } },
  { distance = 1100, deliveries = 5, density = 0.54, time = 210,
    mission = { type = "nostall", target = 4, text = "Deliver 4 parcels, no stalls" },
    stars = { 1500, 2100, 2800 } },
  { distance = 1150, deliveries = 6, density = 0.58, time = 220,
    mission = { type = "deliver", target = 6, text = "Deliver 6 parcels" },
    stars = { 1700, 2400, 3100 } },
  { distance = 1200, deliveries = 6, density = 0.62, time = 230,
    mission = { type = "score", target = 2800, text = "Score 2800 at the junction" },
    stars = { 2800, 3500, 4300 } },
  { distance = 1300, deliveries = 7, density = 0.66, time = 240,
    mission = { type = "deliver", target = 7, text = "Deliver 7 parcels" },
    stars = { 2100, 2900, 3800 } },
}

function M.get(n)
  local d = DEFS[n]
  return {
    name = M.NAMES[n], distance = d.distance, deliveries = d.deliveries,
    density = d.density, time = d.time, mission = d.mission,
    stars = d.stars, number = n,
  }
end

M.LEVELS = {}
for i = 1, 12 do M.LEVELS[i] = M.get(i) end

-- Endless courier mode: deliveries keep coming, traffic thickens over time.
M.ENDLESS = {
  name = "Endless Courier", distance = 0, deliveries = 0, density = 0.30,
  time = 0,
  mission = { type = "endless", target = 0, text = "Deliver as many as you can" },
  stars = { 0, 0, 0 },
}

return M
