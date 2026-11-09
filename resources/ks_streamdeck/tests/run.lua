local root = ... or 'resources/ks_streamdeck'
local function load(name)
    return assert(loadfile(root .. '/' .. name))()
end
local checks = 0
local function check(value, message)
    assert(value, message)
    checks = checks + 1
end
load('client/registry.lua')
local r = StreamDeckRegistry.new()
local playing, calls, shouldFail = nil, {}, false
local provider = {
    catalog = function()
        return {
            { id = 'wave', label = 'Winken', category = 'Gesten' },
            { id = 'dance', label = 'Tanzen', category = 'Tanz' },
            { id = 'wave', label = 'Doppelt', category = 'Test' },
            { id = 'bad:id', label = 'Ungültig', category = 'Test' },
        }
    end,
    current = function()
        return playing
    end,
    stop = function()
        playing = nil
        calls[#calls + 1] = 'stop'
        return true
    end,
    play = function(id, guard)
        calls[#calls + 1] = 'play:' .. id
        if shouldFail then
            error('provider failure')
        end
        if not guard() then
            return false
        end
        playing = id
        return true
    end,
}
check(r:register('test_resource', 'example', provider), 'valid provider')
check(#r.catalog == 2, 'duplicate and unsafe IDs rejected')
check(not r:register('other_resource', 'example', provider), 'provider ownership enforced')
check(not r:remove('other_resource', 'example'), 'only owner removes provider')
check(not r:execute('play', 'example:missing', function()
    return true
end), 'unknown animation rejected')
check(not r:execute('play', 'example:wave', function()
    return false, 'dead'
end), 'state guard rejects')
check(not playing, 'guard does not start')
check(
    r:execute('play', 'example:wave', function()
        return true
    end),
    'play allowed'
)
check(r:current() == 'example:wave', 'actual current state')
check(
    r:execute('toggle', 'example:wave', function()
        return false
    end),
    'toggle stops despite blocked start'
)
check(not playing, 'toggle stopped')
check(
    r:execute('play', 'example:wave', function()
        return true
    end),
    'play again'
)
check(
    r:execute('play', 'example:dance', function()
        return true
    end),
    'switch animation'
)
check(playing == 'dance' and calls[#calls - 1] == 'stop', 'old animation stopped before switching')
shouldFail = true
check(not r:execute('play', 'example:wave', function()
    return true
end), 'provider exception caught')
check(not r.busy, 'failure releases busy state')
shouldFail = false
r.busy = true
check(not r:execute('play', 'example:wave', function()
    return true
end), 'concurrent request denied')
r.busy = false
r:removeOwner('test_resource')
check(#r.catalog == 0, 'provider resource stop removes catalog')

-- Run real client + builtin provider with FiveM native stubs; no framework, DB or server.
local callbacks, handlers, commands, api, out = {}, {}, {}, {}, {}
local now, loaded, vehicle, dead, focused, animTask = 0, true, false, false, false, nil
local waitHook
function GetCurrentResourceName()
    return 'ks_streamdeck'
end
function GetInvokingResource()
    return 'external_test'
end
function RegisterNUICallback(name, fn)
    callbacks[name] = fn
end
function RegisterCommand(name, fn)
    commands[name] = fn
end
function AddEventHandler(name, fn)
    handlers[name] = handlers[name] or {}
    table.insert(handlers[name], fn)
end
function TriggerEvent(name, ...)
    for _, fn in ipairs(handlers[name] or {}) do
        fn(...)
    end
end
function CreateThread() end
function SetTimeout(_, fn)
    fn()
end
function SendNUIMessage(data)
    out[#out + 1] = data
end
function GetGameTimer()
    return now
end
function Wait(ms)
    now = now + ms
    if waitHook then
        waitHook()
    end
end
function GetCurrentServerEndpoint()
    return '127.0.0.1:30120'
end
function PlayerPedId()
    return 1
end
function PlayerId()
    return 7
end
function NetworkIsPlayerActive()
    return true
end
function DoesEntityExist()
    return true
end
function IsEntityDead()
    return dead
end
function IsPedFatallyInjured()
    return dead
end
function IsPedInAnyVehicle()
    return vehicle
end
function IsPedRagdoll()
    return false
end
function IsPedFalling()
    return false
end
function IsPedSwimming()
    return false
end
function IsPedCuffed()
    return false
end
function IsPlayerControlOn()
    return true
end
function IsPauseMenuActive()
    return false
end
function IsNuiFocused()
    return focused
end
function GetResourceState()
    return 'missing'
end
function RequestAnimDict() end
function RemoveAnimDict() end
function HasAnimDictLoaded()
    return loaded
end
function TaskPlayAnim(ped, dict, clip)
    animTask = { ped = ped, dict = dict, clip = clip }
end
function IsEntityPlayingAnim(ped, dict, clip)
    return animTask and animTask.ped == ped and animTask.dict == dict and animTask.clip == clip
        or false
end
function StopAnimTask(_, dict, clip)
    if animTask and animTask.dict == dict and animTask.clip == clip then
        animTask = nil
    end
end
function BeginTextCommandThefeedPost() end
function AddTextComponentSubstringPlayerName() end
function EndTextCommandThefeedPostTicker() end
exports = setmetatable({}, {
    __call = function(_, name, fn)
        api[name] = fn
    end,
})
load('config.lua')
load('client/framework.lua')
load('client/main.lua')
load('client/providers.lua')
local function nui(name, data)
    local result
    callbacks[name](data or {}, function(value)
        result = value
    end)
    check(result ~= nil, 'NUI always acknowledges ' .. name)
    return result
end
nui('ready')
check(out[#out].server.id == '127.0.0.1:30120', 'bindings include actual endpoint')
check(#KSStreamDeck.registry.catalog == 5, 'builtin mode works without other resources')
check(api.RegisterAnimationProvider('external', provider), 'external export registers provider')
check(#KSStreamDeck.registry.catalog == 2, 'external catalog hides builtin fallback')
check(not KSStreamDeck.registry.entries['builtin:wave'], 'hidden fallback cannot execute')
TriggerEvent('onResourceStop', 'external_test')
check(#KSStreamDeck.registry.catalog == 5, 'builtin returns after external resource stops')
local id = 0
local function command(action, animation)
    id = id + 1
    return nui(
        'execute',
        { id = 'test-' .. id, command = action, animation = animation, remainingMs = 3000 }
    )
end
check(not command('play', 'builtin:wave').ok, 'unpaired client blocked')
nui('connection', { connected = true })
vehicle = true
check(not command('play', 'builtin:wave').ok, 'in-vehicle animation blocked')
vehicle = false
focused = true
check(not command('play', 'builtin:wave').ok, 'focused menu blocked')
focused = false
dead = true
check(not command('play', 'builtin:wave').ok, 'dead player blocked')
dead = false
check(command('play', 'builtin:wave').ok, 'builtin animation begins')
check(KSStreamDeck.snapshot().active == 'builtin:wave', 'native playing state reflected')
animTask = nil
check(KSStreamDeck.snapshot().active == nil, 'natural animation ending reflected')
check(command('toggle', 'builtin:wave').ok, 'toggle starts')
focused = true
check(
    command('toggle', 'builtin:wave').ok and not animTask,
    'toggle stops without clearing unrelated tasks'
)
focused = false
loaded = false
check(not command('play', 'builtin:wave').ok and not animTask, 'dictionary timeout does not play')
loaded = true
loaded = false
waitHook = function()
    loaded = true
    nui('connection', { connected = false })
    waitHook = nil
end
check(
    not command('play', 'builtin:wave').ok and not animTask,
    'disconnect during dictionary load cancels action'
)
nui('connection', { connected = true })
check(command('play', 'builtin:wave').ok, 'reconnected animation works')
check(
    not nui(
        'execute',
        { id = 'test-' .. id, command = 'play', animation = 'builtin:wave', remainingMs = 3000 }
    ).ok,
    'duplicate command ID blocked'
)
check(
    not nui(
        'execute',
        { id = 'expired', command = 'play', animation = 'builtin:wave', remainingMs = 0 }
    ).ok,
    'expired request blocked'
)
TriggerEvent('onResourceStop', 'ks_streamdeck')
check(
    out[#out].type == 'suspend',
    'resource restart suspends transport instead of revoking pairing'
)
check(
    not animTask and not KSStreamDeck.connected,
    'resource stop cleans owned animation and session'
)
print(('ks_streamdeck: %d checks passed'):format(checks))
