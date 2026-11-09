-- Original dpEmotes: load after Client/Emote.lua and its animation list.
StreamDeckAdapter.install({
    catalog = function()
        local items = {}
        for _, category in ipairs({ 'Emotes', 'Dances', 'PropEmotes' }) do
            for name, data in pairs((DP or {})[category] or {}) do
                if type(data) == 'table' then
                    local scenario = data[1] == 'Scenario'
                        or data[1] == 'MaleScenario'
                        or data[1] == 'ScenarioObject'
                    items[#items + 1] = {
                        id = category .. '.' .. name,
                        name = name,
                        category = category,
                        label = data[3] or name,
                        dict = not scenario and data[1] or nil,
                        clip = not scenario and data[2] or nil,
                        scenario = scenario and data[2] or nil,
                    }
                end
            end
        end
        return items
    end,
    play = function(entry)
        local categories = { Emotes = 'emotes', Dances = 'dances', PropEmotes = 'props' }
        return EmoteMenuStart(entry.name, categories[entry.category])
    end,
    stop = function()
        return EmoteCancel()
    end,
})
