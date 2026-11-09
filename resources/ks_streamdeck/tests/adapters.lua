local root = ... or 'resources/ks_streamdeck'
assert(loadfile(root .. '/client/registry.lua'))()
local checks = 0
local function check(ok, reason)
    assert(ok, reason)
    checks = checks + 1
end
local function remote(fn)
    return setmetatable({}, {
        __call = function(_, ...)
            return fn(...)
        end,
    })
end
for _, kind in ipairs({ 'dpemotes', 'rpemotes', 'scully' }) do
    local registry = StreamDeckRegistry.new()
    local now, current, loaded, deny, stopCalls, ready = 0, nil, true, false, 0, true
    local loadHook, playHook
    local handlers = {}
    local env = setmetatable({ LocalPlayer = { state = {} }, Config = {} }, { __index = _G })
    local function started(name)
        if not deny then
            current = { dict = 'test', clip = name }
        end
        if playHook then
            playHook()
        end
    end
    local function stop()
        stopCalls = stopCalls + 1
        current = nil
    end
    env.GetCurrentResourceName = function()
        return kind
    end
    env.GetResourceState = function()
        return ready and 'started' or 'stopped'
    end
    env.PlayerPedId = function()
        return 1
    end
    env.DoesEntityExist = function()
        return true
    end
    env.IsEntityDead = function()
        return false
    end
    env.GetGameTimer = function()
        return now
    end
    env.Wait = function(ms)
        now = now + ms
        if loadHook then
            loadHook()
        end
    end
    env.RequestAnimDict = function() end
    env.HasAnimDictLoaded = function()
        return loaded
    end
    env.IsEntityPlayingAnim = function(_, dict, clip)
        return current and current.dict == dict and current.clip == clip or false
    end
    env.IsPedUsingScenario = function(_, scenario)
        return current and current.scenario == scenario or false
    end
    env.AddEventHandler = function(name, fn)
        handlers[name] = fn
    end
    env.CreateThread = function(fn)
        fn()
    end
    env.exports = {
        ks_streamdeck = {
            RegisterAnimationProvider = function(_, id, api)
                local serialized = {}
                for name, fn in pairs(api) do
                    serialized[name] = remote(fn)
                end
                return registry:register(kind, id, serialized)
            end,
        },
    }
    local itemId
    if kind == 'dpemotes' then
        env.DP = {
            Emotes = { wave = { 'test', 'wave', 'Winken' } },
            Dances = {},
            PropEmotes = { coffee = { 'test', 'coffee', 'Kaffee' } },
            Shared = { hug = { 'test', 'hug', 'Umarmen' } },
        }
        env.EmoteMenuStart = function(name, category)
            check(category == 'emotes' or category == 'props', 'dp category preserved')
            started(name)
        end
        env.EmoteCancel = stop
        itemId = 'Emotes.wave'
    elseif kind == 'rpemotes' then
        env.EmoteType = {
            EMOTES = 'Emotes',
            DANCES = 'Dances',
            PROP_EMOTES = 'PropEmotes',
            ANIMAL_EMOTES = 'AnimalEmotes',
        }
        env.EmoteData = {
            wave = { dict = 'test', anim = 'wave', label = 'Winken', emoteType = 'Emotes' },
            coffee = { dict = 'test', anim = 'coffee', label = 'Kaffee', emoteType = 'PropEmotes' },
            hug = { dict = 'test', anim = 'hug', emoteType = 'Shared' },
        }
        env.HasEmotePermission = function()
            return not deny
        end
        env.EmoteCommandStart = function(args)
            started(args[1])
        end
        env.EmoteCancel = stop
        itemId = 'wave'
    else
        env.Emotes = {
            {
                name = 'Emotes',
                type = 'general_emotes',
                options = {
                    { Command = 'wave', Label = 'Winken', Dictionary = 'test', Animation = 'wave' },
                    {
                        Command = 'coffee',
                        Label = 'Kaffee',
                        Dictionary = 'test',
                        Animation = 'coffee',
                        Options = { Props = {} },
                    },
                    {
                        Command = 'secret',
                        Label = 'Versteckt',
                        Dictionary = 'test',
                        Animation = 'secret',
                        Hide = true,
                    },
                    {
                        Command = 'hug',
                        Label = 'Umarmen',
                        Dictionary = 'test',
                        Animation = 'hug',
                        Synchronized = true,
                    },
                },
            },
        }
        env.IsLimited = function()
            return deny
        end
        env.IsControlPressed = function()
            return false
        end
        env.PlayEmoteByCommand = started
        env.IsInEmote = function()
            return current ~= nil
        end
        env.CancelEmote = function(skipReset)
            check(skipReset == true, 'Scully stops without exit animation')
            stop()
        end
        itemId = 'wave'
    end
    assert(loadfile(root .. '/adapters/common.lua', 't', env))()
    assert(loadfile(root .. '/adapters/' .. kind .. '.lua', 't', env))()
    check(#registry.catalog == 2, kind .. ' maps actual catalog and excludes shared/hidden entries')
    check(registry.catalog[1].dict == nil, 'native metadata stays inside the owning resource')
    local id = kind .. ':' .. itemId
    check(
        registry:execute('play', id, function()
            return true
        end),
        kind .. ' uses callable export references'
    )
    check(registry:current() == id, 'actual native state returned')
    check(
        registry:execute('toggle', id, function()
            return false
        end),
        'toggle can stop even when starting is blocked'
    )
    check(not current, 'owner cleaned up')
    deny = true
    check(not registry:execute('play', id, function()
        return true
    end), 'owner restriction preserved')
    check(not current, 'denied animation never starts')
    deny = false
    registry:refresh()
    check(
        registry:execute('play', id, function()
            return true
        end),
        'play after unblock'
    )
    current = { dict = 'revive', clip = 'other' }
    local before = stopCalls
    check(registry:stop(), 'stop inactive provider')
    check(stopCalls == before and current.dict == 'revive', 'unrelated task preserved')
    current = nil
    local allowed = true
    loaded = false
    loadHook = function()
        allowed = false
        loaded = true
        loadHook = nil
    end
    check(not registry:execute('play', id, function()
        return allowed
    end), 'cancel while dictionary loads')
    check(not current, 'no playback after load cancellation')
    allowed = true
    playHook = function()
        allowed = false
    end
    check(not registry:execute('play', id, function()
        return allowed
    end), 'cancel after vendor yields')
    check(not current, 'started animation cleaned after guard expires')
    playHook = nil
    registry:removeOwner(kind)
    check(#registry.catalog == 0, 'resource stop removes catalog')
    handlers['ks_streamdeck:ready']()
    check(#registry.catalog == 2, 'bridge restart re-registers catalog')
    playHook = function()
        registry:removeOwner(kind)
    end
    check(not registry:execute('play', id, function()
        return true
    end), 'provider removal invalidates in-flight command')
    check(not current, 'removed provider cannot finish stale playback')
end
local registry = StreamDeckRegistry.new()
check(
    not registry:register(
        'test',
        'invalid',
        {
            catalog = remote(function()
                return {}
            end),
            play = {},
            stop = function() end,
            current = function() end,
        }
    ),
    'non-callable callbacks rejected'
)
check(not registry:register('test', 'invalid', {
    catalog = function()
        return {}
    end,
    play = function() end,
    stop = function() end,
    current = function() end,
    canPlay = 'bad',
}), 'invalid optional callback rejected')
print(('adapters: %d checks passed'):format(checks))
