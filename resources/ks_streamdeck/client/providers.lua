local cfg, registry = StreamDeckConfig, KSStreamDeck.registry
local owner = GetCurrentResourceName()
local active
local function stopBuiltin()
    if active then
        if DoesEntityExist(active.ped) then
            StopAnimTask(active.ped, active.dict, active.clip, 2.0)
        end
        RemoveAnimDict(active.dict)
        active = nil
    end
    return true
end
local builtin = {
    catalog = function()
        if cfg.Provider == 'auto' then
            for id in pairs(registry.providers) do
                if id ~= 'builtin' then
                    return {}
                end
            end
        end
        local items = {}
        for _, anim in ipairs(cfg.Animations) do
            items[#items + 1] = {
                id = anim.id,
                label = anim.label,
                category = anim.category,
                keywords = anim.keywords,
            }
        end
        return items
    end,
    current = function()
        if
            active
            and active.ped == PlayerPedId()
            and IsEntityPlayingAnim(active.ped, active.dict, active.clip, 3)
        then
            return active.id
        end
        if active then
            stopBuiltin()
        end
    end,
    stop = stopBuiltin,
    play = function(id, guard)
        local anim
        for _, entry in ipairs(cfg.Animations) do
            if entry.id == id then
                anim = entry
                break
            end
        end
        if not anim then
            return false, 'Animation nicht gefunden.'
        end
        RequestAnimDict(anim.dict)
        local deadline = GetGameTimer() + 1500
        while not HasAnimDictLoaded(anim.dict) and GetGameTimer() < deadline do
            Wait(10)
        end
        if not HasAnimDictLoaded(anim.dict) then
            RemoveAnimDict(anim.dict)
            return false, 'Animation konnte nicht geladen werden.'
        end
        local allowed, reason = guard()
        if not allowed then
            RemoveAnimDict(anim.dict)
            return false, reason
        end
        local ped = PlayerPedId()
        TaskPlayAnim(
            ped,
            anim.dict,
            anim.clip,
            3.0,
            2.0,
            anim.duration or -1,
            anim.flags or 49,
            0.0,
            false,
            false,
            false
        )
        active = { id = id, ped = ped, dict = anim.dict, clip = anim.clip }
        local started = GetGameTimer() + 400
        repeat
            Wait(10)
            local valid = guard()
            if not valid then
                stopBuiltin()
                return false, 'Aktion abgebrochen.'
            end
        until IsEntityPlayingAnim(ped, anim.dict, anim.clip, 3) or GetGameTimer() >= started
        if not IsEntityPlayingAnim(ped, anim.dict, anim.clip, 3) then
            stopBuiltin()
            return false, 'Animation konnte nicht gestartet werden.'
        end
        return true
    end,
}
local ks = {
    catalog = function()
        return exports.ks_animations:GetStreamDeckAnimations(cfg.Locale)
    end,
    current = function()
        return exports.ks_animations:GetPlayingAnimation()
    end,
    play = function(id, guard)
        return exports.ks_animations:PlayAnimationById(id, guard)
    end,
    stop = function()
        return exports.ks_animations:StopPlayingAnimation()
    end,
}
local selected
local function configure()
    local mode = cfg.Provider
    local target = mode == 'auto'
            and (GetResourceState('ks_animations') == 'started' and 'ks_animations' or 'builtin')
        or mode
    if target == selected then
        return
    end
    stopBuiltin()
    registry:remove(owner, 'builtin')
    registry:remove(owner, 'ks_animations')
    selected = target
    if target == 'builtin' then
        registry:register(owner, 'builtin', builtin)
    elseif target == 'ks_animations' then
        registry:register(owner, 'ks_animations', ks)
    end
end
AddEventHandler('onClientResourceStart', function(started)
    if started == 'ks_animations' then
        configure()
    end
end)
AddEventHandler('onResourceStop', function(stopped)
    if stopped == 'ks_animations' then
        registry:remove(owner, 'ks_animations')
        selected = nil
        SetTimeout(100, configure)
    end
end)
AddEventHandler('ks_streamdeck:cleanup', stopBuiltin)
configure()
