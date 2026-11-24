-- Second Seat: audio helper. All sounds live on the "/audio" game object.
local M = {}
local BASE = "/audio#"
local KNOWN = {}
function M.register(names)
  for _, n in ipairs(names) do KNOWN[n] = true end
end
function M.play(name)
  if KNOWN[name] then pcall(sound.play, BASE .. name) end
end
function M.stop(name)
  if KNOWN[name] then pcall(sound.stop, BASE .. name) end
end
function M.set_muted(muted)
  pcall(sound.set_gain, "/audio", muted and 0 or 1)
end
return M
