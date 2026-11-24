-- Second Seat: pure driving model. No GUI, no Defold APIs - the autoplay
-- bot and the GUI both drive through this module, so it is unit-testable.
--
-- Seats: "front" (you steer, partner works the throttle) and "back"
-- (you set speed directly, partner steers by AI and rests).
-- Fatigue: partner on throttle +3.5/s, resting -8/s. At 100 the scooter
-- STALLS (speed 0 for 3s); swapping puts the partner up front to rest.
-- Lanes 1..3 (1 = far/top, 3 = near/bottom). Scooter sits at x=300;
-- entities spawn at x=1250 and scroll left at (speed - own_speed)*14 px/s.
local M = {}

M.LANE_Y = { 300, 400, 500 }
M.SCOOTER_X = 300
M.MAX_SPEED = 60          -- km/h at throttle 100
M.FATIGUE_UP = 3.5        -- per second, partner on throttle
M.FATIGUE_DOWN = 8.0      -- per second, partner resting
M.STALL_TIME = 3.0
M.SPAWN_X = 1250
M.PX_PER_SPEED = 14       -- px/s per km/h of relative speed

local next_id = 0

function M.new(def, endless)
  next_id = 0
  return {
    def = def, endless = endless or false,
    lane = 2, speed = 0, order = 40, partner_order = 40,
    seat = "front", fatigue = 0, stalled = false, stall_t = 0,
    distance = 0, score = 0, deliveries = 0, crashes = 0, stalls = 0,
    pickups = 0, missed_stops = 0,
    time_left = def.time or 0, elapsed = 0,
    entities = {}, spawn_t = 1.0, stop_t = 6.0,
    invuln = 0, over = false, won = false, reason = nil,
    ai_t = 0, drift_t = 2.0, wobble_t = 0,
    stops_spawned = 0,
  }
end

function M.set_order(s, v)
  s.order = math.max(0, math.min(100, v or 0))
end

-- A/D throttle: delta per second is applied by the caller in update via
-- s.throttle_held (-1/0/+1); this helper applies an instant step.
function M.throttle_step(s, d)
  M.set_order(s, s.order + d)
end

function M.change_lane(s, d)
  local nl = math.max(1, math.min(3, s.lane + d))
  if nl ~= s.lane then s.lane = nl return true end
  return false
end

function M.swap(s)
  if s.over then return end
  if s.seat == "front" then s.seat = "back" else s.seat = "front" end
  -- Swapping puts the tired partner up front to rest and clears a stall:
  -- the fresh driver takes over at once.
  if s.stalled then
    s.stalled = false
    s.stall_t = 0
    s.fatigue = 70
  end
  s.partner_order = s.order
end

