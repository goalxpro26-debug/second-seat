-- Second Seat: GameDistribution SDK wrapper.
--
-- The gd-defold native extension only registers the `gdsdk` Lua module on
-- HTML5 builds. Every call here is guarded so the same code runs unchanged
-- on other platforms and when the extension is absent: ads become no-ops.
--
-- GD rules honoured here:
--   * ads fire ONLY as an immediate reaction to user input (first Play tap,
--     Next on a level-complete screen) - never on load, never on a timer;
--   * SDK_GAME_PAUSE mutes all audio (via main.audio) and blocks gameplay
--     input until SDK_GAME_START resumes it;
--   * SDK_ERROR / AD_ERROR / AD_SDK_CANCELED resume if ad-paused, so a
--     failed ad can never freeze the game (ad-error resume fix, Nov 23:
--     with a PLACEHOLDER id every ad errors instantly).
local audio = require("main.audio")

local M = {}

local ok, gdsdk = pcall(require, "gdsdk")
if not ok then gdsdk = nil end

local on_pause_cb = nil
local on_resume_cb = nil
local paused = false

function M.available()
  return gdsdk ~= nil
end

function M.is_paused()
  return paused
end

-- pause_cb / resume_cb are called (no args) on SDK_GAME_PAUSE /
-- SDK_GAME_START. The game controller owns what "paused" means; this module
-- always mutes/unmutes audio itself as well.
function M.init(pause_cb, resume_cb)
  on_pause_cb = pause_cb
  on_resume_cb = resume_cb
  if not gdsdk then return end
  pcall(gdsdk.set_listener, function(_self, event, _message)
    if event == gdsdk.SDK_GAME_PAUSE then
      paused = true
      audio.set_muted(true)
      if on_pause_cb then pcall(on_pause_cb) end
    elseif event == gdsdk.SDK_GAME_START
        or event == gdsdk.CONTENT_RESUME_REQUESTED then
      paused = false
      if on_resume_cb then pcall(on_resume_cb) end
    elseif event == gdsdk.SDK_ERROR or event == gdsdk.AD_ERROR
        or event == gdsdk.AD_SDK_CANCELED then
      -- Never leave the game stuck muted/paused if an ad fails.
      if paused then
        paused = false
        if on_resume_cb then pcall(on_resume_cb) end
      end
    end
  end)
end

-- Pre-roll: called once, from the first Play tap (ui_play).
function M.show_preroll()
  if gdsdk then pcall(gdsdk.show_interstitial_ad) end
end

-- Interstitial at a natural break (level complete, via the Next tap).
function M.show_interstitial()
  if gdsdk then pcall(gdsdk.show_interstitial_ad) end
end

return M
