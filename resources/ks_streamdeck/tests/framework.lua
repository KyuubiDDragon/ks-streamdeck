local root = ... or 'resources/ks_streamdeck'
assert(loadfile(root .. '/config.lua'))()
local states, data, ready = {}, { metadata = {} }, true
LocalPlayer = { state = {} }
function GetResourceState(name)
    return states[name] or 'missing'
end
exports = {
    ['qb-core'] = {
        GetCoreObject = function()
            return { Functions = {
                GetPlayerData = function()
                    return data
                end,
            } }
        end,
    },
    qbx_core = {
        GetPlayerData = function()
            return data
        end,
    },
    es_extended = {
        getSharedObject = function()
            return {
                IsPlayerLoaded = function()
                    return ready
                end,
                GetPlayerData = function()
                    return data
                end,
            }
        end,
    },
}
assert(loadfile(root .. '/client/framework.lua'))()
local checks = 0
local function check(ok, reason)
    assert(ok, reason)
    checks = checks + 1
end
check(
    StreamDeckFramework.detect() == 'standalone' and StreamDeckFramework.canPlay(),
    'no framework dependency'
)
for _, mode in ipairs({ 'qbcore', 'qbox', 'esx' }) do
    local resource = StreamDeckConfig.FrameworkResources[mode]
    states[resource] = 'started'
    check(StreamDeckFramework.detect() == mode, 'automatic framework detection')
    check(StreamDeckFramework.canPlay(), 'normal player allowed')
    if mode == 'esx' then
        data.dead = true
        check(not StreamDeckFramework.canPlay(), 'ESX death blocked')
        data.dead = false
        ready = false
        check(not StreamDeckFramework.canPlay(), 'ESX character load blocked')
        ready = true
    else
        for _, key in ipairs({ 'isdead', 'inlaststand', 'ishandcuffed' }) do
            data.metadata[key] = true
            check(not StreamDeckFramework.canPlay(), mode .. ' blocks ' .. key)
            data.metadata[key] = false
        end
        LocalPlayer.state.isLoggedIn = false
        check(not StreamDeckFramework.canPlay(), 'logged-out character blocked')
        LocalPlayer.state.isLoggedIn = true
        local saved = data
        data = {}
        check(not StreamDeckFramework.canPlay(), 'missing metadata fails closed')
        data = saved
    end
    StreamDeckConfig.Framework = mode
    states[resource] = 'stopped'
    check(not StreamDeckFramework.canPlay(), 'configured framework restart blocked')
    StreamDeckConfig.Framework = 'auto'
end
print(('framework: %d checks passed'):format(checks))
