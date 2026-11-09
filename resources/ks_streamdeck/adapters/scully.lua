-- scully_emotemenu: load after client/main.lua and client/menu.lua.
local function allowed(data)
    if data.Hide or data.Synchronized or data.StartSynchronized or data.StartGroupEmote then
        return false
    end
    if data.NSFW and Config.enableNSFWEmotes == 'false' then
        return false
    end
    if data.Gang and not Config.enableGangEmotes then
        return false
    end
    if data.SocialMovement and not Config.enableSocialMovementEmotes then
        return false
    end
    return true
end
StreamDeckAdapter.install({
    catalog = function()
        local items = {}
        local function add(data, category)
            if type(data) ~= 'table' or not allowed(data) then
                return
            end
            items[#items + 1] = {
                id = data.Command,
                name = data.Command,
                label = data.Label,
                category = category,
                dict = data.Dictionary,
                clip = data.Animation,
                scenario = data.Scenario,
                canGroup = data.CanGroupEmote,
            }
        end
        for _, menu in ipairs(Emotes or {}) do
            if
                menu.type ~= 'consumable_emotes'
                and menu.type ~= 'synchronized_emotes'
                and menu.type ~= 'synchronized_dance_emotes'
                and (menu.type ~= 'animal_emotes' or Config.enableAnimalEmotes)
            then
                for _, data in ipairs(menu.options or {}) do
                    add(data, menu.name or 'Emotes')
                end
            end
        end
        for _, data in ipairs(Scenarios or {}) do
            add(data, 'Scenarios')
        end
        return items
    end,
    canPlay = function(entry)
        if IsLimited() then
            return false, 'Emotes are currently blocked.'
        end
        if entry.canGroup and IsControlPressed(0, 47) then
            return false, 'Please start group animations in the game.'
        end
        return true
    end,
    play = function(entry)
        return PlayEmoteByCommand(entry.name)
    end,
    current = function()
        return IsInEmote()
    end,
    canStop = function()
        return not IsLimited()
    end,
    stop = function()
        return CancelEmote(true)
    end,
})
