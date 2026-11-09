-- Load inside the animation resource, before its chosen adapter.
StreamDeckAdapter = {}
local resource = GetCurrentResourceName()
local function validId(value)
    return type(value) == 'string'
        and #value > 0
        and #value <= 64
        and value:match('^[%w_.-]+$') ~= nil
end
local function text(value, limit)
    if type(value) ~= 'string' then
        return nil
    end
    if #value <= limit then
        return value
    end
    local stop = utf8.offset(value, 0, limit + 1)
    return value:sub(1, (stop or limit + 1) - 1)
end
local function playing(entry, ped)
    if not entry or not DoesEntityExist(ped) or IsEntityDead(ped) then
        return false
    end
    if entry.scenario then
        return IsPedUsingScenario(ped, entry.scenario)
    end
    return IsEntityPlayingAnim(ped, entry.dict, entry.clip, 3)
end
function StreamDeckAdapter.create(driver)
    local entries, active, ped = {}, nil, nil
    local api = {}
    function api.catalog()
        local nextEntries, catalog = {}, {}
        local source = driver.catalog() or {}
        table.sort(source, function(a, b)
            return tostring(a.id) < tostring(b.id)
        end)
        for _, entry in ipairs(source) do
            if
                validId(entry.id)
                and not nextEntries[entry.id]
                and (
                    type(entry.scenario) == 'string'
                    or (type(entry.dict) == 'string' and type(entry.clip) == 'string')
                )
            then
                local label, category =
                    text(entry.label or entry.id, 96), text(entry.category or 'Emotes', 64)
                if label and category and #label > 0 and #category > 0 then
                    nextEntries[entry.id] = entry
                    catalog[#catalog + 1] = {
                        id = entry.id,
                        label = label,
                        category = category,
                        keywords = text(entry.keywords or entry.id, 256),
                    }
                end
            end
        end
        entries = nextEntries
        return catalog
    end
    function api.current()
        if active and ped == PlayerPedId() and playing(active, ped) then
            if not driver.current or driver.current(active) then
                return active.id
            end
        end
        active, ped = nil, nil
    end
    function api.stop()
        if not api.current() then
            return true
        end
        if driver.canStop and not driver.canStop() then
            return false, 'The animation system does not allow stopping right now.'
        end
        local old, oldPed = active, ped
        local result, reason = driver.stop(old)
        if result == false then
            return false, reason
        end
        local deadline = GetGameTimer() + 600
        while playing(old, oldPed) and GetGameTimer() < deadline do
            Wait(10)
        end
        if playing(old, oldPed) then
            return false, 'The animation system did not stop the animation.'
        end
        active, ped = nil, nil
        return true
    end
    function api.canPlay(id)
        local entry = entries[id]
        if not entry then
            return false, 'Animation is unavailable.'
        end
        if driver.canPlay then
            return driver.canPlay(entry)
        end
        return true
    end
    function api.play(id, guard)
        -- Refresh from the owner's catalog so removed or restricted IDs cannot be replayed.
        api.catalog()
        local entry = entries[id]
        if not entry then
            return false, 'Animation is unavailable.'
        end
        local allowed, reason = api.canPlay(id)
        if not allowed then
            return false, reason
        end
        if entry.dict then
            RequestAnimDict(entry.dict)
            local deadline = GetGameTimer() + 1500
            while not HasAnimDictLoaded(entry.dict) and GetGameTimer() < deadline do
                allowed, reason = guard()
                if not allowed then
                    return false, reason
                end
                Wait(10)
            end
            if not HasAnimDictLoaded(entry.dict) then
                return false, 'Could not load the animation.'
            end
        end
        allowed, reason = guard()
        if not allowed then
            return false, reason
        end
        local startingPed = PlayerPedId()
        local result, message = driver.play(entry)
        if result == false then
            return false, message
        end
        -- Vendor entrypoints may yield while loading props. Verify playback and the guard again.
        active, ped = entry, startingPed
        local deadline = GetGameTimer() + 600
        repeat
            allowed, reason = guard()
            if not allowed or PlayerPedId() ~= startingPed then
                api.stop()
                return false, reason or 'Character changed.'
            end
            if playing(entry, startingPed) then
                return true
            end
            Wait(10)
        until GetGameTimer() >= deadline
        active, ped = nil, nil
        return false, 'The animation system did not start the animation.'
    end
    return api
end
function StreamDeckAdapter.install(driver)
    local api = StreamDeckAdapter.create(driver)
    local function register()
        if GetResourceState('ks_streamdeck') ~= 'started' then
            return
        end
        local ok, reason = exports.ks_streamdeck:RegisterAnimationProvider(resource, api)
        if not ok then
            print(('[%s] Stream Deck: %s'):format(resource, tostring(reason)))
        end
    end
    AddEventHandler('ks_streamdeck:ready', register)
    AddEventHandler('onClientResourceStart', function(started)
        if started == 'ks_streamdeck' then
            register()
        end
    end)
    CreateThread(function()
        Wait(0)
        register()
    end)
    return api
end
