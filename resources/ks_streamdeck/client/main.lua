local cfg = StreamDeckConfig
KSStreamDeck = { registry = StreamDeckRegistry.new(), connected = false, generation = 0 }
local resource = GetCurrentResourceName()
local lastCatalog = 0
local seen, seenCount = {}, 0

local function notify(message)
    BeginTextCommandThefeedPost('STRING')
    AddTextComponentSubstringPlayerName(('Stream Deck: ' .. tostring(message)):sub(1, 250))
    EndTextCommandThefeedPostTicker(false, false)
end

function KSStreamDeck.canPlay()
    local ped = PlayerPedId()
    local frameworkAllowed, frameworkReason = StreamDeckFramework.canPlay()
    if not frameworkAllowed then
        return false, frameworkReason
    end
    local state = LocalPlayer and LocalPlayer.state
    if state then
        for _, key in ipairs(cfg.BlockedStates or {}) do
            if state[key] == true then
                return false, 'Animation derzeit gesperrt.'
            end
        end
        for _, key in ipairs(cfg.DenyFalseStates or {}) do
            if state[key] == false then
                return false, 'Animation derzeit gesperrt.'
            end
        end
    end
    if not NetworkIsPlayerActive(PlayerId()) or not DoesEntityExist(ped) then
        return false, 'Charakter nicht bereit.'
    end
    if IsEntityDead(ped) or IsPedFatallyInjured(ped) then
        return false, 'Charakter ist bewusstlos.'
    end
    if IsPedInAnyVehicle(ped, false) then
        return false, 'Animation im Fahrzeug nicht verfügbar.'
    end
    if IsPedRagdoll(ped) or IsPedFalling(ped) or IsPedSwimming(ped) or IsPedCuffed(ped) then
        return false, 'Animation derzeit nicht möglich.'
    end
    if not IsPlayerControlOn(PlayerId()) or IsPauseMenuActive() then
        return false, 'Spielsteuerung derzeit gesperrt.'
    end
    if cfg.BlockWhileUIFocused and IsNuiFocused() then
        return false, 'Bitte zuerst das geöffnete Menü schließen.'
    end
    local ok, allowed, message = pcall(cfg.CanPlay)
    if not ok or allowed ~= true then
        return false, message or 'Animation derzeit gesperrt.'
    end
    return true
end

function KSStreamDeck.snapshot()
    if GetGameTimer() - lastCatalog >= cfg.CatalogRefreshInterval then
        KSStreamDeck.registry:refresh()
        lastCatalog = GetGameTimer()
    end
    local allowed, message = KSStreamDeck.canPlay()
    return {
        catalog = KSStreamDeck.registry.catalog,
        active = KSStreamDeck.registry:current(),
        blocked = not allowed and message or nil,
    }
end
local function sendSnapshot()
    SendNUIMessage({ type = 'snapshot', data = KSStreamDeck.snapshot() })
end
local function configure()
    local endpoint = GetCurrentServerEndpoint() or 'not-connected'
    SendNUIMessage({
        type = 'config',
        enabled = cfg.Enabled,
        port = cfg.Port,
        server = {
            id = endpoint .. (cfg.ServerId ~= '' and ('/' .. cfg.ServerId) or ''),
            label = cfg.ServerLabel,
        },
        resource = resource,
    })
end