local function spawn(s, kind, lane)
  next_id = next_id + 1
  local own = 0
  if kind == "car" then own = 16 + math.random() * 8
  elseif kind == "truck" then own = 10 + math.random() * 5 end
  local e = { id = next_id, kind = kind, lane = lane, x = M.SPAWN_X,
              own = own, passed = false }
  if kind == "car" then e.img = math.random() < 0.5 and "car_red" or "car_blue"
  elseif kind == "truck" then e.img = "truck"
  elseif kind == "pothole" then e.img = "pothole"
  elseif kind == "pickup" then e.img = "parcel"
  elseif kind == "stop" then e.img = "stop" end
  s.entities[#s.entities + 1] = e
  return e
end

local function density_now(s)
  if s.endless then
    return math.min(0.9, s.def.density + s.elapsed / 300)
  end
  return s.def.density
end

local function spawn_traffic(s)
  local d = density_now(s)
  local r = math.random()
  local lane = math.random(1, 3)
  if r < 0.20 then
    spawn(s, "pickup", lane)
  elseif r < 0.20 + 0.18 * d + 0.10 then
    spawn(s, "pothole", lane)
  elseif r < 0.62 then
    spawn(s, "car", lane)
  elseif r < 0.62 + 0.20 * d then
    spawn(s, "truck", lane)
  else
    spawn(s, "pickup", lane)
  end
end

-- Nearest threat (traffic/pothole) ahead in a lane, within x range.
local function threat_in(s, lane, x0, x1)
  local best = nil
  for _, e in ipairs(s.entities) do
    if e.lane == lane and (e.kind == "car" or e.kind == "truck" or e.kind == "pothole")
        and e.x > x0 and e.x < x1 then
      if not best or e.x < best.x then best = e end
    end
  end
  return best
end

local function stop_ahead(s)
  local best = nil
  for _, e in ipairs(s.entities) do
    if e.kind == "stop" and e.x > M.SCOOTER_X and not e.passed then
      if not best or e.x < best.x then best = e end
    end
  end
  return best
end

-- Partner steering AI (only when you sit in the BACK seat): drifts toward
-- the centre lane, dodges late, and sometimes misses a pickup (it never
-- steers toward pickups).
local function partner_steer(s, dt)
  s.ai_t = s.ai_t - dt
  s.drift_t = s.drift_t - dt
  if s.ai_t > 0 and s.drift_t > 0 then return end
  if s.ai_t <= 0 then
    s.ai_t = 0.45
    local threat = threat_in(s, s.lane, M.SCOOTER_X + 30, M.SCOOTER_X + 380)
    if threat then
      -- Dodge late: only react once the threat is close, and sometimes
      -- (1 in 5) the partner freezes and does not dodge at all.
      if math.random() < 0.2 then return end
      for _, d in ipairs({ -1, 1, 1, -1 }) do
        local nl = s.lane + d
        if nl >= 1 and nl <= 3 and not threat_in(s, nl, M.SCOOTER_X, M.SCOOTER_X + 500) then
          s.lane = nl
          return
        end
      end
    end
  end
  if s.drift_t <= 0 then
    s.drift_t = 2.5
    if not threat_in(s, s.lane, M.SCOOTER_X, M.SCOOTER_X + 500) and s.lane ~= 2 then
      s.lane = s.lane + (s.lane < 2 and 1 or -1)
    end
  end
end

local function finish_level(s, events)
  local m = s.def.mission
  if m.type == "deliver" then
    if s.deliveries >= m.target then
      s.won, s.reason = true, "All deliveries made!"
    else
      s.won, s.reason = false, "Only " .. s.deliveries .. " of " ..
        m.target .. " deliveries made."
    end
  elseif m.type == "nostall" then
    if s.deliveries >= m.target and s.stalls == 0 then
      s.won, s.reason = true, "Clean run, no stalls!"
    elseif s.stalls > 0 then
      s.won, s.reason = false, "A stall broke the clean run."
    else
      s.won, s.reason = false, "Only " .. s.deliveries .. " of " ..
        m.target .. " deliveries made."
    end
  elseif m.type == "score" then
    if s.score >= m.target then
      s.won, s.reason = true, "Score target reached!"
    else
      s.won, s.reason = false, "Score " .. s.score .. " of " .. m.target .. "."
    end
  end
  s.over = true
  events[#events + 1] = { type = s.won and "win" or "lose", reason = s.reason }
end

function M.update(s, dt)
  local events = {}
  if s.over then return events end
  s.elapsed = s.elapsed + dt
  if s.invuln > 0 then s.invuln = s.invuln - dt end
  if not s.endless then
    s.time_left = s.time_left - dt
    if s.time_left <= 0 then
      s.time_left = 0
      s.over = true
      s.won = false
      s.reason = "Out of time - try again!"
      events[#events + 1] = { type = "lose", reason = s.reason }
      return events
    end
  end

  -- Fatigue: partner on throttle tires, resting recovers.
  if s.seat == "front" then
    s.fatigue = math.min(100, s.fatigue + M.FATIGUE_UP * dt)
  else
    s.fatigue = math.max(0, s.fatigue - M.FATIGUE_DOWN * dt)
  end
  if s.fatigue >= 100 and not s.stalled then
    s.stalled = true
    s.stall_t = M.STALL_TIME
    s.stalls = s.stalls + 1
    s.speed = 0
    events[#events + 1] = { type = "stall" }
    if s.def.mission.type == "nostall" then
      s.over = true
      s.won = false
      s.reason = "Stalled! The no-stall run is over."
      events[#events + 1] = { type = "lose", reason = s.reason }
      return events
    end
  end
  if s.stalled then
    s.stall_t = s.stall_t - dt
    s.speed = 0
    if s.stall_t <= 0 then
      s.stalled = false
      s.fatigue = 90
      events[#events + 1] = { type = "stall_end" }
    end
  end

  -- Held throttle keys (A/D) adjust the order while held.
  if s.throttle_held and s.throttle_held ~= 0 then
    M.set_order(s, s.order + s.throttle_held * 55 * dt)
  end

  -- Effective throttle: direct when you are in back; partner-held (with
  -- fatigue wobble) when you are in front.
  local eff
  if s.stalled then
    eff = 0
  elseif s.seat == "back" then
    eff = s.order
    s.partner_order = s.order
  else
    s.wobble_t = s.wobble_t + dt
    local target = s.order
    local diff = target - s.partner_order
    local step = 30 * dt
    if math.abs(diff) <= step then s.partner_order = target
    else s.partner_order = s.partner_order + (diff > 0 and step or -step) end
    local wob = math.sin(s.wobble_t * 2.3) * (s.fatigue / 100) * 12
    eff = math.max(0, math.min(100, s.partner_order + wob))
  end

  local target_speed = eff * M.MAX_SPEED / 100
  local rate = target_speed > s.speed and 25 or 40
  local ds = target_speed - s.speed
  local step = rate * dt
  if math.abs(ds) <= step then s.speed = target_speed
  else s.speed = s.speed + (ds > 0 and step or -step) end

  s.distance = s.distance + s.speed * dt / 3.6

  -- Partner steers when you sit in back.
  if s.seat == "back" then partner_steer(s, dt) end

  -- Spawns.
  local d = density_now(s)
  s.spawn_t = s.spawn_t - dt
  if s.spawn_t <= 0 then
    s.spawn_t = (2.3 - 1.4 * d) * (0.7 + math.random() * 0.6)
    spawn_traffic(s)
  end
  s.stop_t = s.stop_t - dt
  if s.stop_t <= 0 then
    s.stop_t = 13 + math.random() * 6
    s.stops_spawned = s.stops_spawned + 1
    spawn(s, "stop", math.random(1, 3))
  end

  -- Move entities; resolve overlaps at the scooter.
  -- SWEPT collision: at low headless FPS one frame can move an entity
  -- 100+ px, jumping clean over the 140 px hit window (|x-300| < 70).
  -- An entity counts as overlapping if its path crossed the scooter's
  -- x during this step, not just if it ended inside the window.
  for i = #s.entities, 1, -1 do
    local e = s.entities[i]
    local px = e.x
    e.x = e.x - (s.speed - e.own) * M.PX_PER_SPEED * dt
    local crossed = (px - M.SCOOTER_X) * (e.x - M.SCOOTER_X) <= 0
    local overlap = math.abs(e.x - M.SCOOTER_X) < 70 or crossed
    if e.x < -160 or e.x > 1400 then
      if e.kind == "stop" and not e.passed then
        e.passed = true
        s.missed_stops = s.missed_stops + 1
        events[#events + 1] = { type = "stop_missed" }
      end
      table.remove(s.entities, i)
    elseif not e.passed and e.lane == s.lane and overlap then
      if e.kind == "car" or e.kind == "truck" or e.kind == "pothole" then
        if s.invuln <= 0 then
          e.passed = true
          s.crashes = s.crashes + 1
          s.score = math.max(0, s.score - 50)
          s.speed = s.speed * 0.3
          s.invuln = 1.5
          events[#events + 1] = { type = "crash", kind = e.kind }
          if s.crashes >= 3 then
            s.over = true
            s.won = false
            s.reason = "Three crashes - the scooter needs repairs!"
            events[#events + 1] = { type = "lose", reason = s.reason }
            return events
          end
        end
      elseif e.kind == "pickup" then
        e.passed = true
        s.pickups = s.pickups + 1
        s.score = s.score + 100
        events[#events + 1] = { type = "pickup" }
      elseif e.kind == "stop" then
        e.passed = true
        if s.speed < 20 then
          s.deliveries = s.deliveries + 1
          s.score = s.score + 300
          events[#events + 1] = { type = "delivery", n = s.deliveries }
          local m = s.def.mission
          if not s.endless and (m.type == "deliver" or m.type == "nostall")
              and s.deliveries >= m.target then
            finish_level(s, events)
            return events
          end
        else
          s.missed_stops = s.missed_stops + 1
          events[#events + 1] = { type = "stop_missed" }
        end
      end
    end
  end

  -- Route end (level mode only).
  if not s.endless and s.def.distance > 0 and s.distance >= s.def.distance then
    finish_level(s, events)
  end
  return events
end

-- Bot helpers shared by the GUI autoplay: nearest threat / stop queries.
function M.threat_ahead(s, x1)
  return threat_in(s, s.lane, M.SCOOTER_X + 30, x1 or M.SCOOTER_X + 420)
end

function M.lane_free(s, lane, x0, x1)
  return threat_in(s, lane, x0 or M.SCOOTER_X, x1 or M.SCOOTER_X + 520) == nil
end

function M.stop_ahead(s)
  return stop_ahead(s)
end

return M
