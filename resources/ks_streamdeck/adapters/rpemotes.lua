-- RPEmotes / RPEmotes Reborn: load after its client scripts and converted catalog.
local function permitted(entry)
    local state = LocalPlayer and LocalPlayer.state
    if state and state.canEmote == false then
        return false, 'Emotes derzeit gesperrt.'
    end
    if
        type(HasEmotePermission) == 'function'
        and not HasEmotePermission(entry.name, entry.emoteType)
    then
        return false, 'Keine Berechtigung für diese Animation.'
    end
    if Config and Config.AdultEmotesDisabled and entry.adult then
        return false, 'Animation deaktiviert.'
    end
    return true
end
StreamDeckAdapter.install({
    catalog = function()
        local items = {}
        if type(EmoteData) == 'table' and type(EmoteType) == 'table' then
            local categories = {
                [EmoteType.EMOTES] = 'Emotes',
                [EmoteType.DANCES] = 'Dances',
                [EmoteType.PROP_EMOTES] = 'PropEmotes',
                [EmoteType.ANIMAL_EMOTES] = 'AnimalEmotes',
            }
            for name, data in pairs(EmoteData) do
                if type(data) == 'table' and categories[data.emoteType] then
                    local entry = {
                        id = name,
                        name = name,
                        label = data.label or name,
                        category = categories[data.emoteType],
                        emoteType = data.emoteType,
                        dict = data.dict,
                        clip = data.anim,
                        scenario = data.scenario,
                        adult = data.AdultAnimation,
                    }
                    if
                        permitted(entry)
                        and (entry.category ~= 'AnimalEmotes' or Config.AnimalEmotesEnabled)
                    then
                        items[#items + 1] = entry
                    end
                end
            end
        else
            for _, category in ipairs({ 'Emotes', 'Dances', 'PropEmotes' }) do
                for name, data in pairs((RP or {})[category] or {}) do
                    if type(data) == 'table' then
                        local scenario = data[1] == 'Scenario'
                            or data[1] == 'MaleScenario'
                            or data[1] == 'ScenarioObject'
                        local entry = {
                            id = name,
                            name = name,
                            category = category,
                            label = data[3] or name,
                            dict = not scenario and data[1] or nil,
                            clip = not scenario and data[2] or nil,
                            scenario = scenario and data[2] or nil,
                            adult = data.AdultAnimation,
                        }
                        if permitted(entry) then
                            items[#items + 1] = entry
                        end
                    end
                end
            end
        end
        return items
    end,
    canPlay = permitted,
    play = function(entry)
        -- Uses the owning resource's command handler, including permissions and prop handling.
        return EmoteCommandStart({ entry.name })
    end,
    canStop = function()
        return not LocalPlayer or not LocalPlayer.state or LocalPlayer.state.canCancel ~= false
    end,
    stop = function()
        return EmoteCancel()
    end,
})