RegisterNUICallback('ready', function(_, cb)
    configure()
    cb({ ok = true })
end)
RegisterNUICallback('connection', function(data, cb)
    local connected = data.connected == true
    if KSStreamDeck.connected ~= connected then
        KSStreamDeck.generation = KSStreamDeck.generation + 1
        KSStreamDeck.connected = connected
        seen, seenCount = {}, 0
        if connected then
            notify('Verbunden. Animationen sind auf dem Stream Deck verfügbar.')
        end
    end
    cb({ ok = true })
    if connected then
        sendSnapshot()
    end
end)
RegisterNUICallback('notice', function(data, cb)
    local messages = {
        wrong_code = 'Der Kopplungscode stimmt nicht.',
        pairing_required = 'Bitte im Stream-Deck-Plugin auf Verbinden klicken.',
        session_in_use = 'Bereits mit einer anderen Sitzung verbunden. Zuerst im Plugin trennen.',
        unavailable = 'Stream Deck öffnen und im Plugin auf Verbinden klicken.',
        disconnected = 'Verbindung getrennt.',
        invalid_hello = 'Bitte das aktuelle KS FiveM Stream-Deck-Plugin installieren.',
    }
    if messages[data.message] then
        notify(messages[data.message])
    end
    cb({ ok = true })
end)
RegisterNUICallback('execute', function(data, cb)
    if not cfg.Enabled or not KSStreamDeck.connected then
        cb({ ok = false, message = 'Nicht verbunden.' })
        return
    end
    if type(data.id) ~= 'string' or #data.id > 64 or seen[data.id] then
        cb({ ok = false, message = 'Ungültige oder wiederholte Aktion.' })
        return
    end
    if seenCount >= 2048 then
        local cutoff = GetGameTimer() - 15000
        for id, time in pairs(seen) do
            if time < cutoff then
                seen[id] = nil
                seenCount = seenCount - 1
            end
        end
        if seenCount >= 2048 then
            cb({ ok = false, message = 'Zu viele Aktionen.' })
            return
        end
    end
    seen[data.id], seenCount = GetGameTimer(), seenCount + 1
    local remaining = math.min(3000, math.max(0, tonumber(data.remainingMs) or 0))
    if remaining <= 0 then
        cb({ ok = false, message = 'Aktion abgelaufen.' })
        return
    end
    local generation, deadline = KSStreamDeck.generation, GetGameTimer() + remaining
    local function guard()
        if
            not KSStreamDeck.connected
            or generation ~= KSStreamDeck.generation
            or GetGameTimer() > deadline
        then
            return false, 'Aktion abgelaufen.'
        end
        return KSStreamDeck.canPlay()
    end
    local ok, result, message = pcall(
        KSStreamDeck.registry.execute,
        KSStreamDeck.registry,
        data.command,
        data.animation,
        guard
    )
    cb({ ok = ok and result == true, message = ok and message or 'Animationsfehler.' })
    sendSnapshot()
end)

local function commandHandler(_, args)
    if not cfg.Enabled then
        notify('Auf diesem Server deaktiviert.')
        return
    end
    local code = args[1] or ''
    if code == 'trennen' or code == 'disconnect' then
        SendNUIMessage({ type = 'disconnect' })
        KSStreamDeck.connected = false
        KSStreamDeck.generation = KSStreamDeck.generation + 1
        notify('Verbindung getrennt.')
        return
    end
    if code == 'status' then
        notify(KSStreamDeck.connected and 'Verbunden.' or 'Nicht verbunden.')
        return
    end
    if not code:match('^%d%d%d%d%d%d$') then
        notify(
            'Im Stream-Deck-Plugin auf Verbinden klicken. Alternativ: /' .. cfg.Command .. ' CODE.'
        )
        return
    end
    configure()
    SendNUIMessage({ type = 'pair', code = code })
end
RegisterCommand(cfg.Command, commandHandler, false)
if cfg.Command ~= 'streamdeck' then
    RegisterCommand('streamdeck', commandHandler, false)
end

exports('RegisterAnimationProvider', function(id, provider)
    local owner = GetInvokingResource()
    if not owner then
        return false, 'Aufruf aus einer Resource erforderlich.'
    end
    return KSStreamDeck.registry:register(owner, id, provider)
end)
exports('UnregisterAnimationProvider', function(id)
    return KSStreamDeck.registry:remove(GetInvokingResource(), id)
end)
exports('RefreshAnimations', function()
    KSStreamDeck.registry:refresh()
    sendSnapshot()
end)
exports('GetStatus', function()
    local providers = {}
    for id in pairs(KSStreamDeck.registry.providers) do
        providers[#providers + 1] = id
    end
    table.sort(providers)
    return {
        connected = KSStreamDeck.connected,
        active = KSStreamDeck.registry:current(),
        providers = providers,
        framework = StreamDeckFramework.detect(),
    }
end)

AddEventHandler('onResourceStop', function(stopped)
    if stopped == resource then
        -- A resource reload suspends transport; only explicit disconnect revokes pairing.
        SendNUIMessage({ type = 'suspend' })
        KSStreamDeck.connected = false
        KSStreamDeck.generation = KSStreamDeck.generation + 1
        TriggerEvent('ks_streamdeck:cleanup')
    else
        KSStreamDeck.registry:removeOwner(stopped)
    end
end)
CreateThread(function()
    Wait(0)
    TriggerEvent('ks_streamdeck:ready')
    while true do
        Wait(math.max(500, cfg.SnapshotInterval))
        if KSStreamDeck.connected then
            sendSnapshot()
        end
    end
end)
