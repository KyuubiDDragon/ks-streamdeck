StreamDeckFramework = {}
local cfg = StreamDeckConfig
function StreamDeckFramework.detect()
    local mode = cfg.Framework or 'auto'
    if mode ~= 'auto' then
        return mode
    end
    for _, name in ipairs({ 'qbox', 'qbcore', 'esx' }) do
        if GetResourceState(cfg.FrameworkResources[name]) == 'started' then
            return name
        end
    end
    return 'standalone'
end
function StreamDeckFramework.canPlay()
    local mode = StreamDeckFramework.detect()
    if mode == 'standalone' then
        return true
    end
    local resource = cfg.FrameworkResources[mode]
    if not resource or GetResourceState(resource) ~= 'started' then
        return false, 'Player framework is not ready.'
    end
    local ok, data = pcall(function()
        if mode == 'qbox' then
            return exports[resource]:GetPlayerData()
        end
        if mode == 'qbcore' then
            return exports[resource]:GetCoreObject().Functions.GetPlayerData()
        end
        local esx = exports[resource]:getSharedObject()
        if not esx.IsPlayerLoaded() then
            return nil
        end
        return esx.GetPlayerData()
    end)
    if not ok or type(data) ~= 'table' then
        return false, 'Player data is not ready.'
    end
    if LocalPlayer and LocalPlayer.state and LocalPlayer.state.isLoggedIn == false then
        return false, 'Character is not logged in.'
    end
    if mode == 'esx' then
        if data.dead then
            return false, 'Character is unconscious.'
        end
        return true
    end
    local metadata = data.metadata
    if type(metadata) ~= 'table' then
        return false, 'Player data is not ready.'
    end
    if metadata.isdead or metadata.inlaststand then
        return false, 'Character is unconscious.'
    end
    if metadata.ishandcuffed then
        return false, 'Character is handcuffed.'
    end
    return true
end
